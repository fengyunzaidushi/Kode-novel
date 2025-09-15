// 文件新鲜度服务 - 文件变更检测和冲突管理系统
// 负责监控文件的读取、编辑和外部修改状态，确保代码上下文的一致性
// 主要功能：
// 1. 跟踪文件读取和修改时间戳
// 2. 检测外部文件变更和冲突
// 3. 监控TODO文件的实时变更
// 4. 为对话压缩提供重要文件信息
// 5. 生成文件修改提醒和冲突警告

import { statSync, existsSync, watchFile, unwatchFile } from 'fs'
import {
  emitReminderEvent,
  systemReminderService,
} from '../services/systemReminder'
import { getAgentFilePath } from '../utils/agentStorage'

// 文件时间戳接口 - 存储文件的详细状态信息
interface FileTimestamp {
  path: string              // 文件路径
  lastRead: number          // 上次读取时间戳
  lastModified: number      // 上次修改时间戳（文件系统级别）
  size: number              // 文件大小（字节）
  lastAgentEdit?: number    // 上次AI代理编辑时间戳（用于区分内部和外部修改）
}

// 文件新鲜度状态接口 - 管理所有文件相关的状态信息
interface FileFreshnessState {
  readTimestamps: Map<string, FileTimestamp>  // 文件路径 -> 时间戳信息的映射
  editConflicts: Set<string>                  // 存在编辑冲突的文件路径集合
  sessionFiles: Set<string>                   // 当前会话中访问过的文件集合
  watchedTodoFiles: Map<string, string>       // 代理ID -> TODO文件路径的监控映射
}

/**
 * 文件新鲜度服务类
 * 负责管理文件的生命周期和状态监控，确保代码上下文的准确性
 * 提供文件冲突检测、变更提醒和智能恢复功能
 */
class FileFreshnessService {
  // 服务状态 - 存储所有文件相关的状态信息
  private state: FileFreshnessState = {
    readTimestamps: new Map(),    // 文件时间戳记录
    editConflicts: new Set(),     // 冲突文件集合
    sessionFiles: new Set(),      // 会话文件集合
    watchedTodoFiles: new Map(),  // 监控的TODO文件
  }

  constructor() {
    this.setupEventListeners()
  }

  /**
   * 设置会话管理的事件监听器
   * 与系统提醒服务集成，在会话开始时重置状态
   */
  private setupEventListeners(): void {
    // Listen for session startup events through the SystemReminderService
    systemReminderService.addEventListener(
      'session:startup',
      (context: any) => {
        // Reset session state on startup
        this.resetSession()

        
      },
    )
  }

  /**
   * 记录文件读取操作及其时间戳跟踪
   * 在文件被读取时调用，更新文件状态信息并发出事件
   * @param filePath 要记录的文件路径
   */
  public recordFileRead(filePath: string): void {
    try {
      if (!existsSync(filePath)) {
        return
      }

      const stats = statSync(filePath)
      const timestamp: FileTimestamp = {
        path: filePath,
        lastRead: Date.now(),
        lastModified: stats.mtimeMs,
        size: stats.size,
      }

      this.state.readTimestamps.set(filePath, timestamp)
      this.state.sessionFiles.add(filePath)

      // Emit file read event for system reminders
      emitReminderEvent('file:read', {
        filePath,
        timestamp: timestamp.lastRead,
        size: timestamp.size,
        modified: timestamp.lastModified,
      })
    } catch (error) {
      console.error(`Error recording file read for ${filePath}:`, error)
    }
  }

  /**
   * 检查文件是否在上次读取后被修改
   * 返回文件的新鲜度状态和冲突信息
   * @param filePath 要检查的文件路径
   * @returns 包含新鲜度和冲突状态的对象
   */
  public checkFileFreshness(filePath: string): {
    isFresh: boolean        // 文件是否为最新状态
    lastRead?: number       // 上次读取时间戳
    currentModified?: number // 当前修改时间戳
    conflict: boolean       // 是否存在冲突
  } {
    const recorded = this.state.readTimestamps.get(filePath)

    if (!recorded) {
      return { isFresh: true, conflict: false }
    }

    try {
      if (!existsSync(filePath)) {
        return { isFresh: false, conflict: true }
      }

      const currentStats = statSync(filePath)
      const isFresh = currentStats.mtimeMs <= recorded.lastModified
      const conflict = !isFresh

      if (conflict) {
        this.state.editConflicts.add(filePath)

        // Emit file conflict event
        emitReminderEvent('file:conflict', {
          filePath,
          lastRead: recorded.lastRead,
          lastModified: recorded.lastModified,
          currentModified: currentStats.mtimeMs,
          sizeDiff: currentStats.size - recorded.size,
        })
      }

      return {
        isFresh,
        lastRead: recorded.lastRead,
        currentModified: currentStats.mtimeMs,
        conflict,
      }
    } catch (error) {
      console.error(`Error checking freshness for ${filePath}:`, error)
      return { isFresh: false, conflict: true }
    }
  }

