/**
 * 🎯 消息上下文管理器 - 智能对话上下文窗口管理系统
 *
 * 🏗️ 核心功能：
 * - 实现多策略的消息截断和压缩算法
 * - 提供智能的对话上下文保留机制
 * - 管理 AI 模型的上下文窗口限制
 * - 支持重要消息的优先保留策略
 * - 集成对话历史的智能摘要生成
 *
 * 🔄 依赖关系：
 * - 上游：被查询系统和 AI 服务使用
 * - 下游：依赖 token 计算和消息类型定义
 *
 * 📊 使用场景：
 * - 长对话的上下文窗口管理
 * - AI 模型 token 限制的智能处理
 * - 重要信息的自动保留和压缩
 * - 对话历史的结构化管理
 *
 * 🔧 技术实现：
 * - 策略模式：多种截断策略的动态选择
 * - 智能压缩：基于内容重要性的压缩算法
 * - 摘要生成：对话历史的自动摘要创建
 * - Token 管理：精确的上下文窗口控制
 *
 * 🎯 支持的截断策略：
 * - preserve_recent: 保留最近消息策略
 * - preserve_important: 保留重要消息策略
 * - smart_compression: 智能压缩摘要策略
 * - auto_compact: 自动紧凑压缩策略
 *
 * 💡 设计原则：
 * - 上下文连续性：确保对话逻辑的连贯性
 * - 信息重要性：优先保留关键和错误信息
 * - 性能优化：高效的截断和压缩算法
 * - 用户体验：透明的策略选择和结果反馈
 */
import { Message } from '../query'
import type { UUID } from '../types/common'
import { countTokens } from './tokens'
import crypto from 'crypto'

/**
 * 消息保留策略接口 - 定义上下文截断的策略配置
 *
 * 配置消息截断和压缩的策略参数，支持多种算法
 * 和自定义阈值的灵活组合。
 */
export interface MessageRetentionStrategy {
  /** 策略类型 - 确定使用的截断算法 */
  type:
    | 'preserve_recent'    // 保留最近消息
    | 'preserve_important' // 保留重要消息
    | 'smart_compression'  // 智能压缩摘要
    | 'auto_compact'       // 自动紧凑压缩
  /** 最大 token 限制 - 截断后的目标 token 数量 */
  maxTokens: number
  /** 保留消息数量 - 可选的固定保留数量 */
  preserveCount?: number
  /** 重要性阈值 - 判断消息重要性的阈值（0-1） */
  importanceThreshold?: number
}

/**
 * 消息截断结果接口 - 截断操作的完整结果信息
 *
 * 包含截断后的消息、统计信息和操作摘要，
 * 用于追踪和调试上下文管理的效果。
 */
export interface MessageTruncationResult {
  /** 截断后的消息列表 - 保留的消息数组 */
  truncatedMessages: Message[]
  /** 移除消息数量 - 被截断的消息总数 */
  removedCount: number
  /** 保留的 token 数量 - 截断后的实际 token 数 */
  preservedTokens: number
  /** 策略描述 - 使用的截断策略说明 */
  strategy: string
  /** 操作摘要 - 可选的详细操作描述 */
  summary?: string
}

/**
 * 消息上下文管理器 - 智能对话上下文截断的核心实现
 *
 * 为有上下文限制的 AI 模型实现多种智能截断策略，
 * 确保重要对话内容的保留和上下文连续性。
 *
 * 🎯 主要功能：
 * - 多策略消息截断算法
 * - 智能重要性判断机制
 * - 对话历史摘要生成
 * - Token 精确计算和控制
 *
 * 💡 设计特点：
 * - 策略模式：支持多种截断策略
 * - 智能保留：基于内容重要性的保留
 * - 上下文连续性：确保对话逻辑完整
 * - 透明操作：详细的操作结果反馈
 */
