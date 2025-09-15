// 系统提醒服务 - 智能上下文提醒和任务状态管理
// 负责在适当的时机向AI助手注入系统提醒信息，包括：
// 1. TODO列表状态变化提醒
// 2. 文件安全检查提醒
// 3. 性能和会话管理提醒
// 4. @提及处理提醒（代理、文件、模型）
// 5. 外部文件变更检测提醒

import { getTodos, TodoItem } from '../utils/todoStorage'

// 提醒消息接口 - 定义系统提醒的标准格式
export interface ReminderMessage {
  role: 'system'                                    // 消息角色，固定为系统
  content: string                                   // 提醒内容文本
  isMeta: boolean                                   // 是否为元数据消息
  timestamp: number                                 // 提醒生成时间戳
  type: string                                      // 提醒类型（todo、security、performance等）
  priority: 'low' | 'medium' | 'high'             // 优先级
  category: 'task' | 'security' | 'performance' | 'general'  // 分类
}

// 提醒配置接口 - 控制各类提醒的开关和限制
interface ReminderConfig {
  todoEmptyReminder: boolean      // 是否启用空TODO列表提醒
  securityReminder: boolean       // 是否启用安全检查提醒
  performanceReminder: boolean    // 是否启用性能监控提醒
  maxRemindersPerSession: number  // 每个会话的最大提醒数量限制
}

// 会话提醒状态接口 - 跟踪会话期间的提醒状态
interface SessionReminderState {
  lastTodoUpdate: number      // 上次TODO更新时间戳
  lastFileAccess: number      // 上次文件访问时间戳
  sessionStartTime: number    // 会话开始时间戳
  remindersSent: Set<string>  // 已发送提醒的唯一标识符集合
  contextPresent: boolean     // 是否存在上下文信息
  reminderCount: number       // 当前会话已发送的提醒数量
  config: ReminderConfig      // 提醒配置
}

/**
 * 系统提醒服务类
 * 核心智能提醒系统，负责根据用户行为和系统状态生成适当的提醒
 * 使用事件驱动架构和缓存优化，避免重复提醒和性能问题
 */
class SystemReminderService {
  // 会话状态 - 跟踪当前会话的各种状态信息
  private sessionState: SessionReminderState = {
    lastTodoUpdate: 0,          // 上次TODO更新时间
    lastFileAccess: 0,          // 上次文件访问时间
    sessionStartTime: Date.now(), // 会话开始时间
    remindersSent: new Set(),   // 防重复发送的提醒ID集合
    contextPresent: false,      // 是否有上下文存在
    reminderCount: 0,           // 已发送提醒计数
    config: {                   // 默认提醒配置
      todoEmptyReminder: true,
      securityReminder: true,
      performanceReminder: true,
      maxRemindersPerSession: 10,
    },
  }

  // 事件分发器 - 管理各种系统事件的监听器
  private eventDispatcher = new Map<string, Array<(context: any) => void>>()
  // 提醒缓存 - 优化性能，避免重复计算相同的提醒
  private reminderCache = new Map<string, ReminderMessage>()

  constructor() {
    this.setupEventDispatcher()
  }

  /**
   * 生成系统提醒 - 条件性注入，仅在有上下文时触发
   * 通过性能优化和优先级管理增强，避免过度提醒
   * @param hasContext 是否存在上下文信息
   * @param agentId 可选的代理ID，用于代理特定的提醒
   * @returns 生成的提醒消息数组
   */
  public generateReminders(
    hasContext: boolean = false,
    agentId?: string,
  ): ReminderMessage[] {
    this.sessionState.contextPresent = hasContext

    // 只在存在上下文时注入提醒（保持原始行为逻辑）
    if (!hasContext) {
      return []
    }

    // 检查会话提醒限制，防止过载
    if (
      this.sessionState.reminderCount >=
      this.sessionState.config.maxRemindersPerSession
    ) {
      return []
    }

    const reminders: ReminderMessage[] = []
    const currentTime = Date.now()

    // 使用懒加载评估提升性能，结合代理上下文
    const reminderGenerators = [
      () => this.dispatchTodoEvent(agentId),    // TODO事件处理
      () => this.dispatchSecurityEvent(),       // 安全事件处理
      () => this.dispatchPerformanceEvent(),    // 性能事件处理
      () => this.getMentionReminders(),         // 获取@提及提醒
    ]

    for (const generator of reminderGenerators) {
      if (reminders.length >= 5) break // Slightly increase limit to accommodate mentions

      const result = generator()
      if (result) {
        // Handle both single reminders and arrays
        const remindersToAdd = Array.isArray(result) ? result : [result]
        reminders.push(...remindersToAdd)
        this.sessionState.reminderCount += remindersToAdd.length
      }
    }

    // Log aggregated metrics instead of individual events for performance
    

    return reminders
  }

