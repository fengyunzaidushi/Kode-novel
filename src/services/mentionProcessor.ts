/**
 * @提及处理服务
 * 通过系统提醒基础架构处理@代理和@文件的提及
 * 设计与现有的事件驱动架构自然集成，支持多种@提及格式：
 * - @run-agent-xxx：运行特定代理
 * - @agent-xxx：传统代理格式
 * - @ask-model：咨询特定模型
 * - @filename：文件路径引用
 */

import { emitReminderEvent } from './systemReminder'
import { getAvailableAgentTypes } from '../utils/agentLoader'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { getCwd } from '../utils/state'

// @提及上下文接口 - 存储单个@提及的详细信息
export interface MentionContext {
  type: 'agent' | 'file'  // 提及类型：代理或文件
  mention: string         // 原始提及字符串
  resolved: string        // 解析后的值（代理类型或文件路径）
  exists: boolean         // 是否存在（代理可用或文件存在）
  metadata?: any          // 附加元数据（如模型类型）
}

// 处理后的@提及结果接口 - 所有@提及的综合结果
export interface ProcessedMentions {
  agents: MentionContext[]     // 所有代理相关的@提及
  files: MentionContext[]      // 所有文件相关的@提及
  hasAgentMentions: boolean    // 是否包含代理@提及
  hasFileMentions: boolean     // 是否包含文件@提及
}

/**
 * @提及处理服务类
 * 主要负责解析和处理用户输入中的各种@提及格式
 * 使用缓存优化性能，并通过事件系统发送提醒
 */
class MentionProcessorService {
  // 集中化的@提及模式 - 单一真实数据源
  private static readonly MENTION_PATTERNS = {
    runAgent: /@(run-agent-[\w\-]+)/g,                    // @run-agent-xxx格式
    agent: /@(agent-[\w\-]+)/g,                           // @agent-xxx格式（传统支持）
    askModel: /@(ask-[\w\-]+)/g,                          // @ask-xxx格式
    file: /@([a-zA-Z0-9/._-]+(?:\.[a-zA-Z0-9]+)?)/g      // @文件路径格式
  } as const

  // 代理缓存：避免频繁查询代理加载器
  private agentCache: Map<string, boolean> = new Map()
  private lastAgentCheck: number = 0        // 上次检查时间
  private CACHE_TTL = 60000                 // 1分钟缓存失效时间

  /**
   * 处理用户输入中的@提及并发出相应事件
   * 遵循系统提醒的事件驱动哲学，确保系统稳定性
   * @param input 要处理的用户输入文本
   * @returns 处理后的@提及结果
   */
  public async processMentions(input: string): Promise<ProcessedMentions> {
    const result: ProcessedMentions = {
      agents: [],
      files: [],
      hasAgentMentions: false,
      hasFileMentions: false,
    }

    try {

    // Process agent mentions with unified logic to eliminate code duplication
    const agentMentions = this.extractAgentMentions(input)
    if (agentMentions.length > 0) {
      await this.refreshAgentCache()
      
      for (const { mention, agentType, isAskModel } of agentMentions) {
        if (isAskModel || this.agentCache.has(agentType)) {
          result.agents.push({
            type: 'agent',
            mention,
            resolved: agentType,
            exists: true,
            metadata: isAskModel ? { type: 'ask-model' } : undefined
          })
          result.hasAgentMentions = true
          
          // Emit appropriate event based on mention type
          this.emitAgentMentionEvent(mention, agentType, isAskModel)
        }
      }
    }
    
    // No longer process @xxx format - treat as regular text (emails, etc.)

    // Process file mentions (exclude agent and ask-model mentions)
    const fileMatches = [...input.matchAll(MentionProcessorService.MENTION_PATTERNS.file)]
    const processedAgentMentions = new Set(agentMentions.map(am => am.mention))
    
    for (const match of fileMatches) {
      const mention = match[1]
      
      // Skip if this is an agent or ask-model mention (already processed)
      if (mention.startsWith('run-agent-') || mention.startsWith('agent-') || mention.startsWith('ask-') || processedAgentMentions.has(mention)) {
        continue
      }
      
      // Check if it's a file
      const filePath = this.resolveFilePath(mention)
      if (existsSync(filePath)) {
        result.files.push({
          type: 'file',
          mention,
          resolved: filePath,
          exists: true,
        })
        result.hasFileMentions = true
        
        // Emit file mention event for system reminder to handle
        emitReminderEvent('file:mentioned', {
          filePath: filePath,
          originalMention: mention,
          timestamp: Date.now(),
        })
      }
    }

      return result
    } catch (error) {
      console.warn('[MentionProcessor] Failed to process mentions:', {
        input: input.substring(0, 100) + (input.length > 100 ? '...' : ''),
        error: error instanceof Error ? error.message : error
      })
      
      // Return empty result on error to maintain system stability
      return {
        agents: [],
        files: [],
        hasAgentMentions: false,
        hasFileMentions: false,
      }
    }
  }

