// 消息处理系统核心模块 - 处理用户输入、AI响应和工具使用的消息流转
// 这个模块是Kode系统的消息通信枢纽，负责：
// 1. 消息创建和格式化（用户消息、助手消息、进度消息）
// 2. 用户输入处理（普通提示、Bash命令、斜杠命令）
// 3. 消息标准化和API兼容性处理
// 4. 工具使用状态跟踪和消息重排序

import { randomUUID, UUID } from 'crypto'
import { Box } from 'ink'
import {
  AssistantMessage,
  Message,
  ProgressMessage,
  UserMessage,
} from '../query.js'
import { getCommand, hasCommand } from '../commands'
import { MalformedCommandError } from './errors'
import { logError } from './log'
import { resolve } from 'path'
import { last, memoize } from 'lodash-es'
import type { SetToolJSXFn, Tool, ToolUseContext } from '../Tool'
import { lastX } from '../utils/generators'
import { NO_CONTENT_MESSAGE } from '../services/claude'
import {
  ImageBlockParam,
  TextBlockParam,
  ToolResultBlockParam,
  ToolUseBlockParam,
  Message as APIMessage,
  ContentBlockParam,
  ContentBlock,
} from '@anthropic-ai/sdk/resources/index.mjs'
import { setCwd } from './state'
import { getCwd } from './state'
import chalk from 'chalk'
import * as React from 'react'
import { UserBashInputMessage } from '../components/messages/UserBashInputMessage'
import { Spinner } from '../components/Spinner'
import { BashTool } from '../tools/BashTool/BashTool'
import { ToolUseBlock } from '@anthropic-ai/sdk/resources/index.mjs'

// 注意：自定义命令的动态内容处理已迁移到 src/services/customCommands.ts
// 为了更好的组织结构和代码复用性，executeBashCommands 和 resolveFileReferences
// 函数不再在此处重复定义，而是在需要时从自定义命令服务导入

export const INTERRUPT_MESSAGE = '[Request interrupted by user]'
export const INTERRUPT_MESSAGE_FOR_TOOL_USE =
  '[Request interrupted by user for tool use]'
export const CANCEL_MESSAGE =
  "The user doesn't want to take this action right now. STOP what you are doing and wait for the user to tell you how to proceed."
export const REJECT_MESSAGE =
  "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed."
export const NO_RESPONSE_REQUESTED = 'No response requested.'

export const SYNTHETIC_ASSISTANT_MESSAGES = new Set([
  INTERRUPT_MESSAGE,
  INTERRUPT_MESSAGE_FOR_TOOL_USE,
  CANCEL_MESSAGE,
  REJECT_MESSAGE,
  NO_RESPONSE_REQUESTED,
])

function baseCreateAssistantMessage(
  content: ContentBlock[],
  extra?: Partial<AssistantMessage>,
): AssistantMessage {
  return {
    type: 'assistant',
    costUSD: 0,
    durationMs: 0,
    uuid: randomUUID(),
    message: {
      id: randomUUID(),
      model: '<synthetic>',
      role: 'assistant',
      stop_reason: 'stop_sequence',
      stop_sequence: '',
      type: 'message',
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      content,
    },
    ...extra,
  }
}

export function createAssistantMessage(content: string): AssistantMessage {
  return baseCreateAssistantMessage([
    {
      type: 'text' as const,
      text: content === '' ? NO_CONTENT_MESSAGE : content,
      citations: [],
    },
  ])
}

export function createAssistantAPIErrorMessage(
  content: string,
): AssistantMessage {
  return baseCreateAssistantMessage(
    [
      {
        type: 'text' as const,
        text: content === '' ? NO_CONTENT_MESSAGE : content,
        citations: [],
      },
    ],
    { isApiErrorMessage: true },
  )
}

export type FullToolUseResult = {
  data: unknown // Matches tool's `Output` type
  resultForAssistant: ToolResultBlockParam['content']
}

export function createUserMessage(
  content: string | ContentBlockParam[],
  toolUseResult?: FullToolUseResult,
): UserMessage {
  const m: UserMessage = {
    type: 'user',
    message: {
      role: 'user',
      content,
    },
    uuid: randomUUID(),
    toolUseResult,
  }
  return m
}