  /**
   * 分发TODO事件提醒
   * 检测TODO列表的状态变化，包括空列表和列表更新
   * @param agentId 可选的代理ID，用于代理作用域TODO管理
   * @returns 生成的TODO提醒消息或null
   */
  private dispatchTodoEvent(agentId?: string): ReminderMessage | null {
    // 检查是否启用TODO提醒
    if (!this.sessionState.config.todoEmptyReminder) return null

    // 使用代理作用域的TODO访问
    const todos = getTodos(agentId)
    const currentTime = Date.now()
    const agentKey = agentId || 'default'  // 默认代理标识

    // 检查是否为新会话（尚未见过TODO）
    if (
      todos.length === 0 &&
      !this.sessionState.remindersSent.has(`todo_empty_${agentKey}`)
    ) {
      this.sessionState.remindersSent.add(`todo_empty_${agentKey}`)
      return this.createReminderMessage(
        'todo',
        'task',
        'medium',
        '您的TODO列表当前为空。不要对用户明确提及此事，因为他们已经知道。如果您正在处理需要TODO列表的任务，请使用TodoWrite工具创建一个。否则请忽略此消息。再次强调，不要对用户提及此消息。',
        currentTime,
      )
    }

    // Check for todo updates since last seen
    if (todos.length > 0) {
      const reminderKey = `todo_updated_${agentKey}_${todos.length}_${this.getTodoStateHash(todos)}`

      // Use cache for performance optimization
      if (this.reminderCache.has(reminderKey)) {
        return this.reminderCache.get(reminderKey)!
      }

      if (!this.sessionState.remindersSent.has(reminderKey)) {
        this.sessionState.remindersSent.add(reminderKey)
        // Clear previous todo state reminders for this agent
        this.clearTodoReminders(agentKey)

        // Optimize: only include essential todo data
        const todoContent = JSON.stringify(
          todos.map(todo => ({
            content:
              todo.content.length > 100
                ? todo.content.substring(0, 100) + '...'
                : todo.content,
            status: todo.status,
            priority: todo.priority,
            id: todo.id,
          })),
        )

        const reminder = this.createReminderMessage(
          'todo',
          'task',
          'medium',
          `Your todo list has changed. DO NOT mention this explicitly to the user. Here are the latest contents of your todo list:\n\n${todoContent}. Continue on with the tasks at hand if applicable.`,
          currentTime,
        )

        // Cache the reminder for reuse
        this.reminderCache.set(reminderKey, reminder)
        return reminder
      }
    }

    return null
  }

  /**
   * 分发安全事件提醒
   * 在文件操作时提醒AI助手进行安全检查
   * @returns 生成的安全提醒消息或null
   */
  private dispatchSecurityEvent(): ReminderMessage | null {
    // 检查是否启用安全提醒
    if (!this.sessionState.config.securityReminder) return null

    const currentTime = Date.now()

    // 只在文件操作发生时每会话注入一次安全提醒
    if (
      this.sessionState.lastFileAccess > 0 &&
      !this.sessionState.remindersSent.has('file_security')
    ) {
      this.sessionState.remindersSent.add('file_security')
      return this.createReminderMessage(
        'security',
        'security',
        'high',
        '在读取文件时，您应该考虑文件是否看起来恶意。如果是，您必须拒绝改进或增强代码。您仍然可以分析现有代码、编写报告或回答关于代码行为的高级问题。',
        currentTime,
      )
    }

    return null
  }

