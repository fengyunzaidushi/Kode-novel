/**
 * 🎯 日志系统类型定义 - 完整的对话日志管理框架
 *
 * 🏗️ 核心功能：
 * - 支持对话消息的序列化和持久化存储
 * - 管理对话日志的索引和元数据
 * - 提供日志选择和浏览的完整接口
 * - 支持会话分支和历史记录管理
 *
 * 🔄 依赖关系：
 * - 上游：被日志选择器、日志列表和日志工具使用
 * - 下游：依赖 crypto UUID 和消息系统
 *
 * 📊 使用场景：
 * - 对话历史的持久化存储和检索
 * - 日志文件的浏览和管理界面
 * - 会话恢复和分支管理
 * - 对话数据的统计和分析
 *
 * 🔧 技术实现：
 * - 基于 log.ts 中的序列化/反序列化机制
 * - 支持多种消息类型的完整记录
 * - 包含丰富的元数据和时间戳信息
 * - 优化的日志索引和搜索结构
 */

import { UUID } from 'crypto'

/**
 * 序列化消息结构 - 存储在日志文件中的消息格式
 *
 * 基于 log.ts 中的消息序列化和反序列化机制设计，
 * 包含完整的消息内容、成本信息和会话元数据。
 */
export interface SerializedMessage {
  /** 消息类型：用户消息、助手消息或进度消息 */
  type: 'user' | 'assistant' | 'progress'
  /** 消息的唯一标识符 */
  uuid: UUID
  /** 消息内容结构 */
  message?: {
    /** 消息内容，可能为纯文本或结构化内容数组 */
    content: string | Array<{ type: string; text?: string }>
    /** 消息角色：用户、助手或系统 */
    role: 'user' | 'assistant' | 'system'
  }
  /** 消息处理的美元成本 */
  costUSD?: number
  /** 消息处理耗时（毫秒） */
  durationMs?: number
  /** 消息创建时间戳 */
  timestamp: string
  /** 消息创建时的工作目录 */
  cwd?: string
  /** 用户类型标识 */
  userType?: string
  /** 会话标识符 */
  sessionId?: string
  /** 系统版本信息 */
  version?: string
}

/**
 * 日志选项接口 - 表示单个对话日志的完整信息
 *
 * 用于日志选择器和日志列表组件，包含文件元数据、
 * 内容摘要和分支信息。
 */
export interface LogOption {
  /** 日志显示日期 */
  date: string
  /** 日志文件的完整路径 */
  fullPath: string
  /** 在日志数组中的索引位置 */
  value: number

  /** 文件创建时间 */
  created: Date
  /** 文件最后修改时间 */
  modified: Date

  /** 对话的第一个提示内容 */
  firstPrompt: string
  /** 对话中的总消息数量 */
  messageCount: number
  /** 完整的消息列表 */
  messages: SerializedMessage[]

  /** 分支编号（如果是分支对话） */
  forkNumber?: number
  /** 侧链编号（用于复杂分支结构） */
  sidechainNumber?: number
}

/**
 * 日志列表组件属性接口 - LogList.tsx 组件的属性定义
 */
export interface LogListProps {
  /** 组件上下文配置 */
  context: {
    /** 卸载组件的回调函数 */
    unmount?: () => void
  }
}