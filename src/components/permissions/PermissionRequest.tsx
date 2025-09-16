/**
 * 🛡️ 权限请求管理系统 - 工具使用权限的统一管理和用户交互界面
 *
 * 架构图：
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    权限请求管理系统架构                              │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ 工具识别 → 组件选择 → 权限界面 → 用户决策 → 权限执行              │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * 核心功能：
 * 1. 🎯 工具类型识别：根据工具类型自动选择对应的权限请求组件
 * 2. 🔒 权限验证：统一的权限检查和用户确认流程
 * 3. 🎨 界面分发：为不同工具提供定制化的权限请求界面
 * 4. ⚠️ 风险评估：集成风险评分系统，提供安全警告
 * 5. 💾 权限记忆：支持临时和永久权限授权机制
 */

import { useInput } from 'ink'
import * as React from 'react'
import { Tool } from '../../Tool'
import { AssistantMessage } from '../../query'
import { FileEditTool } from '../../tools/FileEditTool/FileEditTool'
import { FileWriteTool } from '../../tools/FileWriteTool/FileWriteTool'
import { BashTool } from '../../tools/BashTool/BashTool'
import { FileEditPermissionRequest } from './FileEditPermissionRequest/FileEditPermissionRequest'
import { BashPermissionRequest } from './BashPermissionRequest/BashPermissionRequest'
import { FallbackPermissionRequest } from './FallbackPermissionRequest'
import { useNotifyAfterTimeout } from '../../hooks/useNotifyAfterTimeout'
import { FileWritePermissionRequest } from './FileWritePermissionRequest/FileWritePermissionRequest'
import { type CommandSubcommandPrefixResult } from '../../utils/commands'
import { FilesystemPermissionRequest } from './FilesystemPermissionRequest/FilesystemPermissionRequest'
import { NotebookEditTool } from '../../tools/NotebookEditTool/NotebookEditTool'
import { GlobTool } from '../../tools/GlobTool/GlobTool'
import { GrepTool } from '../../tools/GrepTool/GrepTool'
import { LSTool } from '../../tools/lsTool/lsTool'
import { FileReadTool } from '../../tools/FileReadTool/FileReadTool'
import { NotebookReadTool } from '../../tools/NotebookReadTool/NotebookReadTool'
import { PRODUCT_NAME } from '../../constants/product'

/**
 * 🎯 工具权限组件映射器 - 根据工具类型选择对应的权限请求组件
 *
 * 映射策略：
 * - FileEditTool/FileWriteTool: 专用文件操作权限界面
 * - BashTool: 专用Shell命令权限界面
 * - 文件系统工具: 统一文件系统权限界面
 * - 其他工具: 通用fallback权限界面
 *
 * @param tool - 需要权限确认的工具实例
 * @returns 对应的React权限请求组件类
 */
function permissionComponentForTool(tool: Tool) {
  switch (tool) {
    case FileEditTool:
      return FileEditPermissionRequest
    case FileWriteTool:
      return FileWritePermissionRequest
    case BashTool:
      return BashPermissionRequest
    case GlobTool:
    case GrepTool:
    case LSTool:
    case FileReadTool:
    case NotebookReadTool:
    case NotebookEditTool:
      return FilesystemPermissionRequest
    default:
      return FallbackPermissionRequest
  }
}

/**
 * 🎨 权限请求组件属性接口 - 定义权限请求组件的标准属性
 */
export type PermissionRequestProps = {
  /** 🛡️ 工具使用确认信息 - 包含所有权限相关的数据和回调 */
  toolUseConfirm: ToolUseConfirm
  /** ✅ 完成回调 - 权限处理完成后的回调函数 */
  onDone(): void
  /** 📝 详细模式 - 是否显示详细的权限信息 */
  verbose: boolean
}

/**
 * 🔍 命令前缀提取器 - 从工具使用确认信息中提取安全的命令前缀
 *
 * 安全检查：
 * - 验证命令前缀存在
 * - 检查无命令注入风险
 * - 提取清洁的命令前缀
 *
 * @param toolUseConfirm - 工具使用确认信息
 * @returns 安全的命令前缀或null
 */
export function toolUseConfirmGetPrefix(
  toolUseConfirm: ToolUseConfirm,
): string | null {
  return (
    (toolUseConfirm.commandPrefix &&
      !(toolUseConfirm.commandPrefix as any).commandInjectionDetected &&
      (toolUseConfirm.commandPrefix as any).commandPrefix) ||
    null
  )
}

/**
 * 🛡️ 工具使用确认信息接口 - 权限系统的核心数据结构
 *
 * 包含权限请求的所有必要信息：
 * - 消息上下文、工具实例、输入参数
 * - 安全检查结果、风险评分
 * - 用户决策回调函数
 */
export type ToolUseConfirm = {
  /** 📨 助手消息 - 触发权限请求的AI消息 */
  assistantMessage: AssistantMessage
  /** 🔧 目标工具 - 需要权限的工具实例 */
  tool: Tool
  /** 📝 操作描述 - 人类可读的操作说明 */
  description: string
  /** 📋 输入参数 - 工具调用的参数对象 */
  input: { [key: string]: unknown }
  /** 🔗 命令前缀 - 解析的命令前缀信息（如果适用） */
  commandPrefix: CommandSubcommandPrefixResult | null
  /** ⚠️ 风险评分 - 操作的风险等级评分 */
  // TODO: remove riskScore from ToolUseConfirm
  riskScore: number | null
  /** ❌ 中止回调 - 用户中止操作时调用 */
  onAbort(): void
  /** ✅ 允许回调 - 用户授权操作时调用 */
  onAllow(type: 'permanent' | 'temporary'): void
  /** 🚫 拒绝回调 - 用户拒绝操作时调用 */
  onReject(): void
}

/**
 * 🛡️ 权限请求主组件 - 统一的工具权限请求入口点
 *
 * 工作流程：
 * 1. 🎯 接收权限请求参数和工具信息
 * 2. ⌨️ 设置Ctrl+C中断处理
 * 3. 🔔 显示系统通知提醒用户
 * 4. 🎨 选择合适的权限组件进行渲染
 * 5. ✨ 委托具体权限处理给专用组件
 *
 * TODO: Move this to Tool.renderPermissionRequest
 *
 * @param props - 权限请求组件属性
 * @returns React节点 - 渲染的权限请求界面
 */
export function PermissionRequest({
  toolUseConfirm,
  onDone,
  verbose,
}: PermissionRequestProps): React.ReactNode {
  // 🛑 处理Ctrl+C中断 - 允许用户快速拒绝权限请求
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      onDone()
      toolUseConfirm.onReject()
    }
  })

  // 🔔 系统通知 - 提醒用户有权限请求等待处理
  const toolName = toolUseConfirm.tool.userFacingName?.() || 'Tool'
  useNotifyAfterTimeout(
    `${PRODUCT_NAME} needs your permission to use ${toolName}`,
  )

  // 🎯 选择权限组件 - 根据工具类型选择最合适的权限界面
  const PermissionComponent = permissionComponentForTool(toolUseConfirm.tool)

  return (
    <PermissionComponent
      toolUseConfirm={toolUseConfirm}
      onDone={onDone}
      verbose={verbose}
    />
  )
}
