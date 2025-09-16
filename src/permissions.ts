/**
 * 🎯 权限管理系统 - Kode 安全架构的核心组件
 *
 * 🏗️ 核心功能：
 * - 实现细粒度的工具权限控制机制
 * - 提供命令注入检测和安全验证
 * - 管理持久化和会话级权限存储
 * - 支持安全模式和权限升级流程
 *
 * 🔄 依赖关系：
 * - 上游：被工具系统和用户交互钩子使用
 * - 下游：依赖工具接口、配置管理和文件系统权限
 *
 * 📊 使用场景：
 * - 工具执行前的权限验证
 * - 用户权限授权的安全检查
 * - 命令行工具的安全执行控制
 * - 文件编辑权限的动态管理
 *
 * 🔧 技术实现：
 * - 基于白名单的权限控制策略
 * - 命令前缀匹配和精确匹配机制
 * - 分层权限存储（磁盘持久化 + 内存会话）
 * - 命令注入检测和防护机制
 */

import type { CanUseToolFn } from './hooks/useCanUseTool'
import { Tool, ToolUseContext } from './Tool'
import { BashTool, inputSchema } from './tools/BashTool/BashTool'
import { FileEditTool } from './tools/FileEditTool/FileEditTool'
import { FileWriteTool } from './tools/FileWriteTool/FileWriteTool'
import { NotebookEditTool } from './tools/NotebookEditTool/NotebookEditTool'
import { getCommandSubcommandPrefix, splitCommand } from './utils/commands'
import {
  getCurrentProjectConfig,
  saveCurrentProjectConfig,
} from './utils/config.js'
import { AbortError } from './utils/errors'
import { logError } from './utils/log'
import { grantWritePermissionForOriginalDir } from './utils/permissions/filesystem'
import { getCwd } from './utils/state'
import { PRODUCT_NAME } from './constants/product'

/**
 * 安全命令白名单 - 无需权限验证的安全命令集合
 *
 * 这些命令被认为是只读且安全的，不会修改系统状态或
 * 暴露敏感信息，因此可以无需用户授权直接执行。
 */
const SAFE_COMMANDS = new Set([
  'git status',    // Git 状态查询
  'git diff',      // Git 差异比较
  'git log',       // Git 提交历史
  'git branch',    // Git 分支列表
  'pwd',           // 当前工作目录
  'tree',          // 目录树显示
  'date',          // 系统日期时间
  'which',         // 命令路径查找
])

/**
 * 检查 Bash 命令是否有精确匹配权限 - 安全命令优先验证
 *
 * 使用三层权限验证策略：
 * 1. 安全命令白名单（无需权限）
 * 2. 精确命令匹配（完全相同的命令）
 * 3. 前缀匹配权限（已批准的命令前缀）
 *
 * @param tool - 执行工具实例
 * @param command - 待执行的命令字符串
 * @param allowedTools - 已授权的工具权限列表
 * @returns 是否有执行权限
 */
export const bashToolCommandHasExactMatchPermission = (
  tool: Tool,
  command: string,
  allowedTools: string[],
): boolean => {
  // 优先检查安全命令白名单
  if (SAFE_COMMANDS.has(command)) {
    return true
  }
  // 检查精确命令匹配
  if (allowedTools.includes(getPermissionKey(tool, { command }, null))) {
    return true
  }
  // 检查命令是否与已批准的前缀精确匹配
  if (allowedTools.includes(getPermissionKey(tool, { command }, command))) {
    return true
  }
  return false
}

/**
 * 检查 Bash 命令权限 - 支持前缀匹配的权限验证
 *
 * 在精确匹配验证基础上，增加前缀匹配支持，
 * 允许用户授权命令前缀以覆盖多个相关命令。
 *
 * @param tool - 执行工具实例
 * @param command - 待执行的命令字符串
 * @param prefix - 命令前缀（可选）
 * @param allowedTools - 已授权的工具权限列表
 * @returns 是否有执行权限
 */
export const bashToolCommandHasPermission = (
  tool: Tool,
  command: string,
  prefix: string | null,
  allowedTools: string[],
): boolean => {
  // 优先检查精确匹配权限
  if (bashToolCommandHasExactMatchPermission(tool, command, allowedTools)) {
    return true
  }
  // 检查前缀匹配权限
  return allowedTools.includes(getPermissionKey(tool, { command }, prefix))
}

