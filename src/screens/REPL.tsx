/**
 * 🎯 Kode主界面 - 交互式编程环境的核心REPL实现
 *
 * REPL架构设计：
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    Kode REPL 系统架构                           │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ 用户输入 → 命令解析 → 工具执行 → AI处理 → 结果展示 → 循环继续   │
 * │    ↓        ↓         ↓        ↓        ↓                      │
 * │ 输入框 → 斜杠命令 → 权限检查 → 模型调用 → 消息流 → 界面更新     │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * 核心功能：
 * 1. 💬 智能对话：与AI模型的流式交互和上下文管理
 * 2. 🔧 工具集成：文件操作、Shell命令、搜索等开发工具
 * 3. 🛡️ 权限管理：细粒度的工具使用权限控制和用户确认
 * 4. 📋 命令系统：内置斜杠命令和宏指令支持
 * 5. 🔄 对话分支：支持对话历史的分叉和恢复
 * 6. 📊 成本追踪：API使用成本的实时监控和预警
 * 7. 🔌 MCP集成：模型上下文协议的工具扩展支持
 * 8. 🎨 响应式UI：基于Ink的终端界面和实时更新
 */

import { ToolUseBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { Box, Newline, Static, Text } from 'ink'
import ProjectOnboarding, {
  markProjectOnboardingComplete,
} from '../ProjectOnboarding.js'
import { CostThresholdDialog } from '../components/CostThresholdDialog'
import * as React from 'react'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Command } from '../commands'
import { Logo } from '../components/Logo'
import { Message } from '../components/Message'
import { MessageResponse } from '../components/MessageResponse'
import { MessageSelector } from '../components/MessageSelector'
import {
  PermissionRequest,
  type ToolUseConfirm,
} from '../components/permissions/PermissionRequest.js'
import PromptInput from '../components/PromptInput'
import { Spinner } from '../components/Spinner'
import { getSystemPrompt } from '../constants/prompts'
import { getContext } from '../context'
import { getTotalCost, useCostSummary } from '../cost-tracker'
import { useLogStartupTime } from '../hooks/useLogStartupTime'
import { addToHistory } from '../history'
import { useApiKeyVerification } from '../hooks/useApiKeyVerification'
import { useCancelRequest } from '../hooks/useCancelRequest'
import useCanUseTool from '../hooks/useCanUseTool'
import { useLogMessages } from '../hooks/useLogMessages'
import { PermissionProvider } from '../context/PermissionContext'
import { ModeIndicator } from '../components/ModeIndicator'
import {
  setMessagesGetter,
  setMessagesSetter,
  setModelConfigChangeHandler,
} from '../messages'
import {
  type AssistantMessage,
  type BinaryFeedbackResult,
  type Message as MessageType,
  type ProgressMessage,
  query,
} from '../query.js'
import type { WrappedClient } from '../services/mcpClient'
import type { Tool } from '../Tool'
// Auto-updater removed; only show a new version banner passed from CLI
import { getGlobalConfig, saveGlobalConfig } from '../utils/config'
import { MACRO } from '../constants/macros'
import { getNextAvailableLogForkNumber } from '../utils/log'
import {
  getErroredToolUseMessages,
  getInProgressToolUseIDs,
  getLastAssistantMessageId,
  getToolUseID,
  getUnresolvedToolUseIDs,
  INTERRUPT_MESSAGE,
  isNotEmptyMessage,
  type NormalizedMessage,
  normalizeMessages,
  normalizeMessagesForAPI,
  processUserInput,
  reorderMessages,
  extractTag,
  createAssistantMessage,
} from '../utils/messages.js'
import { getModelManager, ModelManager } from '../utils/model'
import { clearTerminal, updateTerminalTitle } from '../utils/terminal'
import { BinaryFeedback } from '../components/binary-feedback/BinaryFeedback'
import { getMaxThinkingTokens } from '../utils/thinking'
import { getOriginalCwd } from '../utils/state'
import { handleHashCommand } from '../commands/terminalSetup'
import { debug as debugLogger } from '../utils/debugLogger'

