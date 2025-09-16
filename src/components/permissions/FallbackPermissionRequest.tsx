/**
 * 🛡️ 通用权限请求组件 - 不支持专用权限界面的工具的默认权限请求处理器
 *
 * 架构设计：
 * ┌─────────────────────────────────────────────────────────────────┐
 * │               通用权限请求组件工作流程                              │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ 工具信息解析 → 风险评估显示 → 用户选择界面 → 权限执行 → 日志记录   │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * 核心功能：
 * 1. 🎯 通用工具支持：为所有工具提供基础权限请求界面
 * 2. 🔍 MCP工具识别：特殊处理MCP（Model Context Protocol）工具
 * 3. ⚠️ 风险可视化：显示操作风险等级和相应的视觉提示
 * 4. 💾 权限记忆：支持"不再询问"的权限持久化机制
 * 5. 📊 使用统计：集成使用情况分析和事件日志记录
 */

import { Box, Text } from 'ink'
import React, { useMemo } from 'react'
import { Select } from '../CustomSelect/select'
import { getTheme } from '../../utils/theme'
import {
  PermissionRequestTitle,
  textColorForRiskScore,
} from './PermissionRequestTitle.js'
import { logUnaryEvent } from '../../utils/unaryLogging'
import { env } from '../../utils/env'
import { getCwd } from '../../utils/state'
import { savePermission } from '../../permissions'
import {
  type ToolUseConfirm,
  toolUseConfirmGetPrefix,
} from './PermissionRequest.js'
import chalk from 'chalk'
import {
  UnaryEvent,
  usePermissionRequestLogging,
} from '../../hooks/usePermissionRequestLogging.js'

/**
 * 🎨 通用权限请求组件属性接口
 */
type Props = {
  /** 🛡️ 工具使用确认信息 */
  toolUseConfirm: ToolUseConfirm
  /** ✅ 完成回调函数 */
  onDone(): void
  /** 📝 详细模式标志 */
  verbose: boolean
}

/**
 * 🛡️ 通用权限请求组件 - 为所有工具提供标准化的权限确认界面
 *
 * 组件职责：
 * 1. 🎯 工具名称处理：清理MCP工具标识，提供友好的显示名称
 * 2. ⚠️ 风险评估展示：根据风险等级调整边框颜色和视觉提示
 * 3. 💬 用户交互界面：提供三种选择 - 允许/记住允许/拒绝
 * 4. 📊 事件日志记录：记录用户的权限决策和使用统计
 * 5. 💾 权限持久化：保存用户的"不再询问"偏好设置
 *
 * @param props - 组件属性
 * @returns React节点 - 渲染的权限请求界面
 */
export function FallbackPermissionRequest({
  toolUseConfirm,
  onDone,
  verbose,
}: Props): React.ReactNode {
  const theme = getTheme()

  // 🔍 工具名称清理：移除MCP标识，提供更友好的用户界面
  // TODO: Avoid these special cases
  const originalUserFacingName = toolUseConfirm.tool.userFacingName()
  const userFacingName = originalUserFacingName.endsWith(' (MCP)')
    ? originalUserFacingName.slice(0, -6)
    : originalUserFacingName

  // 📊 事件日志配置：准备使用统计数据结构
  const unaryEvent = useMemo<UnaryEvent>(
    () => ({
      completion_type: 'tool_use_single',
      language_name: 'none',
    }),
    [],
  )

  // 📈 权限请求日志记录：追踪权限请求的使用情况
  usePermissionRequestLogging(toolUseConfirm, unaryEvent)

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={textColorForRiskScore(toolUseConfirm.riskScore)}
      marginTop={1}
      paddingLeft={1}
      paddingRight={1}
      paddingBottom={1}
    >
      <PermissionRequestTitle
        title="Tool use"
        riskScore={toolUseConfirm.riskScore}
      />
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text>
          {userFacingName}(
          {toolUseConfirm.tool.renderToolUseMessage(
            toolUseConfirm.input as never,
            { verbose },
          )}
          )
          {originalUserFacingName.endsWith(' (MCP)') ? (
            <Text color={theme.secondaryText}> (MCP)</Text>
          ) : (
            ''
          )}
        </Text>
        <Text color={theme.secondaryText}>{toolUseConfirm.description}</Text>
      </Box>

      <Box flexDirection="column">
        <Text>Do you want to proceed?</Text>
        <Select
          options={[
            {
              label: 'Yes',
              value: 'yes',
            },
            {
              label: `Yes, and don't ask again for ${chalk.bold(userFacingName)} commands in ${chalk.bold(getCwd())}`,
              value: 'yes-dont-ask-again',
            },
            {
              label: `No, and provide instructions (${chalk.bold.hex(getTheme().warning)('esc')})`,
              value: 'no',
            },
          ]}
          onChange={newValue => {
            switch (newValue) {
              case 'yes':
                logUnaryEvent({
                  completion_type: 'tool_use_single',
                  event: 'accept',
                  metadata: {
                    language_name: 'none',
                    message_id: toolUseConfirm.assistantMessage.message.id,
                    platform: env.platform,
                  },
                })
                toolUseConfirm.onAllow('temporary')
                onDone()
                break
              case 'yes-dont-ask-again':
                logUnaryEvent({
                  completion_type: 'tool_use_single',
                  event: 'accept',
                  metadata: {
                    language_name: 'none',
                    message_id: toolUseConfirm.assistantMessage.message.id,
                    platform: env.platform,
                  },
                })
                savePermission(
                  toolUseConfirm.tool,
                  toolUseConfirm.input,
                  toolUseConfirmGetPrefix(toolUseConfirm),
                ).then(() => {
                  toolUseConfirm.onAllow('permanent')
                  onDone()
                })
                break
              case 'no':
                logUnaryEvent({
                  completion_type: 'tool_use_single',
                  event: 'reject',
                  metadata: {
                    language_name: 'none',
                    message_id: toolUseConfirm.assistantMessage.message.id,
                    platform: env.platform,
                  },
                })
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