/**
 * Bash 工具权限综合验证 - 支持复合命令和注入检测
 *
 * 对 Bash 命令执行完整的安全验证，包括：
 * - 精确匹配和前缀匹配权限检查
 * - 命令注入攻击检测和防护
 * - 复合命令的分解和逐一验证
 * - 异步前缀查询和缓存机制
 *
 * @param tool - Bash 工具实例
 * @param command - 待执行的命令字符串
 * @param context - 工具使用上下文
 * @param allowedTools - 已授权的工具权限列表
 * @param getCommandSubcommandPrefixFn - 命令前缀查询函数（可注入用于测试）
 * @returns 权限验证结果，包含是否允许和错误消息
 */
export const bashToolHasPermission = async (
  tool: Tool,
  command: string,
  context: ToolUseContext,
  allowedTools: string[],
  getCommandSubcommandPrefixFn = getCommandSubcommandPrefix,
): Promise<PermissionResult> => {
  if (bashToolCommandHasExactMatchPermission(tool, command, allowedTools)) {
    // This is an exact match for a command that is allowed, so we can skip the prefix check
    return { result: true }
  }

  const subCommands = splitCommand(command).filter(_ => {
    // Denim likes to add this, we strip it out so we don't need to prompt the user each time
    if (_ === `cd ${getCwd()}`) {
      return false
    }
    return true
  })
  const commandSubcommandPrefix = await getCommandSubcommandPrefixFn(
    command,
    context.abortController.signal,
  )
  if (context.abortController.signal.aborted) {
    throw new AbortError()
  }

  if (commandSubcommandPrefix === null) {
    // Fail closed and ask for user approval if the command prefix query failed (e.g. due to network error)
    // This is NOT the same as `fullCommandPrefix.commandPrefix === null`, which means no prefix was detected
    return {
      result: false,
      message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
    }
  }

  if (commandSubcommandPrefix.commandInjectionDetected) {
    // Only allow exact matches for potential command injections
    if (bashToolCommandHasExactMatchPermission(tool, command, allowedTools)) {
      return { result: true }
    } else {
      return {
        result: false,
        message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
      }
    }
  }

  // If there is only one command, no need to process subCommands
  if (subCommands.length < 2) {
    if (
      bashToolCommandHasPermission(
        tool,
        command,
        commandSubcommandPrefix.commandPrefix,
        allowedTools,
      )
    ) {
      return { result: true }
    } else {
      return {
        result: false,
        message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
      }
    }
  }
  if (
    subCommands.every(subCommand => {
      const prefixResult =
        commandSubcommandPrefix.subcommandPrefixes.get(subCommand)
      if (prefixResult === undefined || prefixResult.commandInjectionDetected) {
        // If prefix result is missing or command injection is detected, always ask for permission
        return false
      }
      const hasPermission = bashToolCommandHasPermission(
        tool,
        subCommand,
        prefixResult ? prefixResult.commandPrefix : null,
        allowedTools,
      )
      return hasPermission
    })
  ) {
    return { result: true }
  }
  return {
    result: false,
    message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
  }
}

/**
 * 权限验证结果类型 - 统一的权限检查返回值
 *
 * 提供类型安全的权限验证结果，支持成功和失败两种状态，
 * 失败时包含详细的错误消息用于用户提示。
 */
type PermissionResult = { result: true } | { result: false; message: string }

/**
 * 工具使用权限主验证函数 - 统一的权限检查入口点
 *
 * 作为所有工具权限验证的统一入口，根据安全模式、工具类型
 * 和输入参数执行相应的权限检查策略。
 *
 * 验证策略：
 * - 非安全模式：允许所有工具使用（宽松模式）
 * - 工具自检：优先使用工具自定义的权限检查
 * - 特殊工具：Bash、文件编辑等工具的专门处理
 * - 默认工具：基于配置文件的持久化权限验证
 *
 * @param tool - 待使用的工具实例
 * @param input - 工具输入参数
 * @param context - 工具使用上下文
 * @param _assistantMessage - 助手消息（未使用）
 * @returns 权限验证结果
 */
