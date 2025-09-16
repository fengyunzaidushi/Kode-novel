/**
 * 🎯 AI 助手工具使用消息组件 - 工具调用状态的动态可视化系统
 *
 * 🏗️ 核心功能：
 * - 提供 AI 助手工具调用过程的实时状态展示
 * - 支持多种工具类型的差异化渲染和交互
 * - 集成工具执行状态的动画和视觉反馈
 * - 实现工具参数的智能格式化显示
 * - 提供完整的工具生命周期可视化管理
 *
 * 🔄 依赖关系：
 * - 上游：被消息渲染系统调用进行工具调用展示
 * - 下游：依赖工具系统、状态管理、动画组件
 *
 * 📊 使用场景：
 * - AI 助手工具调用的实时状态显示
 * - 工具执行进度的可视化跟踪
 * - 工具参数和结果的结构化展示
 * - 错误状态和异常情况的用户反馈
 * - 特殊工具类型的定制化渲染
 *
 * 🔧 技术实现：
 * - 状态管理：跟踪工具的多种执行状态
 * - 动态渲染：基于工具类型的差异化展示
 * - 实时动画：工具执行过程的视觉动画效果
 * - 智能路由：特殊工具的专用渲染逻辑
 * - 参数格式化：工具输入参数的用户友好展示
 *
 * 💡 设计原则：
 * - 状态透明：清晰展示工具执行的各个阶段
 * - 视觉反馈：通过动画和颜色提供直观的状态指示
 * - 类型适配：不同工具类型采用最适合的显示方式
 * - 用户体验：提供丰富的交互反馈和状态信息
 */