export function createProgressMessage(
  toolUseID: string,
  siblingToolUseIDs: Set<string>,
  content: AssistantMessage,
  normalizedMessages: NormalizedMessage[],
  tools: Tool[],
): ProgressMessage {
  return {
    type: 'progress',
    content,
    normalizedMessages,
    siblingToolUseIDs,
    tools,
    toolUseID,
    uuid: randomUUID(),
  }
}

export function createToolResultStopMessage(
  toolUseID: string,
): ToolResultBlockParam {
  return {
    type: 'tool_result',
    content: CANCEL_MESSAGE,
    is_error: true,
    tool_use_id: toolUseID,
  }
}

/**
 * 处理用户输入的主要函数
 * 根据不同的模式处理用户输入，支持bash命令、斜杠命令和普通提示
 * @param input 用户输入的文本内容
 * @param mode 输入模式：'bash'（直接执行bash命令）| 'prompt'（普通提示）| 'koding'（Koding模式）
 * @param setToolJSX 设置工具JSX显示的函数
 * @param context 工具使用上下文和额外选项
 * @param pastedImage 粘贴的图像数据（Base64格式）
 * @returns 返回处理后的消息数组
 */
export async function processUserInput(
  input: string,
  mode: 'bash' | 'prompt' | 'koding',
  setToolJSX: SetToolJSXFn,
  context: ToolUseContext & {
    setForkConvoWithMessagesOnTheNextRender: (
      forkConvoWithMessages: Message[],
    ) => void
    options?: {
      isKodingRequest?: boolean
      kodingContext?: string
    }
  },
  pastedImage: string | null,
): Promise<Message[]> {
  // Bash命令处理分支 - 直接执行系统命令
  if (mode === 'bash') {
    // 创建包含bash输入标签的用户消息
    const userMessage = createUserMessage(`<bash-input>${input}</bash-input>`)

    // 特殊情况处理：cd命令 - 需要更新工作目录状态
    if (input.startsWith('cd ')) {
      const oldCwd = getCwd()
      const newCwd = resolve(oldCwd, input.slice(3))
      try {
        await setCwd(newCwd)
        return [
          userMessage,
          createAssistantMessage(
            `<bash-stdout>Changed directory to ${chalk.bold(`${newCwd}/`)}</bash-stdout>`,
          ),
        ]
      } catch (e) {
        logError(e)
        return [
          userMessage,
          createAssistantMessage(
            `<bash-stderr>cwd error: ${e instanceof Error ? e.message : String(e)}</bash-stderr>`,
          ),
        ]
      }
    }

    // 所有其他bash命令 - 通过BashTool执行
    // 显示执行中的界面（用户输入 + 加载动画）
    setToolJSX({
      jsx: (
        <Box flexDirection="column" marginTop={1}>
          <UserBashInputMessage
            addMargin={false}
            param={{ text: `<bash-input>${input}</bash-input>`, type: 'text' }}
          />
          <Spinner />  {/* 加载动画 */}
        </Box>
      ),
      shouldHidePromptInput: false,  // 保持提示输入可见
    })
    try {
      const validationResult = await BashTool.validateInput({
        command: input,
      })
      if (!validationResult.result) {
        return [userMessage, createAssistantMessage(validationResult.message)]
      }
      const { data } = await lastX(BashTool.call({ command: input }, context))
      return [
        userMessage,
        createAssistantMessage(
          `<bash-stdout>${data.stdout}</bash-stdout><bash-stderr>${data.stderr}</bash-stderr>`,
        ),
      ]
    } catch (e) {
      return [
        userMessage,
        createAssistantMessage(
          `<bash-stderr>Command failed: ${e instanceof Error ? e.message : String(e)}</bash-stderr>`,
        ),
      ]
    } finally {
      setToolJSX(null)
    }
  }
  // Koding模式 - 用于特殊显示包装的特殊模式
  else if (mode === 'koding') {
    // 创建包含koding标签的用户消息
    const userMessage = createUserMessage(
      `<koding-input>${input}</koding-input>`,
    )
    // 在消息中添加Koding标记
    userMessage.options = {
      ...userMessage.options,
      isKodingRequest: true,  // 标记为Koding请求
    }

    // Koding处理的其余部分在其他地方处理，以便捕获助手响应
    return [userMessage]
  }

  // 斜杠命令处理 - 处理以'/' 开头的特殊命令
  if (input.startsWith('/')) {
    const words = input.slice(1).split(' ')
    let commandName = words[0]  // 提取命令名
    // 处理MCP命令的特殊标记
    if (words.length > 1 && words[1] === '(MCP)') {
      commandName = commandName + ' (MCP)'
    }
    // 检查命令名是否为空
    if (!commandName) {
      return [
        createAssistantMessage('Commands are in the form `/command [args]`'),  // 返回命令格式提示
      ]
    }

    // 检查是否为真实的命令
    if (!hasCommand(commandName, context.options.commands)) {
      // 如果不是真实命令，将其作为普通用户输入处理
      return [createUserMessage(input)]
    }

    const args = input.slice(commandName.length + 2)
    const newMessages = await getMessagesForSlashCommand(
      commandName,
      args,
      setToolJSX,
      context,
    )

    // Local JSX commands
    if (newMessages.length === 0) {
      
      return []
    }

    // For invalid commands, preserve both the user message and error
    if (
      newMessages.length === 2 &&
      newMessages[0]!.type === 'user' &&
      newMessages[1]!.type === 'assistant' &&
      typeof newMessages[1]!.message.content === 'string' &&
      newMessages[1]!.message.content.startsWith('Unknown command:')
    ) {
      
      return newMessages
    }

    // User-Assistant pair (eg. local commands)
    if (newMessages.length === 2) {
      
      return newMessages
    }

    // A valid command
    
    return newMessages
  }

  // 普通用户提示处理分支 - 处理非命令的正常用户输入

  // 检查是否为Koding请求，需要特殊处理
  const isKodingRequest = context.options?.isKodingRequest === true
  const kodingContextInfo = context.options?.kodingContext  // 获取Koding上下文信息

  // Create base message
  let userMessage: UserMessage

  if (pastedImage) {
    userMessage = createUserMessage([
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: pastedImage,
        },
      },
      {
        type: 'text',
        text:
          isKodingRequest && kodingContextInfo
            ? `${kodingContextInfo}\n\n${input}`
            : input,
      },
    ])
  } else {
    let processedInput =
      isKodingRequest && kodingContextInfo
        ? `${kodingContextInfo}\n\n${input}`
        : input

    // Process dynamic content for custom commands with ! and @ prefixes
    // This uses the same processing functions as custom commands to maintain consistency
    if (input.includes('!`') || input.includes('@')) {
      try {
        // Import functions from customCommands service to avoid code duplication
        const { executeBashCommands } = await import(
          '../services/customCommands'
        )

        // Execute bash commands if present
        if (input.includes('!`')) {
          // Note: This function is not exported from customCommands.ts, so we need to expose it
          // For now, we'll keep the local implementation until we refactor the service
          processedInput = await executeBashCommands(processedInput)
        }

        // Process mentions for system reminder integration
        // Note: We don't call resolveFileReferences here anymore - 
        // @file mentions should trigger Read tool usage via reminders, not embed content
        if (input.includes('@')) {
          const { processMentions } = await import('../services/mentionProcessor')
          await processMentions(input)
        }
      } catch (error) {
        console.warn('Dynamic content processing failed:', error)
        // Continue with original input if processing fails
      }
    }

    userMessage = createUserMessage(processedInput)
  }

  // Add the Koding flag to the message if needed
  if (isKodingRequest) {
    userMessage.options = {
      ...userMessage.options,
      isKodingRequest: true,
    }
  }

  return [userMessage]
}