  // Removed identifyMention method as it's no longer needed with separate processing

  /**
   * 解析相对于当前工作目录的文件路径
   * @param mention 提及的文件名或路径
   * @returns 绝对文件路径
   */
  private resolveFilePath(mention: string): string {
    // 简单一致的逻辑：@提及总是相对于当前目录
    return resolve(getCwd(), mention)
  }

  /**
   * 定期刷新代理缓存
   * 避免在每次@提及时都查询代理加载器，提高性能
   */
  private async refreshAgentCache(): Promise<void> {
    const now = Date.now()
    if (now - this.lastAgentCheck < this.CACHE_TTL) {
      return // Cache is still fresh
    }

    try {
      const agents = await getAvailableAgentTypes()
      const previousCacheSize = this.agentCache.size
      this.agentCache.clear()
      
      for (const agent of agents) {
        // Store only the agent type without prefix for consistent lookup
        this.agentCache.set(agent.agentType, true)
      }
      
      this.lastAgentCheck = now
      
      // Log cache refresh for debugging mention resolution issues
      if (agents.length !== previousCacheSize) {
        console.log('[MentionProcessor] Agent cache refreshed:', {
          agentCount: agents.length,
          previousCacheSize,
          cacheAge: now - this.lastAgentCheck
        })
      }
    } catch (error) {
      console.warn('[MentionProcessor] Failed to refresh agent cache, keeping existing cache:', {
        error: error instanceof Error ? error.message : error,
        cacheSize: this.agentCache.size,
        lastRefresh: new Date(this.lastAgentCheck).toISOString()
      })
      // Keep existing cache on error to maintain functionality
    }
  }

  /**
   * 使用统一模式匹配提取代理@提及
   * 集成run-agent、agent和ask-model的检测逻辑，消除代码重复
   * @param input 要处理的文本
   * @returns 代理@提及的数组
   */
  private extractAgentMentions(input: string): Array<{ mention: string; agentType: string; isAskModel: boolean }> {
    const mentions: Array<{ mention: string; agentType: string; isAskModel: boolean }> = []
    
    // Process @run-agent-xxx format (preferred)
    const runAgentMatches = [...input.matchAll(MentionProcessorService.MENTION_PATTERNS.runAgent)]
    for (const match of runAgentMatches) {
      const mention = match[1]
      const agentType = mention.replace(/^run-agent-/, '')
      mentions.push({ mention, agentType, isAskModel: false })
    }
    
    // Process @agent-xxx format (legacy)
    const agentMatches = [...input.matchAll(MentionProcessorService.MENTION_PATTERNS.agent)]
    for (const match of agentMatches) {
      const mention = match[1]
      const agentType = mention.replace(/^agent-/, '')
      mentions.push({ mention, agentType, isAskModel: false })
    }
    
    // Process @ask-model mentions
    const askModelMatches = [...input.matchAll(MentionProcessorService.MENTION_PATTERNS.askModel)]
    for (const match of askModelMatches) {
      const mention = match[1]
      mentions.push({ mention, agentType: mention, isAskModel: true })
    }
    
    return mentions
  }
  
  /**
   * 发出代理@提及事件，带有正确的类型信息
   * 中心化事件发送以确保一致性
   * @param mention 原始@提及字符串
   * @param agentType 代理类型
   * @param isAskModel 是否为模型咨询
   */
  private emitAgentMentionEvent(mention: string, agentType: string, isAskModel: boolean): void {
    try {
      const eventData = {
        originalMention: mention,
        timestamp: Date.now(),
      }

      if (isAskModel) {
        emitReminderEvent('ask-model:mentioned', {
          ...eventData,
          modelName: mention,
        })
      } else {
        emitReminderEvent('agent:mentioned', {
          ...eventData,
          agentType,
        })
      }
      
      // Debug log for mention event emission tracking
      console.log('[MentionProcessor] Emitted mention event:', {
        type: isAskModel ? 'ask-model' : 'agent',
        mention,
        agentType: isAskModel ? undefined : agentType
      })
    } catch (error) {
      console.error('[MentionProcessor] Failed to emit mention event:', {
        mention,
        agentType,
        isAskModel,
        error: error instanceof Error ? error.message : error
      })
    }
  }

  /**
   * 清除缓存 - 用于测试或重置
   * 清空代理缓存并重置检查时间
   */
  public clearCache(): void {
    this.agentCache.clear()
    this.lastAgentCheck = 0
  }
}

// 导出单例实例 - 全局统一的@提及处理器
export const mentionProcessor = new MentionProcessorService()

/**
 * 处理用户输入中的@提及
 * 这是@提及处理器的主要API
 * @param input 要处理的用户输入文本
 * @returns 处理后的@提及结果
 */
export const processMentions = (input: string) =>
  mentionProcessor.processMentions(input)

/**
 * 清除@提及处理器缓存
 * 用于刷新代理列表或重置系统状态
 */
export const clearMentionCache = () =>
  mentionProcessor.clearCache()