// 从Anthropic SDK导入消息相关类型
import {
  Message as APIAssistantMessage,    // API助手消息类型
  MessageParam,                      // 消息参数类型
  ToolUseBlock,                      // 工具使用块类型
} from '@anthropic-ai/sdk/resources/index.mjs'
// 导入通用UUID类型
import type { UUID } from './types/common'
// 导入工具接口和上下文类型
import type { Tool, ToolUseContext } from './Tool'
// 导入二元反馈相关工具函数
import {
  messagePairValidForBinaryFeedback, // 检查消息对是否适用于二元反馈
  shouldUseBinaryFeedback,           // 检查是否应该使用二元反馈
} from './components/binary-feedback/utils.js'
// 导入工具使用权限检查函数类型
import { CanUseToolFn } from './hooks/useCanUseTool'
// 导入Claude服务相关函数
import {
  formatSystemPromptWithContext,    // 格式化系统提示词
  queryLLM,                         // 查询LLM
  queryModel,                       // 查询模型
} from './services/claude.js'
// 导入系统提醒事件发射器
import { emitReminderEvent } from './services/systemReminder'
// 导入生成器工具函数
import { all } from './utils/generators'
// 导入错误日志函数
import { logError } from './utils/log'
// 导入调试和日志相关函数
import {
  debug as debugLogger,            // 调试日志记录器
  markPhase,                       // 标记执行阶段
  getCurrentRequest,               // 获取当前请求
  logUserFriendly,                 // 用户友好日志
} from './utils/debugLogger'
// 导入模型管理器
import { getModelManager } from './utils/model.js'
// 导入消息创建和处理工具函数
import {
  createAssistantMessage,          // 创建助手消息
  createProgressMessage,           // 创建进度消息
  createToolResultStopMessage,     // 创建工具结果停止消息
  createUserMessage,               // 创建用户消息
  FullToolUseResult,               // 完整工具使用结果类型
  INTERRUPT_MESSAGE,               // 中断消息常量
  INTERRUPT_MESSAGE_FOR_TOOL_USE,  // 工具使用中断消息常量
  NormalizedMessage,               // 标准化消息类型
  normalizeMessagesForAPI,         // 为API标准化消息
} from './utils/messages.js'
// 导入工具执行控制器创建函数
import { createToolExecutionController } from './utils/toolExecutionController'
// 导入Bash工具
import { BashTool } from './tools/BashTool/BashTool'
// 导入状态管理函数
import { getCwd } from './utils/state'
// 导入自动压缩核心函数
import { checkAutoCompact } from './utils/autoCompactCore'

// 查询函数的扩展工具使用上下文 - 添加了查询特定的属性
interface ExtendedToolUseContext extends ToolUseContext {
  abortController: AbortController  // 用于取消操作的控制器
  options: {                        // 扩展的选项配置
    commands: any[]                 // 可用命令列表
    forkNumber: number              // 分叉编号
    messageLogName: string          // 消息日志名称
    tools: Tool[]                   // 可用工具列表
    verbose: boolean                // 详细输出模式标志
    safeMode: boolean               // 安全模式标志
    maxThinkingTokens: number       // 最大思考token数
    isKodingRequest?: boolean       // 是否为Koding请求
    model?: string | import('./utils/config').ModelPointerType  // 模型配置
  }
  readFileTimestamps: { [filename: string]: number }  // 文件读取时间戳映射
  setToolJSX: (jsx: any) => void    // 设置工具JSX显示的函数
  requestId?: string                // 可选的请求ID
}

// 导出响应类型 - 包含成本和响应内容
export type Response = { costUSD: number; response: string }

// 导出用户消息类型 - 表示来自用户的消息
export type UserMessage = {
  message: MessageParam             // 消息参数
  type: 'user'                      // 消息类型标识符
  uuid: UUID                        // 消息唯一标识符
  toolUseResult?: FullToolUseResult // 可选的工具使用结果
  options?: {                       // 可选的消息选项
    isKodingRequest?: boolean       // 是否为Koding请求
    kodingContext?: string          // Koding上下文
    isCustomCommand?: boolean       // 是否为自定义命令
    commandName?: string            // 命令名称
    commandArgs?: string            // 命令参数
  }
}

// 导出助手消息类型 - 表示来自AI助手的消息
export type AssistantMessage = {
  costUSD: number                   // 消息成本（美元）
  durationMs: number                // 处理持续时间（毫秒）
  message: APIAssistantMessage      // API助手消息
  type: 'assistant'                 // 消息类型标识符
  uuid: UUID                        // 消息唯一标识符
  isApiErrorMessage?: boolean       // 是否为API错误消息
  responseId?: string               // 用于GPT-5响应API状态管理的响应ID
}