/**
 * 🎨 REPL组件属性接口 - 定义交互式编程环境的完整配置
 *
 * 属性分类：
 * - 🔧 核心配置：命令、工具、模式设置
 * - 📝 对话管理：消息历史、分支、日志
 * - 🔌 扩展集成：MCP客户端、外部工具
 * - 🎯 界面控制：输入框、调试模式、更新提示
 */
type Props = {
  /** 📋 可用的斜杠命令列表 - 系统内置和用户自定义命令 */
  commands: Command[]
  /** 🛡️ 安全模式 - 启用时进行严格的权限检查和风险评估 */
  safeMode?: boolean
  /** 🐛 调试模式 - 显示组件边框、详细日志等开发调试信息 */
  debug?: boolean
  /** 🔄 初始分叉编号 - 用于对话分支管理和历史恢复 */
  initialForkNumber?: number | undefined
  /** 💭 启动提示词 - REPL启动时自动执行的初始命令或提示 */
  initialPrompt: string | undefined
  /** 📝 消息日志名称 - 用于识别和管理对话分支的唯一标识符 */
  messageLogName: string
  /** 📥 显示输入框 - 控制是否在界面底部显示用户输入区域 */
  shouldShowPromptInput: boolean
  /** 🔧 工具列表 - 可供AI使用的开发工具集合 */
  tools: Tool[]
  /** 📊 详细模式 - 显示详细的工具执行日志和系统信息 */
  verbose: boolean | undefined
  /** 💬 初始消息 - 用于恢复对话的历史消息列表 */
  initialMessages?: MessageType[]
  /** 🔌 MCP客户端 - 模型上下文协议的扩展工具客户端 */
  mcpClients?: WrappedClient[]
  /** 🤖 默认模型标识 - 标识当前使用的是否为系统默认AI模型 */
  isDefaultModel?: boolean
  /** 🆕 更新版本号 - 从CLI传入的可用更新版本信息 */
  initialUpdateVersion?: string | null
  /** 📦 更新命令 - 执行更新的推荐命令列表 */
  initialUpdateCommands?: string[] | null
}

/**
 * 🔄 二元反馈上下文 - 用于比较和选择AI响应的交互式反馈系统
 *
 * 用于A/B测试和响应质量评估：
 * - 同时展示两个AI响应
 * - 用户选择更优的回答
 * - 用于模型训练和优化
 */
export type BinaryFeedbackContext = {
  /** 🤖 第一个AI消息 - 待比较的响应A */
  m1: AssistantMessage
  /** 🤖 第二个AI消息 - 待比较的响应B */
  m2: AssistantMessage
  /** ✅ 反馈解析器 - 处理用户选择结果的回调函数 */
  resolve: (result: BinaryFeedbackResult) => void
}

/**
 * REPL - 读取-求值-输出-循环交互式界面
 * 这是Kode/Claude Code的核心用户界面组件，提供：
 *
 * 🏗️ 架构特点：
 * - 基于React Hooks的状态管理
 * - 支持对话分支和恢复
 * - 实时工具执行和权限管理
 * - 流式AI响应处理
 * - MCP协议集成
 *
 * 🔄 主要功能流程：
 * 1. 用户输入 → 命令解析 → 工具调用请求
 * 2. 权限检查 → 工具执行 → 结果展示
 * 3. AI模型调用 → 流式响应 → 界面更新
 *
 * 🎨 UI组件层次：
 * - Static: Logo, 项目引导, 历史消息
 * - Dynamic: 当前对话, 工具执行状态
 * - Interactive: 输入框, 权限对话框, 选择器
 */
