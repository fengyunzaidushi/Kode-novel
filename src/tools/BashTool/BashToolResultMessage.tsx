/**
 * 🎯 Bash工具结果消息组件 - 命令执行结果的结构化UI展示
 *
 * 🏗️ 核心功能：
 * - 提供Bash命令执行结果的美观可读展示
 * - 智能区分标准输出和错误输出的显示样式
 * - 支持详细模式和简洁模式的灵活切换
 * - 集成主题系统的一致性视觉效果
 * - 处理空输出的用户友好提示
 *
 * 🔄 依赖关系：
 * - 上游：被 BashTool 调用进行结果展示
 * - 下游：依赖 OutputLine 组件、主题系统、Ink UI
 *
 * 📊 使用场景：
 * - 终端命令执行结果的实时显示
 * - 标准输出和错误输出的分离展示
 * - 长输出内容的截断和格式化显示
 * - 空命令结果的状态提示
 *
 * 🔧 技术实现：
 * - React函数式组件：现代化的组件开发模式
 * - 条件渲染：基于输出内容的智能显示逻辑
 * - 主题集成：统一的颜色和样式管理
 * - 类型安全：完整的TypeScript类型定义
 *
 * 💡 设计原则：
 * - 清晰可读：区分不同类型输出的视觉效果
 * - 响应式：适应不同内容长度的灵活布局
 * - 一致性：与整体界面风格保持统一
 * - 用户友好：提供清晰的状态反馈
 */
import { Box, Text } from 'ink'
import { OutputLine } from './OutputLine'
import React from 'react'
import { getTheme } from '../../utils/theme'
import { Out as BashOut } from './BashTool'

/**
 * 组件属性类型定义
 * @property content - 命令执行结果内容（排除中断状态）
 * @property verbose - 是否启用详细显示模式
 */
type Props = {
  content: Omit<BashOut, 'interrupted'>  // 排除 interrupted 字段的命令输出结果
  verbose: boolean                       // 详细模式标志
}

/**
 * 🎨 Bash工具结果消息渲染组件 - 智能化的命令输出展示器
 *
 * 负责将Bash命令的执行结果进行结构化展示，智能处理不同类型的输出
 * 并提供用户友好的视觉反馈。
 *
 * @param {Props} props - 组件属性
 * @param {BashOut} props.content - 命令执行结果（不包含中断状态）
 * @param {boolean} props.verbose - 详细显示模式开关
 * @returns {React.JSX.Element} 渲染后的结果展示组件
 *
 * 🎭 渲染逻辑详解：
 * ┌─────────────────────────────────────────────────────────────┐
 * │                  命令输出展示策略                            │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 标准输出处理     │ • 非空时：使用OutputLine组件渲染           │
 * │                 │ • 显示完整的stdout内容和行数统计           │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 错误输出处理     │ • 非空时：使用OutputLine组件渲染           │
 * │                 │ • 启用isError标志，应用错误样式           │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 空输出处理       │ • 标准输出和错误输出均为空时              │
 * │                 │ • 显示 "(No content)" 友好提示           │
 * │                 │ • 使用辅助文本颜色增强可读性              │
 * └─────────────────────────────────────────────────────────────┘
 *
 * 💡 用户体验特性：
 * • 差异化显示：错误输出采用特殊样式突出显示
 * • 行数统计：显示原始输出的完整行数信息
 * • 空状态提示：避免空白界面造成的困惑
 * • 一致性布局：保持与其他工具输出的视觉一致性
 *
 * 🎨 视觉设计：
 * - 使用主题系统确保颜色一致性
 * - 清晰的层次结构和间距设计
 * - 支持终端环境的最佳可读性
 * - 响应式的内容长度适配
 */
function BashToolResultMessage({ content, verbose }: Props): React.JSX.Element {
  const { stdout, stdoutLines, stderr, stderrLines } = content

  return (
    <Box flexDirection="column">
      {stdout !== '' ? (
        <OutputLine content={stdout} lines={stdoutLines} verbose={verbose} />
      ) : null}
      {stderr !== '' ? (
        <OutputLine
          content={stderr}
          lines={stderrLines}
          verbose={verbose}
          isError
        />
      ) : null}
      {stdout === '' && stderr === '' ? (
        <Box flexDirection="row">
          <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
          <Text color={getTheme().secondaryText}>(No content)</Text>
        </Box>
      ) : null}
    </Box>
  )
}

export default BashToolResultMessage