// 导出二元反馈结果类型 - 用于二元反馈系统的结果
export type BinaryFeedbackResult =
  | { message: AssistantMessage | null; shouldSkipPermissionCheck: false }  // 正常结果，需要权限检查
  | { message: AssistantMessage; shouldSkipPermissionCheck: true }          // 跳过权限检查的结果

// 导出进度消息类型 - 表示工具执行过程中的进度更新
export type ProgressMessage = {
  content: AssistantMessage         // 进度内容
  normalizedMessages: NormalizedMessage[]  // 标准化消息列表
  siblingToolUseIDs: Set<string>    // 兄弟工具使用ID集合
  tools: Tool[]                     // 工具列表
  toolUseID: string                 // 工具使用ID
  type: 'progress'                  // 消息类型标识符
  uuid: UUID                        // 消息唯一标识符
}

// 导出消息联合类型 - 数组中的每个项目要么是单个消息，要么是消息-响应对
export type Message = UserMessage | AssistantMessage | ProgressMessage

// 最大工具使用并发数常量 - 限制同时执行的工具数量
const MAX_TOOL_USE_CONCURRENCY = 10

// Returns a message if we got one, or `null` if the user cancelled
async function queryWithBinaryFeedback(
  toolUseContext: ExtendedToolUseContext,
  getAssistantResponse: () => Promise<AssistantMessage>,
  getBinaryFeedbackResponse?: (
    m1: AssistantMessage,
    m2: AssistantMessage,
  ) => Promise<BinaryFeedbackResult>,
): Promise<BinaryFeedbackResult> {
  if (
    process.env.USER_TYPE !== 'ant' ||
    !getBinaryFeedbackResponse ||
    !(await shouldUseBinaryFeedback())
  ) {
    const assistantMessage = await getAssistantResponse()
    if (toolUseContext.abortController.signal.aborted) {
      return { message: null, shouldSkipPermissionCheck: false }
    }
    return { message: assistantMessage, shouldSkipPermissionCheck: false }
  }
  const [m1, m2] = await Promise.all([
    getAssistantResponse(),
    getAssistantResponse(),
  ])
  if (toolUseContext.abortController.signal.aborted) {
    return { message: null, shouldSkipPermissionCheck: false }
  }
  if (m2.isApiErrorMessage) {
    // If m2 is an error, we might as well return m1, even if it's also an error --
    // the UI will display it as an error as it would in the non-feedback path.
    return { message: m1, shouldSkipPermissionCheck: false }
  }
  if (m1.isApiErrorMessage) {
    return { message: m2, shouldSkipPermissionCheck: false }
  }
  if (!messagePairValidForBinaryFeedback(m1, m2)) {
    return { message: m1, shouldSkipPermissionCheck: false }
  }
  return await getBinaryFeedbackResponse(m1, m2)
}

/**
 * The rules of thinking are lengthy and fortuitous. They require plenty of thinking
 * of most long duration and deep meditation for a wizard to wrap one's noggin around.
 *
 * The rules follow:
 * 1. A message that contains a thinking or redacted_thinking block must be part of a query whose max_thinking_length > 0
 * 2. A thinking block may not be the last message in a block
 * 3. Thinking blocks must be preserved for the duration of an assistant trajectory (a single turn, or if that turn includes a tool_use block then also its subsequent tool_result and the following assistant message)
 *
 * Heed these rules well, young wizard. For they are the rules of thinking, and
 * the rules of thinking are the rules of the universe. If ye does not heed these
 * rules, ye will be punished with an entire day of debugging and hair pulling.
 */
