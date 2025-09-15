// 导入Zod库，用于运行时类型验证和模式定义
import { z } from 'zod'
// 导入React库，用于JSX组件类型定义
import * as React from 'react'

/**
 * Kode可扩展工具系统的核心工具接口
 * 为所有工具实现提供标准化契约
 */

// 定义设置工具JSX的函数类型 - 用于在工具执行期间显示UI组件
export type SetToolJSXFn = (jsx: {
  jsx: React.ReactNode | null        // 要显示的React组件节点，可以为null
  shouldHidePromptInput: boolean     // 是否应该隐藏提示输入框
} | null) => void                    // 整个参数可以为null表示清除JSX

// 定义工具使用上下文接口 - 包含工具执行时的所有环境信息
export interface ToolUseContext {
  messageId: string | undefined      // 当前消息的唯一标识符
  agentId?: string                   // 可选的代理标识符
  safeMode?: boolean                 // 可选的安全模式标志
  abortController: AbortController   // 用于取消工具操作的控制器
  readFileTimestamps: { [filePath: string]: number }  // 文件读取时间戳映射，用于缓存控制
  options?: {                        // 可选的配置选项
    commands?: any[]                 // 可用命令列表
    tools?: any[]                    // 可用工具列表
    verbose?: boolean                // 详细输出模式标志
    slowAndCapableModel?: string     // 慢速但功能强大的模型名称
    safeMode?: boolean               // 安全模式标志
    forkNumber?: number              // 分叉编号
    messageLogName?: string          // 消息日志名称
    maxThinkingTokens?: any          // 最大思考token数
    isKodingRequest?: boolean        // 是否为Koding请求
    kodingContext?: string           // Koding上下文
    isCustomCommand?: boolean        // 是否为自定义命令
  }
  // GPT-5 响应API状态管理
  responseState?: {
    previousResponseId?: string      // 前一个响应的ID
    conversationId?: string          // 对话ID
  }
}

// 扩展的工具使用上下文接口 - 继承基础上下文并添加JSX设置功能
export interface ExtendedToolUseContext extends ToolUseContext {
  setToolJSX: SetToolJSXFn          // 设置工具JSX显示的函数
}

// 验证结果接口 - 用于工具输入验证的返回值
export interface ValidationResult {
  result: boolean                   // 验证是否通过
  message?: string                  // 可选的验证消息
  errorCode?: number                // 可选的错误代码
  meta?: any                        // 可选的元数据
}

// 核心工具接口 - 定义所有工具必须实现的标准契约
export interface Tool<
  TInput extends z.ZodObject<any> = z.ZodObject<any>,  // 输入类型，必须是Zod对象模式
  TOutput = any,                                       // 输出类型，可以是任意类型
> {
  name: string                                         // 工具名称
  description?: () => Promise<string>                  // 可选的工具描述生成函数（异步）
  inputSchema: TInput                                  // 输入数据的Zod验证模式
  inputJSONSchema?: Record<string, unknown>            // 可选的JSON Schema表示
  prompt: (options?: { safeMode?: boolean }) => Promise<string>  // 生成工具提示词的异步函数
  userFacingName?: () => string                        // 可选的用户界面显示名称
  isEnabled: () => Promise<boolean>                    // 检查工具是否启用的异步函数
  isReadOnly: () => boolean                            // 检查工具是否为只读（不修改系统状态）
  isConcurrencySafe: () => boolean                     // 检查工具是否可以并发执行
  needsPermissions: (input?: z.infer<TInput>) => boolean  // 检查是否需要用户权限
  validateInput?: (                                    // 可选的输入验证函数
    input: z.infer<TInput>,                           // 输入数据
    context?: ToolUseContext,                         // 可选的使用上下文
  ) => Promise<ValidationResult>                      // 返回验证结果
  renderResultForAssistant: (output: TOutput) => string | any[]  // 为AI助手渲染结果的函数
  renderToolUseMessage: (                             // 渲染工具使用消息的函数
    input: z.infer<TInput>,                           // 输入数据
    options: { verbose: boolean },                    // 选项，包括详细模式标志
  ) => string                                         // 返回消息字符串
  renderToolUseRejectedMessage?: (...args: any[]) => React.ReactElement  // 可选的工具使用被拒绝消息渲染器
  renderToolResultMessage?: (output: TOutput) => React.ReactElement       // 可选的工具结果消息渲染器
  call: (                                             // 工具的核心执行函数
    input: z.infer<TInput>,                           // 输入数据
    context: ToolUseContext,                          // 使用上下文
  ) => AsyncGenerator<                                // 返回异步生成器，支持流式输出
    | { type: 'result'; data: TOutput; resultForAssistant?: string }      // 结果类型输出
    | { type: 'progress'; content: any; normalizedMessages?: any[]; tools?: any[] },  // 进度类型输出
    void,                                             // 生成器不返回值
    unknown                                           // 生成器不接受输入
  >
}