async function getMessagesForSlashCommand(
  commandName: string,
  args: string,
  setToolJSX: SetToolJSXFn,
  context: ToolUseContext & {
    setForkConvoWithMessagesOnTheNextRender: (
      forkConvoWithMessages: Message[],
    ) => void
  },
): Promise<Message[]> {
  try {
    const command = getCommand(commandName, context.options.commands)
    switch (command.type) {
      case 'local-jsx': {
        return new Promise(resolve => {
          command
            .call(r => {
              setToolJSX(null)
              resolve([
                createUserMessage(`<command-name>${command.userFacingName()}</command-name>
          <command-message>${command.userFacingName()}</command-message>
          <command-args>${args}</command-args>`),
                r
                  ? createAssistantMessage(r)
                  : createAssistantMessage(NO_RESPONSE_REQUESTED),
              ])
            }, context)
            .then(jsx => {
              setToolJSX({
                jsx,
                shouldHidePromptInput: true,
              })
            })
        })
      }
      case 'local': {
        const userMessage =
          createUserMessage(`<command-name>${command.userFacingName()}</command-name>
        <command-message>${command.userFacingName()}</command-message>
        <command-args>${args}</command-args>`)

        try {
          // Use the context's abortController for local commands
          const result = await command.call(args, {
            ...context,
            options: {
              commands: context.options.commands || [],
              tools: context.options.tools || [],
              slowAndCapableModel: context.options.slowAndCapableModel || 'main'
            }
          })

          return [
            userMessage,
            createAssistantMessage(
              `<local-command-stdout>${result}</local-command-stdout>`,
            ),
          ]
        } catch (e) {
          logError(e)
          return [
            userMessage,
            createAssistantMessage(
              `<local-command-stderr>${String(e)}</local-command-stderr>`,
            ),
          ]
        }
      }
      case 'prompt': {
        // For custom commands, process them naturally instead of wrapping in command-contents
        const prompt = await command.getPromptForCommand(args)
        return prompt.map(msg => {
          // Create a normal user message from the custom command content
          const userMessage = createUserMessage(
            typeof msg.content === 'string'
              ? msg.content
              : msg.content
                  .map(block => (block.type === 'text' ? block.text : ''))
                  .join('\n'),
          )

          // Add metadata for tracking but don't wrap in special tags
          userMessage.options = {
            ...userMessage.options,
            isCustomCommand: true,
            commandName: command.userFacingName(),
            commandArgs: args,
          }

          return userMessage
        })
      }
    }
  } catch (e) {
    if (e instanceof MalformedCommandError) {
      return [createAssistantMessage(e.message)]
    }
    throw e
  }
}

