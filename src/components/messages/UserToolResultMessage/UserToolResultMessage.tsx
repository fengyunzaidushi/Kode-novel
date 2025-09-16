/**
 * 🎯 用户工具结果消息组件 - 工具执行结果的智能分类展示系统
 *
 * 🏗️ 核心功能：
 * - 提供工具执行结果的统一分发和展示机制
 * - 支持多种工具结果状态的差异化渲染
 * - 集成用户交互结果的可视化反馈
 * - 实现工具执行生命周期的完整展示
 * - 确保各种结果类型的准确识别和处理
 *
 * 🔄 依赖关系：
 * - 上游：被消息渲染系统调用进行工具结果展示
 * - 下游：依赖各类专用工具结果消息组件
 *
 * 📊 使用场景：
 * - 工具执行成功结果的详细展示
 * - 工具执行错误信息的用户友好显示
 * - 用户取消工具操作的状态反馈
 * - 用户拒绝工具权限的交互处理
 * - 工具结果数据的格式化和可视化
 *
 * 🔧 技术实现：
 * - 状态识别：基于结果参数的智能状态判断
 * - 组件路由：将不同结果类型分发到专用组件
 * - 上下文传递：为子组件提供完整的上下文信息
 * - 统一接口：确保所有结果组件的一致性
 *
 * 💡 设计原则：
 * - 状态明确：清晰区分不同的工具执行结果状态
 * - 用户友好：为每种结果提供最适合的展示方式
 * - 扩展灵活：支持新的工具结果类型的轻松添加
 * - 上下文完整：确保结果展示具备必要的上下文信息
 */
import { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import * as React from 'react'
import { Tool } from '../../../Tool'
import { Message, UserMessage } from '../../../query'
import { CANCEL_MESSAGE, REJECT_MESSAGE } from '../../../utils/messages'
import { UserToolCanceledMessage } from './UserToolCanceledMessage'
import { UserToolErrorMessage } from './UserToolErrorMessage'
import { UserToolRejectMessage } from './UserToolRejectMessage'
import { UserToolSuccessMessage } from './UserToolSuccessMessage'

/**
 * 组件属性类型定义 - 用户工具结果消息的完整配置参数
 *
 * @property param - Anthropic SDK 的工具结果块参数
 * @property message - 包含工具结果的用户消息对象
 * @property messages - 完整的消息历史记录数组
 * @property tools - 可用工具的完整列表
 * @property verbose - 详细信息显示模式
 * @property width - 组件显示宽度
 */
type Props = {
  param: ToolResultBlockParam  // 工具结果参数块
  message: UserMessage         // 用户消息对象
  messages: Message[]          // 消息历史记录
  tools: Tool[]                // 可用工具列表
  verbose: boolean             // 详细模式标志
  width: number | string       // 组件宽度设置
}

/**
 * 🎨 用户工具结果消息路由组件 - 智能工具结果分类和渲染分发器
 *
 * 作为工具执行结果的智能路由器，负责识别不同类型的工具执行结果
 * 并将其分发到相应的专业化渲染组件，确保最佳的用户体验。
 *
 * @param {Props} props - 组件属性
 * @param {ToolResultBlockParam} props.param - 包含工具结果内容和状态的参数块
 * @param {UserMessage} props.message - 承载工具结果的用户消息对象
 * @param {Message[]} props.messages - 完整的对话消息历史记录
 * @param {Tool[]} props.tools - 系统中所有可用工具的列表
 * @param {boolean} props.verbose - 详细信息展示的控制开关
 * @param {number | string} props.width - 组件渲染的宽度控制
 * @returns {React.ReactNode} 对应类型的工具结果组件
 *
 * 🔄 工具结果状态识别和路由详解：
 * ┌─────────────────────────────────────────────────────────────┐
 * │                  工具结果智能分类路由                        │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 1. 取消状态检查  │ • 检测 CANCEL_MESSAGE 取消标识           │
 * │                 │ • 路由到 UserToolCanceledMessage 组件     │
 * │                 │ • 显示用户取消操作的友好提示              │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 2. 拒绝状态检查  │ • 检测 REJECT_MESSAGE 拒绝标识           │
 * │                 │ • 路由到 UserToolRejectMessage 组件       │
 * │                 │ • 展示权限拒绝的详细信息和上下文          │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 3. 错误状态检查  │ • 检查 param.is_error 错误标志           │
 * │                 │ • 路由到 UserToolErrorMessage 组件        │
 * │                 │ • 显示工具执行错误的详细信息              │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 4. 成功状态处理  │ • 默认情况：工具执行成功                  │
 * │                 │ • 路由到 UserToolSuccessMessage 组件      │
 * │                 │ • 展示工具结果的完整内容和格式化数据      │
 * └─────────────────────────────────────────────────────────────┘
 *
 * 💡 路由策略：
 * • 优先级顺序：按照结果状态的严重程度和用户关注度排序
 * • 状态互斥：确保每个工具结果只会被一种组件处理
 * • 上下文完整：为每个子组件提供必要的上下文信息
 * • 用户体验：针对不同结果状态提供最合适的视觉反馈
 *
 * 🎯 支持的结果类型：
 * - **取消结果**：用户主动取消工具执行的反馈显示
 * - **拒绝结果**：用户拒绝工具权限请求的状态展示
 * - **错误结果**：工具执行过程中发生错误的详细信息
 * - **成功结果**：工具正常执行完成的结果数据展示
 *
 * 🔍 结果处理特性：
 * • 状态感知：智能识别工具执行的各种终止状态
 * • 上下文传递：确保子组件获得完整的执行上下文
 * • 格式适配：为不同结果类型提供最适合的展示格式
 * • 用户引导：通过清晰的状态显示帮助用户理解操作结果
 */
export function UserToolResultMessage({
  param,
  message,
  messages,
  tools,
  verbose,
  width,
}: Props): React.ReactNode {
  if (param.content === CANCEL_MESSAGE) {
    return <UserToolCanceledMessage />
  }

  if (param.content === REJECT_MESSAGE) {
    return (
      <UserToolRejectMessage
        toolUseID={param.tool_use_id}
        tools={tools}
        messages={messages}
        verbose={verbose}
      />
    )
  }

  if (param.is_error) {
    return <UserToolErrorMessage param={param} verbose={verbose} />
  }

  return (
    <UserToolSuccessMessage
      param={param}
      message={message}
      messages={messages}
      tools={tools}
      verbose={verbose}
      width={width}
    />
  )
}