import { Box, Text } from 'ink'
import React from 'react'
import { logError } from '../../utils/log'
import { ToolUseBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { Tool } from '../../Tool'
import { Cost } from '../Cost'
import { ToolUseLoader } from '../ToolUseLoader'
import { getTheme } from '../../utils/theme'
import { BLACK_CIRCLE } from '../../constants/figures'
import { ThinkTool } from '../../tools/ThinkTool/ThinkTool'
import { AssistantThinkingMessage } from './AssistantThinkingMessage'
import { TaskToolMessage } from './TaskToolMessage'

/**
 * 组件属性类型定义 - 工具使用消息的完整状态和配置参数
 *
 * @property param - Anthropic SDK 的工具使用块参数
 * @property costUSD - API 调用成本（美元）
 * @property durationMs - 工具执行耗时（毫秒）
 * @property addMargin - 是否添加上边距
 * @property tools - 可用工具的完整列表
 * @property debug - 调试模式开关
 * @property verbose - 详细信息显示模式
 * @property erroredToolUseIDs - 执行出错的工具ID集合
 * @property inProgressToolUseIDs - 正在执行的工具ID集合
 * @property unresolvedToolUseIDs - 未解决的工具ID集合
 * @property shouldAnimate - 是否启用动画效果
 * @property shouldShowDot - 是否显示状态指示点
 */
type Props = {
  param: ToolUseBlockParam          // 工具使用参数块
  costUSD: number                   // API 调用成本
  durationMs: number                // 执行耗时统计
  addMargin: boolean                // 边距控制标志
  tools: Tool[]                     // 可用工具列表
  debug: boolean                    // 调试模式标志
  verbose: boolean                  // 详细模式标志
  erroredToolUseIDs: Set<string>    // 错误状态工具ID集合
  inProgressToolUseIDs: Set<string> // 执行中工具ID集合
  unresolvedToolUseIDs: Set<string> // 未解决工具ID集合
  shouldAnimate: boolean            // 动画启用标志
  shouldShowDot: boolean            // 状态点显示标志
}

/**
 * 🎨 AI 助手工具使用消息渲染组件 - 动态工具执行状态的可视化展示器
 *
 * 负责将 AI 助手的工具调用请求进行可视化展示，提供实时的执行状态
 * 跟踪、动画反馈和详细的参数信息显示。
 *
 * @param {Props} props - 组件属性
 * @param {ToolUseBlockParam} props.param - 包含工具名称、ID和输入参数的块
 * @param {number} props.costUSD - 工具调用产生的API成本
 * @param {number} props.durationMs - 工具执行的总耗时
 * @param {boolean} props.addMargin - 组件上边距的添加控制
 * @param {Tool[]} props.tools - 系统中所有可用工具的完整列表
 * @param {boolean} props.debug - 调试信息的显示开关
 * @param {boolean} props.verbose - 详细参数信息的显示开关
 * @param {Set<string>} props.erroredToolUseIDs - 执行失败的工具调用ID集合
 * @param {Set<string>} props.inProgressToolUseIDs - 当前正在执行的工具ID集合
 * @param {Set<string>} props.unresolvedToolUseIDs - 尚未完成的工具ID集合
 * @param {boolean} props.shouldAnimate - 加载动画的启用控制
 * @param {boolean} props.shouldShowDot - 状态指示点的显示控制
 * @returns {React.ReactNode} 渲染后的工具使用消息组件或 null
 *
 * 🔄 工具状态管理和渲染详解：
 * ┌─────────────────────────────────────────────────────────────┐
 * │                  工具执行状态可视化流程                      │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 1. 工具查找      │ • 在工具列表中查找对应的工具实例          │
 * │                 │ • 工具未找到时记录错误并跳过渲染          │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 2. 状态判断      │ • queued: 等待执行状态                   │
 * │                 │ • inProgress: 正在执行状态               │
 * │                 │ • error: 执行错误状态                    │
 * │                 │ • completed: 执行完成状态                │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 3. 特殊工具处理  │ • ThinkTool: 路由到专用思考消息组件      │
 * │                 │ • TaskTool: 使用专用的任务工具消息格式   │
 * │                 │ • 其他工具: 标准化的工具展示格式         │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 4. 状态指示器    │ • 等待状态: 显示静态圆点                 │
 * │                 │ • 执行状态: 显示动态加载动画             │
 * │                 │ • 错误状态: 显示错误颜色指示             │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 5. 参数显示      │ • 解析工具输入参数                       │
 * │                 │ • 调用工具的参数格式化方法               │
 * │                 │ • 支持 React 组件和字符串两种返回格式    │
 * └─────────────────────────────────────────────────────────────┘
 *
 * 💡 渲染特性：
 * • 实时状态：动态跟踪和显示工具的执行状态变化
 * • 类型适配：不同工具类型采用最适合的渲染方式
 * • 动画反馈：通过加载动画提供视觉上的执行反馈
 * • 参数透明：清晰展示工具调用的输入参数信息
 * • 成本跟踪：实时显示工具调用产生的API成本
 *
 * 🎯 支持的工具状态：
 * - **排队状态**：工具等待执行，显示静态指示符
 * - **执行状态**：工具正在运行，显示动画加载器
 * - **完成状态**：工具执行完成，显示最终结果
 * - **错误状态**：工具执行失败，显示错误指示
 */
export function AssistantToolUseMessage({
  param,
  costUSD,
  durationMs,
  addMargin,
  tools,
  debug,
  verbose,
  erroredToolUseIDs,
  inProgressToolUseIDs,
  unresolvedToolUseIDs,
  shouldAnimate,
  shouldShowDot,
}: Props): React.ReactNode {
  const tool = tools.find(_ => _.name === param.name)
  if (!tool) {
    logError(`Tool ${param.name} not found`)
    return null
  }
  const isQueued =
    !inProgressToolUseIDs.has(param.id) && unresolvedToolUseIDs.has(param.id)
  // Keeping color undefined makes the OS use the default color regardless of appearance
  const color = isQueued ? getTheme().secondaryText : undefined

  // Handle thinking tool with specialized rendering
  if (tool === ThinkTool) {
    const { thought } = ThinkTool.inputSchema.parse(param.input)
    return (
      <AssistantThinkingMessage
        param={{ thinking: thought, signature: '', type: 'thinking' }}
        addMargin={addMargin}
      />
    )
  }

  const userFacingToolName = tool.userFacingName ? tool.userFacingName() : tool.name
  return (
    <Box
      flexDirection="row"
      justifyContent="space-between"
      marginTop={addMargin ? 1 : 0}
      width="100%"
    >
      <Box>
        <Box
          flexWrap="nowrap"
          minWidth={userFacingToolName.length + (shouldShowDot ? 2 : 0)}
        >
          {shouldShowDot &&
            (isQueued ? (
              <Box minWidth={2}>
                <Text color={color}>{BLACK_CIRCLE}</Text>
              </Box>
            ) : (
              <ToolUseLoader
                shouldAnimate={shouldAnimate}
                isUnresolved={unresolvedToolUseIDs.has(param.id)}
                isError={erroredToolUseIDs.has(param.id)}
              />
            ))}
          {tool.name === 'Task' && param.input ? (
            <TaskToolMessage
              agentType={String((param.input as any).subagent_type || 'general-purpose')}
              bold={Boolean(!isQueued)}
              children={String(userFacingToolName || '')}
            />
          ) : (
            <Text color={color} bold={!isQueued}>
              {userFacingToolName}
            </Text>
          )}
        </Box>
        <Box flexWrap="nowrap">
          {Object.keys(param.input as { [key: string]: unknown }).length > 0 &&
            (() => {
              const toolMessage = tool.renderToolUseMessage(
                param.input as never,
                {
                  verbose,
                },
              )

              // If the tool returns a React component, render it directly
              if (React.isValidElement(toolMessage)) {
                return (
                  <Box flexDirection="row">
                    <Text color={color}>(</Text>
                    {toolMessage}
                    <Text color={color}>)</Text>
                  </Box>
                )
              }

              // If it's a string, wrap it in Text
              return <Text color={color}>({toolMessage})</Text>
            })()}
          <Text color={color}>…</Text>
        </Box>
      </Box>
      <Cost costUSD={costUSD} durationMs={durationMs} debug={debug} />
    </Box>
  )
}