export function extractTagFromMessage(
  message: Message,
  tagName: string,
): string | null {
  if (message.type === 'progress') {
    return null
  }
  if (typeof message.message.content !== 'string') {
    return null
  }
  return extractTag(message.message.content, tagName)
}

export function extractTag(html: string, tagName: string): string | null {
  if (!html.trim() || !tagName.trim()) {
    return null
  }

  // Escape special characters in the tag name
  const escapedTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // Create regex pattern that handles:
  // 1. Self-closing tags
  // 2. Tags with attributes
  // 3. Nested tags of the same type
  // 4. Multiline content
  const pattern = new RegExp(
    `<${escapedTag}(?:\\s+[^>]*)?>` + // Opening tag with optional attributes
      '([\\s\\S]*?)' + // Content (non-greedy match)
      `<\\/${escapedTag}>`, // Closing tag
    'gi',
  )

  let match
  let depth = 0
  let lastIndex = 0
  const openingTag = new RegExp(`<${escapedTag}(?:\\s+[^>]*?)?>`, 'gi')
  const closingTag = new RegExp(`<\\/${escapedTag}>`, 'gi')

  while ((match = pattern.exec(html)) !== null) {
    // Check for nested tags
    const content = match[1]
    const beforeMatch = html.slice(lastIndex, match.index)

    // Reset depth counter
    depth = 0

    // Count opening tags before this match
    openingTag.lastIndex = 0
    while (openingTag.exec(beforeMatch) !== null) {
      depth++
    }

    // Count closing tags before this match
    closingTag.lastIndex = 0
    while (closingTag.exec(beforeMatch) !== null) {
      depth--
    }

    // Only include content if we're at the correct nesting level
    if (depth === 0 && content) {
      return content
    }

    lastIndex = match.index + match[0].length
  }

  return null
}

