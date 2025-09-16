/**
 * 🎯 Bash命令权限请求组件 - Shell命令执行的专用权限确认界面
 *
 * 命令权限管理架构：
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                  Bash命令权限管理流程                           │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ 命令解析 → 风险评估 → 用户选择 → 权限保存 → 命令执行           │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * 核心功能：
 * 1. 🔍 命令解析：从输入参数中安全提取Shell命令
 * 2. ⚠️ 风险展示：显示命令的风险等级和安全警告
 * 3. 🎯 智能选项：根据命令类型提供合适的权限选择
 * 4. 💾 权限持久化：支持前缀级和完整命令级的权限记忆
 * 5. 📊 事件记录：详细记录用户的权限决策和命令执行统计
 */

import { Box, Text } from 'ink'
import React, { useMemo } from 'react'
import { UnaryEvent } from '../../../hooks/usePermissionRequestLogging'
import { savePermission } from '../../../permissions'
import { BashTool } from '../../../tools/BashTool/BashTool'
import { getTheme } from '../../../utils/theme'
import { usePermissionRequestLogging } from '../hooks'
import {
  type ToolUseConfirm,
  toolUseConfirmGetPrefix,
} from '../PermissionRequest.js'
import { PermissionRequestTitle } from '../PermissionRequestTitle'
import { logUnaryPermissionEvent } from '../utils'
import { Select } from '../../CustomSelect/select'
import { toolUseOptions } from '../toolUseOptions'

/**
 * 🎨 Bash权限请求组件属性接口
 */
type Props = {
  /** 🛡️ 工具使用确认信息 */
  toolUseConfirm: ToolUseConfirm
  /** ✅ 完成回调函数 */
  onDone(): void
}

/**
 * 🎯 Bash命令权限请求组件 - 为Shell命令执行提供专用的权限确认界面
 *
 * 组件特性：
 * 1. 🔍 命令安全解析：使用Zod schema验证和提取命令参数
 * 2. ⚠️ 风险可视化：根据命令风险等级调整界面颜色和警告
 * 3. 🎯 多级权限选择：支持临时、前缀级和完整命令级权限
 * 4. 💾 智能权限记忆：根据命令安全性提供合适的持久化选项
 * 5. 📊 完整事件追踪：记录所有权限决策和执行统计
 *
 * 权限级别：
 * - 临时权限：仅本次执行有效
 * - 前缀权限：对命令前缀（如git、npm）生效
 * - 完整权限：对完整命令字符串生效
 *
 * @param props - 组件属性
 * @returns React节点 - 渲染的Bash权限请求界面
 */
export function BashPermissionRequest({
  toolUseConfirm,
  onDone,
}: Props): React.ReactNode {
  const theme = getTheme()

  // 🔍 命令安全解析：从已验证的输入参数中提取Shell命令
  // 注：此时参数已通过前期验证，可安全使用parse
  const { command } = BashTool.inputSchema.parse(toolUseConfirm.input)

  // 📊 事件日志配置：为Bash命令执行准备统计数据
  const unaryEvent = useMemo<UnaryEvent>(
    () => ({ completion_type: 'tool_use_single', language_name: 'none' }),
    [],
  )

  // 📈 权限请求日志记录：自动追踪Bash权限请求的生命周期
  usePermissionRequestLogging(toolUseConfirm, unaryEvent)

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.permission}
      marginTop={1}
      paddingLeft={1}
      paddingRight={1}
      paddingBottom={1}
    >
      <PermissionRequestTitle
        title="Bash command"
        riskScore={toolUseConfirm.riskScore}
      />
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text>{BashTool.renderToolUseMessage({ command })}</Text>
        <Text color={theme.secondaryText}>{toolUseConfirm.description}</Text>
      </Box>

      <Box flexDirection="column">
        <Text>Do you want to proceed?</Text>
        <Select
          options={toolUseOptions({ toolUseConfirm, command })}
          onChange={newValue => {
            switch (newValue) {
              case 'yes':
                logUnaryPermissionEvent(
                  'tool_use_single',
                  toolUseConfirm,
                  'accept',
                )
                toolUseConfirm.onAllow('temporary')
                onDone()
                break
              case 'yes-dont-ask-again-prefix': {
                const prefix = toolUseConfirmGetPrefix(toolUseConfirm)
                if (prefix !== null) {
                  logUnaryPermissionEvent(
                    'tool_use_single',
                    toolUseConfirm,
                    'accept',
                  )
                  savePermission(
                    toolUseConfirm.tool,
                    toolUseConfirm.input,
                    prefix,
                  ).then(() => {
                    toolUseConfirm.onAllow('permanent')
                    onDone()
                  })
                }
                break
              }
              case 'yes-dont-ask-again-full':
                logUnaryPermissionEvent(
                  'tool_use_single',
                  toolUseConfirm,
                  'accept',
                )
                savePermission(
                  toolUseConfirm.tool,
                  toolUseConfirm.input,
                  null, // Save without prefix
                ).then(() => {
                  toolUseConfirm.onAllow('permanent')
                  onDone()
                })
                break
              case 'no':
                logUnaryPermissionEvent(
                  'tool_use_single',
                  toolUseConfirm,
                  'reject',
                )
                toolUseConfirm.onReject()
                onDone()
                break
            }
          }}
        />
      </Box>
    </Box>
  )
}