  /**
   * 记录AI代理的文件编辑操作
   * 更新文件状态，清除冲突标记，并发出编辑事件
   * @param filePath 被编辑的文件路径
   * @param content 可选的文件内容，用于统计长度
   */
  public recordFileEdit(filePath: string, content?: string): void {
    try {
      const now = Date.now()

      // Update recorded timestamp after edit
      if (existsSync(filePath)) {
        const stats = statSync(filePath)
        const existing = this.state.readTimestamps.get(filePath)

        if (existing) {
          existing.lastModified = stats.mtimeMs
          existing.size = stats.size
          existing.lastAgentEdit = now // Mark this as Agent-initiated edit
          this.state.readTimestamps.set(filePath, existing)
        } else {
          // Create new record for Agent-edited file
          const timestamp: FileTimestamp = {
            path: filePath,
            lastRead: now,
            lastModified: stats.mtimeMs,
            size: stats.size,
            lastAgentEdit: now,
          }
          this.state.readTimestamps.set(filePath, timestamp)
        }
      }

      // Remove from conflicts since we just edited it
      this.state.editConflicts.delete(filePath)

      // Emit file edit event
      emitReminderEvent('file:edited', {
        filePath,
        timestamp: now,
        contentLength: content?.length || 0,
        source: 'agent',
      })
    } catch (error) {
      console.error(`Error recording file edit for ${filePath}:`, error)
    }
  }

  /**
   * 生成文件修改提醒
   * 检测文件是否被外部修改，并生成相应的提醒文本
   * @param filePath 要检查的文件路径
   * @returns 提醒文本或null（如果无需提醒）
   */
  public generateFileModificationReminder(filePath: string): string | null {
    const recorded = this.state.readTimestamps.get(filePath)

    if (!recorded) {
      return null
    }

    try {
      if (!existsSync(filePath)) {
        return `Note: ${filePath} was deleted since last read.`
      }

      const currentStats = statSync(filePath)
      const isModified = currentStats.mtimeMs > recorded.lastModified

      if (!isModified) {
        return null
      }

      // Check if this was an Agent-initiated change
      // Use small time tolerance to handle filesystem timestamp precision issues
      const TIME_TOLERANCE_MS = 100
      if (
        recorded.lastAgentEdit &&
        recorded.lastAgentEdit >= recorded.lastModified - TIME_TOLERANCE_MS
      ) {
        // Agent modified this file recently, no reminder needed
        // (context already contains before/after content)
        return null
      }

      // External modification detected - generate reminder
      return `Note: ${filePath} was modified externally since last read. The file may have changed outside of this session.`
    } catch (error) {
      console.error(`Error checking modification for ${filePath}:`, error)
      return null
    }
  }

  /**
   * 获取存在编辑冲突的文件列表
   * @returns 冲突文件路径数组
   */
  public getConflictedFiles(): string[] {
    return Array.from(this.state.editConflicts)
  }

  /**
   * 获取当前会话中访问过的所有文件
   * @returns 会话文件路径数组
   */
  public getSessionFiles(): string[] {
    return Array.from(this.state.sessionFiles)
  }

  /**
   * 重置会话状态
   * 清理所有文件监听器和状态信息，为新会话做准备
   */
  public resetSession(): void {
    // Clean up existing todo file watchers
    this.state.watchedTodoFiles.forEach(filePath => {
      try {
        unwatchFile(filePath)
      } catch (error) {
        console.error(`Error unwatching file ${filePath}:`, error)
      }
    })

    this.state = {
      readTimestamps: new Map(),
      editConflicts: new Set(),
      sessionFiles: new Set(),
      watchedTodoFiles: new Map(),
    }
  }