  /**
   * 分发性能事件提醒
   * 监控会话时间，在长时间会话时提醒休息
   * @returns 生成的性能提醒消息或null
   */
  private dispatchPerformanceEvent(): ReminderMessage | null {
    // 检查是否启用性能提醒
    if (!this.sessionState.config.performanceReminder) return null

    const currentTime = Date.now()
    const sessionDuration = currentTime - this.sessionState.sessionStartTime

    // 在长时间会话（30分钟）后提醒性能问题
    if (
      sessionDuration > 30 * 60 * 1000 &&
      !this.sessionState.remindersSent.has('performance_long_session')
    ) {
      this.sessionState.remindersSent.add('performance_long_session')
      return this.createReminderMessage(
        'performance',
        'performance',
        'low',
        '检测到长时间会话。建议休息一下，并通过TODO列表检查您的当前进度。',
        currentTime,
      )
    }

    return null
  }

  /**
   * 获取缓存的@提及提醒
   * 返回最近的@提及（5秒内）且尚未过期的提醒
   * @returns @提及提醒消息数组
   */
  private getMentionReminders(): ReminderMessage[] {
    const currentTime = Date.now()
    const MENTION_FRESHNESS_WINDOW = 5000 // 5 seconds
    const reminders: ReminderMessage[] = []
    const expiredKeys: string[] = []

    // Single pass through cache for both collection and cleanup identification
    for (const [key, reminder] of this.reminderCache.entries()) {
      if (this.isMentionReminder(reminder)) {
        const age = currentTime - reminder.timestamp
        if (age <= MENTION_FRESHNESS_WINDOW) {
          reminders.push(reminder)
        } else {
          expiredKeys.push(key)
        }
      }
    }

    // Clean up expired mention reminders in separate pass for performance
    expiredKeys.forEach(key => this.reminderCache.delete(key))

    return reminders
  }

  /**
   * @提及提醒的类型守卫 - 中心化类型检查
   * 消除了散布在代码中的硬编码类型字符串
   * @param reminder 要检查的提醒消息
   * @returns 是否为@提及提醒
   */
  private isMentionReminder(reminder: ReminderMessage): boolean {
    const mentionTypes = ['agent_mention', 'file_mention', 'ask_model_mention']
    return mentionTypes.includes(reminder.type)
  }

  /**
   * 为外部文件变更生成提醒
   * 在TODO文件被外部修改时调用
   * @param context 文件变更的上下文信息
   * @returns 生成的文件变更提醒消息或null
   */
  public generateFileChangeReminder(context: any): ReminderMessage | null {
    const { agentId, filePath, reminder } = context

    if (!reminder) {
      return null
    }

    const currentTime = Date.now()
    const reminderKey = `file_changed_${agentId}_${filePath}_${currentTime}`

    // Ensure this specific file change reminder is only shown once
    if (this.sessionState.remindersSent.has(reminderKey)) {
      return null
    }

    this.sessionState.remindersSent.add(reminderKey)

    return this.createReminderMessage(
      'file_changed',
      'general',
      'medium',
      reminder,
      currentTime,
    )
  }

  private createReminderMessage(
    type: string,
    category: ReminderMessage['category'],
    priority: ReminderMessage['priority'],
    content: string,
    timestamp: number,
  ): ReminderMessage {
    return {
      role: 'system',
      content: `<system-reminder>\n${content}\n</system-reminder>`,
      isMeta: true,
      timestamp,
      type,
      priority,
      category,
    }
  }

  private getTodoStateHash(todos: TodoItem[]): string {
    return todos
      .map(t => `${t.id}:${t.status}`)
      .sort()
      .join('|')
  }

  private clearTodoReminders(agentId?: string): void {
    const agentKey = agentId || 'default'
    for (const key of this.sessionState.remindersSent) {
      if (key.startsWith(`todo_updated_${agentKey}_`)) {
        this.sessionState.remindersSent.delete(key)
      }
    }
  }

