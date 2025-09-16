/**
 * 🎯 AI 助手文本消息组件 - 智能消息显示和格式化的核心组件
 *
 * 🏗️ 核心功能：
 * - 提供 AI 助手响应消息的统一展示界面
 * - 支持多种特殊消息类型的差异化渲染
 * - 集成 Markdown 格式化和语法高亮
 * - 实现错误消息和状态提示的可视化
 * - 提供成本统计和性能指标的实时显示
 *
 * 🔄 依赖关系：
 * - 上游：被消息渲染系统调用进行 AI 响应展示
 * - 下游：依赖主题系统、Markdown 处理、终端适配
 *
 * 📊 使用场景：
 * - AI 助手的标准文本响应显示
 * - 命令输出结果的结构化展示
 * - 错误信息和警告提示的可视化
 * - 系统状态和用户交互的反馈显示
 *
 * 🔧 技术实现：
 * - 智能路由：基于内容类型的消息分发机制
 * - 样式差异化：不同消息类型的视觉区分
 * - 响应式布局：自适应终端宽度的界面调整
 * - 成本集成：实时显示 API 调用成本和耗时
 *
 * 💡 设计原则：
 * - 内容优先：确保消息内容的清晰可读
 * - 类型区分：不同消息类型的明确视觉标识
 * - 响应适配：适应不同终端尺寸的灵活布局
 * - 用户体验：提供丰富的交互反馈和状态提示
 */
import { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import React from 'react'
import { AssistantBashOutputMessage } from './AssistantBashOutputMessage'
import { AssistantLocalCommandOutputMessage } from './AssistantLocalCommandOutputMessage'
import { getTheme } from '../../utils/theme'
import { Box, Text } from 'ink'
import { Cost } from '../Cost'
import {
  API_ERROR_MESSAGE_PREFIX,
  CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE,
  INVALID_API_KEY_ERROR_MESSAGE,
  PROMPT_TOO_LONG_ERROR_MESSAGE,
} from '../../services/claude.js'
import {
  CANCEL_MESSAGE,
  INTERRUPT_MESSAGE,
  INTERRUPT_MESSAGE_FOR_TOOL_USE,
  isEmptyMessageText,
  NO_RESPONSE_REQUESTED,
} from '../../utils/messages.js'
import { BLACK_CIRCLE } from '../../constants/figures'
import { applyMarkdown } from '../../utils/markdown'
import { useTerminalSize } from '../../hooks/useTerminalSize'

/**
 * 组件属性类型定义 - AI 助手文本消息的完整配置参数
 *
 * @property param - Anthropic SDK 的文本块参数对象
 * @property costUSD - API 调用成本（美元）
 * @property durationMs - 响应生成耗时（毫秒）
 * @property debug - 调试模式开关
 * @property addMargin - 是否添加上边距
 * @property shouldShowDot - 是否显示消息前缀点
 * @property verbose - 详细模式（可选）
 * @property width - 组件宽度（可选）
 */
type Props = {
  param: TextBlockParam      // AI 文本响应参数
  costUSD: number           // API 调用成本
  durationMs: number        // 响应耗时
  debug: boolean            // 调试模式标志
  addMargin: boolean        // 边距添加标志
  shouldShowDot: boolean    // 前缀点显示标志
  verbose?: boolean         // 详细模式（可选）
  width?: number | string   // 组件宽度（可选）
}

/**
 * 🎨 AI 助手文本消息渲染组件 - 多类型消息的智能分发和展示器
 *
 * 负责将 AI 助手的文本响应进行智能分类和格式化显示，支持多种
 * 特殊消息类型的差异化渲染和用户友好的视觉呈现。
 *
 * @param {Props} props - 组件属性
 * @param {TextBlockParam} props.param - 包含文本内容的消息参数
 * @param {number} props.costUSD - API 调用的成本费用
 * @param {number} props.durationMs - 消息生成的耗时统计
 * @param {boolean} props.debug - 调试信息显示开关
 * @param {boolean} props.addMargin - 上边距添加控制
 * @param {boolean} props.shouldShowDot - 前缀标识点的显示控制
 * @param {boolean} [props.verbose] - 详细显示模式开关
 * @returns {React.ReactNode} 渲染后的消息组件或 null
 *
 * 🔄 消息类型路由详解：
 * ┌─────────────────────────────────────────────────────────────┐
 * │                  智能消息分发处理流程                        │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 1. 内容检查      │ • 检测空消息并跳过渲染                    │
 * │                 │ • 提取文本内容进行类型判断                │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 2. 特殊内容路由  │ • Bash 输出：路由到专用 Bash 组件         │
 * │                 │ • 本地命令：路由到本地命令输出组件        │
 * │                 │ • API 错误：显示带错误样式的提示          │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 3. 系统消息处理  │ • 中断消息：显示用户中断提示              │
 * │                 │ • 取消消息：显示操作取消状态              │
 * │                 │ • 上下文满：显示压缩建议                  │
 * │                 │ • 余额不足：显示充值链接                  │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 4. 标准消息渲染  │ • Markdown 格式化处理                    │
 * │                 │ • 响应式布局和终端适配                    │
 * │                 │ • 成本信息和性能统计显示                  │
 * └─────────────────────────────────────────────────────────────┘
 *
 * 💡 渲染策略：
 * • 内容为王：优先保证消息内容的清晰展示
 * • 类型区分：不同消息类型采用差异化的视觉样式
 * • 上下文感知：基于消息类型提供相应的操作建议
 * • 性能友好：只渲染必要的组件，跳过空消息
 */
export function AssistantTextMessage({
  param: { text },
  costUSD,
  durationMs,
  debug,
  addMargin,
  shouldShowDot,
  verbose,
}: Props): React.ReactNode {
  const { columns } = useTerminalSize()
  if (isEmptyMessageText(text)) {
    return null
  }

  // Show bash output
  if (text.startsWith('<bash-stdout') || text.startsWith('<bash-stderr')) {
    return <AssistantBashOutputMessage content={text} verbose={verbose} />
  }

  // Show command output
  if (
    text.startsWith('<local-command-stdout') ||
    text.startsWith('<local-command-stderr')
  ) {
    return <AssistantLocalCommandOutputMessage content={text} />
  }

  if (text.startsWith(API_ERROR_MESSAGE_PREFIX)) {
    return (
      <Text>
        &nbsp;&nbsp;⎿ &nbsp;
        <Text color={getTheme().error}>
          {text === API_ERROR_MESSAGE_PREFIX
            ? `${API_ERROR_MESSAGE_PREFIX}: Please wait a moment and try again.`
            : text}
        </Text>
      </Text>
    )
  }

  switch (text) {
    // Local JSX commands don't need a response, but we still want Claude to see them
    // Tool results render their own interrupt messages
    case NO_RESPONSE_REQUESTED:
    case INTERRUPT_MESSAGE_FOR_TOOL_USE:
      return null

    case INTERRUPT_MESSAGE:
    case CANCEL_MESSAGE:
      return (
        <Text>
          &nbsp;&nbsp;⎿ &nbsp;
          <Text color={getTheme().error}>Interrupted by user</Text>
        </Text>
      )

    case PROMPT_TOO_LONG_ERROR_MESSAGE:
      return (
        <Text>
          &nbsp;&nbsp;⎿ &nbsp;
          <Text color={getTheme().error}>
            Context low &middot; Run /compact to compact & continue
          </Text>
        </Text>
      )

    case CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE:
      return (
        <Text>
          &nbsp;&nbsp;⎿ &nbsp;
          <Text color={getTheme().error}>
            Credit balance too low &middot; Add funds:
            https://console.anthropic.com/settings/billing
          </Text>
        </Text>
      )

    case INVALID_API_KEY_ERROR_MESSAGE:
      return (
        <Text>
          &nbsp;&nbsp;⎿ &nbsp;
          <Text color={getTheme().error}>{INVALID_API_KEY_ERROR_MESSAGE}</Text>
        </Text>
      )

    default:
      return (
        <Box
          alignItems="flex-start"
          flexDirection="row"
          justifyContent="space-between"
          marginTop={addMargin ? 1 : 0}
          width="100%"
        >
          <Box flexDirection="row">
            {shouldShowDot && (
              <Box minWidth={2}>
                <Text color={getTheme().text}>{BLACK_CIRCLE}</Text>
              </Box>
            )}
            <Box flexDirection="column" width={columns - 6}>
              <Text>{applyMarkdown(text)}</Text>
            </Box>
          </Box>
          <Cost costUSD={costUSD} durationMs={durationMs} debug={debug} />
        </Box>
      )
  }
}