export function REPL({
  commands,
  safeMode,
  debug = false,
  initialForkNumber = 0,
  initialPrompt,
  messageLogName,
  shouldShowPromptInput,
  tools,
  verbose: verboseFromCLI,
  initialMessages,
  mcpClients = [],
  isDefaultModel = true,
  initialUpdateVersion,
  initialUpdateCommands,
}: Props): React.ReactNode {
  // 📊 详细模式缓存：避免每次渲染时同步读取文件配置
  const [verboseConfig] = useState(() => verboseFromCLI ?? getGlobalConfig().verbose)
  const verbose = verboseConfig

  // 🔄 对话分支管理：用于强制Logo重新渲染和使用新的对话日志文件
  const [forkNumber, setForkNumber] = useState(
    getNextAvailableLogForkNumber(messageLogName, initialForkNumber, 0),
  )

  // 🔄 分支待处理消息：存储下次渲染时要分叉的对话消息
  const [
    forkConvoWithMessagesOnTheNextRender,
    setForkConvoWithMessagesOnTheNextRender,
  ] = useState<MessageType[] | null>(null)

  // 🛑 请求控制管理：简化的AbortController管理系统
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // 🔧 工具界面状态：工具执行时的UI展示和输入框控制
  const [toolJSX, setToolJSX] = useState<{
    jsx: React.ReactNode | null
    shouldHidePromptInput: boolean
  } | null>(null)

  // 🛡️ 权限确认状态：工具使用权限的用户确认界面
  const [toolUseConfirm, setToolUseConfirm] = useState<ToolUseConfirm | null>(
    null,
  )

  // 💬 对话消息管理：核心的消息历史存储和状态
  const [messages, setMessages] = useState<MessageType[]>(initialMessages ?? [])

  // 📝 输入状态管理：用户输入内容和输入模式控制
  const [inputValue, setInputValue] = useState('')
  const [inputMode, setInputMode] = useState<'bash' | 'prompt' | 'koding'>(
    'prompt',
  )

  // 📊 交互统计：提交计数和界面状态追踪
  const [submitCount, setSubmitCount] = useState(0)
  const [isMessageSelectorVisible, setIsMessageSelectorVisible] =
    useState(false)

  // 💰 成本控制：API使用成本的对话框显示状态
  const [showCostDialog, setShowCostDialog] = useState(false)
  const [haveShownCostDialog, setHaveShownCostDialog] = useState(
    getGlobalConfig().hasAcknowledgedCostThreshold,
  )

  // 🔄 二元反馈状态：AI响应比较和选择的交互状态
  const [binaryFeedbackContext, setBinaryFeedbackContext] =
    useState<BinaryFeedbackContext | null>(null)

  // 🆕 版本更新横幅：从CLI传入以保证在顶部显示
  const updateAvailableVersion = initialUpdateVersion ?? null
  const updateCommands = initialUpdateCommands ?? null

  /**
   * 🔄 获取二元反馈响应 - 创建AI响应比较的异步交互
   *
   * 工作流程：
   * 1. 设置二元反馈上下文状态
   * 2. 显示A/B选择界面给用户
   * 3. 等待用户选择并返回结果
   *
   * @param m1 - 第一个AI响应消息
   * @param m2 - 第二个AI响应消息
   * @returns Promise<BinaryFeedbackResult> - 用户选择的结果
   */
  const getBinaryFeedbackResponse = useCallback(
    (
      m1: AssistantMessage,
      m2: AssistantMessage,
    ): Promise<BinaryFeedbackResult> => {
      return new Promise<BinaryFeedbackResult>(resolvePromise => {
        setBinaryFeedbackContext({
          m1,
          m2,
          resolve: resolvePromise,
        })
      })
    },
    [],
  )

  // 📁 文件时间戳缓存：用于检测文件变更和热重载
  const readFileTimestamps = useRef<{
    [filename: string]: number
  }>({})

  // 🔑 API密钥验证状态：实时监控密钥有效性
  const { status: apiKeyStatus, reverify } = useApiKeyVerification()

  /**
   * 🛑 取消操作处理器 - 统一的请求取消和状态清理
   *
   * 取消优先级：
   * 1. 工具使用确认 - 取消权限请求
   * 2. AbortController - 取消网络请求
   * 3. 加载状态清理 - 重置UI状态
   */
  function onCancel() {
    if (!isLoading) {
      return
    }
    setIsLoading(false)
    if (toolUseConfirm) {
      toolUseConfirm.onAbort()
    } else if (abortController && !abortController.signal.aborted) {
      abortController.abort()
    }
  }

  // 🔗 取消请求钩子：统一管理键盘中断和请求取消
  useCancelRequest(
    setToolJSX,
    setToolUseConfirm,
    setBinaryFeedbackContext,
    onCancel,
    isLoading,
    isMessageSelectorVisible,
    abortController?.signal,
  )

  // 🔄 对话分支效果：处理对话分叉和消息恢复
  useEffect(() => {
    if (forkConvoWithMessagesOnTheNextRender) {
      setForkNumber(_ => _ + 1)
      setForkConvoWithMessagesOnTheNextRender(null)
      setMessages(forkConvoWithMessagesOnTheNextRender)
    }
  }, [forkConvoWithMessagesOnTheNextRender])

  // 💰 成本监控效果：API使用成本达到阈值时显示警告对话框
  useEffect(() => {
    const totalCost = getTotalCost()
    if (totalCost >= 5 /* $5 */ && !showCostDialog && !haveShownCostDialog) {

      setShowCostDialog(true)
    }
  }, [messages, showCostDialog, haveShownCostDialog])

  // 📢 更新横幅：由CLI在启动时提供，无需异步检查

  // 🔧 工具使用权限：集成权限检查系统的工具使用钩子
  const canUseTool = useCanUseTool(setToolUseConfirm)

  /**
   * 🚀 初始化处理器 - REPL启动时的初始化和自动提示执行
   *
   * 初始化流程：
   * 1. 验证API密钥有效性
   * 2. 执行启动提示词（如果提供）
   * 3. 处理用户输入和AI响应
   * 4. 更新UI状态和对话历史
   */
  async function onInit() {
    reverify()

    if (!initialPrompt) {
      return
    }

    setIsLoading(true)

    const newAbortController = new AbortController()
    setAbortController(newAbortController)

    // 🔧 强制重新读取配置以确保模型切换生效
    const model = new ModelManager(getGlobalConfig()).getModelName('main')
    const newMessages = await processUserInput(
      initialPrompt,
      'prompt',
      setToolJSX,
      {
        abortController: newAbortController,
        options: {
          commands,
          forkNumber,
          messageLogName,
          tools,
          verbose,
          maxThinkingTokens: 0,
        },
        messageId: getLastAssistantMessageId(messages),
        setForkConvoWithMessagesOnTheNextRender,
        readFileTimestamps: readFileTimestamps.current,
      },
      null,
    )

    if (newMessages.length) {
      for (const message of newMessages) {
        if (message.type === 'user') {
          addToHistory(initialPrompt)
          // TODO: setHistoryIndex
        }
      }
      setMessages(_ => [..._, ...newMessages])

      // 📋 如果用户输入是bash命令或无效斜杠命令，最后一条消息是助手消息
      const lastMessage = newMessages[newMessages.length - 1]!
      if (lastMessage.type === 'assistant') {
        setAbortController(null)
        setIsLoading(false)
        return
      }

      // 🔧 并行获取AI查询所需的系统配置和上下文
      const [systemPrompt, context, model, maxThinkingTokens] =
        await Promise.all([
          getSystemPrompt(),
          getContext(),
          new ModelManager(getGlobalConfig()).getModelName('main'),
          getMaxThinkingTokens([...messages, ...newMessages]),
        ])

      // 🤖 流式AI查询：处理启动提示的AI响应
      for await (const message of query(
        [...messages, ...newMessages],
        systemPrompt,
        context,
        canUseTool,
        {
          options: {
            commands,
            forkNumber,
            messageLogName,
            tools,
            verbose,
            safeMode,
            maxThinkingTokens,
          },
          messageId: getLastAssistantMessageId([...messages, ...newMessages]),
          readFileTimestamps: readFileTimestamps.current,
          abortController: newAbortController,
          setToolJSX,
        },
        getBinaryFeedbackResponse,
      )) {
        setMessages(oldMessages => [...oldMessages, message])
      }
    } else {
      addToHistory(initialPrompt)
      // TODO: setHistoryIndex
    }

    setHaveShownCostDialog(
      getGlobalConfig().hasAcknowledgedCostThreshold || false,
    )

    // 🧹 清理状态：初始化完成后重置加载状态和请求控制器
    setIsLoading(false)
    setAbortController(null)
  }

  /**
   * 🎯 查询处理器 - 处理用户输入并调用AI模型的核心方法
   *
   * 查询流程：
   * 1. 设置AbortController用于请求取消
   * 2. 检测是否为Koding模式请求
   * 3. 更新消息历史和UI状态
   * 4. 调用AI模型进行查询
   * 5. 处理Koding模式的特殊逻辑
   *
   * @param newMessages - 要处理的新消息列表
   * @param passedAbortController - 可选的外部AbortController
   */
  async function onQuery(newMessages: MessageType[], passedAbortController?: AbortController) {
    // 使用传入的AbortController或创建新的控制器
    const controllerToUse = passedAbortController || new AbortController()
    if (!passedAbortController) {
      setAbortController(controllerToUse)
    }

    // 🔍 检查是否为Koding请求：基于最后一条消息的选项判断
    const isKodingRequest =
      newMessages.length > 0 &&
      newMessages[0].type === 'user' &&
      'options' in newMessages[0] &&
      newMessages[0].options?.isKodingRequest === true

    setMessages(oldMessages => [...oldMessages, ...newMessages])

    // 🎓 标记引导完成：任何用户消息发送给Claude时完成项目引导
    markProjectOnboardingComplete()

    // 📋 如果用户输入是bash命令或无效斜杠命令，最后一条消息是助手消息
    const lastMessage = newMessages[newMessages.length - 1]!

    // 🖥️ 基于用户消息更新终端标题
    if (
      lastMessage.type === 'user' &&
      typeof lastMessage.message.content === 'string'
    ) {
      // updateTerminalTitle(lastMessage.message.content)
    }
    if (lastMessage.type === 'assistant') {
      setAbortController(null)
      setIsLoading(false)
      return
    }

    // 🔧 并行获取AI查询所需的系统配置和上下文
    const [systemPrompt, context, model, maxThinkingTokens] =
      await Promise.all([
        getSystemPrompt(),
        getContext(),
        new ModelManager(getGlobalConfig()).getModelName('main'),
        getMaxThinkingTokens([...messages, lastMessage]),
      ])

    let lastAssistantMessage: MessageType | null = null

    // 🤖 调用API查询：流式处理AI响应
    for await (const message of query(
      [...messages, lastMessage],
      systemPrompt,
      context,
      canUseTool,
      {
        options: {
          commands,
          forkNumber,
          messageLogName,
          tools,
          verbose,
          safeMode,
          maxThinkingTokens,
          // 如果是Koding模式请求，传递标志
          isKodingRequest: isKodingRequest || undefined,
        },
        messageId: getLastAssistantMessageId([...messages, lastMessage]),
        readFileTimestamps: readFileTimestamps.current,
        abortController: controllerToUse,
        setToolJSX,
      },
      getBinaryFeedbackResponse,
    )) {
      setMessages(oldMessages => [...oldMessages, message])

      // 🔄 跟踪最后的助手消息用于Koding模式
      if (message.type === 'assistant') {
        lastAssistantMessage = message
      }
    }

    // 💾 Koding模式特殊处理：如果是Koding请求且收到助手响应，
    // 保存到AGENTS.md（如果存在CLAUDE.md也保存）
    if (
      isKodingRequest &&
      lastAssistantMessage &&
      lastAssistantMessage.type === 'assistant'
    ) {
      try {
        const content =
          typeof lastAssistantMessage.message.content === 'string'
            ? lastAssistantMessage.message.content
            : lastAssistantMessage.message.content
                .filter(block => block.type === 'text')
                .map(block => (block.type === 'text' ? block.text : ''))
                .join('\n')

        // 📝 将内容添加到AGENTS.md（如果存在CLAUDE.md也添加）
        if (content && content.trim().length > 0) {
          handleHashCommand(content)
        }
      } catch (error) {
        console.error('Error saving response to project docs:', error)
      }
    }

    setIsLoading(false)
  }

  // 💰 注册成本汇总跟踪器：监控API使用成本
  useCostSummary()

  // 📮 注册消息获取器和设置器：为外部模块提供消息状态访问
  useEffect(() => {
    const getMessages = () => messages
    setMessagesGetter(getMessages)
    setMessagesSetter(setMessages)
  }, [messages])

  // 🔄 注册模型配置变更处理器：模型切换时刷新UI
  useEffect(() => {
    setModelConfigChangeHandler(() => {
      setForkNumber(prev => prev + 1)
    })
  }, [])

  // 📝 本地记录对话转录：用于调试和对话恢复
  useLogMessages(messages, messageLogName, forkNumber)

  // ⏱️ 记录启动时间：性能监控
  useLogStartupTime()

  // 🚀 初始加载效果：启动时执行初始化
  useEffect(() => {
    onInit()
    // TODO: fix this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 📋 标准化消息：缓存处理过的消息列表，过滤空消息
  const normalizedMessages = useMemo(
    () => normalizeMessages(messages).filter(isNotEmptyMessage),
    [messages],
  )

  // 🔄 未解决的工具使用ID：跟踪正在等待处理的工具调用
  const unresolvedToolUseIDs = useMemo(
    () => getUnresolvedToolUseIDs(normalizedMessages),
    [normalizedMessages],
  )

  // ⚡ 进行中的工具使用ID：跟踪当前正在执行的工具调用
  const inProgressToolUseIDs = useMemo(
    () => getInProgressToolUseIDs(normalizedMessages),
    [normalizedMessages],
  )

  // ❌ 错误的工具使用ID：跟踪执行失败的工具调用
  const erroredToolUseIDs = useMemo(
    () =>
      new Set(
        getErroredToolUseMessages(normalizedMessages).map(
          _ => (_.message.content[0]! as ToolUseBlockParam).id,
        ),
      ),
    [normalizedMessages],
  )

  // 🎨 消息JSX渲染器：缓存消息列表的React组件表示
  const messagesJSX = useMemo(() => {
    return [
      // 🏠 静态顶部区域：Logo、更新横幅、项目引导
      {
        type: 'static',
        jsx: (
          <Box flexDirection="column" key={`logo${forkNumber}`}>
            <Logo
              mcpClients={mcpClients}
              isDefaultModel={isDefaultModel}
              updateBannerVersion={updateAvailableVersion}
              updateBannerCommands={updateCommands}
            />
            <ProjectOnboarding workspaceDir={getOriginalCwd()} />
          </Box>
        ),
      },
      // 📋 动态消息区域：重新排序的对话消息和工具执行进度
      ...reorderMessages(normalizedMessages).map(_ => {
        const toolUseID = getToolUseID(_)
        const message =
          _.type === 'progress' ? (
            _.content.message.content[0]?.type === 'text' &&
            // 🔄 TaskTool中断使用Progress消息，无需额外的 ⎿
            // 因为 <Message /> 组件已经添加了边距
            _.content.message.content[0].text === INTERRUPT_MESSAGE ? (
              <Message
                message={_.content}
                messages={_.normalizedMessages}
                addMargin={false}
                tools={_.tools}
                verbose={verbose ?? false}
                debug={debug}
                erroredToolUseIDs={new Set()}
                inProgressToolUseIDs={new Set()}
                unresolvedToolUseIDs={new Set()}
                shouldAnimate={false}
                shouldShowDot={false}
              />
            ) : (
              <MessageResponse children={
                <Message
                  message={_.content}
                  messages={_.normalizedMessages}
                  addMargin={false}
                  tools={_.tools}
                  verbose={verbose ?? false}
                  debug={debug}
                  erroredToolUseIDs={new Set()}
                  inProgressToolUseIDs={new Set()}
                  unresolvedToolUseIDs={
                    new Set([
                      (_.content.message.content[0]! as ToolUseBlockParam).id,
                    ])
                  }
                  shouldAnimate={false}
                  shouldShowDot={false}
                />
              } />
            )
          ) : (
            <Message
              message={_}
              messages={normalizedMessages}
              addMargin={true}
              tools={tools}
              verbose={verbose}
              debug={debug}
              erroredToolUseIDs={erroredToolUseIDs}
              inProgressToolUseIDs={inProgressToolUseIDs}
              shouldAnimate={
                !toolJSX &&
                !toolUseConfirm &&
                !isMessageSelectorVisible &&
                (!toolUseID || inProgressToolUseIDs.has(toolUseID))
              }
              shouldShowDot={true}
              unresolvedToolUseIDs={unresolvedToolUseIDs}
            />
          )

        // 🎯 渲染类型决策：根据工具状态决定静态或动态渲染
        const type = shouldRenderStatically(
          _,
          normalizedMessages,
          unresolvedToolUseIDs,
        )
          ? 'static'
          : 'transient'

        // 🐛 调试模式：添加边框标识渲染类型
        if (debug) {
          return {
            type,
            jsx: (
              <Box
                borderStyle="single"
                borderColor={type === 'static' ? 'green' : 'red'}
                key={_.uuid}
                width="100%"
              >
                {message}
              </Box>
            ),
          }
        }

        return {
          type,
          jsx: (
            <Box key={_.uuid} width="100%">
              {message}
            </Box>
          ),
        }
      }),
    ]
  }, [
    forkNumber,
    normalizedMessages,
    tools,
    verbose,
    debug,
    erroredToolUseIDs,
    inProgressToolUseIDs,
    toolJSX,
    toolUseConfirm,
    isMessageSelectorVisible,
    unresolvedToolUseIDs,
    mcpClients,
    isDefaultModel,
  ])

  // 💰 成本对话框显示控制：仅在非加载状态时显示
  const showingCostDialog = !isLoading && showCostDialog

  return (
    <PermissionProvider
      isBypassPermissionsModeAvailable={!safeMode}
      children={
        <React.Fragment>
        {/* 📢 更新横幅现在在Logo内渲染以保持稳定位置 */}
        <ModeIndicator />
      {/* 🏠 静态消息区域：Logo、引导等固定内容 */}
      <React.Fragment key={`static-messages-${forkNumber}`}>
        <Static
          items={messagesJSX.filter(_ => _.type === 'static')}
          children={(item: any) => item.jsx}
        />
      </React.Fragment>
      {/* 💬 动态消息区域：实时更新的对话内容 */}
      {messagesJSX.filter(_ => _.type === 'transient').map(_ => _.jsx)}
      {/* 🎛️ 交互控制区域：工具、权限、输入等交互界面 */}
      <Box
        borderColor="red"
        borderStyle={debug ? 'single' : undefined}
        flexDirection="column"
        width="100%"
      >
        {/* ⏳ 加载指示器：显示AI处理进度 */}
        {!toolJSX && !toolUseConfirm && !binaryFeedbackContext && isLoading && (
          <Spinner />
        )}
        {/* 🔧 工具执行界面：显示当前运行的工具UI */}
        {toolJSX ? toolJSX.jsx : null}
        {/* 🔄 二元反馈界面：A/B响应选择器 */}
        {!toolJSX && binaryFeedbackContext && !isMessageSelectorVisible && (
          <BinaryFeedback
            m1={binaryFeedbackContext.m1}
            m2={binaryFeedbackContext.m2}
            resolve={result => {
              binaryFeedbackContext.resolve(result)
              setTimeout(() => setBinaryFeedbackContext(null), 0)
            }}
            verbose={verbose}
            normalizedMessages={normalizedMessages}
            tools={tools}
            debug={debug}
            erroredToolUseIDs={erroredToolUseIDs}
            inProgressToolUseIDs={inProgressToolUseIDs}
            unresolvedToolUseIDs={unresolvedToolUseIDs}
          />
        )}
        {/* 🛡️ 权限请求界面：工具使用权限确认对话框 */}
        {!toolJSX &&
          toolUseConfirm &&
          !isMessageSelectorVisible &&
          !binaryFeedbackContext && (
            <PermissionRequest
              toolUseConfirm={toolUseConfirm}
              onDone={() => setToolUseConfirm(null)}
              verbose={verbose}
            />
          )}
        {/* 💰 成本警告对话框：API使用成本超过阈值时显示 */}
        {!toolJSX &&
          !toolUseConfirm &&
          !isMessageSelectorVisible &&
          !binaryFeedbackContext &&
          showingCostDialog && (
            <CostThresholdDialog
              onDone={() => {
                setShowCostDialog(false)
                setHaveShownCostDialog(true)
                const projectConfig = getGlobalConfig()
                saveGlobalConfig({
                  ...projectConfig,
                  hasAcknowledgedCostThreshold: true,
                })

              }}
            />
          )}

        {/* 📝 用户输入界面：命令输入框和相关控制组件 */}
        {!toolUseConfirm &&
          !toolJSX?.shouldHidePromptInput &&
          shouldShowPromptInput &&
          !isMessageSelectorVisible &&
          !binaryFeedbackContext &&
          !showingCostDialog && (
            <>
              <PromptInput
                commands={commands}
                forkNumber={forkNumber}
                messageLogName={messageLogName}
                tools={tools}
                isDisabled={apiKeyStatus === 'invalid'}
                isLoading={isLoading}
                onQuery={onQuery}
                debug={debug}
                verbose={verbose}
                messages={messages}
                setToolJSX={setToolJSX}
                input={inputValue}
                onInputChange={setInputValue}
                mode={inputMode}
                onModeChange={setInputMode}
                submitCount={submitCount}
                onSubmitCountChange={setSubmitCount}
                setIsLoading={setIsLoading}
                setAbortController={setAbortController}
                onShowMessageSelector={() =>
                  setIsMessageSelectorVisible(prev => !prev)
                }
                setForkConvoWithMessagesOnTheNextRender={
                  setForkConvoWithMessagesOnTheNextRender
                }
                readFileTimestamps={readFileTimestamps.current}
                abortController={abortController}
                onModelChange={() => setForkNumber(prev => prev + 1)}
              />
            </>
          )}
      </Box>
      {/* 📋 消息选择器：对话历史导航和回退界面 */}
      {isMessageSelectorVisible && (
        <MessageSelector
          erroredToolUseIDs={erroredToolUseIDs}
          unresolvedToolUseIDs={unresolvedToolUseIDs}
          messages={normalizeMessagesForAPI(messages)}
          onSelect={async message => {
            setIsMessageSelectorVisible(false)

            // 🔍 如果用户选择了当前提示，不执行任何操作
            if (!messages.includes(message)) {
              return
            }

            // 🛑 取消工具使用调用/请求
            onCancel()

            // 🔧 技巧：确保"用户中断"消息在取消响应中渲染
            // 否则屏幕会被清空，但顶部会残留一个多余的"用户中断"消息
            setImmediate(async () => {
              // 🧹 清除消息并重新渲染
              await clearTerminal()
              setMessages([])
              setForkConvoWithMessagesOnTheNextRender(
                messages.slice(0, messages.indexOf(message)),
              )

              // 📝 填充/重置提示输入
              if (typeof message.message.content === 'string') {
                setInputValue(message.message.content)
              }
            })
          }}
          onEscape={() => setIsMessageSelectorVisible(false)}
          tools={tools}
        />
      )}
      {/* 🔧 修复偶尔出现的渲染artifact */}
      <Newline />
        </React.Fragment>
      }
    />
  )
}

/**
 * 🎯 静态渲染判断器 - 决定消息是否应该静态渲染
 *
 * 渲染策略：
 * - 静态渲染：内容不会变化，性能优化
 * - 动态渲染：内容可能更新，需要重新渲染
 *
 * @param message - 要判断的消息
 * @param messages - 所有标准化消息列表
 * @param unresolvedToolUseIDs - 未解决的工具使用ID集合
 * @returns 是否应该静态渲染
 */
function shouldRenderStatically(
  message: NormalizedMessage,
  messages: NormalizedMessage[],
  unresolvedToolUseIDs: Set<string>,
): boolean {
  switch (message.type) {
    case 'user':
    case 'assistant': {
      const toolUseID = getToolUseID(message)
      if (!toolUseID) {
        return true
      }
      if (unresolvedToolUseIDs.has(toolUseID)) {
        return false
      }

      const correspondingProgressMessage = messages.find(
        _ => _.type === 'progress' && _.toolUseID === toolUseID,
      ) as ProgressMessage | null
      if (!correspondingProgressMessage) {
        return true
      }

      return !intersects(
        unresolvedToolUseIDs,
        correspondingProgressMessage.siblingToolUseIDs,
      )
    }
    case 'progress':
      return !intersects(unresolvedToolUseIDs, message.siblingToolUseIDs)
  }
}

/**
 * 🔍 集合交集判断器 - 检查两个集合是否有交集
 *
 * @param a - 第一个集合
 * @param b - 第二个集合
 * @returns 是否存在交集
 */
function intersects<A>(a: Set<A>, b: Set<A>): boolean {
  return a.size > 0 && b.size > 0 && [...a].some(_ => b.has(_))
}
