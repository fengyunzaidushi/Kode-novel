/**
 * 🎯 工具系统核心接口 - Kode 可扩展架构的基础层
 *
 * 🏗️ 核心功能：
 * - 定义所有工具必须实现的标准化契约
 * - 提供类型安全的工具输入输出接口
 * - 集成权限系统和安全验证机制
 * - 支持异步操作和流式输出处理
 *
 * 🔄 依赖关系：
 * - 上游：被所有具体工具实现和工具管理器使用
 * - 下游：依赖 Zod 验证库和 React 组件系统
 *
 * 📊 使用场景：
 * - 工具系统的架构基础定义
 * - 新工具开发的接口规范
 * - 工具权限管理和安全验证
 * - AI 代理的工具调用和结果处理
 *
 * 🔧 技术实现：
 * - 基于 TypeScript 泛型的类型安全设计
 * - Zod 运行时类型验证和 JSON Schema 支持
 * - React 组件集成用于 UI 渲染
 * - 异步生成器模式支持流式处理
 */

// 导入Zod库，用于运行时类型验证和模式定义
import { z } from 'zod'
// 导入React库，用于JSX组件类型定义
import * as React from 'react'

/**
 * 工具 JSX 设置函数类型 - 工具 UI 组件渲染控制器
 *
 * 用于在工具执行期间动态设置和更新用户界面组件，
 * 支持工具的实时交互和状态显示。
 *
 * @param jsx - JSX 配置对象或 null（清除显示）
 * @param jsx.jsx - 要显示的 React 组件节点
 * @param jsx.shouldHidePromptInput - 是否隐藏用户输入框
 */
export type SetToolJSXFn = (jsx: {
  jsx: React.ReactNode | null        // 要显示的React组件节点，可以为null
  shouldHidePromptInput: boolean     // 是否应该隐藏提示输入框
} | null) => void                    // 整个参数可以为null表示清除JSX

/**
 * 工具使用上下文接口 - 工具执行时的完整环境信息
 *
 * 包含工具执行所需的所有上下文数据，包括消息状态、
 * 配置选项、文件缓存信息和模型响应状态。
 */
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

/**
 * 扩展工具使用上下文接口 - 包含 UI 交互能力的工具上下文
 *
 * 继承基础工具上下文，增加了 JSX 组件渲染控制功能，
 * 支持工具的动态 UI 更新和用户交互。
 */
export interface ExtendedToolUseContext extends ToolUseContext {
  /** 设置工具 JSX 显示的函数 - 用于动态更新工具 UI */
  setToolJSX: SetToolJSXFn
}

/**
 * 验证结果接口 - 工具输入验证的标准化返回值
 *
 * 提供统一的验证结果格式，支持详细的错误信息
 * 和元数据传递，确保验证过程的可追溯性。
 */
export interface ValidationResult {
  /** 验证是否通过 */
  result: boolean
  /** 可选的验证消息 - 用于详细说明验证结果 */
  message?: string
  /** 可选的错误代码 - 用于程序化处理验证错误 */
  errorCode?: number
  /** 可选的元数据 - 用于传递额外的验证信息 */
  meta?: any
}

/**
 * 核心工具接口 - Kode 工具系统的标准化契约
 *
 * 定义所有工具必须实现的完整接口规范，包括类型安全、
 * 权限控制、验证机制和异步执行支持。
 *
 * @template TInput - 工具输入类型，必须是 Zod 对象模式
 * @template TOutput - 工具输出类型，可以是任意类型
 */
export interface Tool<
  TInput extends z.ZodObject<any> = z.ZodObject<any>,  // 输入类型，必须是Zod对象模式
  TOutput = any,                                       // 输出类型，可以是任意类型
> {
  /** 工具名称 - 唯一标识符 */
  name: string

  /** 工具描述生成函数 - 异步获取工具功能说明 */
  description?: () => Promise<string>

  /** 输入数据验证模式 - 基于 Zod 的类型安全验证 */
  inputSchema: TInput

  /** JSON Schema 表示 - 可选的标准化模式描述 */
  inputJSONSchema?: Record<string, unknown>

  /**
   * 工具提示词生成函数 - 为 AI 模型生成使用指导
   *
   * @param options - 可选配置，包括安全模式等
   * @returns 生成的提示词字符串
   */
  prompt: (options?: { safeMode?: boolean }) => Promise<string>

  /** 用户界面显示名称生成函数 - 可选的友好名称 */
  userFacingName?: () => string

  /**
   * 工具启用状态检查 - 异步检查工具是否可用
   *
   * @returns 工具是否启用的布尔值
   */
  isEnabled: () => Promise<boolean>

  /**
   * 只读模式检查 - 确定工具是否修改系统状态
   *
   * @returns 是否为只读工具
   */
  isReadOnly: () => boolean

  /**
   * 并发安全检查 - 确定工具是否支持并发执行
   *
   * @returns 是否支持并发执行
   */
  isConcurrencySafe: () => boolean

  /**
   * 权限需求检查 - 确定是否需要用户授权
   *
   * @param input - 可选的输入数据，用于条件性权限检查
   * @returns 是否需要用户权限
   */
  needsPermissions: (input?: z.infer<TInput>) => boolean

  /**
   * 输入验证函数 - 可选的自定义验证逻辑
   *
   * @param input - 待验证的输入数据
   * @param context - 可选的工具使用上下文
   * @returns 验证结果对象
   */
  validateInput?: (
    input: z.infer<TInput>,
    context?: ToolUseContext,
  ) => Promise<ValidationResult>

  /**
   * AI 助手结果渲染器 - 将工具输出格式化为 AI 可理解的形式
   *
   * @param output - 工具执行输出
   * @returns 格式化的字符串或对象数组
   */
  renderResultForAssistant: (output: TOutput) => string | any[]

  /**
   * 工具使用消息渲染器 - 生成工具调用的显示消息
   *
   * @param input - 工具输入数据
   * @param options - 渲染选项，包括详细模式标志
   * @returns 格式化的消息字符串
   */
  renderToolUseMessage: (
    input: z.infer<TInput>,
    options: { verbose: boolean },
  ) => string

  /** 工具使用被拒绝消息渲染器 - 可选的权限拒绝 UI 组件 */
  renderToolUseRejectedMessage?: (...args: any[]) => React.ReactElement

  /** 工具结果消息渲染器 - 可选的结果显示 UI 组件 */
  renderToolResultMessage?: (output: TOutput) => React.ReactElement

  /**
   * 工具核心执行函数 - 异步生成器模式支持流式处理
   *
   * @param input - 验证后的输入数据
   * @param context - 工具执行上下文
   * @returns 异步生成器，产生结果或进度信息
   */
  call: (
    input: z.infer<TInput>,
    context: ToolUseContext,
  ) => AsyncGenerator<
    | { type: 'result'; data: TOutput; resultForAssistant?: string }      // 最终结果输出
    | { type: 'progress'; content: any; normalizedMessages?: any[]; tools?: any[] },  // 进度状态输出
    void,                                             // 生成器不返回值
    unknown                                           // 生成器不接受输入
  >
}
