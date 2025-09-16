/**
 * 🎯 权限工具函数集 - 权限系统的通用工具和日志记录功能
 *
 * 核心功能：
 * 1. 📊 统一日志记录：标准化权限事件的日志格式和元数据
 * 2. 🔍 事件追踪：记录用户的权限决策行为用于分析
 * 3. 📈 使用统计：支持产品改进和用户行为分析
 * 4. 🏷️ 元数据标准化：确保日志数据的一致性和完整性
 */

import { env } from '../../utils/env'
import { CompletionType, logUnaryEvent } from '../../utils/unaryLogging'
import { ToolUseConfirm } from './PermissionRequest'

/**
 * 📊 权限事件日志记录器 - 统一记录用户的权限决策事件
 *
 * 记录内容：
 * - 完成类型：工具使用类型分类
 * - 用户决策：接受或拒绝权限请求
 * - 消息ID：关联到具体的AI助手消息
 * - 平台信息：运行环境标识
 *
 * 用途：
 * - 🔍 用户行为分析：了解权限使用模式
 * - 📈 产品改进：基于使用数据优化权限流程
 * - 🚨 安全监控：追踪权限滥用或异常行为
 *
 * @param completion_type - 完成类型分类
 * @param toolUseConfirm - 工具使用确认信息，用于提取消息ID
 * @param event - 用户事件类型：'accept'（接受）或'reject'（拒绝）
 */
export function logUnaryPermissionEvent(
  completion_type: CompletionType,
  {
    assistantMessage: {
      message: { id: message_id },
    },
  }: ToolUseConfirm,
  event: 'accept' | 'reject',
): void {
  logUnaryEvent({
    completion_type,
    event,
    metadata: {
      language_name: 'none',
      message_id,
      platform: env.platform,
    },
  })
}