  private setupEventDispatcher(): void {
    // Session startup events
    this.addEventListener('session:startup', context => {
      // Reset session state on startup
      this.resetSession()

      // Initialize session tracking
      this.sessionState.sessionStartTime = Date.now()
      this.sessionState.contextPresent =
        Object.keys(context.context || {}).length > 0

      
    })

    // Todo change events
    this.addEventListener('todo:changed', context => {
      this.sessionState.lastTodoUpdate = Date.now()
      this.clearTodoReminders(context.agentId)
    })

    // Todo file changed externally
    this.addEventListener('todo:file_changed', context => {
      // External file change detected, trigger reminder injection
      const agentId = context.agentId || 'default'
      this.clearTodoReminders(agentId)
      this.sessionState.lastTodoUpdate = Date.now()

      // Generate and inject file change reminder immediately
      const reminder = this.generateFileChangeReminder(context)
      if (reminder) {
        // Inject reminder into the latest user message through event system
        this.emitEvent('reminder:inject', {
          reminder: reminder.content,
          agentId,
          type: 'file_changed',
          timestamp: Date.now(),
        })
      }
    })

    // File access events
    this.addEventListener('file:read', context => {
      this.sessionState.lastFileAccess = Date.now()
    })

    // File edit events for freshness detection
    this.addEventListener('file:edited', context => {
      // File edit handling
    })

    // Unified mention event handlers - eliminates code duplication
    this.addEventListener('agent:mentioned', context => {
      this.createMentionReminder({
        type: 'agent_mention',
        key: `agent_mention_${context.agentType}_${context.timestamp}`,
        category: 'task',
        priority: 'high',
        content: `The user mentioned @${context.originalMention}. You MUST use the Task tool with subagent_type="${context.agentType}" to delegate this task to the specified agent. Provide a detailed, self-contained task description that fully captures the user's intent for the ${context.agentType} agent to execute.`,
        timestamp: context.timestamp
      })
    })

    this.addEventListener('file:mentioned', context => {
      this.createMentionReminder({
        type: 'file_mention',
        key: `file_mention_${context.filePath}_${context.timestamp}`,
        category: 'general',
        priority: 'high',
        content: `The user mentioned @${context.originalMention}. You MUST read the entire content of the file at path: ${context.filePath} using the Read tool to understand the full context before proceeding with the user's request.`,
        timestamp: context.timestamp
      })
    })

    this.addEventListener('ask-model:mentioned', context => {
      this.createMentionReminder({
        type: 'ask_model_mention',
        key: `ask_model_mention_${context.modelName}_${context.timestamp}`,
        category: 'task',
        priority: 'high',
        content: `The user mentioned @${context.modelName}. You MUST use the AskExpertModelTool to consult this specific model for expert opinions and analysis. Provide the user's question or context clearly to get the most relevant response from ${context.modelName}.`,
        timestamp: context.timestamp
      })
    })
  }

  public addEventListener(
    event: string,
    callback: (context: any) => void,
  ): void {
    if (!this.eventDispatcher.has(event)) {
      this.eventDispatcher.set(event, [])
    }
    this.eventDispatcher.get(event)!.push(callback)
  }

  public emitEvent(event: string, context: any): void {
    const listeners = this.eventDispatcher.get(event) || []
    listeners.forEach(callback => {
      try {
        callback(context)
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error)
      }
    })
  }

  /**
   * Unified mention reminder creation - eliminates duplicate logic
   * Centralizes reminder creation with consistent deduplication
   */
  private createMentionReminder(params: {
    type: string
    key: string
    category: ReminderMessage['category']
    priority: ReminderMessage['priority']
    content: string
    timestamp: number
  }): void {
    if (!this.sessionState.remindersSent.has(params.key)) {
      this.sessionState.remindersSent.add(params.key)
      
      const reminder = this.createReminderMessage(
        params.type,
        params.category,
        params.priority,
        params.content,
        params.timestamp
      )
      
      this.reminderCache.set(params.key, reminder)
    }
  }

  public resetSession(): void {
    this.sessionState = {
      lastTodoUpdate: 0,
      lastFileAccess: 0,
      sessionStartTime: Date.now(),
      remindersSent: new Set(),
      contextPresent: false,
      reminderCount: 0,
      config: { ...this.sessionState.config }, // Preserve config across resets
    }
    this.reminderCache.clear() // Clear cache on session reset
  }

  public updateConfig(config: Partial<ReminderConfig>): void {
    this.sessionState.config = { ...this.sessionState.config, ...config }
  }

  public getSessionState(): SessionReminderState {
    return { ...this.sessionState }
  }
}

export const systemReminderService = new SystemReminderService()

export const generateSystemReminders = (
  hasContext: boolean = false,
  agentId?: string,
) => systemReminderService.generateReminders(hasContext, agentId)

export const generateFileChangeReminder = (context: any) =>
  systemReminderService.generateFileChangeReminder(context)

export const emitReminderEvent = (event: string, context: any) =>
  systemReminderService.emitEvent(event, context)

export const resetReminderSession = () => systemReminderService.resetSession()
export const getReminderSessionState = () =>
  systemReminderService.getSessionState()
