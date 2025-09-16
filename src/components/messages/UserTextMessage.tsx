/**
 * 🎯 用户文本消息组件 - 用户输入的智能分类和渲染系统
 *
 * 🏗️ 核心功能：
 * - 提供用户输入消息的统一分发和路由机制
 * - 支持多种用户输入类型的智能识别
 * - 集成专业化组件的差异化渲染
 * - 实现灵活的消息格式解析和处理
 * - 确保用户输入的准确展示和交互
 *
 * 🔄 依赖关系：
 * - 上游：被消息渲染系统调用进行用户输入展示
 * - 下游：依赖各类专用用户消息组件
 *
 * 📊 使用场景：
 * - 用户文本输入的分类识别和渲染
 * - Koding 代码输入的特殊格式处理
 * - Bash 命令输入的语法高亮显示
 * - 斜杠命令的结构化展示
 * - 标准用户提示的格式化显示
 *
 * 🔧 技术实现：
 * - 模式匹配：基于文本内容的输入类型识别
 * - 组件路由：将不同输入类型分发到专用组件
 * - 内容过滤：跳过空消息和无内容消息
 * - 统一接口：为所有子组件提供一致的属性传递
 *
 * 💡 设计原则：
 * - 智能分发：精准识别不同类型的用户输入
 * - 专业渲染：每种输入类型都有最适合的显示方式
 * - 扩展灵活：支持新的用户输入类型的轻松添加
 * - 用户体验：确保用户输入的清晰可读和直观展示
 */
import { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { UserBashInputMessage } from './UserBashInputMessage'
import { UserKodingInputMessage } from './UserKodingInputMessage'
import { UserCommandMessage } from './UserCommandMessage'
import { UserPromptMessage } from './UserPromptMessage'
import * as React from 'react'
import { NO_CONTENT_MESSAGE } from '../../services/claude'

/**
 * 组件属性类型定义 - 用户文本消息的配置参数
 *
 * @property addMargin - 是否为消息添加上边距
 * @property param - Anthropic SDK 的文本块参数，包含用户输入内容
 */
type Props = {
  addMargin: boolean      // 边距控制标志
  param: TextBlockParam   // 用户文本输入参数
}

/**
 * 🎨 用户文本消息路由组件 - 智能用户输入分类和渲染分发器
 *
 * 作为用户输入消息的智能路由器，负责识别不同类型的用户输入
 * 并将其分发到相应的专业化渲染组件，确保最佳的显示效果。
 *
 * @param {Props} props - 组件属性
 * @param {boolean} props.addMargin - 边距添加控制标志
 * @param {TextBlockParam} props.param - 包含用户输入文本的参数对象
 * @returns {React.ReactNode} 对应类型的用户消息组件或 null
 *
 * 🔄 输入类型识别和路由详解：
 * ┌─────────────────────────────────────────────────────────────┐
 * │                  用户输入智能分类路由                        │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 1. 空消息检查    │ • 检测 NO_CONTENT_MESSAGE                │
 * │                 │ • 空消息跳过渲染，返回 null               │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 2. Koding 输入   │ • 检测 <koding-input> 标签               │
 * │                 │ • 路由到 UserKodingInputMessage 组件      │
 * │                 │ • 专业的代码输入格式化显示                │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 3. Bash 命令     │ • 检测 <bash-input> 标签                 │
 * │                 │ • 路由到 UserBashInputMessage 组件        │
 * │                 │ • 命令行输入的语法高亮和格式化            │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 4. 斜杠命令      │ • 检测 <command-name> 或 <command-message>│
 * │                 │ • 路由到 UserCommandMessage 组件          │
 * │                 │ • 结构化的命令展示和参数显示              │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 5. 标准提示      │ • 默认情况：所有其他用户输入              │
 * │                 │ • 路由到 UserPromptMessage 组件           │
 * │                 │ • 标准用户提示的格式化显示                │
 * └─────────────────────────────────────────────────────────────┘
 *
 * 💡 路由策略：
 * • 优先级顺序：按照输入复杂度和特殊性进行优先级排序
 * • 模式匹配：基于内容标签和文本模式进行精确识别
 * • 回退机制：未匹配的输入自动路由到标准提示组件
 * • 属性传递：为所有子组件提供一致的属性接口
 *
 * 🎯 支持的输入类型：
 * - **Koding输入**：代码片段和编程相关的用户输入
 * - **Bash命令**：终端命令和脚本执行输入
 * - **斜杠命令**：系统命令和快捷操作指令
 * - **标准提示**：普通的用户文本输入和对话内容
 */
export function UserTextMessage({ addMargin, param }: Props): React.ReactNode {
  if (param.text.trim() === NO_CONTENT_MESSAGE) {
    return null
  }

  // Koding inputs!
  if (param.text.includes('<koding-input>')) {
    return <UserKodingInputMessage addMargin={addMargin} param={param} />
  }

  // Bash inputs!
  if (param.text.includes('<bash-input>')) {
    return <UserBashInputMessage addMargin={addMargin} param={param} />
  }

  // Slash commands/
  if (
    param.text.includes('<command-name>') ||
    param.text.includes('<command-message>')
  ) {
    return <UserCommandMessage addMargin={addMargin} param={param} />
  }

  // User prompts>
  return <UserPromptMessage addMargin={addMargin} param={param} />
}