  /**
   * 开始监控代理的TODO文件
   * 为指定代理启动文件监控，在文件被外部修改时发出提醒
   * @param agentId 要监控TODO文件的代理ID
   */
  public startWatchingTodoFile(agentId: string): void {
    try {
      const filePath = getAgentFilePath(agentId)

      // Don't watch if already watching
      if (this.state.watchedTodoFiles.has(agentId)) {
        return
      }

      this.state.watchedTodoFiles.set(agentId, filePath)

      // Record initial state if file exists
      if (existsSync(filePath)) {
        this.recordFileRead(filePath)
      }

      // Start watching for changes
      watchFile(filePath, { interval: 1000 }, (curr, prev) => {
        // Check if this was an external modification
        const reminder = this.generateFileModificationReminder(filePath)
        if (reminder) {
          // File was modified externally, emit todo change reminder
          emitReminderEvent('todo:file_changed', {
            agentId,
            filePath,
            reminder,
            timestamp: Date.now(),
            currentStats: { mtime: curr.mtime, size: curr.size },
            previousStats: { mtime: prev.mtime, size: prev.size },
          })
        }
      })
    } catch (error) {
      console.error(
        `Error starting todo file watch for agent ${agentId}:`,
        error,
      )
    }
  }

  /**
   * 停止监控代理的TODO文件
   * 清理文件监听器并从监控列表中移除
   * @param agentId 要停止监控的代理ID
   */
  public stopWatchingTodoFile(agentId: string): void {
    try {
      const filePath = this.state.watchedTodoFiles.get(agentId)
      if (filePath) {
        unwatchFile(filePath)
        this.state.watchedTodoFiles.delete(agentId)
      }
    } catch (error) {
      console.error(
        `Error stopping todo file watch for agent ${agentId}:`,
        error,
      )
    }
  }

  /**
   * 获取文件的详细信息
   * @param filePath 文件路径
   * @returns 文件时间戳信息或null
   */
  public getFileInfo(filePath: string): FileTimestamp | null {
    return this.state.readTimestamps.get(filePath) || null
  }

  /**
   * 检查文件是否被跟踪监控
   * @param filePath 文件路径
   * @returns 是否被跟踪
   */
  public isFileTracked(filePath: string): boolean {
    return this.state.readTimestamps.has(filePath)
  }

  /**
   * 获取在对话压缩时优先恢复的重要文件
   * 基于以下标准选择最近访问的文件：
   * - 文件访问新近度（最近的优先）
   * - 文件类型相关性（排除依赖、构建产物）
   * - 开发工作流重要性
   * 用于在对话历史被压缩时保持编码上下文
   * @param maxFiles 最大文件数量，默认5个
   * @returns 重要文件信息数组
   */
  public getImportantFiles(maxFiles: number = 5): Array<{
    path: string        // 文件路径
    timestamp: number   // 访问时间戳
    size: number        // 文件大小
  }> {
    return Array.from(this.state.readTimestamps.entries())
      .map(([path, info]) => ({
        path,
        timestamp: info.lastRead,
        size: info.size,
      }))
      .filter(file => this.isValidForRecovery(file.path))
      .sort((a, b) => b.timestamp - a.timestamp) // Newest first
      .slice(0, maxFiles)
  }

  /**
   * 确定哪些文件适合自动恢复
   * 排除通常与开发上下文不相关的文件：
   * - 构建产物和生成文件
   * - 依赖包和缓存文件
   * - 临时文件和系统目录
   * @param filePath 要检查的文件路径
   * @returns 是否适合恢复
   */
  private isValidForRecovery(filePath: string): boolean {
    return (
      !filePath.includes('node_modules') &&
      !filePath.includes('.git') &&
      !filePath.startsWith('/tmp') &&
      !filePath.includes('.cache') &&
      !filePath.includes('dist/') &&
      !filePath.includes('build/')
    )
  }
}

export const fileFreshnessService = new FileFreshnessService()

export const recordFileRead = (filePath: string) =>
  fileFreshnessService.recordFileRead(filePath)
export const recordFileEdit = (filePath: string, content?: string) =>
  fileFreshnessService.recordFileEdit(filePath, content)
export const checkFileFreshness = (filePath: string) =>
  fileFreshnessService.checkFileFreshness(filePath)
export const generateFileModificationReminder = (filePath: string) =>
  fileFreshnessService.generateFileModificationReminder(filePath)
export const resetFileFreshnessSession = () =>
  fileFreshnessService.resetSession()
export const startWatchingTodoFile = (agentId: string) =>
  fileFreshnessService.startWatchingTodoFile(agentId)
export const stopWatchingTodoFile = (agentId: string) =>
  fileFreshnessService.stopWatchingTodoFile(agentId)