export function isNotEmptyMessage(message: Message): boolean {
  if (message.type === 'progress') {
    return true
  }

  if (typeof message.message.content === 'string') {
    return message.message.content.trim().length > 0
  }

  if (message.message.content.length === 0) {
    return false
  }

  // Skip multi-block messages for now
  if (message.message.content.length > 1) {
    return true
  }

  if (message.message.content[0]!.type !== 'text') {
    return true
  }

  return (
    message.message.content[0]!.text.trim().length > 0 &&
    message.message.content[0]!.text !== NO_CONTENT_MESSAGE &&
    message.message.content[0]!.text !== INTERRUPT_MESSAGE_FOR_TOOL_USE
  )
}

// TODO: replace this with plain UserMessage if/when PR #405 lands
type NormalizedUserMessage = {
  message: {
    content: [
      | TextBlockParam
      | ImageBlockParam
      | ToolUseBlockParam
      | ToolResultBlockParam,
    ]
    role: 'user'
  }
  type: 'user'
  uuid: UUID
}

export type NormalizedMessage =
  | NormalizedUserMessage
  | AssistantMessage
  | ProgressMessage

// Split messages, so each content block gets its own message
/**
 * 消息标准化函数
 * 将复合消息拆分为单个内容块，以便于UI显示和API处理
 * @param messages 原始消息数组
 * @returns 标准化后的消息数组，每个消息只包含一个内容块
 */
export function normalizeMessages(messages: Message[]): NormalizedMessage[] {
  return messages.flatMap(message => {
    // 进度消息不需要拆分，直接返回
    if (message.type === 'progress') {
      return [message] as NormalizedMessage[]
    }
    // 字符串内容不需要拆分，直接返回
    if (typeof message.message.content === 'string') {
      return [message] as NormalizedMessage[]
    }
    return message.message.content.map(_ => {
      switch (message.type) {
        case 'assistant':
          return {
            type: 'assistant',
            uuid: randomUUID(),
            message: {
              ...message.message,
              content: [_],
            },
            costUSD:
              (message as AssistantMessage).costUSD /
              message.message.content.length,
            durationMs: (message as AssistantMessage).durationMs,
          } as NormalizedMessage
        case 'user':
          // It seems like the line below was a no-op before, but I'm not sure.
          // To check, we could throw an error if any of the following are true:
          // - message `role` does isn't `user` -- this possibility is allowed by MCP tools,
          //   though isn't supposed to happen in practice (we should fix this)
          // - message `content` is not an array -- this one is more concerning because it's
          //   not allowed by the `NormalizedUserMessage` type, but if it's happening that was
          //   probably a bug before.
          // Maybe I'm missing something? -(ab)
          // return createUserMessage([_]) as NormalizedMessage
          return message as NormalizedUserMessage
      }
    })
  })
}

type ToolUseRequestMessage = AssistantMessage & {
  message: { content: ToolUseBlock[] }
}

function isToolUseRequestMessage(
  message: Message,
): message is ToolUseRequestMessage {
  return (
    message.type === 'assistant' &&
    'costUSD' in message &&
    // Note: stop_reason === 'tool_use' is unreliable -- it's not always set correctly
    message.message.content.some(_ => _.type === 'tool_use')
  )
}

// Re-order, to move result messages to be after their tool use messages
/**
 * 消息重排序函数
 * 将工具结果消息移动到对应的工具使用消息之后，保持正确的执行顺序
 * @param messages 标准化的消息数组
 * @returns 重排序后的消息数组
 */