export const hasPermissionsToUseTool: CanUseToolFn = async (
  tool,
  input,
  context,
  _assistantMessage,
): Promise<PermissionResult> => {
  // If safe mode is not enabled, allow all tools (permissive by default)
  if (!context.options.safeMode) {
    return { result: true }
  }

  if (context.abortController.signal.aborted) {
    throw new AbortError()
  }

  // Check if the tool needs permissions
  try {
    if (!tool.needsPermissions(input as never)) {
      return { result: true }
    }
  } catch (e) {
    logError(`Error checking permissions: ${e}`)
    return { result: false, message: 'Error checking permissions' }
  }

  const projectConfig = getCurrentProjectConfig()
  const allowedTools = projectConfig.allowedTools ?? []
  // Special case for BashTool to allow blanket commands without exposing them in the UI
  if (tool === BashTool && allowedTools.includes(BashTool.name)) {
    return { result: true }
  }

  // TODO: Move this into tool definitions (done for read tools!)
  switch (tool) {
    // For bash tool, check each sub-command's permissions separately
    case BashTool: {
      // The types have already been validated by the tool,
      // so we can safely parse the input (as opposed to safeParse).
      const { command } = inputSchema.parse(input)
      return await bashToolHasPermission(tool, command, context, allowedTools)
    }
    // For file editing tools, check session-only permissions
    case FileEditTool:
    case FileWriteTool:
    case NotebookEditTool: {
      // The types have already been validated by the tool,
      // so we can safely pass this in
      if (!tool.needsPermissions(input)) {
        return { result: true }
      }
      return {
        result: false,
        message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
      }
    }
    // For other tools, check persistent permissions
    default: {
      const permissionKey = getPermissionKey(tool, input, null)
      if (allowedTools.includes(permissionKey)) {
        return { result: true }
      }

      return {
        result: false,
        message: `${PRODUCT_NAME} requested permissions to use ${tool.name}, but you haven't granted it yet.`,
      }
    }
  }
}

/**
 * 保存工具权限 - 分层权限存储策略
 *
 * 根据工具类型采用不同的权限存储策略：
 * - 文件编辑工具：仅在内存中授权（会话级权限）
 * - 其他工具：持久化存储到配置文件（项目级权限）
 *
 * 这种设计平衡了安全性和用户体验，文件编辑等敏感操作
 * 需要每次会话重新授权，而其他工具可以保持持久权限。
 *
 * @param tool - 工具实例
 * @param input - 工具输入参数
 * @param prefix - 权限前缀（用于 Bash 命令）
 */
export async function savePermission(
  tool: Tool,
  input: { [k: string]: unknown },
  prefix: string | null,
): Promise<void> {
  const key = getPermissionKey(tool, input, prefix)

  // For file editing tools, store write permissions only in memory
  if (
    tool === FileEditTool ||
    tool === FileWriteTool ||
    tool === NotebookEditTool
  ) {
    grantWritePermissionForOriginalDir()
    return
  }

  // For other tools, store permissions on disk
  const projectConfig = getCurrentProjectConfig()
  if (projectConfig.allowedTools.includes(key)) {
    return
  }

  projectConfig.allowedTools.push(key)
  projectConfig.allowedTools.sort()

  saveCurrentProjectConfig(projectConfig)
}

/**
 * 生成权限密钥 - 工具权限的唯一标识符生成
 *
 * 为不同类型的工具生成标准化的权限密钥，用于权限存储和查找。
 *
 * 密钥格式：
 * - Bash 工具（有前缀）：`BashTool(prefix:*)`
 * - Bash 工具（无前缀）：`BashTool(具体命令)`
 * - 其他工具：`工具名称`
 *
 * @param tool - 工具实例
 * @param input - 工具输入参数
 * @param prefix - 权限前缀（仅用于 Bash 工具）
 * @returns 权限密钥字符串
 */
function getPermissionKey(
  tool: Tool,
  input: { [k: string]: unknown },
  prefix: string | null,
): string {
  switch (tool) {
    case BashTool:
      if (prefix) {
        return `${BashTool.name}(${prefix}:*)`
      }
      return `${BashTool.name}(${BashTool.renderToolUseMessage(input as never)})`
    default:
      return tool.name
  }
}
