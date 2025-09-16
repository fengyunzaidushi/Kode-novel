/**
 * 🎯 任务工具实现 - AI 代理协调和任务分发的核心工具
 *
 * 🏗️ 核心功能：
 * - 实现多 AI 代理的智能调度和任务分发
 * - 提供专业化代理的动态选择机制
 * - 支持并发代理执行和性能优化
 * - 管理代理生命周期和状态隔离
 * - 集成任务日志和结果聚合系统
 *
 * 🔄 依赖关系：
 * - 上游：被主 AI 代理调用进行任务分解
 * - 下游：依赖代理加载器、模型管理、权限系统
 *
 * 📊 使用场景：
 * - 复杂多步骤任务的智能分解
 * - 专业领域问题的代理派发
 * - 并发任务处理的性能优化
 * - 大型项目的模块化处理
 *
 * 🔧 技术实现：
 * - 代理发现：动态加载和配置活跃代理
 * - 任务路由：基于代理能力的智能分派
 * - 并发控制：多代理同时执行的协调
 * - 状态管理：代理间的独立性和通信
 * - 结果聚合：多代理结果的统一处理
 *
 * 💡 设计原则：
 * - 自主性：代理具有完整的独立执行能力
 * - 专业化：不同代理处理特定领域任务
 * - 性能导向：最大化并发执行效率
 * - 安全隔离：严格的代理间状态隔离
 */
import { TextBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import chalk from 'chalk'
import { last, memoize } from 'lodash-es'
import { EOL } from 'os'
import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import { z } from 'zod'
import { Tool, ValidationResult } from '../../Tool'
import { FallbackToolUseRejectedMessage } from '../../components/FallbackToolUseRejectedMessage'
import { getAgentPrompt } from '../../constants/prompts'
import { getContext } from '../../context'
import { hasPermissionsToUseTool } from '../../permissions'
import { AssistantMessage, Message as MessageType, query } from '../../query'
import { formatDuration, formatNumber } from '../../utils/format'
import {
  getMessagesPath,
  getNextAvailableLogSidechainNumber,
  overwriteLog,
} from '../../utils/log.js'
import { applyMarkdown } from '../../utils/markdown'
import {
  createAssistantMessage,
  createUserMessage,
  getLastAssistantMessageId,
  INTERRUPT_MESSAGE,
  normalizeMessages,
} from '../../utils/messages.js'
import { getModelManager } from '../../utils/model'
import { getMaxThinkingTokens } from '../../utils/thinking'
import { getTheme } from '../../utils/theme'
import { generateAgentId } from '../../utils/agentStorage'
import { debug as debugLogger } from '../../utils/debugLogger'
import { getTaskTools, getPrompt } from './prompt'
import { TOOL_NAME } from './constants'
import { getActiveAgents, getAgentByType, getAvailableAgentTypes } from '../../utils/agentLoader'

/**
 * 📋 TaskTool 输入参数模式定义 - 任务创建和代理选择的参数规范
 *
 * 定义了创建和执行任务时的标准输入参数结构，确保参数的
 * 完整性、类型安全性和业务逻辑的正确性。
 *
 * 🎯 参数架构设计：
 * ┌─────────────────┬──────────────┬─────────────────────────────────┐
 * │    参数名称      │   是否必需   │            功能说明              │
 * ├─────────────────┼──────────────┼─────────────────────────────────┤
 * │ description     │   必需       │ 任务简短描述(3-5词)              │
 * │ prompt          │   必需       │ 详细任务指令和执行要求           │
 * │ model_name      │   可选       │ 指定AI模型(覆盖默认模型)         │
 * │ subagent_type   │   可选       │ 专业化代理类型选择               │
 * └─────────────────┴──────────────┴─────────────────────────────────┘
 *
 * 💡 参数设计理念：
 * - 简洁明确：description 提供快速识别，prompt 提供详细指令
 * - 灵活配置：支持模型和代理类型的动态选择
 * - 向下兼容：可选参数确保与现有系统的兼容性
 * - 类型安全：使用 Zod 进行严格的运行时类型验证
 *
 * 🔍 参数验证策略：
 * 1. 必需参数检查：确保核心信息的完整性
 * 2. 类型严格验证：防止类型错误导致的执行问题
 * 3. 业务逻辑验证：验证代理类型和模型的有效性
 * 4. 安全性检查：防止恶意输入和注入攻击
 */
const inputSchema = z.object({
  /**
   * 任务简短描述 - 用于快速识别和日志记录
   * 要求：3-5个词的简洁描述，便于在界面和日志中快速识别任务类型
   * 示例：'Fix authentication bug', 'Update user interface'
   */
  description: z
    .string()
    .describe('A short (3-5 word) description of the task'),

  /**
   * 详细任务指令 - 代理执行的核心指导内容
   * 包含：具体执行要求、上下文信息、预期结果等完整指令
   * 这是代理理解和执行任务的主要依据
   */
  prompt: z.string().describe('The task for the agent to perform'),

  /**
   * 指定AI模型名称 - 可选的模型覆盖配置
   * 用途：在需要特定模型能力时覆盖系统默认的task模型指针
   * 场景：复杂推理任务、特定语言处理、性能优化需求等
   */
  model_name: z
    .string()
    .optional()
    .describe(
      'Optional: Specific model name to use for this task. If not provided, uses the default task model pointer.',
    ),

  /**
   * 专业化代理类型 - 任务领域专家的选择标识
   * 功能：根据任务特性选择最适合的专业化代理
   * 类型：如 'code-reviewer', 'data-analyst', 'content-writer' 等
   * 默认：如未指定，系统将使用 'general-purpose' 通用代理
   */
  subagent_type: z
    .string()
    .optional()
    .describe(
      'The type of specialized agent to use for this task',
    ),
})

/**
 * 🎯 TaskTool 主对象定义 - 任务编排和代理协调的核心实现
 *
 * TaskTool 是整个多代理系统的中央协调器，负责接收、分析、分发和
 * 监控各种任务的执行过程，实现智能化的代理选择和任务管理。
 *
 * 🏗️ 对象结构设计：
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    TaskTool 核心架构                        │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 配置层   │ prompt, name, description, inputSchema           │
 * │ 验证层   │ validateInput, isEnabled, needsPermissions       │
 * │ 执行层   │ call (任务执行引擎)                              │
 * │ 渲染层   │ render* 系列方法 (用户界面展示)                   │
 * │ 工具层   │ isReadOnly, isConcurrencySafe (系统属性)         │
 * └─────────────────────────────────────────────────────────────┘
 *
 * 💡 设计哲学：
 * - 统一接口：符合 Tool 规范，确保系统一致性
 * - 智能分发：基于任务特性自动选择最适合的代理
 * - 状态隔离：每个任务在独立的上下文中执行
 * - 结果聚合：统一处理和展示多代理执行结果
 *
 * 🔄 生命周期管理：
 * 初始化 → 参数验证 → 代理选择 → 任务执行 → 结果处理 → 状态更新
 */
export const TaskTool = {
  /**
   * 生成任务工具的 AI 提示指导 - 动态代理协调策略生成
   *
   * 此方法是任务编排系统的智能大脑，负责基于当前系统状态
   * 生成完整的代理使用指导，包括代理选择策略、工具分配和执行建议。
   *
   * @param {Object} options - 提示生成配置选项
   * @param {boolean} options.safeMode - 安全模式标志
   * @returns {Promise<string>} 完整的任务协调指导文档
   *
   * 🎭 核心功能：
   * - 扫描活跃代理并生成能力描述
   * - 提供智能代理选择建议
   * - 生成并发执行优化策略
   * - 包含完整的最佳实践指导
   */
  async prompt({ safeMode }) {
    // 与原始 Claude Code 完全兼容 - 返回完整代理描述指导
    return await getPrompt(safeMode)
  },

  /**
   * 工具标识名称 - 系统中的唯一标识符
   * 用于工具注册、权限控制和日志记录
   */
  name: TOOL_NAME,

  /**
   * 工具功能描述 - 面向用户的简洁说明
   *
   * @returns {Promise<string>} 工具的功能描述文本
   *
   * 🎯 设计原则：
   * 保持与原始 Claude Code 系统的完全一致性，
   * 使用简洁明了的描述便于用户理解和识别。
   */
  async description() {
    // 与原始 Claude Code 完全匹配 - 简洁的功能描述
    return "Launch a new task"
  },

  /**
   * 输入参数验证模式 - 确保任务创建参数的完整性和正确性
   * 详细定义请参考上方 inputSchema 的完整注释说明
   */
  inputSchema,
  
  /**
   * 🚀 任务执行引擎核心方法 - 多代理协调的智能执行系统
   *
   * 这是 TaskTool 的核心执行引擎，负责完整的任务生命周期管理，
   * 从任务接收、代理选择、执行监控到结果聚合的全过程协调。
   *
   * @param {Object} taskParams - 任务执行参数
   * @param {string} taskParams.description - 任务简短描述
   * @param {string} taskParams.prompt - 详细任务指令
   * @param {string} [taskParams.model_name] - 可选的AI模型名称
   * @param {string} [taskParams.subagent_type] - 专业化代理类型
   *
   * @param {Object} context - 执行上下文环境
   * @param {AbortController} context.abortController - 任务中断控制器
   * @param {Object} context.options - 执行选项配置
   * @param {boolean} context.options.safeMode - 安全模式标志
   * @param {number} context.options.forkNumber - 分支编号
   * @param {string} context.options.messageLogName - 消息日志名称
   * @param {boolean} context.options.verbose - 详细输出模式
   * @param {Object} context.readFileTimestamps - 文件读取时间戳记录
   *
   * @returns {AsyncGenerator} 异步生成器，产出执行进度和结果
   *
   * 🔄 任务执行生命周期详解：
   * ┌─────────────────────────────────────────────────────────────┐
   * │                    任务执行生命周期                          │
   * ├─────────────────────────────────────────────────────────────┤
   * │ 1. 任务初始化  │ • 记录开始时间                            │
   * │               │ • 设置默认代理类型                         │
   * │               │ • 初始化执行环境                           │
   * ├─────────────────────────────────────────────────────────────┤
   * │ 2. 代理配置    │ • 动态加载代理配置                         │
   * │               │ • 应用系统提示和模型设置                   │
   * │               │ • 配置工具访问权限                         │
   * ├─────────────────────────────────────────────────────────────┤
   * │ 3. 执行准备    │ • 构建消息上下文                           │
   * │               │ • 获取可用工具列表                         │
   * │               │ • 配置执行参数                             │
   * ├─────────────────────────────────────────────────────────────┤
   * │ 4. 任务执行    │ • 启动AI模型查询                           │
   * │               │ • 实时监控执行进度                         │
   * │               │ • 处理工具使用和结果                       │
   * ├─────────────────────────────────────────────────────────────┤
   * │ 5. 结果处理    │ • 聚合执行结果                             │
   * │               │ • 生成性能统计                             │
   * │               │ • 处理中断和异常情况                       │
   * └─────────────────────────────────────────────────────────────┘
   *
   * 💡 执行策略特性：
   * - 智能代理选择：基于任务特性自动匹配最适合的代理类型
   * - 动态配置加载：实时加载代理配置，支持热更新
   * - 优雅错误处理：提供友好的错误信息和恢复建议
   * - 实时进度反馈：通过生成器模式提供执行进度更新
   * - 性能监控：完整的执行时间和资源使用统计
   */
  async *call(
    { description, prompt, model_name, subagent_type },
    {
      abortController,
      options: { safeMode = false, forkNumber, messageLogName, verbose },
      readFileTimestamps,
    },
  ): AsyncGenerator<
    | { type: 'result'; data: TextBlock[]; resultForAssistant?: string }
    | { type: 'progress'; content: any; normalizedMessages?: any[]; tools?: any[] },
    void,
    unknown
  > {
    /**
     * 🕐 执行计时器初始化
     * 记录任务开始时间，用于性能统计和监控分析
     */
    const startTime = Date.now()

    /**
     * 🎭 代理类型智能选择
     * 如果未指定专业代理，默认使用通用代理处理任务
     * 这确保了系统的健壮性和向下兼容性
     */
    const agentType = subagent_type || 'general-purpose'

    /**
     * 🔧 执行配置初始化
     * 准备任务执行所需的各种配置参数，这些参数将根据
     * 代理配置进行动态调整和优化
     */
    let effectivePrompt = prompt      // 有效的执行提示
    let effectiveModel = model_name || 'task'  // 有效的AI模型
    let toolFilter = null            // 工具过滤配置
    let temperature = undefined      // 模型温度参数

    /**
     * 🎯 代理配置动态加载和应用
     * 这是代理选择和配置的核心逻辑，负责：
     * 1. 验证代理类型的有效性
     * 2. 加载对应的代理配置
     * 3. 应用专业化设置
     * 4. 处理配置错误情况
     */
    if (agentType) {
      const agentConfig = await getAgentByType(agentType)
      
      if (!agentConfig) {
        /**
         * 🚨 代理类型未找到的错误处理
         * 当请求的代理类型不存在时，系统采用友好的错误处理策略：
         * 1. 不抛出异常中断执行
         * 2. 提供可用代理类型的完整列表
         * 3. 给出具体的解决方案建议
         * 这种设计提高了系统的用户体验和可维护性
         */
        const availableTypes = await getAvailableAgentTypes()
        const helpMessage = `Agent type '${agentType}' not found.\n\nAvailable agents:\n${availableTypes.map(t => `  • ${t}`).join('\n')}\n\nUse /agents command to manage agent configurations.`

        yield {
          type: 'result',
          data: [{ type: 'text', text: helpMessage }] as TextBlock[],
          resultForAssistant: helpMessage,
        }
        return
      }

      /**
       * 📝 系统提示词应用逻辑
       * 如果代理配置包含系统提示词，将其与用户提示进行合并。
       * 合并策略：系统提示在前，用户提示在后，确保专业化指导优先级。
       * 这允许每个代理类型拥有独特的工作模式和专业知识背景。
       */
      if (agentConfig.systemPrompt) {
        effectivePrompt = `${agentConfig.systemPrompt}\n\n${prompt}`
      }

      /**
       * 🤖 AI模型智能选择逻辑
       * 模型选择的优先级顺序：
       * 1. 用户明确指定的 model_name 参数（最高优先级）
       * 2. 代理配置中指定的专业模型
       * 3. 'inherit' 特殊值：保持系统默认的指针配置
       * 4. 系统默认的 'task' 模型指针
       *
       * 这种设计平衡了灵活性和默认行为的合理性。
       */
      if (!model_name && agentConfig.model_name) {
        // 支持 'inherit' 特殊值：保持基于指针的默认配置
        if (agentConfig.model_name !== 'inherit') {
          effectiveModel = agentConfig.model_name as string
        }
      }
      
      /**
       * 🔨 工具过滤配置存储
       * 将代理的工具访问权限配置保存，后续将应用于工具列表过滤。
       * 这是实现代理专业化和权限控制的关键机制。
       */
      toolFilter = agentConfig.tools

      /**
       * 🌡️ 温度参数扩展预留
       * 当前代理配置中不包含温度参数，但保留扩展空间。
       * 未来可根据代理类型的特殊需求添加个性化的温度设置。
       */
      // Note: temperature is not currently in our agent configs
      // but could be added in the future
    }

    /**
     * 💬 消息上下文构建
     * 创建任务执行的消息序列，将有效提示转换为用户消息。
     * 这是与AI模型交互的基础数据结构。
     */
    const messages: MessageType[] = [createUserMessage(effectivePrompt)]

    /**
     * 🛠️ 可用工具获取
     * 根据安全模式获取代理可以使用的工具列表。
     * 这确保了不同环境下的适当权限控制。
     */
    let tools = await getTaskTools(safeMode)

    /**
     * 🎯 工具权限过滤应用
     * 根据代理配置的工具权限，对可用工具进行精确过滤：
     *
     * 过滤规则：
     * 1. '*' 或 ['*']：代理拥有全部工具的访问权限
     * 2. 字符串数组：仅允许指定名称的工具
     * 3. null/undefined：使用默认工具集合
     *
     * 🔒 权限控制逻辑：
     * 这种设计确保每个代理只能访问其专业领域所需的工具，
     * 既提高了安全性，也避免了不相关工具的干扰。
     */
    if (toolFilter) {
      // 向后兼容性：['*'] 表示所有工具
      const isAllArray = Array.isArray(toolFilter) && toolFilter.length === 1 && toolFilter[0] === '*'
      if (toolFilter === '*' || isAllArray) {
        // 无操作，保留所有工具
      } else if (Array.isArray(toolFilter)) {
        tools = tools.filter(tool => toolFilter.includes(tool.name))
      }
    }

    /**
     * 🤖 最终模型确定
     * 将之前解析的有效模型名称作为实际执行的模型。
     * 此时所有模型选择逻辑已经完成。
     */
    const modelToUse = effectiveModel

    /**
     * 📊 任务启动进度报告
     * 通过生成器向用户实时报告任务启动的关键信息：
     * 1. 选择的代理类型
     * 2. 使用的AI模型
     * 3. 任务简短描述
     * 4. 提示内容预览（长内容截断）
     *
     * 🔄 实时反馈机制：
     * 这种渐进式的进度报告提供了良好的用户体验，
     * 让用户了解系统正在进行的操作和配置选择。
     */
    yield {
      type: 'progress',
      content: createAssistantMessage(`Starting agent: ${agentType}`),
      normalizedMessages: normalizeMessages(messages),
      tools,
    }

    yield {
      type: 'progress',
      content: createAssistantMessage(`Using model: ${modelToUse}`),
      normalizedMessages: normalizeMessages(messages),
      tools,
    }

    yield {
      type: 'progress',
      content: createAssistantMessage(`Task: ${description}`),
      normalizedMessages: normalizeMessages(messages),
      tools,
    }

    yield {
      type: 'progress',
      content: createAssistantMessage(`Prompt: ${prompt.length > 150 ? prompt.substring(0, 150) + '...' : prompt}`),
      normalizedMessages: normalizeMessages(messages),
      tools,
    }

    /**
     * 🎭 执行环境并行初始化
     * 使用 Promise.all 并行获取任务执行所需的核心环境信息：
     * 1. taskPrompt: 代理的系统级提示指导
     * 2. context: 项目和代码库的上下文信息
     * 3. maxThinkingTokens: 模型思考令牌的上限配置
     *
     * 💡 性能优化：
     * 并行获取这些信息显著降低了任务启动的延迟，
     * 提升了整体系统的响应速度。
     */
    const [taskPrompt, context, maxThinkingTokens] = await Promise.all([
      getAgentPrompt(),
      getContext(),
      getMaxThinkingTokens(messages),
    ])

    /**
     * 🚫 自我引用防护机制
     * 向任务提示中注入模型身份信息，防止代理尝试调用自身。
     * 这避免了 "模型A通过AskExpertModel调用模型A" 的递归问题。
     *
     * 🔄 防护逻辑：
     * 明确告知代理当前使用的模型身份，指导其直接使用自身能力
     * 而不是通过专家咨询工具间接调用相同模型。
     */
    taskPrompt.push(`\nIMPORTANT: You are currently running as ${modelToUse}. You do not need to consult ${modelToUse} via AskExpertModel since you ARE ${modelToUse}. Complete tasks directly using your capabilities.`)

    /**
     * 📊 工具使用统计初始化
     * 用于追踪和统计任务执行过程中的工具调用次数，
     * 为性能分析和用户反馈提供数据基础。
     */
    let toolUseCount = 0

    /**
     * 📝 日志管理优化
     * 使用记忆化函数获取日志侧链编号，避免重复计算。
     * 这确保了每个任务分支都有独立的日志记录空间。
     */
    const getSidechainNumber = memoize(() =>
      getNextAvailableLogSidechainNumber(messageLogName, forkNumber),
    )

    /**
     * 🆔 任务唯一标识生成
     * 为当前任务执行生成全局唯一的标识符，
     * 用于日志追踪、性能监控和调试分析。
     */
    const taskId = generateAgentId()

    /**
     * ⚙️ 查询选项构建
     * 构建AI模型查询的完整配置选项，遵循原始AgentTool模式。
     * 这些选项控制了模型的行为、安全级别和执行环境。
     *
     * 🔧 配置说明：
     * - safeMode: 安全模式开关
     * - forkNumber: 执行分支编号
     * - messageLogName: 消息日志名称
     * - tools: 可用工具列表
     * - commands: 可用命令列表（当前为空）
     * - verbose: 详细输出模式
     * - maxThinkingTokens: 思考令牌上限
     * - model: 使用的AI模型名称
     */
    const queryOptions = {
      safeMode,
      forkNumber,
      messageLogName,
      tools,
      commands: [],
      verbose,
      maxThinkingTokens,
      model: modelToUse,
    }
    
    // Add temperature if specified by subagent config
    if (temperature !== undefined) {
      queryOptions['temperature'] = temperature
    }
    
    for await (const message of query(
      messages,
      taskPrompt,
      context,
      hasPermissionsToUseTool,
      {
        abortController,
        options: queryOptions,
        messageId: getLastAssistantMessageId(messages),
        agentId: taskId,
        readFileTimestamps,
        setToolJSX: () => {}, // No-op implementation for TaskTool
      },
    )) {
      messages.push(message)

      overwriteLog(
        getMessagesPath(messageLogName, forkNumber, getSidechainNumber()),
        messages.filter(_ => _.type !== 'progress'),
      )

      if (message.type !== 'assistant') {
        continue
      }

      const normalizedMessages = normalizeMessages(messages)
      
      // Process tool uses and text content for better visibility
      for (const content of message.message.content) {
        if (content.type === 'text' && content.text && content.text !== INTERRUPT_MESSAGE) {
          // Show agent's reasoning/responses
          const preview = content.text.length > 200 ? content.text.substring(0, 200) + '...' : content.text
          yield {
            type: 'progress',
            content: createAssistantMessage(`${preview}`),
            normalizedMessages,
            tools,
          }
        } else if (content.type === 'tool_use') {
          toolUseCount++
          
          // Show which tool is being used with agent context
          const toolMessage = normalizedMessages.find(
            _ =>
              _.type === 'assistant' &&
              _.message.content[0]?.type === 'tool_use' &&
              _.message.content[0].id === content.id,
          ) as AssistantMessage
          
          if (toolMessage) {
            // Clone and modify the message to show agent context
            const modifiedMessage = {
              ...toolMessage,
              message: {
                ...toolMessage.message,
                content: toolMessage.message.content.map(c => {
                  if (c.type === 'tool_use' && c.id === content.id) {
                    // Add agent context to tool name display
                    return {
                      ...c,
                      name: c.name // Keep original name, UI will handle display
                    }
                  }
                  return c
                })
              }
            }
            
            yield {
              type: 'progress',
              content: modifiedMessage,
              normalizedMessages,
              tools,
            }
          }
        }
      }
    }

    const normalizedMessages = normalizeMessages(messages)
    const lastMessage = last(messages)
    if (lastMessage?.type !== 'assistant') {
      throw new Error('Last message was not an assistant message')
    }

    // 🔧 CRITICAL FIX: Match original AgentTool interrupt handling pattern exactly
    if (
      lastMessage.message.content.some(
        _ => _.type === 'text' && _.text === INTERRUPT_MESSAGE,
      )
    ) {
      // Skip progress yield - only yield final result
    } else {
      const result = [
        toolUseCount === 1 ? '1 tool use' : `${toolUseCount} tool uses`,
        formatNumber(
          (lastMessage.message.usage.cache_creation_input_tokens ?? 0) +
            (lastMessage.message.usage.cache_read_input_tokens ?? 0) +
            lastMessage.message.usage.input_tokens +
            lastMessage.message.usage.output_tokens,
        ) + ' tokens',
        formatDuration(Date.now() - startTime),
      ]
      yield {
        type: 'progress',
        content: createAssistantMessage(`Task completed (${result.join(' · ')})`),
        normalizedMessages,
        tools,
      }
    }

    // Output is an AssistantMessage, but since TaskTool is a tool, it needs
    // to serialize its response to UserMessage-compatible content.
    const data = lastMessage.message.content.filter(_ => _.type === 'text')
    yield {
      type: 'result',
      data,
      resultForAssistant: this.renderResultForAssistant(data),
    }
  },

  isReadOnly() {
    return true // for now...
  },
  isConcurrencySafe() {
    return true // Task tool supports concurrent execution in official implementation
  },
  async validateInput(input, context) {
    if (!input.description || typeof input.description !== 'string') {
      return {
        result: false,
        message: 'Description is required and must be a string',
      }
    }
    if (!input.prompt || typeof input.prompt !== 'string') {
      return {
        result: false,
        message: 'Prompt is required and must be a string',
      }
    }

    // Model validation - similar to Edit tool error handling
    if (input.model_name) {
      const modelManager = getModelManager()
      const availableModels = modelManager.getAllAvailableModelNames()

      if (!availableModels.includes(input.model_name)) {
        return {
          result: false,
          message: `Model '${input.model_name}' does not exist. Available models: ${availableModels.join(', ')}`,
          meta: {
            model_name: input.model_name,
            availableModels,
          },
        }
      }
    }

    // Validate subagent_type if provided
    if (input.subagent_type) {
      const availableTypes = await getAvailableAgentTypes()
      if (!availableTypes.includes(input.subagent_type)) {
        return {
          result: false,
          message: `Agent type '${input.subagent_type}' does not exist. Available types: ${availableTypes.join(', ')}`,
          meta: {
            subagent_type: input.subagent_type,
            availableTypes,
          },
        }
      }
    }

    return { result: true }
  },
  async isEnabled() {
    return true
  },
  userFacingName(input?: any) {
    // Return agent name with proper prefix
    const agentType = input?.subagent_type || 'general-purpose'
    return `agent-${agentType}`
  },
  needsPermissions() {
    return false
  },
  renderResultForAssistant(data: TextBlock[]) {
    return data.map(block => block.type === 'text' ? block.text : '').join('\n')
  },
  renderToolUseMessage({ description, prompt, model_name, subagent_type }, { verbose }) {
    if (!description || !prompt) return null

    const modelManager = getModelManager()
    const defaultTaskModel = modelManager.getModelName('task')
    const actualModel = model_name || defaultTaskModel
    const agentType = subagent_type || 'general-purpose'
    const promptPreview =
      prompt.length > 80 ? prompt.substring(0, 80) + '...' : prompt

    const theme = getTheme()
    
    if (verbose) {
      return (
        <Box flexDirection="column">
          <Text>
            [{agentType}] {actualModel}: {description}
          </Text>
          <Box
            paddingLeft={2}
            borderLeftStyle="single"
            borderLeftColor={theme.secondaryBorder}
          >
            <Text color={theme.secondaryText}>{promptPreview}</Text>
          </Box>
        </Box>
      )
    }

    // Simple display: agent type, model and description
    return `[${agentType}] ${actualModel}: ${description}`
  },
  renderToolUseRejectedMessage() {
    return <FallbackToolUseRejectedMessage />
  },
  renderToolResultMessage(content) {
    const theme = getTheme()

    if (Array.isArray(content)) {
      const textBlocks = content.filter(block => block.type === 'text')
      const totalLength = textBlocks.reduce(
        (sum, block) => sum + block.text.length,
        0,
      )
      // 🔧 CRITICAL FIX: Use exact match for interrupt detection, not .includes()
      const isInterrupted = content.some(
        block =>
          block.type === 'text' && block.text === INTERRUPT_MESSAGE,
      )

      if (isInterrupted) {
        // 🔧 CRITICAL FIX: Match original system interrupt rendering exactly
        return (
          <Box flexDirection="row">
            <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
            <Text color={theme.error}>Interrupted by user</Text>
          </Box>
        )
      }

      return (
        <Box flexDirection="column">
          <Box justifyContent="space-between" width="100%">
            <Box flexDirection="row">
              <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
              <Text>Task completed</Text>
              {textBlocks.length > 0 && (
                <Text color={theme.secondaryText}>
                  {' '}
                  ({totalLength} characters)
                </Text>
              )}
            </Box>
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="row">
        <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
        <Text color={theme.secondaryText}>Task completed</Text>
      </Box>
    )
  },
} satisfies Tool<typeof inputSchema, TextBlock[]>
