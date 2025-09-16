/**
 * 🎯 权限模式管理系统 - 基于 Claude Code 的权限控制机制
 *
 * 🏗️ 核心功能：
 * - 提供四种权限模式的完整定义和配置
 * - 管理工具访问权限和路径限制
 * - 支持权限模式间的安全切换
 * - 实现细粒度的操作控制和验证
 *
 * 🔄 依赖关系：
 * - 上游：被权限系统和工具执行器调用
 * - 下游：控制所有工具和文件系统操作
 *
 * 📊 使用场景：
 * - 交互式会话中的权限模式切换
 * - 自动化脚本的权限控制
 * - 计划模式下的只读操作限制
 * - 开发调试时的权限绕过
 *
 * 🔧 技术实现：
 * - 基于官方 Claude Code 实现的权限模式设计
 * - 使用类型安全的模式定义和配置
 * - 支持权限模式的循环切换机制
 * - 包含详细的限制和元数据管理
 */

/**
 * 权限模式类型 - 四种不同的操作权限级别
 *
 * - `default`: 标准权限检查模式，需要用户确认操作
 * - `acceptEdits`: 自动接受编辑操作，减少交互中断
 * - `plan`: 计划模式，仅允许只读工具进行研究和规划
 * - `bypassPermissions`: 绕过所有权限检查，用于调试和紧急情况
 */
export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'plan'
  | 'bypassPermissions'

/**
 * 权限上下文接口 - 完整的权限状态和配置信息
 */
export interface PermissionContext {
  /** 当前激活的权限模式 */
  mode: PermissionMode
  /** 允许使用的工具列表，'*' 表示所有工具 */
  allowedTools: string[]
  /** 允许访问的文件路径列表 */
  allowedPaths: string[]
  /** 权限限制配置 */
  restrictions: {
    /** 是否为只读模式 */
    readOnly: boolean
    /** 是否需要用户确认操作 */
    requireConfirmation: boolean
    /** 是否绕过所有验证 */
    bypassValidation: boolean
  }
  /** 权限模式的元数据信息 */
  metadata: {
    /** 模式激活时间 */
    activatedAt?: string
    /** 上一个权限模式 */
    previousMode?: PermissionMode
    /** 模式切换次数 */
    transitionCount: number
  }
}

/**
 * 模式配置接口 - 每种权限模式的完整配置定义
 */
export interface ModeConfig {
  /** 模式名称 */
  name: PermissionMode
  /** 显示标签 */
  label: string
  /** 图标表示 */
  icon: string
  /** 主题颜色 */
  color: string
  /** 模式描述 */
  description: string
  /** 该模式下允许的工具 */
  allowedTools: string[]
  /** 该模式下的操作限制 */
  restrictions: {
    /** 是否为只读模式 */
    readOnly: boolean
    /** 是否需要用户确认 */
    requireConfirmation: boolean
    /** 是否绕过验证 */
    bypassValidation: boolean
  }
}

/**
 * 权限模式配置表 - 基于官方 Claude Code 的模式配置
 *
 * 为每种权限模式定义完整的配置信息，包括显示属性、
 * 允许的工具列表和操作限制。
 */
export const MODE_CONFIGS: Record<PermissionMode, ModeConfig> = {
  default: {
    name: 'default',
    label: 'DEFAULT',
    icon: '🔒',
    color: 'blue',
    description: 'Standard permission checking',
    allowedTools: ['*'],
    restrictions: {
      readOnly: false,
      requireConfirmation: true,
      bypassValidation: false,
    },
  },
  acceptEdits: {
    name: 'acceptEdits',
    label: 'ACCEPT EDITS',
    icon: '✅',
    color: 'green',
    description: 'Auto-approve edit operations',
    allowedTools: ['*'],
    restrictions: {
      readOnly: false,
      requireConfirmation: false,
      bypassValidation: false,
    },
  },
  plan: {
    name: 'plan',
    label: 'PLAN MODE',
    icon: '📝',
    color: 'yellow',
    description: 'Research and planning - read-only tools only',
    allowedTools: [
      'Read',
      'Grep',
      'Glob',
      'LS',
      'WebSearch',
      'WebFetch',
      'NotebookRead',
      'exit_plan_mode',
    ],
    restrictions: {
      readOnly: true,
      requireConfirmation: true,
      bypassValidation: false,
    },
  },
  bypassPermissions: {
    name: 'bypassPermissions',
    label: 'BYPASS PERMISSIONS',
    icon: '🔓',
    color: 'red',
    description: 'All permissions bypassed',
    allowedTools: ['*'],
    restrictions: {
      readOnly: false,
      requireConfirmation: false,
      bypassValidation: true,
    },
  },
}

/**
 * 权限模式循环切换函数 - 基于原始 yg2 函数实现
 *
 * 按照预定的顺序在不同权限模式间切换，支持可选的绕过权限模式。
 *
 * 切换顺序：
 * default → acceptEdits → plan → bypassPermissions → default
 * (如果 bypassPermissions 不可用，则 plan → default)
 *
 * @param currentMode - 当前的权限模式
 * @param isBypassAvailable - 是否可以使用绕过权限模式，默认为 true
 * @returns 下一个权限模式
 *
 * @example
 * ```typescript
 * // 从默认模式切换
 * const nextMode = getNextPermissionMode('default'); // 返回 'acceptEdits'
 *
 * // 禁用绕过权限模式
 * const safeNext = getNextPermissionMode('plan', false); // 返回 'default'
 * ```
 */
export function getNextPermissionMode(
  currentMode: PermissionMode,
  isBypassAvailable: boolean = true,
): PermissionMode {
  switch (currentMode) {
    case 'default':
      return 'acceptEdits'
    case 'acceptEdits':
      return 'plan'
    case 'plan':
      return isBypassAvailable ? 'bypassPermissions' : 'default'
    case 'bypassPermissions':
      return 'default'
    default:
      return 'default'
  }
}
