/**
 * GPT-5响应API状态管理服务
 * 管理previous_response_id以实现对话连续性和推理上下文复用
 * 主GPT-5的持久推理功能提供支持，确保复杂任务的思维连续性
 */

// 对话状态接口 - 存储单个对话的状态信息
interface ConversationState {
  previousResponseId?: string  // 上一次响应的ID，用于上下文连续
  lastUpdate: number          // 最后更新时间戳，用于清理过期状态
}

/**
 * 响应状态管理器类
 * 负责管理多个对话的响应ID状态，支持自动清理和状态持久化
 */
class ResponseStateManager {
  // 对话状态映射表：对话ID -> 对话状态
  private conversationStates = new Map<string, ConversationState>()

  // 缓存清理间隔：1小时未活动后清理
  private readonly CLEANUP_INTERVAL = 60 * 60 * 1000
  
  /**
   * 构造函数 - 初始化管理器并设置定时清理
   */
  constructor() {
    // 定期清理过期的对话状态，防止内存泄漏
    setInterval(() => {
      this.cleanup()
    }, this.CLEANUP_INTERVAL)
  }
  
  /**
   * 设置对话的上一次响应ID
   * 在每次收到AI响应时调用，以保持推理上下文的连续性
   * @param conversationId 对话ID
   * @param responseId 响应ID
   */
  setPreviousResponseId(conversationId: string, responseId: string): void {
    this.conversationStates.set(conversationId, {
      previousResponseId: responseId,  // 存储响应ID
      lastUpdate: Date.now()           // 更新时间戳
    })
  }
  
  /**
   * 获取对话的上一次响应ID
   * 在发送新请求时调用，保持推理链的连续性
   * @param conversationId 对话ID
   * @returns 上一次的响应ID或undefined
   */
  getPreviousResponseId(conversationId: string): string | undefined {
    const state = this.conversationStates.get(conversationId)
    if (state) {
      // 更新最后访问时间，防止被过早清理
      state.lastUpdate = Date.now()
      return state.previousResponseId
    }
    return undefined
  }
  
  /**
   * 清除特定对话的状态
   * 在对话结束或重置时调用
   * @param conversationId 要清除的对话ID
   */
  clearConversation(conversationId: string): void {
    this.conversationStates.delete(conversationId)
  }
  
  /**
   * 清除所有对话状态
   * 在系统重置或清理时使用
   */
  clearAll(): void {
    this.conversationStates.clear()
  }
  
  /**
   * 清理过期的对话状态
   * 移除超过一小时未活动的对话，防止内存泄漏
   */
  private cleanup(): void {
    const now = Date.now()
    for (const [conversationId, state] of this.conversationStates.entries()) {
      // 检查是否超过清理间隔
      if (now - state.lastUpdate > this.CLEANUP_INTERVAL) {
        this.conversationStates.delete(conversationId)
      }
    }
  }
  
  /**
   * 获取当前状态大小（用于调试和监控）
   * @returns 当前管理的对话数量
   */
  getStateSize(): number {
    return this.conversationStates.size
  }
}

// 单例实例 - 全局统一的状态管理器
export const responseStateManager = new ResponseStateManager()

/**
 * 从上下文生成对话ID的辅助函数
 * 根据可用的上下文信息生成稳定的对话ID
 * @param agentId 代理ID（优先使用）
 * @param messageId 消息ID（备用）
 * @returns 对话ID
 */
export function getConversationId(agentId?: string, messageId?: string): string {
  // 优先使用agentId作为主要标识符，备用messageId或时间戳
  return agentId || messageId || `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}