export class MessageContextManager {
  /**
   * 智能截断消息 - 基于策略和 token 限制的消息截断
   *
   * 根据指定的保留策略和 token 限制，智能地截断消息列表，
   * 保留重要内容并确保上下文的连续性。
   *
   * @param messages - 原始消息列表
   * @param strategy - 保留策略配置
   * @returns Promise<MessageTruncationResult> - 截断结果和统计信息
   *
   * 🔄 处理流程：
   * 1. 根据策略类型选择截断算法
   * 2. 执行相应的截断逻辑
   * 3. 计算 token 数量和统计信息
   * 4. 返回完整的截断结果
   *
   * 🎯 支持策略：
   * - preserve_recent: 保留最新消息
   * - preserve_important: 保留重要消息
   * - smart_compression: 智能压缩摘要
   * - auto_compact: 自动紧凑处理
   */
  async truncateMessages(
    messages: Message[],
    strategy: MessageRetentionStrategy,
  ): Promise<MessageTruncationResult> {
    switch (strategy.type) {
      case 'preserve_recent':
        return this.preserveRecentMessages(messages, strategy)
      case 'preserve_important':
        return this.preserveImportantMessages(messages, strategy)
      case 'smart_compression':
        return this.smartCompressionStrategy(messages, strategy)
      case 'auto_compact':
        return this.autoCompactStrategy(messages, strategy)
      default:
        return this.preserveRecentMessages(messages, strategy)
    }
  }

  /**
   * 策略 1: 保留最近消息 - 基于时间顺序的简单截断
   *
   * 保留对话中最近的一定数量的消息，丢弃较早的消息。
   * 这是最简单直接的截断策略，确保最新的对话上下文得到保留。
   *
   * @param messages - 消息列表
   * @param strategy - 策略配置
   * @returns MessageTruncationResult - 截断结果
   *
   * 🎯 策略特点：
   * - 时间优先：按时间顺序保留最新消息
   * - 简单高效：无需复杂的重要性判断
   * - 上下文连续：保持最近对话的连贯性
   * - 可预测：结果易于理解和预期
   */
  private preserveRecentMessages(
    messages: Message[],
    strategy: MessageRetentionStrategy,
  ): MessageTruncationResult {
    const preserveCount =
      strategy.preserveCount || this.estimateMessageCount(strategy.maxTokens)
    const truncatedMessages = messages.slice(-preserveCount)
    const removedCount = messages.length - truncatedMessages.length

    return {
      truncatedMessages,
      removedCount,
      preservedTokens: countTokens(truncatedMessages),
      strategy: `Preserved last ${preserveCount} messages`,
      summary:
        removedCount > 0
          ? `Removed ${removedCount} older messages to fit context window`
          : 'No messages removed',
    }
  }

  /**
   * 策略 2: 保留重要消息 - 基于内容重要性的智能保留
   *
   * 识别并保留对话中的重要消息（错误、用户查询、关键决策等），
   * 同时保留最近的消息以维持上下文连续性。
   *
   * @param messages - 消息列表
   * @param strategy - 策略配置
   * @returns MessageTruncationResult - 截断结果
   *
   * 🎯 重要性判断标准：
   * - 用户消息：始终被视为重要
   * - 错误消息：包含错误关键词的消息
   * - 最近消息：保持对话连续性
   * - 工具调用：关键的系统操作
   *
   * 🔄 处理流程：
   * 1. 提取最近消息（保证连续性）
   * 2. 识别历史中的重要消息
   * 3. 合并并去重消息列表
   * 4. 按原始顺序排序
   */
  private preserveImportantMessages(
    messages: Message[],
    strategy: MessageRetentionStrategy,
  ): MessageTruncationResult {
    const importantMessages: Message[] = []
    const recentMessages: Message[] = []

    // Always preserve the last few messages for context continuity
    const recentCount = Math.min(5, messages.length)
    recentMessages.push(...messages.slice(-recentCount))

    // Identify important messages (errors, tool failures, user decisions)
    for (let i = 0; i < messages.length - recentCount; i++) {
      const message = messages[i]
      if (this.isImportantMessage(message)) {
        importantMessages.push(message)
      }
    }

    // Combine and deduplicate
    const combinedMessages = [
      ...importantMessages,
      ...recentMessages.filter(
        msg => !importantMessages.some(imp => this.messagesEqual(imp, msg)),
      ),
    ]

    // Sort by original order
    const truncatedMessages = combinedMessages.sort((a, b) => {
      const aIndex = messages.indexOf(a)
      const bIndex = messages.indexOf(b)
      return aIndex - bIndex
    })

    const removedCount = messages.length - truncatedMessages.length

    return {
      truncatedMessages,
      removedCount,
      preservedTokens: countTokens(truncatedMessages),
      strategy: `Preserved ${importantMessages.length} important + ${recentMessages.length} recent messages`,
      summary: `Kept critical errors, user decisions, and recent context (${removedCount} messages archived)`,
    }
  }

