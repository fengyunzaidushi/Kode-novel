/**
 * 🎯 权限请求钩子函数 - 权限系统的React钩子和事件处理逻辑
 *
 * 核心功能：
 * 1. 📊 自动化日志记录：使用React hooks自动追踪权限请求生命周期
 * 2. 🔄 异步语言处理：支持同步和异步的语言名称解析
 * 3. 📈 统计事件集成：与统计分析系统无缝集成
 * 4. 🎭 声明式设计：通过hooks提供简洁的权限日志记录接口
 */

import { useEffect } from 'react'
import { logUnaryEvent, CompletionType } from '../../utils/unaryLogging'
import { ToolUseConfirm } from '../../components/permissions/PermissionRequest'
import { env } from '../../utils/env'

/**
 * 📊 统一事件类型定义 - 权限请求日志事件的数据结构
 */
type UnaryEventType = {
  /** 🏷️ 完成类型 - 工具使用的分类标识 */
  completion_type: CompletionType
  /** 🌐 语言名称 - 支持同步字符串或异步Promise解析 */
  language_name: string | Promise<string>
}

/**
 * 📊 权限请求日志记录钩子 - 自动化权限事件的统计和追踪
 *
 * 功能特性：
 * - 🔄 生命周期集成：在组件挂载时自动记录权限请求事件
 * - 🌐 异步语言支持：处理同步字符串和异步Promise的语言名称
 * - 📈 统计数据标准化：确保所有权限事件都有一致的元数据格式
 * - 🎯 React优化：使用useEffect钩子确保事件只记录一次
 *
 * 记录的事件信息：
 * - 完成类型、语言环境、消息ID、平台信息
 * - 自动关联到特定的AI助手消息和用户会话
 *
 * 使用场景：
 * - 权限请求组件中的自动日志记录
 * - 用户行为分析和产品改进数据收集
 * - 权限系统使用情况的统计监控
 *
 * @param toolUseConfirm - 工具使用确认信息，包含消息和用户上下文
 * @param unaryEvent - 统一事件对象，包含分类和语言信息
 */
export function usePermissionRequestLogging(
  toolUseConfirm: ToolUseConfirm,
  unaryEvent: UnaryEventType,
): void {
  useEffect(() => {
    // 🌐 语言名称异步处理：统一处理字符串和Promise类型的语言标识
    const languagePromise = Promise.resolve(unaryEvent.language_name)

    // 📊 统一事件日志记录：等待语言解析完成后记录完整的事件信息
    languagePromise.then(language => {
      logUnaryEvent({
        completion_type: unaryEvent.completion_type,
        event: 'response',
        metadata: {
          language_name: language,
          message_id: toolUseConfirm.assistantMessage.message.id,
          platform: env.platform,
        },
      })
    })
  }, [toolUseConfirm, unaryEvent])
}