export function reorderMessages(
  messages: NormalizedMessage[],
): NormalizedMessage[] {
  const ms: NormalizedMessage[] = []                    // 重排序后的消息数组
  const toolUseMessages: ToolUseRequestMessage[] = []    // 工具使用请求消息列表

  for (const message of messages) {
    // track tool use messages we've seen
    if (isToolUseRequestMessage(message)) {
      toolUseMessages.push(message)
    }

    // if it's a tool progress message...
    if (message.type === 'progress') {
      // replace any existing progress messages with this one
      const existingProgressMessage = ms.find(
        _ => _.type === 'progress' && _.toolUseID === message.toolUseID,
      )
      if (existingProgressMessage) {
        ms[ms.indexOf(existingProgressMessage)] = message
        continue
      }
      // otherwise, insert it after its tool use
      const toolUseMessage = toolUseMessages.find(
        _ => _.message.content[0]?.id === message.toolUseID,
      )
      if (toolUseMessage) {
        ms.splice(ms.indexOf(toolUseMessage) + 1, 0, message)
        continue
      }
    }

    // if it's a tool result, insert it after its tool use and progress messages
    if (
      message.type === 'user' &&
      Array.isArray(message.message.content) &&
      message.message.content[0]?.type === 'tool_result'
    ) {
      const toolUseID = (message.message.content[0] as ToolResultBlockParam)
        ?.tool_use_id

      // First check for progress messages
      const lastProgressMessage = ms.find(
        _ => _.type === 'progress' && _.toolUseID === toolUseID,
      )
      if (lastProgressMessage) {
        ms.splice(ms.indexOf(lastProgressMessage) + 1, 0, message)
        continue
      }

      // If no progress messages, check for tool use messages
      const toolUseMessage = toolUseMessages.find(
        _ => _.message.content[0]?.id === toolUseID,
      )
      if (toolUseMessage) {
        ms.splice(ms.indexOf(toolUseMessage) + 1, 0, message)
        continue
      }
    }

    // otherwise, just add it to the list
    else {
      ms.push(message)
    }
  }

  return ms
}

const getToolResultIDs = memoize(
  (normalizedMessages: NormalizedMessage[]): { [toolUseID: string]: boolean } =>
    Object.fromEntries(
      normalizedMessages.flatMap(_ =>
        _.type === 'user' && _.message.content[0]?.type === 'tool_result'
          ? [
              [
                _.message.content[0]!.tool_use_id,
                _.message.content[0]!.is_error ?? false,
              ],
            ]
          : ([] as [string, boolean][]),
      ),
    ),
)

export function getUnresolvedToolUseIDs(
  normalizedMessages: NormalizedMessage[],
): Set<string> {
  const toolResults = getToolResultIDs(normalizedMessages)
  return new Set(
    normalizedMessages
      .filter(
        (
          _,
        ): _ is AssistantMessage & {
          message: { content: [ToolUseBlockParam] }
        } =>
          _.type === 'assistant' &&
          Array.isArray(_.message.content) &&
          _.message.content[0]?.type === 'tool_use' &&
          !(_.message.content[0]?.id in toolResults),
      )
      .map(_ => _.message.content[0].id),
  )
}

/**
 * Tool uses are in flight if either:
 * 1. They have a corresponding progress message and no result message
 * 2. They are the first unresoved tool use
 *
 * TODO: Find a way to harden this logic to make it more explicit
 */
/**
 * 获取正在执行中的工具使用ID集合
 * 工具使用处于执行中状态的条件：
 * 1. 有对应的进度消息但没有结果消息
 * 2. 是第一个未解决的工具使用
 * @param normalizedMessages 标准化消息数组
 * @returns 正在执行中的工具使用ID集合
 */
export function getInProgressToolUseIDs(
  normalizedMessages: NormalizedMessage[],
): Set<string> {
  const unresolvedToolUseIDs = getUnresolvedToolUseIDs(normalizedMessages)  // 获取所有未解决的工具ID
  const toolUseIDsThatHaveProgressMessages = new Set(                      // 有进度消息的工具ID
    normalizedMessages.filter(_ => _.type === 'progress').map(_ => _.toolUseID),
  )
  return new Set(
    (
      normalizedMessages.filter(_ => {
        if (_.type !== 'assistant') {
          return false
        }
        if (_.message.content[0]?.type !== 'tool_use') {
          return false
        }
        const toolUseID = _.message.content[0].id
        if (toolUseID === unresolvedToolUseIDs.values().next().value) {
          return true
        }

        if (
          toolUseIDsThatHaveProgressMessages.has(toolUseID) &&
          unresolvedToolUseIDs.has(toolUseID)
        ) {
          return true
        }

        return false
      }) as AssistantMessage[]
    ).map(_ => (_.message.content[0]! as ToolUseBlockParam).id),
  )
}