  /**
   * 策略 3: 智能压缩摘要 - 对话历史的智能摘要生成
   *
   * 将较早的消息压缩为摘要，保留最近的完整消息，
   * 实现对话历史的高效压缩和关键信息的保留。
   *
   * @param messages - 消息列表
   * @param strategy - 策略配置
   * @returns Promise<MessageTruncationResult> - 截断结果
   *
   * 🔄 压缩流程：
   * 1. 分离较早消息和最近消息
   * 2. 对较早消息生成智能摘要
   * 3. 创建摘要消息节点
   * 4. 与最近消息合并
   *
   * 🎯 摘要特性：
   * - 统计信息：消息数量和类型统计
   * - 主题提取：识别对话的关键主题
   * - 工具使用：记录工具调用情况
   * - 结构化：标准格式的摘要内容
   */
  private async smartCompressionStrategy(
    messages: Message[],
    strategy: MessageRetentionStrategy,
  ): Promise<MessageTruncationResult> {
    const recentCount = Math.min(10, Math.floor(messages.length * 0.3))
    const recentMessages = messages.slice(-recentCount)
    const olderMessages = messages.slice(0, -recentCount)

    // Create a summary of older messages
    const summary = this.createMessagesSummary(olderMessages)

    // Create a summary message
    const summaryMessage: Message = {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: `[CONVERSATION SUMMARY - ${olderMessages.length} messages compressed]\n\n${summary}\n\n[END SUMMARY - Recent context follows...]`,
          },
        ],
      },
      costUSD: 0,
      durationMs: 0,
      uuid: crypto.randomUUID() as UUID
    }

    const truncatedMessages = [summaryMessage, ...recentMessages]

    return {
      truncatedMessages,
      removedCount: olderMessages.length,
      preservedTokens: countTokens(truncatedMessages),
      strategy: `Compressed ${olderMessages.length} messages + preserved ${recentCount} recent`,
      summary: `Created intelligent summary of conversation history`,
    }
  }

  /**
   * Strategy 4: Use existing auto-compact mechanism
   */
  private async autoCompactStrategy(
    messages: Message[],
    strategy: MessageRetentionStrategy,
  ): Promise<MessageTruncationResult> {
    // This would integrate with the existing autoCompactCore.ts
    // For now, fallback to preserve_recent
    return this.preserveRecentMessages(messages, strategy)
  }

  /**
   * Helper: Estimate how many messages fit in token budget
   */
  private estimateMessageCount(maxTokens: number): number {
    const avgTokensPerMessage = 150 // Conservative estimate
    return Math.max(3, Math.floor(maxTokens / avgTokensPerMessage))
  }

  /**
   * Helper: Determine if a message is important
   */
  private isImportantMessage(message: Message): boolean {
    if (message.type === 'user') return true // User messages are always important

    if (message.type === 'assistant') {
      const content = message.message.content
      if (Array.isArray(content)) {
        const textContent = content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join(' ')
          .toLowerCase()

        // Mark as important if contains error keywords
        return (
          textContent.includes('error') ||
          textContent.includes('failed') ||
          textContent.includes('warning') ||
          textContent.includes('critical') ||
          textContent.includes('issue')
        )
      }
    }

    return false
  }

  /**
   * Helper: Check if two messages are equal
   */
  private messagesEqual(a: Message, b: Message): boolean {
    return JSON.stringify(a) === JSON.stringify(b)
  }

  /**
   * Helper: Create summary of message sequence
   */
  private createMessagesSummary(messages: Message[]): string {
    const userMessages = messages.filter(m => m.type === 'user').length
    const assistantMessages = messages.filter(
      m => m.type === 'assistant',
    ).length
    const toolUses = messages.filter(
      m =>
        m.type === 'assistant' &&
        Array.isArray(m.message.content) &&
        m.message.content.some(c => c.type === 'tool_use'),
    ).length

    const topics: string[] = []

    // Extract key topics from user messages
    messages.forEach(msg => {
      if (msg.type === 'user' && Array.isArray(msg.message.content)) {
        const text = msg.message.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join(' ')

        // Simple keyword extraction (could be enhanced with NLP)
        if (text.includes('error') || text.includes('bug'))
          topics.push('debugging')
        if (text.includes('implement') || text.includes('create'))
          topics.push('implementation')
        if (text.includes('explain') || text.includes('understand'))
          topics.push('explanation')
        if (text.includes('fix') || text.includes('solve'))
          topics.push('problem-solving')
      }
    })

    const uniqueTopics = [...new Set(topics)]

    return `Previous conversation included ${userMessages} user messages and ${assistantMessages} assistant responses, with ${toolUses} tool invocations. Key topics: ${uniqueTopics.join(', ') || 'general discussion'}.`
  }
}

