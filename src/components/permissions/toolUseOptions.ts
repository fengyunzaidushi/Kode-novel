/**
 * 🎯 工具使用选项生成器 - 权限确认对话框的动态选项生成系统
 *
 * 选项生成策略：
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    权限选项生成逻辑                              │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ 安全检查 → 前缀优先 → 完整命令 → 基础选项 → 用户界面生成       │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * 核心功能：
 * 1. 🔒 安全性验证：检查命令是否安全，防止注入攻击
 * 2. 🎯 智能选项：根据命令类型动态生成"不再询问"选项
 * 3. 📂 目录绑定：权限记忆与当前工作目录关联
 * 4. 🎨 视觉优化：使用颜色和样式增强用户体验
 * 5. ⚡ 优先级处理：前缀权限优先于完整命令权限
 */

import { type Option } from '@inkjs/ui'
import chalk from 'chalk'
import {
  type ToolUseConfirm,
  toolUseConfirmGetPrefix,
} from './PermissionRequest.js'
import { isUnsafeCompoundCommand } from '../../utils/commands'
import { getCwd } from '../../utils/state'
import { getTheme } from '../../utils/theme'
import { type OptionSubtree } from '../CustomSelect/select'

/**
 * 🛡️ 工具使用选项生成器 - 为权限确认对话框动态生成用户选择选项
 *
 * 选项生成逻辑：
 * 1. 🔍 安全性检查：验证命令是否为不安全的复合命令或存在注入风险
 * 2. 🎯 前缀权限优先：如果有安全的命令前缀，优先提供前缀级别的权限
 * 3. 📝 完整命令权限：对于安全的完整命令，提供命令级别的权限
 * 4. 📂 目录关联：所有权限都与当前工作目录绑定
 * 5. 🎨 视觉增强：使用粗体和颜色突出显示关键信息
 *
 * 安全策略：
 * - 危险复合命令：不提供"不再询问"选项
 * - 潜在注入风险：阻止权限持久化
 * - 前缀优先级：前缀权限比完整命令权限更精细化
 *
 * @param params - 包含工具确认信息和命令字符串的参数对象
 * @returns 用户可选择的权限选项数组
 */
export function toolUseOptions({
  toolUseConfirm,
  command,
}: {
  /** 🛡️ 工具使用确认信息 */
  toolUseConfirm: ToolUseConfirm
  /** 📝 要执行的命令字符串 */
  command: string
}): (Option | OptionSubtree)[] {
  // 🔒 安全性检查：隐藏不安全命令的"不再询问"选项
  // 防止复合命令注入和潜在的安全漏洞
  const showDontAskAgainOption =
    !isUnsafeCompoundCommand(command) &&
    toolUseConfirm.commandPrefix &&
    !toolUseConfirm.commandPrefix.commandInjectionDetected

  // 🔍 提取安全的命令前缀
  const prefix = toolUseConfirmGetPrefix(toolUseConfirm)
  const showDontAskAgainPrefixOption = showDontAskAgainOption && prefix !== null

  // 🎯 动态生成"不再询问"选项
  let dontShowAgainOptions: (Option | OptionSubtree)[] = []
  if (showDontAskAgainPrefixOption) {
    // ⚡ 前缀选项优先：前缀级权限比完整命令权限更灵活
    dontShowAgainOptions = [
      {
        label: `Yes, and don't ask again for ${chalk.bold(prefix)} commands in ${chalk.bold(getCwd())}`,
        value: 'yes-dont-ask-again-prefix',
      },
    ]
  } else if (showDontAskAgainOption) {
    // 📝 完整命令权限：针对特定命令的权限持久化
    dontShowAgainOptions = [
      {
        label: `Yes, and don't ask again for ${chalk.bold(command)} commands in ${chalk.bold(getCwd())}`,
        value: 'yes-dont-ask-again-full',
      },
    ]
  }

  // 🎨 返回完整的用户选项列表
  return [
    {
      label: 'Yes',
      value: 'yes',
    },
    ...dontShowAgainOptions,
    {
      label: `No, and provide instructions (${chalk.bold.hex(getTheme().warning)('esc')})`,
      value: 'no',
    },
  ]
}