export function getErroredToolUseMessages(
  normalizedMessages: NormalizedMessage[],
): AssistantMessage[] {
  const toolResults = getToolResultIDs(normalizedMessages)
  return normalizedMessages.filter(
    _ =>
      _.type === 'assistant' &&
      Array.isArray(_.message.content) &&
      _.message.content[0]?.type === 'tool_use' &&
      _.message.content[0]?.id in toolResults &&
      toolResults[_.message.content[0]?.id],
  ) as AssistantMessage[]
}

/**
 * 为API调用标准化消息
 * 过滤掉进度消息，合并相同类型的连续工具结果消息
 * @param messages 原始消息数组
 * @returns 适合API调用的消息数组，不包含进度消息
 */
export function normalizeMessagesForAPI(
  messages: Message[],
): (UserMessage | AssistantMessage)[] {
  const result: (UserMessage | AssistantMessage)[] = []
  messages
    .filter(_ => _.type !== 'progress')  // 过滤掉进度消息，因为它们不发送给AI模型
    .forEach(message => {
      switch (message.type) {
        case 'user': {
          // If the current message is not a tool result, add it to the result
          if (
            !Array.isArray(message.message.content) ||
            message.message.content[0]?.type !== 'tool_result'
          ) {
            result.push(message)
            return
          }

          // If the last message is not a tool result, add it to the result
          const lastMessage = last(result)
          if (
            !lastMessage ||
            lastMessage?.type === 'assistant' ||
            !Array.isArray(lastMessage.message.content) ||
            lastMessage.message.content[0]?.type !== 'tool_result'
          ) {
            result.push(message)
            return
          }

          // Otherwise, merge the current message with the last message
          result[result.indexOf(lastMessage)] = {
            ...lastMessage,
            message: {
              ...lastMessage.message,
              content: [
                ...lastMessage.message.content,
                ...message.message.content,
              ],
            },
          }
          return
        }
        case 'assistant':
          result.push(message)
          return
      }
    })
  return result
}

// Sometimes the API returns empty messages (eg. "\n\n"). We need to filter these out,
// otherwise they will give an API error when we send them to the API next time we call query().
export function normalizeContentFromAPI(
  content: APIMessage['content'],
): APIMessage['content'] {
  const filteredContent = content.filter(
    _ => _.type !== 'text' || _.text.trim().length > 0,
  )

  if (filteredContent.length === 0) {
    return [{ type: 'text', text: NO_CONTENT_MESSAGE, citations: [] }]
  }

  return filteredContent
}

export function isEmptyMessageText(text: string): boolean {
  return (
    stripSystemMessages(text).trim() === '' ||
    text.trim() === NO_CONTENT_MESSAGE
  )
}
const STRIPPED_TAGS = [
  'commit_analysis',
  'context',
  'function_analysis',
  'pr_analysis',
]

export function stripSystemMessages(content: string): string {
  const regex = new RegExp(`<(${STRIPPED_TAGS.join('|')})>.*?</\\1>\n?`, 'gs')
  return content.replace(regex, '').trim()
}

export function getToolUseID(message: NormalizedMessage): string | null {
  switch (message.type) {
    case 'assistant':
      if (message.message.content[0]?.type !== 'tool_use') {
        return null
      }
      return message.message.content[0].id
    case 'user':
      if (message.message.content[0]?.type !== 'tool_result') {
        return null
      }
      return message.message.content[0].tool_use_id
    case 'progress':
      return message.toolUseID
  }
}

export function getLastAssistantMessageId(
  messages: Message[],
): string | undefined {
  // Iterate from the end of the array to find the last assistant message
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message && message.type === 'assistant') {
      return message.message.id
    }
  }
  return undefined
}
