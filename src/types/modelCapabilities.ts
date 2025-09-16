/**
 * 🎯 模型能力类型定义 - 统一 API 支持的完整框架
 *
 * 🏗️ 核心功能：
 * - 定义不同 AI 模型的能力和限制
 * - 提供统一的请求和响应接口
 * - 支持多种 API 架构的适配和回退
 * - 管理工具调用和状态管理能力
 *
 * 🔄 依赖关系：
 * - 上游：被模型适配器和服务层使用
 * - 下游：适配各种 AI 模型 API（OpenAI、Anthropic 等）
 *
 * 📊 使用场景：
 * - 多模型支持的统一接口实现
 * - 模型能力检测和功能启用
 * - API 调用参数的标准化处理
 * - 不同模型间的兼容性管理
 *
 * 🔧 技术实现：
 * - 支持 Chat Completions 和 Responses API 两种架构
 * - 完整的工具调用能力定义
 * - 灵活的参数映射和适配机制
 * - 统一的流式传输和状态管理
 */

/**
 * 模型能力接口 - 描述 AI 模型的完整能力集合
 */
export interface ModelCapabilities {
  /** API 架构类型配置 */
  apiArchitecture: {
    /** 主要 API 架构：聊天完成或响应式 API */
    primary: 'chat_completions' | 'responses_api'
    /** 备用架构（响应式 API 模型可回退到聊天完成） */
    fallback?: 'chat_completions'
  }

  /** 参数映射配置 */
  parameters: {
    /** 最大令牌字段名称 */
    maxTokensField: 'max_tokens' | 'max_completion_tokens'
    /** 是否支持推理强度参数 */
    supportsReasoningEffort: boolean
    /** 是否支持详细程度参数 */
    supportsVerbosity: boolean
    /** 温度参数模式：灵活、固定为1或受限 */
    temperatureMode: 'flexible' | 'fixed_one' | 'restricted'
  }

  /** 工具调用能力 */
  toolCalling: {
    /** 工具调用模式：无、函数调用或自定义工具 */
    mode: 'none' | 'function_calling' | 'custom_tools'
    /** 是否支持自由格式工具调用 */
    supportsFreeform: boolean
    /** 是否支持允许工具列表限制 */
    supportsAllowedTools: boolean
    /** 是否支持并行工具调用 */
    supportsParallelCalls: boolean
  }

  /** 状态管理能力 */
  stateManagement: {
    /** 是否支持响应 ID */
    supportsResponseId: boolean
    /** 是否支持对话链式调用 */
    supportsConversationChaining: boolean
    /** 是否支持前一个响应 ID 引用 */
    supportsPreviousResponseId: boolean
  }

  /** 流式传输支持 */
  streaming: {
    /** 是否支持流式响应 */
    supported: boolean
    /** 是否在流中包含使用量信息 */
    includesUsage: boolean
  }
}

/**
 * 统一请求参数接口 - 标准化的 AI 模型请求格式
 */
export interface UnifiedRequestParams {
  /** 对话消息列表 */
  messages: any[]
  /** 系统提示列表 */
  systemPrompt: string[]
  /** 可用工具列表 */
  tools?: any[]
  /** 最大生成令牌数 */
  maxTokens: number
  /** 是否启用流式传输 */
  stream?: boolean
  /** 前一个响应的 ID（用于状态管理） */
  previousResponseId?: string
  /** 推理强度级别：最小、低、中、高 */
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
  /** 响应详细程度：低、中、高 */
  verbosity?: 'low' | 'medium' | 'high'
  /** 生成温度（创造性控制） */
  temperature?: number
  /** 允许使用的工具列表 */
  allowedTools?: string[]
}

/**
 * 统一响应格式接口 - 标准化的 AI 模型响应格式
 */
export interface UnifiedResponse {
  /** 响应的唯一标识符 */
  id: string
  /** 生成的文本内容 */
  content: string
  /** 工具调用列表（如果有） */
  toolCalls?: any[]
  /** 令牌使用统计 */
  usage: {
    /** 提示令牌数 */
    promptTokens: number
    /** 完成令牌数 */
    completionTokens: number
    /** 推理令牌数（如果支持） */
    reasoningTokens?: number
  }
  /** 响应 ID（用于响应式 API 状态管理） */
  responseId?: string
}