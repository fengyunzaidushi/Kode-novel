/**
 * 🎯 对话与消息系统类型定义 - 统一的消息处理框架
 *
 * 🏗️ 核心功能：
 * - 定义用户、助手和进度消息的统一接口
 * - 支持工具调用结果的集成和传递
 * - 提供完整的对话会话类型安全
 * - 集成成本追踪和性能监控数据
 *
 * 🔄 依赖关系：
 * - 上游：被调试日志器和对话相关工具使用
 * - 下游：依赖 Anthropic AI SDK 和 crypto UUID
 *
 * 📊 使用场景：
 * - 对话历史的序列化和反序列化
 * - 消息流的类型安全处理
 * - 工具执行结果的消息集成
 * - 调试和日志记录的统一接口
 *
 * 🔧 技术实现：
 * - 与 query.ts 中的 Message 类型保持一致
 * - 支持 Anthropic AI SDK 的原生消息格式
 * - 包含完整的元数据和选项配置
 * - 类型安全的联合类型定义
 */

import { UUID } from 'crypto'
import type { MessageParam } from '@anthropic-ai/sdk/resources/index.mjs'
import type { Message as APIAssistantMessage } from '@anthropic-ai/sdk/resources/index.mjs'

/**
 * 基础消息接口 - 对话系统中使用的统一消息类型
 *
 * 这是一个联合类型，与 query.ts 中的 Message 类型保持完全一致，
 * 确保整个系统中消息类型的统一性和类型安全。
 */
export type Message = UserMessage | AssistantMessage | ProgressMessage

/**
 * 用户消息结构 - 来自用户的输入消息和工具执行结果
 */
export interface UserMessage {
  /** 符合 Anthropic API 格式的消息参数 */
  message: MessageParam
  /** 消息类型标识 */
  type: 'user'
  /** 消息的唯一标识符 */
  uuid: UUID
  /** 工具使用的完整结果 (FullToolUseResult 类型) */
  toolUseResult?: any
  /** 用户消息的可选配置 */
  options?: {
    /** 是否为编程请求 */
    isKodingRequest?: boolean
    /** 编程上下文信息 */
    kodingContext?: string
  }
}

/**
 * 助手消息结构 - AI 助手的响应消息和元数据
 */
export interface AssistantMessage {
  /** 本次响应的美元成本 */
  costUSD: number
  /** 响应生成耗时（毫秒） */
  durationMs: number
  /** 符合 Anthropic API 格式的助手消息 */
  message: APIAssistantMessage
  /** 消息类型标识 */
  type: 'assistant'
  /** 消息的唯一标识符 */
  uuid: UUID
  /** 是否为 API 错误消息 */
  isApiErrorMessage?: boolean
}

/**
 * 进度消息结构 - 工具执行过程中的进度更新消息
 *
 * 用于在工具执行期间向用户显示实时进度和状态更新。
 */
export interface ProgressMessage {
  /** 包含的助手消息内容 */
  content: AssistantMessage
  /** 标准化的消息列表 (NormalizedMessage 类型) */
  normalizedMessages: any[]
  /** 并行执行的工具使用 ID 集合 */
  siblingToolUseIDs: Set<string>
  /** 相关的工具列表 (Tool 类型) */
  tools: any[]
  /** 当前工具使用的 ID */
  toolUseID: string
  /** 消息类型标识 */
  type: 'progress'
  /** 消息的唯一标识符 */
  uuid: UUID
}