export async function* query(
  messages: Message[],
  systemPrompt: string[],
  context: { [k: string]: string },
  canUseTool: CanUseToolFn,
  toolUseContext: ExtendedToolUseContext,
  getBinaryFeedbackResponse?: (
    m1: AssistantMessage,
    m2: AssistantMessage,
  ) => Promise<BinaryFeedbackResult>,
): AsyncGenerator<Message, void> {
  const currentRequest = getCurrentRequest()

  markPhase('QUERY_INIT')

  // Auto-compact check
  const { messages: processedMessages, wasCompacted } = await checkAutoCompact(
    messages,
    toolUseContext,
  )
  if (wasCompacted) {
    messages = processedMessages
  }

  markPhase('SYSTEM_PROMPT_BUILD')
  
  const { systemPrompt: fullSystemPrompt, reminders } =
    formatSystemPromptWithContext(systemPrompt, context, toolUseContext.agentId)

  // Emit session startup event
  emitReminderEvent('session:startup', {
    agentId: toolUseContext.agentId,
    messages: messages.length,
    timestamp: Date.now(),
  })

  // Inject reminders into the latest user message
  if (reminders && messages.length > 0) {
    // Find the last user message
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg?.type === 'user') {
        const lastUserMessage = msg as UserMessage
        messages[i] = {
          ...lastUserMessage,
          message: {
            ...lastUserMessage.message,
            content:
              typeof lastUserMessage.message.content === 'string'
                ? reminders + lastUserMessage.message.content
                : [
                    ...(Array.isArray(lastUserMessage.message.content)
                      ? lastUserMessage.message.content
                      : []),
                    { type: 'text', text: reminders },
                  ],
          },
        }
        break
      }
    }
  }

  markPhase('LLM_PREPARATION')

  function getAssistantResponse() {
    return queryLLM(
      normalizeMessagesForAPI(messages),
      fullSystemPrompt,
      toolUseContext.options.maxThinkingTokens,
      toolUseContext.options.tools,
      toolUseContext.abortController.signal,
      {
        safeMode: toolUseContext.options.safeMode ?? false,
        model: toolUseContext.options.model || 'main',
        prependCLISysprompt: true,
        toolUseContext: toolUseContext,
      },
    )
  }

  const result = await queryWithBinaryFeedback(
    toolUseContext,
    getAssistantResponse,
    getBinaryFeedbackResponse,
  )

  // If request was cancelled, return immediately with interrupt message  
  if (toolUseContext.abortController.signal.aborted) {
    yield createAssistantMessage(INTERRUPT_MESSAGE)
    return
  }

  if (result.message === null) {
    yield createAssistantMessage(INTERRUPT_MESSAGE)
    return
  }

  const assistantMessage = result.message
  const shouldSkipPermissionCheck = result.shouldSkipPermissionCheck

  yield assistantMessage

  // @see https://docs.anthropic.com/en/docs/build-with-claude/tool-use
  // Note: stop_reason === 'tool_use' is unreliable -- it's not always set correctly
  const toolUseMessages = assistantMessage.message.content.filter(
    _ => _.type === 'tool_use',
  )

  // If there's no more tool use, we're done
  if (!toolUseMessages.length) {
    return
  }

  const toolResults: UserMessage[] = []
  
  // Simple concurrency check like original system
  const canRunConcurrently = toolUseMessages.every(msg =>
    toolUseContext.options.tools.find(t => t.name === msg.name)?.isReadOnly(),
  )

  if (canRunConcurrently) {
    for await (const message of runToolsConcurrently(
      toolUseMessages,
      assistantMessage,
      canUseTool,
      toolUseContext,
      shouldSkipPermissionCheck,
    )) {
      yield message
      // progress messages are not sent to the server, so don't need to be accumulated for the next turn
      if (message.type === 'user') {
        toolResults.push(message)
      }
    }
  } else {
    for await (const message of runToolsSerially(
      toolUseMessages,
      assistantMessage,
      canUseTool,
      toolUseContext,
      shouldSkipPermissionCheck,
    )) {
      yield message
      // progress messages are not sent to the server, so don't need to be accumulated for the next turn
      if (message.type === 'user') {
        toolResults.push(message)
      }
    }
  }

  if (toolUseContext.abortController.signal.aborted) {
    yield createAssistantMessage(INTERRUPT_MESSAGE_FOR_TOOL_USE)
    return
  }

  // Sort toolResults to match the order of toolUseMessages
  const orderedToolResults = toolResults.sort((a, b) => {
    const aIndex = toolUseMessages.findIndex(
      tu => tu.id === (a.message.content[0] as ToolUseBlock).id,
    )
    const bIndex = toolUseMessages.findIndex(
      tu => tu.id === (b.message.content[0] as ToolUseBlock).id,
    )
    return aIndex - bIndex
  })

  // Recursive query

  try {
    yield* await query(
      [...messages, assistantMessage, ...orderedToolResults],
      systemPrompt,
      context,
      canUseTool,
      toolUseContext,
      getBinaryFeedbackResponse,
    )
  } catch (error) {
    // Re-throw the error to maintain the original behavior
    throw error
  }
}

async function* runToolsConcurrently(
  toolUseMessages: ToolUseBlock[],
  assistantMessage: AssistantMessage,
  canUseTool: CanUseToolFn,
  toolUseContext: ExtendedToolUseContext,
  shouldSkipPermissionCheck?: boolean,
): AsyncGenerator<Message, void> {
  yield* all(
    toolUseMessages.map(toolUse =>
      runToolUse(
        toolUse,
        new Set(toolUseMessages.map(_ => _.id)),
        assistantMessage,
        canUseTool,
        toolUseContext,
        shouldSkipPermissionCheck,
      ),
    ),
    MAX_TOOL_USE_CONCURRENCY,
  )
}

