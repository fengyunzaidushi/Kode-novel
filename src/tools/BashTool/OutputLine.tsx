/**
 * 🎯 输出行组件 - 命令输出内容的智能渲染和显示模块
 *
 * 🏗️ 核心功能：
 * - 提供命令输出内容的灵活显示和截断处理
 * - 支持详细模式和简洁模式的动态切换
 * - 集成错误状态的差异化视觉样式
 * - 实现长输出的智能截断和预览
 * - 提供一致的布局和用户体验
 *
 * 🔄 依赖关系：
 * - 上游：被 BashToolResultMessage 使用进行内容渲染
 * - 下游：依赖 Ink UI、主题系统、Chalk 颜色处理
 *
 * 📊 使用场景：
 * - 标准输出和错误输出的统一渲染
 * - 长命令输出的截断和预览显示
 * - 终端界面的一致性布局控制
 * - 不同输出类型的视觉区分
 *
 * 🔧 技术实现：
 * - 智能截断：保留输出末尾的关键信息
 * - 主题集成：错误输出的颜色差异化
 * - 响应式布局：适应不同终端宽度
 * - 性能优化：避免渲染过长内容影响性能
 *
 * 💡 设计原则：
 * - 信息优先：确保重要信息的可见性
 * - 视觉清晰：区分不同类型输出的样式
 * - 性能友好：合理控制渲染内容的长度
 * - 一致体验：统一的界面布局和交互
 */
import { Box, Text } from 'ink'
import * as React from 'react'
import { getTheme } from '../../utils/theme'
import { MAX_RENDERED_LINES } from './prompt'
import chalk from 'chalk'

/**
 * 📐 截断内容渲染函数 - 智能处理长输出内容的显示策略
 *
 * 对超过显示行数限制的内容进行智能截断，保留最后的关键行数
 * 并提供截断信息的友好提示。
 *
 * @param content - 需要处理的原始内容字符串
 * @param totalLines - 原始内容的总行数
 * @returns 处理后的显示内容字符串
 *
 * 🔄 处理策略：
 * ┌─────────────────────────────────────────────────────────────┐
 * │                  内容截断处理策略                            │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 短内容情况       │ 行数 ≤ MAX_RENDERED_LINES                │
 * │                 │ • 直接返回完整内容                        │
 * │                 │ • 无需截断和提示信息                      │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 长内容截断       │ 行数 > MAX_RENDERED_LINES                │
 * │                 │ • 保留最后N行内容                         │
 * │                 │ • 添加截断信息提示                        │
 * │                 │ • 显示总行数统计                          │
 * └─────────────────────────────────────────────────────────────┘
 *
 * 💡 设计考虑：
 * • 末尾保留策略：通常最后的输出包含最重要的结果信息
 * • 灰色提示文本：使用chalk.grey()提供非侵入性的信息提示
 * • 行数统计：帮助用户了解完整输出的规模
 * • 性能优化：避免渲染过多内容导致界面卡顿
 */
function renderTruncatedContent(content: string, totalLines: number): string {
  const allLines = content.split('\n')
  if (allLines.length <= MAX_RENDERED_LINES) {
    return allLines.join('\n')
  }

  // Show last 5 lines of output by default (matching reference implementation)
  const lastLines = allLines.slice(-MAX_RENDERED_LINES)
  return [
    chalk.grey(
      `Showing last ${MAX_RENDERED_LINES} lines of ${totalLines} total lines`,
    ),
    ...lastLines,
  ].join('\n')
}

/**
 * 📝 输出行组件 - 统一的命令输出渲染器
 *
 * 提供标准化的命令输出显示组件，支持多种显示模式和视觉状态。
 * 是Bash工具输出展示的基础构建单元。
 *
 * @param props - 组件属性对象
 * @param {string} props.content - 要显示的输出内容
 * @param {number} props.lines - 原始输出的总行数
 * @param {boolean} props.verbose - 是否启用详细模式显示
 * @param {boolean} [props.isError] - 是否为错误输出（影响颜色样式）
 * @param {React.Key} [props.key] - React key属性（用于列表渲染）
 * @returns {JSX.Element} 渲染后的输出行组件
 *
 * 🎨 渲染模式详解：
 * ┌─────────────────────────────────────────────────────────────┐
 * │                  输出显示模式控制                            │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 详细模式         │ verbose = true                           │
 * │ (verbose=true)   │ • 显示完整的原始内容                     │
 * │                 │ • 不进行任何截断处理                      │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 简洁模式         │ verbose = false                          │
 * │ (verbose=false)  │ • 使用renderTruncatedContent截断显示     │
 * │                 │ • 智能保留末尾关键信息                    │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 错误样式         │ isError = true                           │
 * │ (isError=true)   │ • 应用主题的错误颜色                     │
 * │                 │ • 视觉上区分错误输出                      │
 * └─────────────────────────────────────────────────────────────┘
 *
 * 🎯 布局结构：
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │  ⎿ │ 输出内容（根据verbose模式决定是否截断）                │
 * │    │ • 标准输出：默认颜色                                   │
 * │    │ • 错误输出：错误主题颜色                               │
 * └─────────────────────────────────────────────────────────────┘
 * ```
 *
 * 💡 设计特点：
 * • 统一标识符：使用 "⎿" 符号作为输出行的视觉标识
 * • 响应式宽度：组件宽度自动适应容器
 * • 主题集成：颜色样式遵循全局主题设置
 * • 灵活布局：支持各种内容长度的自适应显示
 */
export function OutputLine({
  content,
  lines,
  verbose,
  isError,
}: {
  content: string   // 输出内容字符串
  lines: number     // 原始输出总行数
  verbose: boolean  // 详细显示模式
  isError?: boolean // 错误输出标志（可选）
  key?: React.Key   // React key 属性（可选）
}) {
  return (
    <Box justifyContent="space-between" width="100%">
      <Box flexDirection="row">
        <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
        <Box flexDirection="column">
          <Text color={isError ? getTheme().error : undefined}>
            {verbose
              ? content.trim()
              : renderTruncatedContent(content.trim(), lines)}
          </Text>
        </Box>
      </Box>
    </Box>
  )
}