/**
 * 创建保留策略工厂函数 - 智能生成适合的消息保留策略
 *
 * 根据上下文长度、当前 token 数量和用户偏好，
 * 自动生成最适合的消息保留策略配置。
 *
 * @param targetContextLength - 目标上下文长度限制
 * @param currentTokens - 当前消息的 token 数量
 * @param userPreference - 用户偏好设置，默认为 'balanced'
 * @returns MessageRetentionStrategy - 生成的保留策略
 *
 * 🎯 用户偏好策略：
 * - aggressive: 激进截断，保留最少消息（preserve_recent）
 * - conservative: 保守压缩，使用智能摘要（smart_compression）
 * - balanced: 平衡保留，优先重要消息（preserve_important）
 *
 * 🔄 策略选择逻辑：
 * 1. 计算可用 token 空间（目标长度的 70%）
 * 2. 根据用户偏好选择截断策略
 * 3. 估算合适的消息保留数量
 * 4. 生成完整的策略配置
 *
 * 💡 设计原则：
 * - 预留空间：为新对话留出 30% 的 token 空间
 * - 用户导向：基于偏好的个性化策略
 * - 性能平衡：在效果和性能间找到平衡
 */
export function createRetentionStrategy(
  targetContextLength: number,
  currentTokens: number,
  userPreference: 'aggressive' | 'balanced' | 'conservative' = 'balanced',
): MessageRetentionStrategy {
  const maxTokens = Math.floor(targetContextLength * 0.7) // Leave room for new conversation

  switch (userPreference) {
    case 'aggressive':
      return {
        type: 'preserve_recent',
        maxTokens,
        preserveCount: Math.max(3, Math.floor(maxTokens / 200)),
      }
    case 'conservative':
      return {
        type: 'smart_compression',
        maxTokens,
      }
    case 'balanced':
    default:
      return {
        type: 'preserve_important',
        maxTokens,
        preserveCount: Math.max(5, Math.floor(maxTokens / 150)),
      }
  }
}