async function* runToolsSerially(
  toolUseMessages: ToolUseBlock[],
  assistantMessage: AssistantMessage,
  canUseTool: CanUseToolFn,
  toolUseContext: ExtendedToolUseContext,
  shouldSkipPermissionCheck?: boolean,
): AsyncGenerator<Message, void> {
  for (const toolUse of toolUseMessages) {
    yield* runToolUse(
      toolUse,
      new Set(toolUseMessages.map(_ => _.id)),
      assistantMessage,
      canUseTool,
      toolUseContext,
      shouldSkipPermissionCheck,
    )
  }
}

export async function* runToolUse(
  toolUse: ToolUseBlock,
  siblingToolUseIDs: Set<string>,
  assistantMessage: AssistantMessage,
  canUseTool: CanUseToolFn,
  toolUseContext: ExtendedToolUseContext,
  shouldSkipPermissionCheck?: boolean,
): AsyncGenerator<Message, void> {
  const currentRequest = getCurrentRequest()

  // 🔍 Debug: 工具调用开始
  debugLogger.flow('TOOL_USE_START', {
    toolName: toolUse.name,
    toolUseID: toolUse.id,
    inputSize: JSON.stringify(toolUse.input).length,
    siblingToolCount: siblingToolUseIDs.size,
    shouldSkipPermissionCheck: !!shouldSkipPermissionCheck,
    requestId: currentRequest?.id,
  })

  logUserFriendly(
    'TOOL_EXECUTION',
    {
      toolName: toolUse.name,
      action: 'Starting',
      target: toolUse.input ? Object.keys(toolUse.input).join(', ') : '',
    },
    currentRequest?.id,
  )


  

  const toolName = toolUse.name
  const tool = toolUseContext.options.tools.find(t => t.name === toolName)

  // Check if the tool exists
  if (!tool) {
    debugLogger.error('TOOL_NOT_FOUND', {
      requestedTool: toolName,
      availableTools: toolUseContext.options.tools.map(t => t.name),
      toolUseID: toolUse.id,
      requestId: currentRequest?.id,
    })

    

    yield createUserMessage([
      {
        type: 'tool_result',
        content: `Error: No such tool available: ${toolName}`,
        is_error: true,
        tool_use_id: toolUse.id,
      },
    ])
    return
  }

  const toolInput = toolUse.input as { [key: string]: string }

  debugLogger.flow('TOOL_VALIDATION_START', {
    toolName: tool.name,
    toolUseID: toolUse.id,
    inputKeys: Object.keys(toolInput),
    requestId: currentRequest?.id,
  })

  try {
    // 🔧 Check for cancellation before starting tool execution
    if (toolUseContext.abortController.signal.aborted) {
      debugLogger.flow('TOOL_USE_CANCELLED_BEFORE_START', {
        toolName: tool.name,
        toolUseID: toolUse.id,
        abortReason: 'AbortController signal',
        requestId: currentRequest?.id,
      })

      

      const message = createUserMessage([
        createToolResultStopMessage(toolUse.id),
      ])
      yield message
      return
    }

    // Track if any progress messages were yielded
    let hasProgressMessages = false
    
    for await (const message of checkPermissionsAndCallTool(
      tool,
      toolUse.id,
      siblingToolUseIDs,
      toolInput,
      toolUseContext,
      canUseTool,
      assistantMessage,
      shouldSkipPermissionCheck,
    )) {
      // 🔧 Check for cancellation during tool execution
      if (toolUseContext.abortController.signal.aborted) {
        debugLogger.flow('TOOL_USE_CANCELLED_DURING_EXECUTION', {
          toolName: tool.name,
          toolUseID: toolUse.id,
          hasProgressMessages,
          abortReason: 'AbortController signal during execution',
          requestId: currentRequest?.id,
        })

        // If we yielded progress messages but got cancelled, yield a cancellation result
        if (hasProgressMessages && message.type === 'progress') {
          yield message // yield the last progress message first
        }
        
        // Always yield a tool result message for cancellation to clear UI state
        const cancelMessage = createUserMessage([
          createToolResultStopMessage(toolUse.id),
        ])
        yield cancelMessage
        return
      }

      if (message.type === 'progress') {
        hasProgressMessages = true
      }
      
      yield message
    }
  } catch (e) {
    logError(e)
    
    // 🔧 Even on error, ensure we yield a tool result to clear UI state
    const errorMessage = createUserMessage([
      {
        type: 'tool_result',
        content: `Tool execution failed: ${e instanceof Error ? e.message : String(e)}`,
        is_error: true,
        tool_use_id: toolUse.id,
      },
    ])
    yield errorMessage
  }
}

// TODO: Generalize this to all tools
export function normalizeToolInput(
  tool: Tool,
  input: { [key: string]: boolean | string | number },
): { [key: string]: boolean | string | number } {
  switch (tool) {
    case BashTool: {
      const { command, timeout } = BashTool.inputSchema.parse(input) // already validated upstream, won't throw
      return {
        command: command.replace(`cd ${getCwd()} && `, ''),
        ...(timeout ? { timeout } : {}),
      }
    }
    default:
      return input
  }
}

async function* checkPermissionsAndCallTool(
  tool: Tool,
  toolUseID: string,
  siblingToolUseIDs: Set<string>,
  input: { [key: string]: boolean | string | number },
  context: ToolUseContext,
  canUseTool: CanUseToolFn,
  assistantMessage: AssistantMessage,
  shouldSkipPermissionCheck?: boolean,
): AsyncGenerator<UserMessage | ProgressMessage, void> {
  // Validate input types with zod
  // (surprisingly, the model is not great at generating valid input)
  const isValidInput = tool.inputSchema.safeParse(input)
  if (!isValidInput.success) {
    // Create a more helpful error message for common cases
    let errorMessage = `InputValidationError: ${isValidInput.error.message}`
    
    // Special handling for the "View" tool (FileReadTool) being called with empty parameters
    if (tool.name === 'View' && Object.keys(input).length === 0) {
      errorMessage = `Error: The View tool requires a 'file_path' parameter to specify which file to read. Please provide the absolute path to the file you want to view. For example: {"file_path": "/path/to/file.txt"}`
    }
    
    
    yield createUserMessage([
      {
        type: 'tool_result',
        content: errorMessage,
        is_error: true,
        tool_use_id: toolUseID,
      },
    ])
    return
  }

  const normalizedInput = normalizeToolInput(tool, input)

  // Validate input values. Each tool has its own validation logic
  const isValidCall = await tool.validateInput?.(
    normalizedInput as never,
    context,
  )
  if (isValidCall?.result === false) {
    yield createUserMessage([
      {
        type: 'tool_result',
        content: isValidCall!.message,
        is_error: true,
        tool_use_id: toolUseID,
      },
    ])
    return
  }

  // Check whether we have permission to use the tool,
  // and ask the user for permission if we don't
  const permissionResult = shouldSkipPermissionCheck
    ? ({ result: true } as const)
    : await canUseTool(tool, normalizedInput, context, assistantMessage)
  if (permissionResult.result === false) {
    yield createUserMessage([
      {
        type: 'tool_result',
        content: permissionResult.message,
        is_error: true,
        tool_use_id: toolUseID,
      },
    ])
    return
  }

  // Call the tool
  try {
    const generator = tool.call(normalizedInput as never, context)
    for await (const result of generator) {
      switch (result.type) {
        case 'result':
          
          yield createUserMessage(
            [
              {
                type: 'tool_result',
                content: result.resultForAssistant || String(result.data),
                tool_use_id: toolUseID,
              },
            ],
            {
              data: result.data,
              resultForAssistant: result.resultForAssistant || String(result.data),
            },
          )
          return
        case 'progress':
          
          yield createProgressMessage(
            toolUseID,
            siblingToolUseIDs,
            result.content,
            result.normalizedMessages || [],
            result.tools || [],
          )
          break
      }
    }
  } catch (error) {
    const content = formatError(error)
    logError(error)
    
    yield createUserMessage([
      {
        type: 'tool_result',
        content,
        is_error: true,
        tool_use_id: toolUseID,
      },
    ])
  }
}

function formatError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error)
  }
  const parts = [error.message]
  if ('stderr' in error && typeof error.stderr === 'string') {
    parts.push(error.stderr)
  }
  if ('stdout' in error && typeof error.stdout === 'string') {
    parts.push(error.stdout)
  }
  const fullMessage = parts.filter(Boolean).join('\n')
  if (fullMessage.length <= 10000) {
    return fullMessage
  }
  const halfLength = 5000
  const start = fullMessage.slice(0, halfLength)
  const end = fullMessage.slice(-halfLength)
  return `${start}\n\n... [${fullMessage.length - 10000} characters truncated] ...\n\n${end}`
}
