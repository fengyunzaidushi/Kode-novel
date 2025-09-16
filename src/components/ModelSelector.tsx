/**
 * 🎯 模型选择器组件 - AI模型配置和管理的交互式向导界面
 *
 * 模型配置架构：
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    模型选择器配置流程                            │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ 提供商选择 → API配置 → 模型选择 → 参数设置 → 连接测试 → 确认保存 │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * 核心功能：
 * 1. 🤖 多提供商支持：Anthropic、OpenAI、Azure、Ollama等主流AI服务
 * 2. 🔧 参数配置：最大token、上下文长度、推理努力等模型参数
 * 3. 🔍 模型搜索：动态加载和搜索可用模型列表
 * 4. ✅ 连接测试：验证API密钥和模型配置的有效性
 * 5. 🎯 指针管理：支持主模型、任务模型、推理模型等不同角色配置
 * 6. 📋 向导流程：逐步引导用户完成复杂的模型配置
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Box, Text, useInput } from 'ink'
import { getTheme } from '../utils/theme'
import { Select } from './CustomSelect/select'
import { Newline } from 'ink'
import { getModelManager } from '../utils/model'

/**
 * 🖼️ 屏幕容器组件 - 为配置向导提供统一的界面容器
 *
 * 提供一致的界面布局：
 * - 圆角边框和统一的间距
 * - 动态标题显示（包含退出状态提示）
 * - 主题色彩集成
 *
 * @param props - 容器组件属性
 * @returns React节点 - 带边框的容器布局
 */
function ScreenContainer({
  title,
  exitState,
  children,
}: {
  /** 📝 屏幕标题 */
  title: string
  /** 🔄 退出状态 - 双击保护状态信息 */
  exitState: { pending: boolean; keyName: string }
  /** 🎨 子组件内容 */
  children: React.ReactNode
}) {
  const theme = getTheme()
  return (
    <Box
      flexDirection="column"
      gap={1}
      borderStyle="round"
      borderColor={theme.secondaryBorder}
      paddingX={2}
      paddingY={1}
    >
      <Text bold>
        {title}{' '}
        {exitState.pending ? `(press ${exitState.keyName} again to exit)` : ''}
      </Text>
      {children}
    </Box>
  )
}
import { PRODUCT_NAME } from '../constants/product'
import { useExitOnCtrlCD } from '../hooks/useExitOnCtrlCD'
import {
  getGlobalConfig,
  saveGlobalConfig,
  ProviderType,
  ModelPointerType,
  setAllPointersToModel,
  setModelPointer,
} from '../utils/config.js'
import models, { providers } from '../constants/models'
import TextInput from './TextInput'
import OpenAI from 'openai'
import chalk from 'chalk'
import { fetchAnthropicModels, verifyApiKey } from '../services/claude'
import { fetchCustomModels, getModelFeatures } from '../services/openai'
import { testGPT5Connection, validateGPT5Config } from '../services/gpt5ConnectionTest'
/**
 * 🎨 模型选择器组件属性接口
 */
type Props = {
  /** ✅ 完成回调 - 配置完成后调用 */
  onDone: () => void
  /** 🚫 中止控制器 - 用于取消异步操作 */
  abortController?: AbortController
  /** 🎯 目标指针 - 指定要配置的模型角色（主模型/任务模型/推理模型） */
  targetPointer?: ModelPointerType
  /** 🆕 首次设置 - 是否为初次配置流程 */
  isOnboarding?: boolean
  /** ❌ 取消回调 - 取消配置时调用（与onDone不同） */
  onCancel?: () => void
  /** ⏭️ 跳过模型类型 - 是否跳过模型类型选择步骤 */
  skipModelType?: boolean
}

/**
 * 🤖 模型信息接口 - 描述AI模型的基本信息
 */
type ModelInfo = {
  /** 🏷️ 模型名称 - 具体的模型标识符 */
  model: string
  /** 🏢 提供商 - AI服务提供商名称 */
  provider: string
  /** 🔧 扩展属性 - 其他模型相关的配置信息 */
  [key: string]: any
}

/**
 * 🧠 推理努力等级 - Claude模型的推理深度选项
 *
 * - low: 快速响应，适合简单任务
 * - medium: 平衡速度和质量，通用选择
 * - high: 深度思考，适合复杂问题
 */
type ReasoningEffortOption = 'low' | 'medium' | 'high'

/**
 * 📏 上下文长度选项 - 模型可处理的最大token数量配置
 */
type ContextLengthOption = {
  /** 📝 显示标签 - 用户友好的描述文本 */
  label: string
  /** 🔢 token数值 - 实际的上下文长度限制 */
  value: number
}

/**
 * 📏 上下文长度预设选项 - 常用的token限制配置列表
 *
 * 从32K到10M token的完整覆盖，适应不同使用场景：
 * - 32K-128K: 日常对话和代码分析
 * - 200K-512K: 文档处理和复杂任务
 * - 1M+: 大型文档分析和批量处理
 */
const CONTEXT_LENGTH_OPTIONS: ContextLengthOption[] = [
  { label: '32K tokens', value: 32000 },
  { label: '64K tokens', value: 64000 },
  { label: '128K tokens', value: 128000 },
  { label: '200K tokens', value: 200000 },
  { label: '256K tokens', value: 256000 },
  { label: '300K tokens', value: 300000 },
  { label: '512K tokens', value: 512000 },
  { label: '1000K tokens', value: 1000000 },
  { label: '2000K tokens', value: 2000000 },
  { label: '3000K tokens', value: 3000000 },
  { label: '5000K tokens', value: 5000000 },
  { label: '10000K tokens', value: 10000000 },
]

/** 📏 默认上下文长度 - 平衡性能和功能的推荐配置 */
const DEFAULT_CONTEXT_LENGTH = 128000

/**
 * 🔢 最大token选项接口 - 控制AI响应的最大长度
 */
type MaxTokensOption = {
  /** 📝 显示标签 - 用户友好的描述 */
  label: string
  /** 🔢 token数值 - 实际的最大输出限制 */
  value: number
}

const MAX_TOKENS_OPTIONS: MaxTokensOption[] = [
  { label: '1K tokens', value: 1024 },
  { label: '2K tokens', value: 2048 },
  { label: '4K tokens', value: 4096 },
  { label: '8K tokens (recommended)', value: 8192 },
  { label: '16K tokens', value: 16384 },
  { label: '32K tokens', value: 32768 },
  { label: '64K tokens', value: 65536 },
  { label: '128K tokens', value: 131072 },
]

const DEFAULT_MAX_TOKENS = 8192

// Custom hook to handle Escape key navigation
function useEscapeNavigation(
  onEscape: () => void,
  abortController?: AbortController,
) {
  // Use a ref to track if we've handled the escape key
  const handledRef = useRef(false)

  useInput(
    (input, key) => {
      if (key.escape && !handledRef.current) {
        handledRef.current = true
        // Reset after a short delay to allow for multiple escapes
        setTimeout(() => {
          handledRef.current = false
        }, 100)
        onEscape()
      }
    },
    { isActive: true },
  )
}

function printModelConfig() {
  const config = getGlobalConfig()
  // Only show ModelProfile information - no legacy fields
  const modelProfiles = config.modelProfiles || []
  const activeProfiles = modelProfiles.filter(p => p.isActive)

  if (activeProfiles.length === 0) {
    console.log(chalk.gray('  ⎿  No active model profiles configured'))
    return
  }

  const profileSummary = activeProfiles
    .map(p => `${p.name} (${p.provider}: ${p.modelName})`)
    .join(' | ')
  console.log(chalk.gray(`  ⎿  ${profileSummary}`))
}

/**
 * 🎯 模型选择器主组件 - AI模型配置向导的核心实现
 *
 * 组件特性：
 * 1. 📋 多步骤向导：通过屏幕栈管理复杂的配置流程
 * 2. 🔄 状态同步：与全局配置系统实时同步
 * 3. 🎯 角色配置：支持不同模型角色的独立配置
 * 4. ✅ 实时验证：配置过程中的连接测试和有效性检查
 * 5. 🔄 错误恢复：网络错误和配置错误的自动重试机制
 *
 * 向导流程：
 * 1. 提供商选择（Anthropic、OpenAI、Azure等）
 * 2. API密钥配置和验证
 * 3. 模型列表获取和选择
 * 4. 参数配置（最大token、上下文长度等）
 * 5. 连接测试和最终确认
 *
 * @param props - 模型选择器组件属性
 * @returns React节点 - 渲染的配置向导界面
 */
export function ModelSelector({
  onDone: onDoneProp,
  abortController,
  targetPointer,
  isOnboarding = false,
  onCancel,
  skipModelType = false,
}: Props): React.ReactNode {
  // 📊 配置和主题管理
  const config = getGlobalConfig()
  const theme = getTheme()

  // ✅ 完成处理：打印配置信息并调用完成回调
  const onDone = () => {
    printModelConfig()
    onDoneProp()
  }

  // 🔄 退出状态管理：双击保护机制
  const exitState = useExitOnCtrlCD(() => process.exit(0))

  // 🎯 屏幕初始化：总是从提供商选择开始配置流程
  const getInitialScreen = (): string => {
    return 'provider'
  }

  // 📋 屏幕导航栈：管理向导步骤的前进和后退
  const [screenStack, setScreenStack] = useState<
    Array<
      | 'provider'        // 提供商选择
      | 'anthropicSubMenu' // Anthropic子菜单
      | 'apiKey'          // API密钥配置
      | 'resourceName'    // Azure资源名称
      | 'baseUrl'         // 自定义API端点
      | 'model'           // 模型选择
      | 'modelInput'      // 模型手动输入
      | 'modelParams'     // 模型参数配置
      | 'contextLength'   // 上下文长度设置
      | 'connectionTest'  // 连接测试
      | 'confirmation'    // 最终确认
    >
  >([getInitialScreen()])

  // 🎯 当前屏幕：栈顶元素即为当前显示的配置步骤
  const currentScreen = screenStack[screenStack.length - 1]

  /**
   * 🔄 前进导航：将新屏幕推入导航栈
   *
   * @param screen - 要导航到的目标屏幕
   */
  const navigateTo = (
    screen:
      | 'provider'
      | 'anthropicSubMenu'
      | 'apiKey'
      | 'resourceName'
      | 'baseUrl'
      | 'model'
      | 'modelInput'
      | 'modelParams'
      | 'contextLength'
      | 'connectionTest'
      | 'confirmation',
  ) => {
    setScreenStack(prev => [...prev, screen])
  }

  /**
   * ⬅️ 后退导航：返回上一个配置步骤或退出向导
   */
  const goBack = () => {
    if (screenStack.length > 1) {
      // 🔙 移除当前屏幕，返回上一步
      setScreenStack(prev => prev.slice(0, -1))
    } else {
      // 📤 已在首屏，退出配置向导
      onDone()
    }
  }

  // 🔧 模型配置状态：核心配置参数管理
  const [selectedProvider, setSelectedProvider] = useState<ProviderType>(
    config.primaryProvider ?? 'anthropic',
  )

  // 🏢 Anthropic提供商子菜单状态：不同API端点选择
  const [anthropicProviderType, setAnthropicProviderType] = useState<
    'official' | 'bigdream' | 'opendev' | 'custom'
  >('official')
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [apiKey, setApiKey] = useState<string>('')

  // 📊 模型参数状态：控制AI行为的关键设置
  const [maxTokens, setMaxTokens] = useState<string>(
    config.maxTokens?.toString() || DEFAULT_MAX_TOKENS.toString(),
  )
  const [maxTokensMode, setMaxTokensMode] = useState<'preset' | 'custom'>(
    'preset',
  )
  const [selectedMaxTokensPreset, setSelectedMaxTokensPreset] =
    useState<number>(config.maxTokens || DEFAULT_MAX_TOKENS)
  const [reasoningEffort, setReasoningEffort] =
    useState<ReasoningEffortOption>('medium')
  const [supportsReasoningEffort, setSupportsReasoningEffort] =
    useState<boolean>(false)

  // 📏 上下文长度状态：使用默认值而非历史配置
  const [contextLength, setContextLength] = useState<number>(
    DEFAULT_CONTEXT_LENGTH,
  )

  // 🎯 表单焦点状态：管理用户输入焦点和光标位置
  const [activeFieldIndex, setActiveFieldIndex] = useState(0)
  const [maxTokensCursorOffset, setMaxTokensCursorOffset] = useState<number>(0)

  // 🎨 UI状态管理：界面交互和用户体验

  // 🔍 搜索和模型加载状态：动态模型列表管理
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [modelLoadError, setModelLoadError] = useState<string | null>(null)
  const [modelSearchQuery, setModelSearchQuery] = useState<string>('')
  const [modelSearchCursorOffset, setModelSearchCursorOffset] =
    useState<number>(0)
  const [cursorOffset, setCursorOffset] = useState<number>(0)
  const [apiKeyEdited, setApiKeyEdited] = useState<boolean>(false)

  // 🔄 重试逻辑状态：网络错误恢复机制
  const [fetchRetryCount, setFetchRetryCount] = useState<number>(0)
  const [isRetrying, setIsRetrying] = useState<boolean>(false)

  // ✅ 连接测试状态：API配置验证反馈
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false)
  const [connectionTestResult, setConnectionTestResult] = useState<{
    success: boolean
    message: string
    endpoint?: string
    details?: string
  } | null>(null)

  // ⚠️ 验证错误状态：重复模型检测和配置冲突提醒
  const [validationError, setValidationError] = useState<string | null>(null)

  // State for Azure-specific configuration
  const [resourceName, setResourceName] = useState<string>('')
  const [resourceNameCursorOffset, setResourceNameCursorOffset] =
    useState<number>(0)
  const [customModelName, setCustomModelName] = useState<string>('')
  const [customModelNameCursorOffset, setCustomModelNameCursorOffset] =
    useState<number>(0)

  // State for Ollama-specific configuration
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState<string>(
    'http://localhost:11434/v1',
  )
  const [ollamaBaseUrlCursorOffset, setOllamaBaseUrlCursorOffset] =
    useState<number>(0)

  // State for custom OpenAI-compatible API configuration
  const [customBaseUrl, setCustomBaseUrl] = useState<string>('')
  const [customBaseUrlCursorOffset, setCustomBaseUrlCursorOffset] =
    useState<number>(0)

  // State for provider base URL configuration (used for all providers)
  const [providerBaseUrl, setProviderBaseUrl] = useState<string>('')
  const [providerBaseUrlCursorOffset, setProviderBaseUrlCursorOffset] =
    useState<number>(0)

  // Reasoning effort options
  const reasoningEffortOptions = [
    { label: 'Low - Faster responses, less thorough reasoning', value: 'low' },
    { label: 'Medium - Balanced speed and reasoning depth', value: 'medium' },
    {
      label: 'High - Slower responses, more thorough reasoning',
      value: 'high',
    },
  ]

  // Get available providers from models.ts, excluding community Claude providers (now in Anthropic sub-menu)
  const availableProviders = Object.keys(providers).filter(
    provider => provider !== 'bigdream' && provider !== 'opendev',
  )

  // Create provider options with nice labels
  const providerOptions = availableProviders.map(provider => {
    const modelCount = models[provider]?.length || 0
    const label = getProviderLabel(provider, modelCount)
    return {
      label,
      value: provider,
    }
  })

  useEffect(() => {
    if (!apiKeyEdited && selectedProvider) {
      if (process.env[selectedProvider.toUpperCase() + '_API_KEY']) {
        setApiKey(
          process.env[selectedProvider.toUpperCase() + '_API_KEY'] as string,
        )
      } else {
        setApiKey('')
      }
    }
  }, [selectedProvider, apiKey, apiKeyEdited])

  // Ensure contextLength is always set to a valid option when contextLength screen is displayed
  useEffect(() => {
    if (
      currentScreen === 'contextLength' &&
      !CONTEXT_LENGTH_OPTIONS.find(opt => opt.value === contextLength)
    ) {
      setContextLength(DEFAULT_CONTEXT_LENGTH)
    }
  }, [currentScreen, contextLength])

  // Create a set of model names from our constants/models.ts for the current provider
  const ourModelNames = new Set(
    (models[selectedProvider as keyof typeof models] || []).map(
      (model: any) => model.model,
    ),
  )

  // Create model options from available models, filtered by search query
  const filteredModels = modelSearchQuery
    ? availableModels.filter(model =>
        model.model?.toLowerCase().includes(modelSearchQuery.toLowerCase()),
      )
    : availableModels

  // Sort models with priority for specific keywords
  const sortModelsByPriority = (models: ModelInfo[]) => {
    const priorityKeywords = [
      'claude',
      'kimi',
      'deepseek',
      'minimax',
      'o3',
      'gpt',
      'qwen',
    ]

    return models.sort((a, b) => {
      // Add safety checks for undefined model names
      const aModelLower = a.model?.toLowerCase() || ''
      const bModelLower = b.model?.toLowerCase() || ''

      // Check if models contain priority keywords
      const aHasPriority = priorityKeywords.some(keyword =>
        aModelLower.includes(keyword),
      )
      const bHasPriority = priorityKeywords.some(keyword =>
        bModelLower.includes(keyword),
      )

      // If one has priority and the other doesn't, prioritize the one with keywords
      if (aHasPriority && !bHasPriority) return -1
      if (!aHasPriority && bHasPriority) return 1

      // If both have priority or neither has priority, sort alphabetically
      return a.model.localeCompare(b.model)
    })
  }

  const sortedFilteredModels = sortModelsByPriority(filteredModels)

  const modelOptions = sortedFilteredModels.map(model => {
    // Check if this model is in our constants/models.ts list
    const isInOurModels = ourModelNames.has(model.model)

    return {
      label: `${model.model}${getModelDetails(model)}`,
      value: model.model,
    }
  })

  function getModelDetails(model: ModelInfo): string {
    const details = []

    if (model.max_tokens) {
      details.push(`${formatNumber(model.max_tokens)} tokens`)
    }

    if (model.supports_vision) {
      details.push('vision')
    }

    if (model.supports_function_calling) {
      details.push('tools')
    }

    return details.length > 0 ? ` (${details.join(', ')})` : ''
  }

  function formatNumber(num: number): string {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(0)}K`
    }
    return num.toString()
  }

  function getProviderLabel(provider: string, modelCount: number): string {
    // Use provider names from the providers object if available
    if (providers[provider]) {
      return `${providers[provider].name} ${providers[provider].status === 'wip' ? '(WIP)' : ''} (${modelCount} models)`
    }
    return `${provider}`
  }

  function handleProviderSelection(provider: string) {
    const providerType = provider as ProviderType
    setSelectedProvider(providerType)

    if (provider === 'custom') {
      // For custom provider, save and exit
      saveConfiguration(providerType, selectedModel || '')
      onDone()
    } else if (provider === 'anthropic') {
      // For Anthropic provider, go to sub-menu to choose between official, community proxies, or custom
      navigateTo('anthropicSubMenu')
    } else {
      // For all other providers, go to base URL configuration first
      // Initialize with the default base URL for the provider
      const defaultBaseUrl = providers[providerType]?.baseURL || ''
      setProviderBaseUrl(defaultBaseUrl)
      navigateTo('baseUrl')
    }
  }

  // Local implementation of fetchAnthropicModels for UI
  async function fetchAnthropicModels(baseURL: string, apiKey: string) {
    try {
      const response = await fetch(`${baseURL}/v1/models`, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(
            'Invalid API key. Please check your API key and try again.',
          )
        } else if (response.status === 403) {
          throw new Error('API key does not have permission to access models.')
        } else if (response.status === 404) {
          throw new Error(
            'API endpoint not found. This provider may not support model listing.',
          )
        } else if (response.status === 429) {
          throw new Error(
            'Too many requests. Please wait a moment and try again.',
          )
        } else if (response.status >= 500) {
          throw new Error(
            'API service is temporarily unavailable. Please try again later.',
          )
        } else {
          throw new Error(`Unable to connect to API (${response.status}).`)
        }
      }

      const data = await response.json()

      // Handle different response formats
      let models = []
      if (data && data.data && Array.isArray(data.data)) {
        models = data.data
      } else if (Array.isArray(data)) {
        models = data
      } else if (data && data.models && Array.isArray(data.models)) {
        models = data.models
      } else {
        throw new Error('API returned unexpected response format.')
      }

      return models
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('API key') ||
          error.message.includes('API endpoint') ||
          error.message.includes('API service') ||
          error.message.includes('response format'))
      ) {
        throw error
      }

      if (error instanceof Error && error.message.includes('fetch')) {
        throw new Error(
          'Unable to connect to the API. Please check the base URL and your internet connection.',
        )
      }

      throw new Error(
        'Failed to fetch models from API. Please check your configuration and try again.',
      )
    }
  }

  // 通用的Anthropic兼容模型获取函数，实现三层降级策略
  async function fetchAnthropicCompatibleModelsWithFallback(
    baseURL: string,
    provider: string,
    apiKeyUrl: string,
  ) {
    let lastError: Error | null = null

    // 第一层：尝试使用 Anthropic 风格的 API
    try {
      const models = await fetchAnthropicModels(baseURL, apiKey)
      return models.map((model: any) => ({
        model: model.modelName || model.id || model.name || model.model || 'unknown',
        provider: provider,
        max_tokens: model.max_tokens || 8192,
        supports_vision: model.supports_vision || true,
        supports_function_calling: model.supports_function_calling || true,
        supports_reasoning_effort: false,
      }))
    } catch (error) {
      lastError = error as Error
      console.log(
        `Anthropic API failed for ${provider}, trying OpenAI format:`,
        error,
      )
    }

    // 第二层：尝试使用 OpenAI 风格的 API
    try {
      const models = await fetchCustomModels(baseURL, apiKey)
      return models.map((model: any) => ({
        model: model.modelName || model.id || model.name || model.model || 'unknown',
        provider: provider,
        max_tokens: model.max_tokens || 8192,
        supports_vision: model.supports_vision || false,
        supports_function_calling: model.supports_function_calling || true,
        supports_reasoning_effort: false,
      }))
    } catch (error) {
      lastError = error as Error
      console.log(
        `OpenAI API failed for ${provider}, falling back to manual input:`,
        error,
      )
    }

    // 第三层：抛出错误，触发手动输入模式
    let errorMessage = `Failed to fetch ${provider} models using both Anthropic and OpenAI API formats`

    if (lastError) {
      errorMessage = lastError.message
    }

    // 添加有用的建议
    if (errorMessage.includes('API key')) {
      errorMessage += `\n\n💡 Tip: Get your API key from ${apiKeyUrl}`
    } else if (errorMessage.includes('permission')) {
      errorMessage += `\n\n💡 Tip: Make sure your API key has access to the ${provider} API`
    } else if (errorMessage.includes('connection')) {
      errorMessage += '\n\n💡 Tip: Check your internet connection and try again'
    }

    setModelLoadError(errorMessage)
    throw new Error(errorMessage)
  }

  // 统一处理所有Anthropic兼容提供商的模型获取
  async function fetchAnthropicCompatibleProviderModels() {
    // 根据anthropicProviderType确定默认baseURL和API key获取地址
    let defaultBaseURL: string
    let apiKeyUrl: string
    let actualProvider: string

    switch (anthropicProviderType) {
      case 'official':
        defaultBaseURL = 'https://api.anthropic.com'
        apiKeyUrl = 'https://console.anthropic.com/settings/keys'
        actualProvider = 'anthropic'
        break
      case 'bigdream':
        defaultBaseURL = 'https://api-key.info'
        apiKeyUrl = 'https://api-key.info/register?aff=MSl4'
        actualProvider = 'bigdream'
        break
      case 'opendev':
        defaultBaseURL = 'https://api.openai-next.com'
        apiKeyUrl = 'https://api.openai-next.com/register/?aff_code=4xo7'
        actualProvider = 'opendev'
        break
      case 'custom':
        defaultBaseURL = providerBaseUrl
        apiKeyUrl = 'your custom API provider'
        actualProvider = 'anthropic'
        break
      default:
        throw new Error(
          `Unsupported Anthropic provider type: ${anthropicProviderType}`,
        )
    }

    const baseURL =
      anthropicProviderType === 'custom'
        ? providerBaseUrl
        : providerBaseUrl || defaultBaseURL
    return await fetchAnthropicCompatibleModelsWithFallback(
      baseURL,
      actualProvider,
      apiKeyUrl,
    )
  }

  // Remove duplicate function definitions - using unified fetchAnthropicCompatibleProviderModels instead

  async function fetchKimiModels() {
    try {
      const baseURL = providerBaseUrl || 'https://api.moonshot.cn/v1'
      const models = await fetchCustomModels(baseURL, apiKey)

      const kimiModels = models.map((model: any) => ({
        model: model.modelName || model.id || model.name || model.model || 'unknown',
        provider: 'kimi',
        max_tokens: model.max_tokens || 8192,
        supports_vision: false, // Default to false, could be enhanced
        supports_function_calling: true,
        supports_reasoning_effort: false,
      }))

      return kimiModels
    } catch (error) {
      let errorMessage = 'Failed to fetch Kimi models'

      if (error instanceof Error) {
        errorMessage = error.message
      }

      // Add helpful suggestions based on error type
      if (errorMessage.includes('API key')) {
        errorMessage +=
          '\n\n💡 Tip: Get your API key from https://platform.moonshot.cn/console/api-keys'
      } else if (errorMessage.includes('permission')) {
        errorMessage +=
          '\n\n💡 Tip: Make sure your API key has access to the Kimi API'
      } else if (errorMessage.includes('connection')) {
        errorMessage +=
          '\n\n💡 Tip: Check your internet connection and try again'
      }

      setModelLoadError(errorMessage)
      throw error
    }
  }

  async function fetchDeepSeekModels() {
    try {
      const baseURL = providerBaseUrl || 'https://api.deepseek.com'
      const models = await fetchCustomModels(baseURL, apiKey)

      const deepseekModels = models.map((model: any) => ({
        model: model.modelName || model.id || model.name || model.model || 'unknown',
        provider: 'deepseek',
        max_tokens: model.max_tokens || 8192,
        supports_vision: false, // Default to false, could be enhanced
        supports_function_calling: true,
        supports_reasoning_effort: false,
      }))

      return deepseekModels
    } catch (error) {
      let errorMessage = 'Failed to fetch DeepSeek models'

      if (error instanceof Error) {
        errorMessage = error.message
      }

      // Add helpful suggestions based on error type
      if (errorMessage.includes('API key')) {
        errorMessage +=
          '\n\n💡 Tip: Get your API key from https://platform.deepseek.com/api_keys'
      } else if (errorMessage.includes('permission')) {
        errorMessage +=
          '\n\n💡 Tip: Make sure your API key has access to the DeepSeek API'
      } else if (errorMessage.includes('connection')) {
        errorMessage +=
          '\n\n💡 Tip: Check your internet connection and try again'
      }

      setModelLoadError(errorMessage)
      throw error
    }
  }

  async function fetchSiliconFlowModels() {
    try {
      const baseURL = providerBaseUrl || 'https://api.siliconflow.cn/v1'
      const models = await fetchCustomModels(baseURL, apiKey)

      const siliconflowModels = models.map((model: any) => ({
        model: model.modelName || model.id || model.name || model.model || 'unknown',
        provider: 'siliconflow',
        max_tokens: model.max_tokens || 8192,
        supports_vision: false, // Default to false, could be enhanced
        supports_function_calling: true,
        supports_reasoning_effort: false,
      }))

      return siliconflowModels
    } catch (error) {
      let errorMessage = 'Failed to fetch SiliconFlow models'

      if (error instanceof Error) {
        errorMessage = error.message
      }

      // Add helpful suggestions based on error type
      if (errorMessage.includes('API key')) {
        errorMessage +=
          '\n\n💡 Tip: Get your API key from https://cloud.siliconflow.cn/i/oJWsm6io'
      } else if (errorMessage.includes('permission')) {
        errorMessage +=
          '\n\n💡 Tip: Make sure your API key has access to the SiliconFlow API'
      } else if (errorMessage.includes('connection')) {
        errorMessage +=
          '\n\n💡 Tip: Check your internet connection and try again'
      }

      setModelLoadError(errorMessage)
      throw error
    }
  }

  async function fetchQwenModels() {
    try {
      const baseURL =
        providerBaseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
      const models = await fetchCustomModels(baseURL, apiKey)

      const qwenModels = models.map((model: any) => ({
        model: model.modelName || model.id || model.name || model.model || 'unknown',
        provider: 'qwen',
        max_tokens: model.max_tokens || 8192,
        supports_vision: false,
        supports_function_calling: true,
        supports_reasoning_effort: false,
      }))

      return qwenModels
    } catch (error) {
      let errorMessage = 'Failed to fetch Qwen models'

      if (error instanceof Error) {
        errorMessage = error.message
      }

      if (errorMessage.includes('API key')) {
        errorMessage +=
          '\n\n💡 Tip: Get your API key from https://bailian.console.aliyun.com/?tab=model#/api-key'
      } else if (errorMessage.includes('permission')) {
        errorMessage +=
          '\n\n💡 Tip: Make sure your API key has access to the Qwen API'
      } else if (errorMessage.includes('connection')) {
        errorMessage +=
          '\n\n💡 Tip: Check your internet connection and try again'
      }

      setModelLoadError(errorMessage)
      throw error
    }
  }

  async function fetchGLMModels() {
    try {
      const baseURL = providerBaseUrl || 'https://open.bigmodel.cn/api/paas/v4'
      const models = await fetchCustomModels(baseURL, apiKey)

      const glmModels = models.map((model: any) => ({
        model: model.modelName || model.id || model.name || model.model || 'unknown',
        provider: 'glm',
        max_tokens: model.max_tokens || 8192,
        supports_vision: false,
        supports_function_calling: true,
        supports_reasoning_effort: false,
      }))

      return glmModels
    } catch (error) {
      let errorMessage = 'Failed to fetch GLM models'

      if (error instanceof Error) {
        errorMessage = error.message
      }

      if (errorMessage.includes('API key')) {
        errorMessage +=
          '\n\n💡 Tip: Get your API key from https://open.bigmodel.cn (API Keys section)'
      } else if (errorMessage.includes('permission')) {
        errorMessage +=
          '\n\n💡 Tip: Make sure your API key has access to the GLM API'
      } else if (errorMessage.includes('connection')) {
        errorMessage +=
          '\n\n💡 Tip: Check your internet connection and try again'
      }

      setModelLoadError(errorMessage)
      throw error
    }
  }

  async function fetchMinimaxModels() {
    try {
      const baseURL = providerBaseUrl || 'https://api.minimaxi.com/v1'
      const models = await fetchCustomModels(baseURL, apiKey)

      const minimaxModels = models.map((model: any) => ({
        model: model.modelName || model.id || model.name || model.model || 'unknown',
        provider: 'minimax',
        max_tokens: model.max_tokens || 8192,
        supports_vision: false,
        supports_function_calling: true,
        supports_reasoning_effort: false,
      }))

      return minimaxModels
    } catch (error) {
      let errorMessage = 'Failed to fetch MiniMax models'

      if (error instanceof Error) {
        errorMessage = error.message
      }

      if (errorMessage.includes('API key')) {
        errorMessage +=
          '\n\n💡 Tip: Get your API key from https://www.minimax.io/platform/user-center/basic-information'
      } else if (errorMessage.includes('permission')) {
        errorMessage +=
          '\n\n💡 Tip: Make sure your API key has access to the MiniMax API'
      } else if (errorMessage.includes('connection')) {
        errorMessage +=
          '\n\n💡 Tip: Check your internet connection and try again'
      }

      setModelLoadError(errorMessage)
      throw error
    }
  }

  async function fetchBaiduQianfanModels() {
    try {
      const baseURL = providerBaseUrl || 'https://qianfan.baidubce.com/v2'
      const models = await fetchCustomModels(baseURL, apiKey)

      const baiduModels = models.map((model: any) => ({
        model: model.modelName || model.id || model.name || model.model || 'unknown',
        provider: 'baidu-qianfan',
        max_tokens: model.max_tokens || 8192,
        supports_vision: false,
        supports_function_calling: true,
        supports_reasoning_effort: false,
      }))

      return baiduModels
    } catch (error) {
      let errorMessage = 'Failed to fetch Baidu Qianfan models'

      if (error instanceof Error) {
        errorMessage = error.message
      }

      if (errorMessage.includes('API key')) {
        errorMessage +=
          '\n\n💡 Tip: Get your API key from https://console.bce.baidu.com/iam/#/iam/accesslist'
      } else if (errorMessage.includes('permission')) {
        errorMessage +=
          '\n\n💡 Tip: Make sure your API key has access to the Baidu Qianfan API'
      } else if (errorMessage.includes('connection')) {
        errorMessage +=
          '\n\n💡 Tip: Check your internet connection and try again'
      }

      setModelLoadError(errorMessage)
      throw error
    }
  }

  async function fetchCustomOpenAIModels() {
    try {
      const models = await fetchCustomModels(customBaseUrl, apiKey)

      const customModels = models.map((model: any) => ({
        model: model.modelName || model.id || model.name || model.model || 'unknown',
        provider: 'custom-openai',
        max_tokens: model.max_tokens || 4096,
        supports_vision: false, // Default to false, could be enhanced
        supports_function_calling: true,
        supports_reasoning_effort: false,
      }))

      return customModels
    } catch (error) {
      let errorMessage = 'Failed to fetch custom API models'

      if (error instanceof Error) {
        errorMessage = error.message
      }

      // Add helpful suggestions based on error type
      if (errorMessage.includes('API key')) {
        errorMessage +=
          '\n\n💡 Tip: Check that your API key is valid for this endpoint'
      } else if (errorMessage.includes('endpoint not found')) {
        errorMessage +=
          '\n\n💡 Tip: Make sure the base URL ends with /v1 and supports OpenAI-compatible API'
      } else if (errorMessage.includes('connect')) {
        errorMessage +=
          '\n\n💡 Tip: Verify the base URL is correct and accessible'
      } else if (errorMessage.includes('response format')) {
        errorMessage +=
          '\n\n💡 Tip: This API may not be fully OpenAI-compatible'
      }

      setModelLoadError(errorMessage)
      throw error
    }
  }

  async function fetchGeminiModels() {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(
          errorData.error?.message || `API error: ${response.status}`,
        )
      }

      const { models } = await response.json()

      const geminiModels = models
        .filter((model: any) =>
          model.supportedGenerationMethods.includes('generateContent'),
        )
        .map((model: any) => ({
          model: model.name.replace('models/', ''),
          provider: 'gemini',
          max_tokens: model.outputTokenLimit,
          supports_vision:
            model.supportedGenerationMethods.includes('generateContent'),
          supports_function_calling:
            model.supportedGenerationMethods.includes('generateContent'),
        }))

      return geminiModels
    } catch (error) {
      setModelLoadError(
        error instanceof Error ? error.message : 'Unknown error',
      )
      throw error
    }
  }

  async function fetchOllamaModels() {
    try {
      const response = await fetch(`${ollamaBaseUrl}/models`)

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`)
      }

      const responseData = await response.json()

      // Properly handle Ollama API response format
      // Ollama API can return models in different formats based on version
      let models = []

      // Check if data field exists (newer Ollama versions)
      if (responseData.data && Array.isArray(responseData.data)) {
        models = responseData.data
      }
      // Check if models array is directly at the root (older Ollama versions)
      else if (Array.isArray(responseData.models)) {
        models = responseData.models
      }
      // If response is already an array
      else if (Array.isArray(responseData)) {
        models = responseData
      } else {
        throw new Error(
          'Invalid response from Ollama API: missing models array',
        )
      }

      // Transform Ollama models to our format
      const ollamaModels = models.map((model: any) => ({
        model:
          model.name ??
          model.modelName ??
          (typeof model === 'string' ? model : ''),
        provider: 'ollama',
        max_tokens: 4096, // Default value
        supports_vision: false,
        supports_function_calling: true,
        supports_reasoning_effort: false,
      }))

      // Filter out models with empty names
      const validModels = ollamaModels.filter(model => model.model)

      setAvailableModels(validModels)

      // Only navigate if we have models
      if (validModels.length > 0) {
        navigateTo('model')
      } else {
        setModelLoadError('No models found in your Ollama installation')
      }

      return validModels
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)

      if (errorMessage.includes('fetch')) {
        setModelLoadError(
          `Could not connect to Ollama server at ${ollamaBaseUrl}. Make sure Ollama is running and the URL is correct.`,
        )
      } else {
        setModelLoadError(`Error loading Ollama models: ${errorMessage}`)
      }

      console.error('Error fetching Ollama models:', error)
      return []
    }
  }

  async function fetchModelsWithRetry() {
    const MAX_RETRIES = 2
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      setFetchRetryCount(attempt)
      setIsRetrying(attempt > 1)

      if (attempt > 1) {
        // Show retry message
        setModelLoadError(
          `Attempt ${attempt}/${MAX_RETRIES}: Retrying model discovery...`,
        )
        // Wait 1 second before retrying
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      try {
        const models = await fetchModels()
        // Success! Reset retry state and return models
        setFetchRetryCount(0)
        setIsRetrying(false)
        setModelLoadError(null)
        return models
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        console.log(`Model fetch attempt ${attempt} failed:`, lastError.message)

        if (attempt === MAX_RETRIES) {
          // Final attempt failed, break to handle fallback
          break
        }
      }
    }

    // All retries failed, handle fallback to manual input
    setIsRetrying(false)
    const errorMessage = lastError?.message || 'Unknown error'

    // Check if provider supports manual input fallback
    const supportsManualInput = [
      'anthropic',
      'kimi',
      'deepseek',
      'siliconflow',
      'qwen',
      'glm',
      'minimax',
      'baidu-qianfan',
      'custom-openai',
    ].includes(selectedProvider)

    if (supportsManualInput) {
      setModelLoadError(
        `Failed to auto-discover models after ${MAX_RETRIES} attempts: ${errorMessage}\n\n⚡ Automatically switching to manual model configuration...`,
      )

      // Automatically switch to manual input after 2 seconds
      setTimeout(() => {
        setModelLoadError(null)
        navigateTo('modelInput')
      }, 2000)
    } else {
      setModelLoadError(
        `Failed to load models after ${MAX_RETRIES} attempts: ${errorMessage}`,
      )
    }

    return []
  }

  async function fetchModels() {
    setIsLoadingModels(true)
    setModelLoadError(null)

    try {
      // For Anthropic provider (including official and community proxies via sub-menu), use the same logic
      if (selectedProvider === 'anthropic') {
        const anthropicModels = await fetchAnthropicCompatibleProviderModels()
        setAvailableModels(anthropicModels)
        navigateTo('model')
        return anthropicModels
      }

      // For custom OpenAI-compatible APIs, use the fetchCustomOpenAIModels function
      if (selectedProvider === 'custom-openai') {
        const customModels = await fetchCustomOpenAIModels()
        setAvailableModels(customModels)
        navigateTo('model')
        return customModels
      }

      // For Gemini, use the separate fetchGeminiModels function
      if (selectedProvider === 'gemini') {
        const geminiModels = await fetchGeminiModels()
        setAvailableModels(geminiModels)
        navigateTo('model')
        return geminiModels
      }

      // For Kimi, use the fetchKimiModels function
      if (selectedProvider === 'kimi') {
        const kimiModels = await fetchKimiModels()
        setAvailableModels(kimiModels)
        navigateTo('model')
        return kimiModels
      }

      // For DeepSeek, use the fetchDeepSeekModels function
      if (selectedProvider === 'deepseek') {
        const deepseekModels = await fetchDeepSeekModels()
        setAvailableModels(deepseekModels)
        navigateTo('model')
        return deepseekModels
      }

      // For SiliconFlow, use the fetchSiliconFlowModels function
      if (selectedProvider === 'siliconflow') {
        const siliconflowModels = await fetchSiliconFlowModels()
        setAvailableModels(siliconflowModels)
        navigateTo('model')
        return siliconflowModels
      }

      // For Qwen, use the fetchQwenModels function
      if (selectedProvider === 'qwen') {
        const qwenModels = await fetchQwenModels()
        setAvailableModels(qwenModels)
        navigateTo('model')
        return qwenModels
      }

      // For GLM, use the fetchGLMModels function
      if (selectedProvider === 'glm') {
        const glmModels = await fetchGLMModels()
        setAvailableModels(glmModels)
        navigateTo('model')
        return glmModels
      }

      // For Baidu Qianfan, use the fetchBaiduQianfanModels function
      if (selectedProvider === 'baidu-qianfan') {
        const baiduModels = await fetchBaiduQianfanModels()
        setAvailableModels(baiduModels)
        navigateTo('model')
        return baiduModels
      }

      // For Azure, skip model fetching and go directly to model input
      if (selectedProvider === 'azure') {
        navigateTo('modelInput')
        return []
      }

      // For all other providers, use the OpenAI client
      let baseURL = providerBaseUrl || providers[selectedProvider]?.baseURL

      // For custom-openai provider, use the custom base URL
      if (selectedProvider === 'custom-openai') {
        baseURL = customBaseUrl
      }

      const openai = new OpenAI({
        apiKey: apiKey || 'dummy-key-for-ollama', // Ollama doesn't need a real key
        baseURL: baseURL,
        dangerouslyAllowBrowser: true,
      })

      // Fetch the models
      const response = await openai.models.list()

      // Transform the response into our ModelInfo format
      const fetchedModels = []
      for (const model of response.data) {
        const modelName = (model as any).modelName || (model as any).id || (model as any).name || (model as any).model || 'unknown'
        const modelInfo = models[selectedProvider as keyof typeof models]?.find(
          m => m.model === modelName,
        )
        fetchedModels.push({
          model: modelName,
          provider: selectedProvider,
          max_tokens: modelInfo?.max_output_tokens,
          supports_vision: modelInfo?.supports_vision || false,
          supports_function_calling:
            modelInfo?.supports_function_calling || false,
          supports_reasoning_effort:
            modelInfo?.supports_reasoning_effort || false,
        })
      }

      setAvailableModels(fetchedModels)

      // Navigate to model selection screen if models were loaded successfully
      navigateTo('model')

      return fetchedModels
    } catch (error) {
      // Log for debugging
      console.error('Error fetching models:', error)

      // Re-throw the error so that fetchModelsWithRetry can handle it properly
      throw error
    } finally {
      setIsLoadingModels(false)
    }
  }

  function handleApiKeySubmit(key: string) {
    setApiKey(key)

    // For Azure, go to resource name input next
    if (selectedProvider === 'azure') {
      navigateTo('resourceName')
      return
    }

    // Fetch models with the provided API key
    fetchModelsWithRetry().catch(error => {
      // The retry logic in fetchModelsWithRetry already handles the error display
      // This catch is just to prevent unhandled promise rejection
      console.error('Final error after retries:', error)
    })
  }

  function handleResourceNameSubmit(name: string) {
    setResourceName(name)
    navigateTo('modelInput')
  }

  function handleOllamaBaseUrlSubmit(url: string) {
    setOllamaBaseUrl(url)
    setIsLoadingModels(true)
    setModelLoadError(null)

    // Use the dedicated Ollama model fetch function
    fetchOllamaModels().finally(() => {
      setIsLoadingModels(false)
    })
  }

  function handleCustomBaseUrlSubmit(url: string) {
    // Automatically remove trailing slash from baseURL
    const cleanUrl = url.replace(/\/+$/, '')
    setCustomBaseUrl(cleanUrl)
    // After setting custom base URL, go to API key input
    navigateTo('apiKey')
  }

  function handleProviderBaseUrlSubmit(url: string) {
    // Automatically remove trailing slash from baseURL
    const cleanUrl = url.replace(/\/+$/, '')
    setProviderBaseUrl(cleanUrl)

    // For Ollama, handle differently - it tries to fetch models immediately
    if (selectedProvider === 'ollama') {
      setOllamaBaseUrl(cleanUrl)
      setIsLoadingModels(true)
      setModelLoadError(null)

      // Use the dedicated Ollama model fetch function
      fetchOllamaModels().finally(() => {
        setIsLoadingModels(false)
      })
    } else {
      // For all other providers, go to API key input next
      navigateTo('apiKey')
    }
  }

  function handleAnthropicProviderSelection(
    providerType: 'official' | 'bigdream' | 'custom',
  ) {
    setAnthropicProviderType(providerType)

    if (providerType === 'custom') {
      // For custom Anthropic provider, go to base URL configuration
      setProviderBaseUrl('')
      navigateTo('baseUrl')
    } else {
      // For official/community proxy providers, set default base URL and go to API key
      const defaultUrls = {
        official: 'https://api.anthropic.com',
        bigdream: 'https://api-key.info',
        opendev: 'https://api.openai-next.com',
      }
      setProviderBaseUrl(defaultUrls[providerType])
      navigateTo('apiKey')
    }
  }

  function handleCustomModelSubmit(model: string) {
    setCustomModelName(model)
    setSelectedModel(model)

    // No model info available, so set default values
    setSupportsReasoningEffort(false)
    setReasoningEffort(null)

    // Use default max tokens for manually entered models
    setMaxTokensMode('preset')
    setSelectedMaxTokensPreset(DEFAULT_MAX_TOKENS)
    setMaxTokens(DEFAULT_MAX_TOKENS.toString())
    setMaxTokensCursorOffset(DEFAULT_MAX_TOKENS.toString().length)

    // Go to model parameters screen
    navigateTo('modelParams')
    // Reset active field index
    setActiveFieldIndex(0)
  }

  function handleModelSelection(model: string) {
    setSelectedModel(model)

    // Check if the selected model supports reasoning_effort
    const modelInfo = availableModels.find(m => m.model === model)
    setSupportsReasoningEffort(modelInfo?.supports_reasoning_effort || false)

    if (!modelInfo?.supports_reasoning_effort) {
      setReasoningEffort(null)
    }

    // Set max tokens based on model info or default
    if (modelInfo?.max_tokens) {
      const modelMaxTokens = modelInfo.max_tokens
      // Check if the model's max tokens matches any of our presets
      const matchingPreset = MAX_TOKENS_OPTIONS.find(
        option => option.value === modelMaxTokens,
      )

      if (matchingPreset) {
        setMaxTokensMode('preset')
        setSelectedMaxTokensPreset(modelMaxTokens)
        setMaxTokens(modelMaxTokens.toString())
      } else {
        setMaxTokensMode('custom')
        setMaxTokens(modelMaxTokens.toString())
      }
      setMaxTokensCursorOffset(modelMaxTokens.toString().length)
    } else {
      // No model-specific max tokens, use default
      setMaxTokensMode('preset')
      setSelectedMaxTokensPreset(DEFAULT_MAX_TOKENS)
      setMaxTokens(DEFAULT_MAX_TOKENS.toString())
      setMaxTokensCursorOffset(DEFAULT_MAX_TOKENS.toString().length)
    }

    // Go to model parameters screen
    navigateTo('modelParams')
    // Reset active field index
    setActiveFieldIndex(0)
  }

  const handleModelParamsSubmit = () => {
    // Values are already in state, no need to extract from form
    // Ensure contextLength is set to a valid option before navigating
    if (!CONTEXT_LENGTH_OPTIONS.find(opt => opt.value === contextLength)) {
      setContextLength(DEFAULT_CONTEXT_LENGTH)
    }
    // Navigate to context length screen
    navigateTo('contextLength')
  }

  async function testConnection(): Promise<{
    success: boolean
    message: string
    endpoint?: string
    details?: string
  }> {
    setIsTestingConnection(true)
    setConnectionTestResult(null)

    try {
      // Determine the base URL to test
      let testBaseURL =
        providerBaseUrl || providers[selectedProvider]?.baseURL || ''

      if (selectedProvider === 'azure') {
        testBaseURL = `https://${resourceName}.openai.azure.com/openai/deployments/${selectedModel}`
      } else if (selectedProvider === 'custom-openai') {
        testBaseURL = customBaseUrl
      }

      // For OpenAI-compatible providers, try multiple endpoints in order of preference
      const isOpenAICompatible = [
        'minimax',
        'kimi',
        'deepseek',
        'siliconflow',
        'qwen',
        'glm',
        'baidu-qianfan',
        'openai',
        'mistral',
        'xai',
        'groq',
        'custom-openai',
      ].includes(selectedProvider)

      if (isOpenAICompatible) {
        // 🔥 Use specialized GPT-5 connection test for GPT-5 models
        const isGPT5 = selectedModel?.toLowerCase().includes('gpt-5')
        
        if (isGPT5) {
          console.log(`🚀 Using specialized GPT-5 connection test for model: ${selectedModel}`)
          
          // Validate configuration first
          const configValidation = validateGPT5Config({
            model: selectedModel,
            apiKey: apiKey,
            baseURL: testBaseURL,
            maxTokens: parseInt(maxTokens) || 8192,
            provider: selectedProvider,
          })
          
          if (!configValidation.valid) {
            return {
              success: false,
              message: '❌ GPT-5 configuration validation failed',
              details: configValidation.errors.join('\n'),
            }
          }
          
          // Use specialized GPT-5 test service
          const gpt5Result = await testGPT5Connection({
            model: selectedModel,
            apiKey: apiKey,
            baseURL: testBaseURL,
            maxTokens: parseInt(maxTokens) || 8192,
            provider: selectedProvider,
          })
          
          return gpt5Result
        }
        
        // For non-GPT-5 OpenAI-compatible models, use existing logic
        const endpointsToTry = []

        if (selectedProvider === 'minimax') {
          endpointsToTry.push(
            {
              path: '/text/chatcompletion_v2',
              name: 'MiniMax v2 (recommended)',
            },
            { path: '/chat/completions', name: 'Standard OpenAI' },
          )
        } else {
          endpointsToTry.push({
            path: '/chat/completions',
            name: 'Standard OpenAI',
          })
        }

        let lastError = null
        for (const endpoint of endpointsToTry) {
          try {
            const testResult = await testChatEndpoint(
              testBaseURL,
              endpoint.path,
              endpoint.name,
            )
            
            if (testResult.success) {
              return testResult
            }
            lastError = testResult
          } catch (error) {
            lastError = {
              success: false,
              message: `Failed to test ${endpoint.name}`,
              endpoint: endpoint.path,
              details: error instanceof Error ? error.message : String(error),
            }
          }
        }

        return (
          lastError || {
            success: false,
            message: 'All endpoints failed',
            details: 'No endpoints could be reached',
          }
        )
      } else {
        // For non-OpenAI providers (like Anthropic, Gemini), use different test approach
        return await testProviderSpecificEndpoint(testBaseURL)
      }
    } catch (error) {
      return {
        success: false,
        message: 'Connection test failed',
        details: error instanceof Error ? error.message : String(error),
      }
    } finally {
      setIsTestingConnection(false)
    }
  }

  async function testChatEndpoint(
    baseURL: string,
    endpointPath: string,
    endpointName: string,
  ): Promise<{
    success: boolean
    message: string
    endpoint?: string
    details?: string
  }> {
    const testURL = `${baseURL.replace(/\/+$/, '')}${endpointPath}`

    // Create a test message that expects a specific response
    const testPayload: any = {
      model: selectedModel,
      messages: [
        {
          role: 'user',
          content:
            'Please respond with exactly "YES" (in capital letters) to confirm this connection is working.',
        },
      ],
      max_tokens: Math.max(parseInt(maxTokens) || 8192, 8192), // Ensure minimum 8192 tokens for connection test
      temperature: 0,
      stream: false,
    }

    // GPT-5 parameter compatibility fix
    if (selectedModel && selectedModel.toLowerCase().includes('gpt-5')) {
      console.log(`Applying GPT-5 parameter fix for model: ${selectedModel}`)
      
      // GPT-5 requires max_completion_tokens instead of max_tokens
      if (testPayload.max_tokens) {
        testPayload.max_completion_tokens = testPayload.max_tokens
        delete testPayload.max_tokens
        console.log(`Transformed max_tokens → max_completion_tokens: ${testPayload.max_completion_tokens}`)
      }
      
      // GPT-5 temperature handling - ensure it's 1 or undefined
      if (testPayload.temperature !== undefined && testPayload.temperature !== 1) {
        console.log(`Adjusting temperature from ${testPayload.temperature} to 1 for GPT-5`)
        testPayload.temperature = 1
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    // Add authorization headers
    if (selectedProvider === 'azure') {
      headers['api-key'] = apiKey
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    try {
      const response = await fetch(testURL, {
        method: 'POST',
        headers,
        body: JSON.stringify(testPayload),
      })

      if (response.ok) {
        const data = await response.json()
        console.log(
          '[DEBUG] Connection test response:',
          JSON.stringify(data, null, 2),
        )

        // Check if we got a valid response with content
        let responseContent = ''

        if (data.choices && data.choices.length > 0) {
          responseContent = data.choices[0]?.message?.content || ''
        } else if (data.reply) {
          // Handle MiniMax format
          responseContent = data.reply
        } else if (data.output) {
          // Handle other formats
          responseContent = data.output?.text || data.output || ''
        }

        console.log('[DEBUG] Extracted response content:', responseContent)

        // Check if response contains "YES" (case insensitive)
        const containsYes = responseContent.toLowerCase().includes('yes')

        if (containsYes) {
          return {
            success: true,
            message: `✅ Connection test passed with ${endpointName}`,
            endpoint: endpointPath,
            details: `Model responded correctly: "${responseContent.trim()}"`,
          }
        } else {
          return {
            success: false,
            message: `⚠️ ${endpointName} connected but model response unexpected`,
            endpoint: endpointPath,
            details: `Expected "YES" but got: "${responseContent.trim() || '(empty response)'}"`,
          }
        }
      } else {
        const errorData = await response.json().catch(() => null)
        const errorMessage =
          errorData?.error?.message || errorData?.message || response.statusText

        return {
          success: false,
          message: `❌ ${endpointName} failed (${response.status})`,
          endpoint: endpointPath,
          details: `Error: ${errorMessage}`,
        }
      }
    } catch (error) {
      return {
        success: false,
        message: `❌ ${endpointName} connection failed`,
        endpoint: endpointPath,
        details: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async function testResponsesEndpoint(
    baseURL: string,
    endpointPath: string,
    endpointName: string,
  ): Promise<{
    success: boolean
    message: string
    endpoint?: string
    details?: string
  }> {
    const testURL = `${baseURL.replace(/\/+$/, '')}${endpointPath}`

    // 🔧 Enhanced GPT-5 Responses API test payload
    const testPayload: any = {
      model: selectedModel,
      input: [
        {
          role: 'user',
          content:
            'Please respond with exactly "YES" (in capital letters) to confirm this connection is working.',
        },
      ],
      max_completion_tokens: Math.max(parseInt(maxTokens) || 8192, 8192),
      temperature: 1, // GPT-5 only supports temperature=1
      // 🚀 Add reasoning configuration for better GPT-5 performance
      reasoning: {
        effort: 'low', // Fast response for connection test
      },
    }

    console.log(`🔧 Testing GPT-5 Responses API for model: ${selectedModel}`)
    console.log(`🔧 Test URL: ${testURL}`)
    console.log(`🔧 Test payload:`, JSON.stringify(testPayload, null, 2))

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    }

    try {
      const response = await fetch(testURL, {
        method: 'POST',
        headers,
        body: JSON.stringify(testPayload),
      })

      if (response.ok) {
        const data = await response.json()
        console.log(
          '[DEBUG] Responses API connection test response:',
          JSON.stringify(data, null, 2),
        )

        // Extract content from Responses API format
        let responseContent = ''
        
        if (data.output_text) {
          responseContent = data.output_text
        } else if (data.output) {
          responseContent = typeof data.output === 'string' ? data.output : data.output.text || ''
        }

        console.log('[DEBUG] Extracted response content:', responseContent)

        // Check if response contains "YES" (case insensitive)
        const containsYes = responseContent.toLowerCase().includes('yes')

        if (containsYes) {
          return {
            success: true,
            message: `✅ Connection test passed with ${endpointName}`,
            endpoint: endpointPath,
            details: `GPT-5 responded correctly via Responses API: "${responseContent.trim()}"`,
          }
        } else {
          return {
            success: false,
            message: `⚠️ ${endpointName} connected but model response unexpected`,
            endpoint: endpointPath,
            details: `Expected "YES" but got: "${responseContent.trim() || '(empty response)'}"`,
          }
        }
      } else {
        // 🔧 Enhanced error handling with detailed debugging
        const errorData = await response.json().catch(() => null)
        const errorMessage =
          errorData?.error?.message || errorData?.message || response.statusText
        
        console.log(`🚨 GPT-5 Responses API Error (${response.status}):`, errorData)
        
        // 🔧 Provide specific guidance for common GPT-5 errors
        let details = `Responses API Error: ${errorMessage}`
        if (response.status === 400 && errorMessage.includes('max_tokens')) {
          details += '\n🔧 Note: This appears to be a parameter compatibility issue. The fallback to Chat Completions should handle this.'
        } else if (response.status === 404) {
          details += '\n🔧 Note: Responses API endpoint may not be available for this model or provider.'
        } else if (response.status === 401) {
          details += '\n🔧 Note: API key authentication failed.'
        }
        
        return {
          success: false,
          message: `❌ ${endpointName} failed (${response.status})`,
          endpoint: endpointPath,
          details: details,
        }
      }
    } catch (error) {
      return {
        success: false,
        message: `❌ ${endpointName} connection failed`,
        endpoint: endpointPath,
        details: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async function testProviderSpecificEndpoint(baseURL: string): Promise<{
    success: boolean
    message: string
    endpoint?: string
    details?: string
  }> {
    // For Anthropic and Anthropic-compatible providers, use the official SDK for testing
    if (selectedProvider === 'anthropic' || selectedProvider === 'bigdream') {
      try {
        console.log(
          `[DEBUG] Testing ${selectedProvider} connection using official Anthropic SDK...`,
        )

        // Determine the baseURL for testing
        let testBaseURL: string | undefined = undefined
        if (selectedProvider === 'bigdream') {
          testBaseURL = baseURL || 'https://api-key.info'
        } else if (selectedProvider === 'anthropic') {
          // For anthropic, use user-provided baseURL if available, otherwise undefined (official API)
          testBaseURL =
            baseURL && baseURL !== 'https://api.anthropic.com'
              ? baseURL
              : undefined
        }

        // Use the verifyApiKey function which uses the official Anthropic SDK
        const isValid = await verifyApiKey(apiKey, testBaseURL, selectedProvider)

        if (isValid) {
          return {
            success: true,
            message: `✅ ${selectedProvider} connection test passed`,
            endpoint: '/messages',
            details: 'API key verified using official Anthropic SDK',
          }
        } else {
          return {
            success: false,
            message: `❌ ${selectedProvider} API key verification failed`,
            endpoint: '/messages',
            details:
              'Invalid API key. Please check your API key and try again.',
          }
        }
      } catch (error) {
        console.log(`[DEBUG] ${selectedProvider} connection test error:`, error)
        return {
          success: false,
          message: `❌ ${selectedProvider} connection failed`,
          endpoint: '/messages',
          details: error instanceof Error ? error.message : String(error),
        }
      }
    }

    // For other providers, return a placeholder success (we can extend this later)
    return {
      success: true,
      message: `✅ Configuration saved for ${selectedProvider}`,
      details: 'Provider-specific testing not implemented yet',
    }
  }

  async function handleConnectionTest() {
    const result = await testConnection()
    setConnectionTestResult(result)

    if (result.success) {
      // Auto-advance to confirmation after a short delay
      setTimeout(() => {
        navigateTo('confirmation')
      }, 2000)
    }
  }

  const handleContextLengthSubmit = () => {
    // Context length value is already in state
    // Navigate to connection test screen
    navigateTo('connectionTest')
  }

  async function saveConfiguration(
    provider: ProviderType,
    model: string,
  ): Promise<string | null> {
    let baseURL = providerBaseUrl || providers[provider]?.baseURL || ''
    let actualProvider = provider

    // For Anthropic provider, determine the actual provider based on sub-menu selection
    if (provider === 'anthropic') {
      switch (anthropicProviderType) {
        case 'official':
          actualProvider = 'anthropic'
          baseURL = baseURL || 'https://api.anthropic.com'
          break
        case 'bigdream':
          actualProvider = 'bigdream'
          baseURL = baseURL || 'https://api-key.info'
          break
        case 'custom':
          actualProvider = 'anthropic' // Use anthropic for custom endpoints
          // baseURL is already set from user input
          break
      }
    }

    // For Azure, construct the baseURL using the resource name
    if (provider === 'azure') {
      baseURL = `https://${resourceName}.openai.azure.com/openai/deployments/${model}`
    }
    // For custom OpenAI-compatible API, use the custom base URL
    else if (provider === 'custom-openai') {
      baseURL = customBaseUrl
    }

    try {
      // Use ModelManager's addModel method for duplicate validation
      const modelManager = getModelManager()

      const modelConfig = {
        name: `${actualProvider} ${model}`,
        provider: actualProvider,
        modelName: model,
        baseURL: baseURL,
        apiKey: apiKey || '',
        maxTokens: parseInt(maxTokens) || DEFAULT_MAX_TOKENS,
        contextLength: contextLength || DEFAULT_CONTEXT_LENGTH,
        reasoningEffort,
      }

      // addModel method will throw error if duplicate exists
      return await modelManager.addModel(modelConfig)
    } catch (error) {
      // Validation failed - show error to user
      setValidationError(
        error instanceof Error ? error.message : 'Failed to add model',
      )
      return null
    }
  }

  async function handleConfirmation() {
    // Clear any previous validation errors
    setValidationError(null)

    // Save the configuration and exit
    const modelId = await saveConfiguration(selectedProvider, selectedModel)

    // If validation failed (modelId is null), don't proceed
    if (!modelId) {
      return // Error is already set in saveConfiguration
    }

    // Handle model pointer assignment for new system
    if (modelId && (isOnboarding || targetPointer)) {
      if (isOnboarding) {
        // First-time setup: set all pointers to this model
        setAllPointersToModel(modelId)
      } else if (targetPointer) {
        // Specific pointer configuration: only set target pointer
        setModelPointer(targetPointer, modelId)
      }
    }

    onDone()
  }

  // Handle back navigation based on current screen
  const handleBack = () => {
    if (currentScreen === 'provider') {
      // If we're at the first screen, exit
      if (onCancel) {
        onCancel()
      } else {
        onDone()
      }
    } else {
      // Remove the current screen from the stack
      setScreenStack(prev => prev.slice(0, -1))
    }
  }

  // Use escape navigation hook
  useEscapeNavigation(handleBack, abortController)

  // Handle cursor offset changes
  function handleCursorOffsetChange(offset: number) {
    setCursorOffset(offset)
  }

  // Handle API key changes
  function handleApiKeyChange(value: string) {
    setApiKeyEdited(true)
    setApiKey(value)
  }

  // Handle model search query changes
  function handleModelSearchChange(value: string) {
    setModelSearchQuery(value)
    // Update cursor position to end of text when typing
    setModelSearchCursorOffset(value.length)
  }

  // Handle model search cursor offset changes
  function handleModelSearchCursorOffsetChange(offset: number) {
    setModelSearchCursorOffset(offset)
  }

  // Handle input for Resource Name screen
  useInput((input, key) => {
    // Handle API key submission on Enter
    if (currentScreen === 'apiKey' && key.return) {
      if (apiKey) {
        handleApiKeySubmit(apiKey)
      }
      return
    }

    if (currentScreen === 'apiKey' && key.tab) {
      // For providers that support manual model input, skip to manual model input
      if (
        selectedProvider === 'anthropic' ||
        selectedProvider === 'kimi' ||
        selectedProvider === 'deepseek' ||
        selectedProvider === 'qwen' ||
        selectedProvider === 'glm' ||
        selectedProvider === 'minimax' ||
        selectedProvider === 'baidu-qianfan' ||
        selectedProvider === 'siliconflow' ||
        selectedProvider === 'custom-openai'
      ) {
        navigateTo('modelInput')
        return
      }

      // For other providers, try to fetch models without API key
      fetchModelsWithRetry().catch(error => {
        // The retry logic in fetchModelsWithRetry already handles the error display
        // This catch is just to prevent unhandled promise rejection
        console.error('Final error after retries:', error)
      })
      return
    }

    // Handle Resource Name submission on Enter
    if (currentScreen === 'resourceName' && key.return) {
      if (resourceName) {
        handleResourceNameSubmit(resourceName)
      }
      return
    }

    // Handle Base URL submission on Enter
    if (currentScreen === 'baseUrl' && key.return) {
      if (selectedProvider === 'custom-openai') {
        handleCustomBaseUrlSubmit(customBaseUrl)
      } else {
        // For all other providers (including ollama), use the general handler
        handleProviderBaseUrlSubmit(providerBaseUrl)
      }
      return
    }

    // Handle Custom Model Name submission on Enter
    if (currentScreen === 'modelInput' && key.return) {
      if (customModelName) {
        handleCustomModelSubmit(customModelName)
      }
      return
    }

    // Handle confirmation on Enter
    if (currentScreen === 'confirmation' && key.return) {
      handleConfirmation().catch(error => {
        console.error('Error in handleConfirmation:', error)
        setValidationError(
          error instanceof Error ? error.message : 'Unexpected error occurred',
        )
      })
      return
    }

    // Handle connection test
    if (currentScreen === 'connectionTest') {
      if (key.return) {
        if (!isTestingConnection && !connectionTestResult) {
          handleConnectionTest()
        } else if (connectionTestResult && connectionTestResult.success) {
          navigateTo('confirmation')
        } else if (connectionTestResult && !connectionTestResult.success) {
          // Retry the test
          handleConnectionTest()
        }
        return
      }
    }

    // Handle context length selection
    if (currentScreen === 'contextLength') {
      if (key.return) {
        handleContextLengthSubmit()
        return
      }

      if (key.upArrow) {
        const currentIndex = CONTEXT_LENGTH_OPTIONS.findIndex(
          opt => opt.value === contextLength,
        )
        const newIndex =
          currentIndex > 0
            ? currentIndex - 1
            : currentIndex === -1
              ? CONTEXT_LENGTH_OPTIONS.findIndex(
                  opt => opt.value === DEFAULT_CONTEXT_LENGTH,
                ) || 0
              : CONTEXT_LENGTH_OPTIONS.length - 1
        setContextLength(CONTEXT_LENGTH_OPTIONS[newIndex].value)
        return
      }

      if (key.downArrow) {
        const currentIndex = CONTEXT_LENGTH_OPTIONS.findIndex(
          opt => opt.value === contextLength,
        )
        const newIndex =
          currentIndex === -1
            ? CONTEXT_LENGTH_OPTIONS.findIndex(
                opt => opt.value === DEFAULT_CONTEXT_LENGTH,
              ) || 0
            : (currentIndex + 1) % CONTEXT_LENGTH_OPTIONS.length
        setContextLength(CONTEXT_LENGTH_OPTIONS[newIndex].value)
        return
      }
    }

    // Handle paste event (Ctrl+V or Cmd+V)
    if (
      currentScreen === 'apiKey' &&
      ((key.ctrl && input === 'v') || (key.meta && input === 'v'))
    ) {
      // We can't directly access clipboard in terminal, but we can show a message
      setModelLoadError(
        "Please use your terminal's paste functionality or type the API key manually",
      )
      return
    }

    // Handle Tab key for form navigation in model params screen
    if (currentScreen === 'modelParams' && key.tab) {
      const formFields = getFormFieldsForModelParams()
      // Move to next field
      setActiveFieldIndex(current => (current + 1) % formFields.length)
      return
    }

    // Handle Enter key for form submission in model params screen
    if (currentScreen === 'modelParams' && key.return) {
      const formFields = getFormFieldsForModelParams()
      const currentField = formFields[activeFieldIndex]

      if (
        currentField.name === 'submit' ||
        activeFieldIndex === formFields.length - 1
      ) {
        // If on the Continue button, submit the form
        handleModelParamsSubmit()
      } else if (currentField.component === 'select') {
        // For select fields, move to the next field (since selection should be handled by Select component)
        setActiveFieldIndex(current =>
          Math.min(current + 1, formFields.length - 1),
        )
      }
      return
    }
  })

  // Helper function to get form fields for model params
  function getFormFieldsForModelParams() {
    return [
      {
        name: 'maxTokens',
        label: 'Maximum Tokens',
        description: 'Select the maximum number of tokens to generate.',
        value: parseInt(maxTokens),
        component: 'select',
        options: MAX_TOKENS_OPTIONS.map(option => ({
          label: option.label,
          value: option.value.toString(),
        })),
        defaultValue: maxTokens,
      },
      ...(supportsReasoningEffort
        ? [
            {
              name: 'reasoningEffort',
              label: 'Reasoning Effort',
              description: 'Controls reasoning depth for complex problems.',
              value: reasoningEffort,
              component: 'select',
            },
          ]
        : []),
      {
        name: 'submit',
        label: 'Continue →',
        component: 'button',
      },
    ]
  }

  // Render API Key Input Screen
  if (currentScreen === 'apiKey') {
    const modelTypeText = 'this model profile'

    return (
      <Box flexDirection="column" gap={1}>
        <Box
          flexDirection="column"
          gap={1}
          borderStyle="round"
          borderColor={theme.secondaryBorder}
          paddingX={2}
          paddingY={1}
        >
          <Text bold>
            API Key Setup{' '}
            {exitState.pending
              ? `(press ${exitState.keyName} again to exit)`
              : ''}
          </Text>
          <Box flexDirection="column" gap={1}>
            <Text bold>
              Enter your {getProviderLabel(selectedProvider, 0).split(' (')[0]}{' '}
              API key for {modelTypeText}:
            </Text>
            <Box flexDirection="column" width={70}>
              <Text color={theme.secondaryText}>
                This key will be stored locally and used to access the{' '}
                {selectedProvider} API.
                <Newline />
                Your key is never sent to our servers.
                <Newline />
                <Newline />
                {selectedProvider === 'kimi' && (
                  <>
                    💡 Get your API key from:{' '}
                    <Text color={theme.suggestion}>
                      https://platform.moonshot.cn/console/api-keys
                    </Text>
                  </>
                )}
                {selectedProvider === 'deepseek' && (
                  <>
                    💡 Get your API key from:{' '}
                    <Text color={theme.suggestion}>
                      https://platform.deepseek.com/api_keys
                    </Text>
                  </>
                )}
                {selectedProvider === 'siliconflow' && (
                  <>
                    💡 Get your API key from:{' '}
                    <Text color={theme.suggestion}>
                      https://cloud.siliconflow.cn/i/oJWsm6io
                    </Text>
                  </>
                )}
                {selectedProvider === 'qwen' && (
                  <>
                    💡 Get your API key from:{' '}
                    <Text color={theme.suggestion}>
                      https://bailian.console.aliyun.com/?tab=model#/api-key
                    </Text>
                  </>
                )}
                {selectedProvider === 'glm' && (
                  <>
                    💡 Get your API key from:{' '}
                    <Text color={theme.suggestion}>
                      https://open.bigmodel.cn (API Keys section)
                    </Text>
                  </>
                )}
                {selectedProvider === 'minimax' && (
                  <>
                    💡 Get your API key from:{' '}
                    <Text color={theme.suggestion}>
                      https://www.minimax.io/platform/user-center/basic-information
                    </Text>
                  </>
                )}
                {selectedProvider === 'baidu-qianfan' && (
                  <>
                    💡 Get your API key from:{' '}
                    <Text color={theme.suggestion}>
                      https://console.bce.baidu.com/iam/#/iam/accesslist
                    </Text>
                  </>
                )}
                {selectedProvider === 'anthropic' && (
                  <>
                    💡 Get your API key from:{' '}
                    <Text color={theme.suggestion}>
                      {anthropicProviderType === 'official'
                        ? 'https://console.anthropic.com/settings/keys'
                        : anthropicProviderType === 'bigdream'
                          ? 'https://api-key.info/register?aff=MSl4'
                          : anthropicProviderType === 'opendev'
                            ? 'https://api.openai-next.com/register/?aff_code=4xo7'
                            : 'your custom API provider'}
                    </Text>
                  </>
                )}
                {selectedProvider === 'openai' && (
                  <>
                    💡 Get your API key from:{' '}
                    <Text color={theme.suggestion}>
                      https://platform.openai.com/api-keys
                    </Text>
                  </>
                )}
              </Text>
            </Box>

            <Box>
              <TextInput
                placeholder="sk-..."
                value={apiKey}
                onChange={handleApiKeyChange}
                onSubmit={handleApiKeySubmit}
                mask="*"
                columns={500}
                cursorOffset={cursorOffset}
                onChangeCursorOffset={handleCursorOffsetChange}
                showCursor={true}
              />
            </Box>

            <Box marginTop={1}>
              <Text>
                <Text color={theme.suggestion} dimColor={!apiKey}>
                  [Submit API Key]
                </Text>
                <Text>
                  {' '}
                  - Press Enter or click to continue with this API key
                </Text>
              </Text>
            </Box>

            {isLoadingModels && (
              <Box>
                <Text color={theme.suggestion}>
                  Loading available models...
                </Text>
              </Box>
            )}
            {modelLoadError && (
              <Box>
                <Text color="red">Error: {modelLoadError}</Text>
              </Box>
            )}
            <Box marginTop={1}>
              <Text dimColor>
                Press <Text color={theme.suggestion}>Enter</Text> to continue,{' '}
                <Text color={theme.suggestion}>Tab</Text> to{' '}
                {selectedProvider === 'anthropic' ||
                selectedProvider === 'kimi' ||
                selectedProvider === 'deepseek' ||
                selectedProvider === 'qwen' ||
                selectedProvider === 'glm' ||
                selectedProvider === 'minimax' ||
                selectedProvider === 'baidu-qianfan' ||
                selectedProvider === 'siliconflow' ||
                selectedProvider === 'custom-openai'
                  ? 'skip to manual model input'
                  : 'skip using a key'}
                , or <Text color={theme.suggestion}>Esc</Text> to go back
              </Text>
            </Box>
          </Box>
        </Box>
      </Box>
    )
  }

  // Render Model Selection Screen
  if (currentScreen === 'model') {
    const modelTypeText = 'this model profile'

    return (
      <Box flexDirection="column" gap={1}>
        <Box
          flexDirection="column"
          gap={1}
          borderStyle="round"
          borderColor={theme.secondaryBorder}
          paddingX={2}
          paddingY={1}
        >
          <Text bold>
            Model Selection{' '}
            {exitState.pending
              ? `(press ${exitState.keyName} again to exit)`
              : ''}
          </Text>
          <Box flexDirection="column" gap={1}>
            <Text bold>
              Select a model from{' '}
              {
                getProviderLabel(
                  selectedProvider,
                  availableModels.length,
                ).split(' (')[0]
              }{' '}
              for {modelTypeText}:
            </Text>
            <Box flexDirection="column" width={70}>
              <Text color={theme.secondaryText}>
                This model profile can be assigned to different pointers (main,
                task, reasoning, quick) for various use cases.
              </Text>
            </Box>

            <Box marginY={1}>
              <Text bold>Search models:</Text>
              <TextInput
                placeholder="Type to filter models..."
                value={modelSearchQuery}
                onChange={handleModelSearchChange}
                columns={100}
                cursorOffset={modelSearchCursorOffset}
                onChangeCursorOffset={handleModelSearchCursorOffsetChange}
                showCursor={true}
                focus={true}
              />
            </Box>

            {modelOptions.length > 0 ? (
              <>
                <Select
                  options={modelOptions}
                  onChange={handleModelSelection}
                />
                <Text dimColor>
                  Showing {modelOptions.length} of {availableModels.length}{' '}
                  models
                </Text>
              </>
            ) : (
              <Box>
                {availableModels.length > 0 ? (
                  <Text color="yellow">
                    No models match your search. Try a different query.
                  </Text>
                ) : (
                  <Text color="yellow">
                    No models available for this provider.
                  </Text>
                )}
              </Box>
            )}

            <Box marginTop={1}>
              <Text dimColor>
                Press <Text color={theme.suggestion}>Esc</Text> to go back to
                API key input
              </Text>
            </Box>
          </Box>
        </Box>
      </Box>
    )
  }

  if (currentScreen === 'modelParams') {
    // Define form fields
    const formFields = getFormFieldsForModelParams()

    return (
      <Box flexDirection="column" gap={1}>
        <Box
          flexDirection="column"
          gap={1}
          borderStyle="round"
          borderColor={theme.secondaryBorder}
          paddingX={2}
          paddingY={1}
        >
          <Text bold>
            Model Parameters{' '}
            {exitState.pending
              ? `(press ${exitState.keyName} again to exit)`
              : ''}
          </Text>
          <Box flexDirection="column" gap={1}>
            <Text bold>Configure parameters for {selectedModel}:</Text>
            <Box flexDirection="column" width={70}>
              <Text color={theme.secondaryText}>
                Use <Text color={theme.suggestion}>Tab</Text> to navigate
                between fields. Press{' '}
                <Text color={theme.suggestion}>Enter</Text> to submit.
              </Text>
            </Box>

            <Box flexDirection="column">
              {formFields.map((field, index) => (
                <Box flexDirection="column" marginY={1} key={field.name}>
                  {field.component !== 'button' ? (
                    <>
                      <Text
                        bold
                        color={
                          activeFieldIndex === index ? theme.success : undefined
                        }
                      >
                        {field.label}
                      </Text>
                      {field.description && (
                        <Text color={theme.secondaryText}>
                          {field.description}
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text
                      bold
                      color={
                        activeFieldIndex === index ? theme.success : undefined
                      }
                    >
                      {field.label}
                    </Text>
                  )}
                  <Box marginY={1}>
                    {activeFieldIndex === index ? (
                      field.component === 'select' ? (
                        field.name === 'maxTokens' ? (
                          <Select
                            options={field.options || []}
                            onChange={value => {
                              const numValue = parseInt(value)
                              setMaxTokens(numValue.toString())
                              setSelectedMaxTokensPreset(numValue)
                              setMaxTokensCursorOffset(
                                numValue.toString().length,
                              )
                              // Move to next field after selection
                              setTimeout(() => {
                                setActiveFieldIndex(index + 1)
                              }, 100)
                            }}
                            defaultValue={field.defaultValue}
                          />
                        ) : (
                          <Select
                            options={reasoningEffortOptions}
                            onChange={value => {
                              setReasoningEffort(value as ReasoningEffortOption)
                              // Move to next field after selection
                              setTimeout(() => {
                                setActiveFieldIndex(index + 1)
                              }, 100)
                            }}
                            defaultValue={reasoningEffort}
                          />
                        )
                      ) : null
                    ) : field.name === 'maxTokens' ? (
                      <Text color={theme.secondaryText}>
                        Current:{' '}
                        <Text color={theme.suggestion}>
                          {MAX_TOKENS_OPTIONS.find(
                            opt => opt.value === parseInt(maxTokens),
                          )?.label || `${maxTokens} tokens`}
                        </Text>
                      </Text>
                    ) : field.name === 'reasoningEffort' ? (
                      <Text color={theme.secondaryText}>
                        Current:{' '}
                        <Text color={theme.suggestion}>{reasoningEffort}</Text>
                      </Text>
                    ) : null}
                  </Box>
                </Box>
              ))}

              <Box marginTop={1}>
                <Text dimColor>
                  Press <Text color={theme.suggestion}>Tab</Text> to navigate,{' '}
                  <Text color={theme.suggestion}>Enter</Text> to continue, or{' '}
                  <Text color={theme.suggestion}>Esc</Text> to go back
                </Text>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    )
  }

  // Render Resource Name Input Screen
  if (currentScreen === 'resourceName') {
    return (
      <Box flexDirection="column" gap={1}>
        <Box
          flexDirection="column"
          gap={1}
          borderStyle="round"
          borderColor={theme.secondaryBorder}
          paddingX={2}
          paddingY={1}
        >
          <Text bold>
            Azure Resource Setup{' '}
            {exitState.pending
              ? `(press ${exitState.keyName} again to exit)`
              : ''}
          </Text>
          <Box flexDirection="column" gap={1}>
            <Text bold>Enter your Azure OpenAI resource name:</Text>
            <Box flexDirection="column" width={70}>
              <Text color={theme.secondaryText}>
                This is the name of your Azure OpenAI resource (without the full
                domain).
                <Newline />
                For example, if your endpoint is
                "https://myresource.openai.azure.com", enter "myresource".
              </Text>
            </Box>

            <Box>
              <TextInput
                placeholder="myazureresource"
                value={resourceName}
                onChange={setResourceName}
                onSubmit={handleResourceNameSubmit}
                columns={100}
                cursorOffset={resourceNameCursorOffset}
                onChangeCursorOffset={setResourceNameCursorOffset}
                showCursor={true}
              />
            </Box>

            <Box marginTop={1}>
              <Text>
                <Text color={theme.suggestion} dimColor={!resourceName}>
                  [Submit Resource Name]
                </Text>
                <Text> - Press Enter or click to continue</Text>
              </Text>
            </Box>

            <Box marginTop={1}>
              <Text dimColor>
                Press <Text color={theme.suggestion}>Enter</Text> to continue or{' '}
                <Text color={theme.suggestion}>Esc</Text> to go back
              </Text>
            </Box>
          </Box>
        </Box>
      </Box>
    )
  }

  // Render Base URL Input Screen (for all providers)
  if (currentScreen === 'baseUrl') {
    const isCustomOpenAI = selectedProvider === 'custom-openai'

    // For custom-openai, we still use the old logic with customBaseUrl
    if (isCustomOpenAI) {
      return (
        <Box flexDirection="column" gap={1}>
          <Box
            flexDirection="column"
            gap={1}
            borderStyle="round"
            borderColor={theme.secondaryBorder}
            paddingX={2}
            paddingY={1}
          >
            <Text bold>
              Custom API Server Setup{' '}
              {exitState.pending
                ? `(press ${exitState.keyName} again to exit)`
                : ''}
            </Text>
            <Box flexDirection="column" gap={1}>
              <Text bold>Enter your custom API URL:</Text>
              <Box flexDirection="column" width={70}>
                <Text color={theme.secondaryText}>
                  This is the base URL for your OpenAI-compatible API.
                  <Newline />
                  For example: https://api.example.com/v1
                </Text>
              </Box>

              <Box>
                <TextInput
                  placeholder="https://api.example.com/v1"
                  value={customBaseUrl}
                  onChange={setCustomBaseUrl}
                  onSubmit={handleCustomBaseUrlSubmit}
                  columns={100}
                  cursorOffset={customBaseUrlCursorOffset}
                  onChangeCursorOffset={setCustomBaseUrlCursorOffset}
                  showCursor={!isLoadingModels}
                  focus={!isLoadingModels}
                />
              </Box>

              <Box marginTop={1}>
                <Text>
                  <Text
                    color={
                      isLoadingModels ? theme.secondaryText : theme.suggestion
                    }
                  >
                    [Submit Base URL]
                  </Text>
                  <Text> - Press Enter or click to continue</Text>
                </Text>
              </Box>

              <Box marginTop={1}>
                <Text dimColor>
                  Press <Text color={theme.suggestion}>Enter</Text> to continue
                  or <Text color={theme.suggestion}>Esc</Text> to go back
                </Text>
              </Box>
            </Box>
          </Box>
        </Box>
      )
    }

    // For all other providers, use the new general provider URL configuration
    const providerName = providers[selectedProvider]?.name || selectedProvider
    const defaultUrl = providers[selectedProvider]?.baseURL || ''

    return (
      <Box flexDirection="column" gap={1}>
        <Box
          flexDirection="column"
          gap={1}
          borderStyle="round"
          borderColor={theme.secondaryBorder}
          paddingX={2}
          paddingY={1}
        >
          <Text bold>
            {providerName} API Configuration{' '}
            {exitState.pending
              ? `(press ${exitState.keyName} again to exit)`
              : ''}
          </Text>
          <Box flexDirection="column" gap={1}>
            <Text bold>Configure the API endpoint for {providerName}:</Text>
            <Box flexDirection="column" width={70}>
              <Text color={theme.secondaryText}>
                {selectedProvider === 'ollama' ? (
                  <>
                    This is the URL of your Ollama server.
                    <Newline />
                    Default is http://localhost:11434/v1 for local Ollama
                    installations.
                  </>
                ) : (
                  <>
                    This is the base URL for the {providerName} API.
                    <Newline />
                    You can modify this URL or press Enter to use the default.
                  </>
                )}
              </Text>
            </Box>

            <Box>
              <TextInput
                placeholder={defaultUrl}
                value={providerBaseUrl}
                onChange={setProviderBaseUrl}
                onSubmit={handleProviderBaseUrlSubmit}
                columns={100}
                cursorOffset={providerBaseUrlCursorOffset}
                onChangeCursorOffset={setProviderBaseUrlCursorOffset}
                showCursor={!isLoadingModels}
                focus={!isLoadingModels}
              />
            </Box>

            <Box marginTop={1}>
              <Text>
                <Text
                  color={
                    isLoadingModels ? theme.secondaryText : theme.suggestion
                  }
                >
                  [Submit Base URL]
                </Text>
                <Text> - Press Enter or click to continue</Text>
              </Text>
            </Box>

            {isLoadingModels && (
              <Box marginTop={1}>
                <Text color={theme.success}>
                  {selectedProvider === 'ollama'
                    ? 'Connecting to Ollama server...'
                    : `Connecting to ${providerName}...`}
                </Text>
              </Box>
            )}

            {modelLoadError && (
              <Box marginTop={1}>
                <Text color="red">Error: {modelLoadError}</Text>
              </Box>
            )}

            <Box marginTop={1}>
              <Text dimColor>
                Press <Text color={theme.suggestion}>Enter</Text> to continue or{' '}
                <Text color={theme.suggestion}>Esc</Text> to go back
              </Text>
            </Box>
          </Box>
        </Box>
      </Box>
    )
  }

  // Render Custom Model Input Screen
  if (currentScreen === 'modelInput') {
    const modelTypeText = 'this model profile'

    // Determine the screen title and description based on provider
    let screenTitle = 'Manual Model Setup'
    let description = 'Enter the model name manually'
    let placeholder = 'gpt-4'
    let examples = 'For example: "gpt-4", "gpt-3.5-turbo", etc.'

    if (selectedProvider === 'azure') {
      screenTitle = 'Azure Model Setup'
      description = `Enter your Azure OpenAI deployment name for ${modelTypeText}:`
      examples = 'For example: "gpt-4", "gpt-35-turbo", etc.'
      placeholder = 'gpt-4'
    } else if (selectedProvider === 'anthropic') {
      screenTitle = 'Claude Model Setup'
      description = `Enter the Claude model name for ${modelTypeText}:`
      examples =
        'For example: "claude-3-5-sonnet-latest", "claude-3-5-haiku-latest", etc.'
      placeholder = 'claude-3-5-sonnet-latest'
    } else if (selectedProvider === 'bigdream') {
      screenTitle = 'BigDream Model Setup'
      description = `Enter the BigDream model name for ${modelTypeText}:`
      examples =
        'For example: "claude-3-5-sonnet-latest", "claude-3-5-haiku-latest", etc.'
      placeholder = 'claude-3-5-sonnet-latest'
    } else if (selectedProvider === 'kimi') {
      screenTitle = 'Kimi Model Setup'
      description = `Enter the Kimi model name for ${modelTypeText}:`
      examples = 'For example: "kimi-k2-0711-preview"'
      placeholder = 'kimi-k2-0711-preview'
    } else if (selectedProvider === 'deepseek') {
      screenTitle = 'DeepSeek Model Setup'
      description = `Enter the DeepSeek model name for ${modelTypeText}:`
      examples =
        'For example: "deepseek-chat", "deepseek-coder", "deepseek-reasoner", etc.'
      placeholder = 'deepseek-chat'
    } else if (selectedProvider === 'siliconflow') {
      screenTitle = 'SiliconFlow Model Setup'
      description = `Enter the SiliconFlow model name for ${modelTypeText}:`
      examples =
        'For example: "Qwen/Qwen2.5-72B-Instruct", "meta-llama/Meta-Llama-3.1-8B-Instruct", etc.'
      placeholder = 'Qwen/Qwen2.5-72B-Instruct'
    } else if (selectedProvider === 'qwen') {
      screenTitle = 'Qwen Model Setup'
      description = `Enter the Qwen model name for ${modelTypeText}:`
      examples = 'For example: "qwen-plus", "qwen-turbo", "qwen-max", etc.'
      placeholder = 'qwen-plus'
    } else if (selectedProvider === 'glm') {
      screenTitle = 'GLM Model Setup'
      description = `Enter the GLM model name for ${modelTypeText}:`
      examples = 'For example: "glm-4", "glm-4v", "glm-3-turbo", etc.'
      placeholder = 'glm-4'
    } else if (selectedProvider === 'minimax') {
      screenTitle = 'MiniMax Model Setup'
      description = `Enter the MiniMax model name for ${modelTypeText}:`
      examples =
        'For example: "abab6.5s-chat", "abab6.5g-chat", "abab5.5s-chat", etc.'
      placeholder = 'abab6.5s-chat'
    } else if (selectedProvider === 'baidu-qianfan') {
      screenTitle = 'Baidu Qianfan Model Setup'
      description = `Enter the Baidu Qianfan model name for ${modelTypeText}:`
      examples =
        'For example: "ERNIE-4.0-8K", "ERNIE-3.5-8K", "ERNIE-Speed-128K", etc.'
      placeholder = 'ERNIE-4.0-8K'
    } else if (selectedProvider === 'custom-openai') {
      screenTitle = 'Custom API Model Setup'
      description = `Enter the model name for ${modelTypeText}:`
      examples = 'Enter the exact model name as supported by your API endpoint.'
      placeholder = 'model-name'
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Box
          flexDirection="column"
          gap={1}
          borderStyle="round"
          borderColor={theme.secondaryBorder}
          paddingX={2}
          paddingY={1}
        >
          <Text bold>
            {screenTitle}{' '}
            {exitState.pending
              ? `(press ${exitState.keyName} again to exit)`
              : ''}
          </Text>
          <Box flexDirection="column" gap={1}>
            <Text bold>{description}</Text>
            <Box flexDirection="column" width={70}>
              <Text color={theme.secondaryText}>
                {selectedProvider === 'azure'
                  ? 'This is the deployment name you configured in your Azure OpenAI resource.'
                  : selectedProvider === 'anthropic'
                    ? 'This should be a valid Claude model identifier from Claude.'
                    : selectedProvider === 'bigdream'
                      ? 'This should be a valid Claude model identifier supported by BigDream.'
                      : selectedProvider === 'kimi'
                        ? 'This should be a valid Kimi model identifier from Moonshot AI.'
                        : selectedProvider === 'deepseek'
                          ? 'This should be a valid DeepSeek model identifier.'
                          : selectedProvider === 'siliconflow'
                            ? 'This should be a valid SiliconFlow model identifier.'
                            : selectedProvider === 'qwen'
                              ? 'This should be a valid Qwen model identifier from Alibaba Cloud.'
                              : selectedProvider === 'glm'
                                ? 'This should be a valid GLM model identifier from Zhipu AI.'
                                : selectedProvider === 'minimax'
                                  ? 'This should be a valid MiniMax model identifier.'
                                  : selectedProvider === 'baidu-qianfan'
                                    ? 'This should be a valid Baidu Qianfan model identifier.'
                                    : 'This should match the model name supported by your API endpoint.'}
                <Newline />
                {examples}
              </Text>
            </Box>

            <Box>
              <TextInput
                placeholder={placeholder}
                value={customModelName}
                onChange={setCustomModelName}
                onSubmit={handleCustomModelSubmit}
                columns={100}
                cursorOffset={customModelNameCursorOffset}
                onChangeCursorOffset={setCustomModelNameCursorOffset}
                showCursor={true}
              />
            </Box>

            <Box marginTop={1}>
              <Text>
                <Text color={theme.suggestion} dimColor={!customModelName}>
                  [Submit Model Name]
                </Text>
                <Text> - Press Enter or click to continue</Text>
              </Text>
            </Box>

            <Box marginTop={1}>
              <Text dimColor>
                Press <Text color={theme.suggestion}>Enter</Text> to continue or{' '}
                <Text color={theme.suggestion}>Esc</Text> to go back
              </Text>
            </Box>
          </Box>
        </Box>
      </Box>
    )
  }

  // Render Context Length Selection Screen
  if (currentScreen === 'contextLength') {
    const selectedOption =
      CONTEXT_LENGTH_OPTIONS.find(opt => opt.value === contextLength) ||
      CONTEXT_LENGTH_OPTIONS[2] // Default to 128K

    return (
      <Box flexDirection="column" gap={1}>
        <Box
          flexDirection="column"
          gap={1}
          borderStyle="round"
          borderColor={theme.secondaryBorder}
          paddingX={2}
          paddingY={1}
        >
          <Text bold>
            Context Length Configuration{' '}
            {exitState.pending
              ? `(press ${exitState.keyName} again to exit)`
              : ''}
          </Text>
          <Box flexDirection="column" gap={1}>
            <Text bold>Choose the context window length for your model:</Text>
            <Box flexDirection="column" width={70}>
              <Text color={theme.secondaryText}>
                This determines how much conversation history and context the
                model can process at once. Higher values allow for longer
                conversations but may increase costs.
              </Text>
            </Box>

            <Box flexDirection="column" marginY={1}>
              {CONTEXT_LENGTH_OPTIONS.map((option, index) => {
                const isSelected = option.value === contextLength
                return (
                  <Box key={option.value} flexDirection="row">
                    <Text color={isSelected ? 'blue' : undefined}>
                      {isSelected ? '→ ' : '  '}
                      {option.label}
                      {option.value === DEFAULT_CONTEXT_LENGTH
                        ? ' (recommended)'
                        : ''}
                    </Text>
                  </Box>
                )
              })}
            </Box>

            <Box flexDirection="column" marginY={1}>
              <Text dimColor>
                Selected:{' '}
                <Text color={theme.suggestion}>{selectedOption.label}</Text>
              </Text>
            </Box>
          </Box>
        </Box>

        <Box marginLeft={1}>
          <Text dimColor>
            ↑/↓ to select · Enter to continue · Esc to go back
          </Text>
        </Box>
      </Box>
    )
  }

  // Render Connection Test Screen
  if (currentScreen === 'connectionTest') {
    const providerDisplayName = getProviderLabel(selectedProvider, 0).split(
      ' (',
    )[0]

    return (
      <Box flexDirection="column" gap={1}>
        <Box
          flexDirection="column"
          gap={1}
          borderStyle="round"
          borderColor={theme.secondaryBorder}
          paddingX={2}
          paddingY={1}
        >
          <Text bold>
            Connection Test{' '}
            {exitState.pending
              ? `(press ${exitState.keyName} again to exit)`
              : ''}
          </Text>
          <Box flexDirection="column" gap={1}>
            <Text bold>Testing connection to {providerDisplayName}...</Text>
            <Box flexDirection="column" width={70}>
              <Text color={theme.secondaryText}>
                This will verify your configuration by sending a test request to
                the API.
                {selectedProvider === 'minimax' && (
                  <>
                    <Newline />
                    For MiniMax, we'll test both v2 and v1 endpoints to find the
                    best one.
                  </>
                )}
              </Text>
            </Box>

            {!connectionTestResult && !isTestingConnection && (
              <Box marginY={1}>
                <Text>
                  <Text color={theme.suggestion}>Press Enter</Text> to start the
                  connection test
                </Text>
              </Box>
            )}

            {isTestingConnection && (
              <Box marginY={1}>
                <Text color={theme.suggestion}>🔄 Testing connection...</Text>
              </Box>
            )}

            {connectionTestResult && (
              <Box flexDirection="column" marginY={1} paddingX={1}>
                <Text
                  color={connectionTestResult.success ? theme.success : 'red'}
                >
                  {connectionTestResult.message}
                </Text>

                {connectionTestResult.endpoint && (
                  <Text color={theme.secondaryText}>
                    Endpoint: {connectionTestResult.endpoint}
                  </Text>
                )}

                {connectionTestResult.details && (
                  <Text color={theme.secondaryText}>
                    Details: {connectionTestResult.details}
                  </Text>
                )}

                {connectionTestResult.success ? (
                  <Box marginTop={1}>
                    <Text color={theme.success}>
                      ✅ Automatically proceeding to confirmation...
                    </Text>
                  </Box>
                ) : (
                  <Box marginTop={1}>
                    <Text>
                      <Text color={theme.suggestion}>Press Enter</Text> to retry
                      test, or <Text color={theme.suggestion}>Esc</Text> to go
                      back
                    </Text>
                  </Box>
                )}
              </Box>
            )}

            <Box marginTop={1}>
              <Text dimColor>
                Press <Text color={theme.suggestion}>Esc</Text> to go back to
                context length
              </Text>
            </Box>
          </Box>
        </Box>
      </Box>
    )
  }

  // Render Confirmation Screen
  if (currentScreen === 'confirmation') {
    // Show model profile being created

    // Get provider display name
    const providerDisplayName = getProviderLabel(selectedProvider, 0).split(
      ' (',
    )[0]

    // Determine if provider requires API key
    const showsApiKey = selectedProvider !== 'ollama'

    return (
      <Box flexDirection="column" gap={1}>
        <Box
          flexDirection="column"
          gap={1}
          borderStyle="round"
          borderColor={theme.secondaryBorder}
          paddingX={2}
          paddingY={1}
        >
          <Text bold>
            Configuration Confirmation{' '}
            {exitState.pending
              ? `(press ${exitState.keyName} again to exit)`
              : ''}
          </Text>
          <Box flexDirection="column" gap={1}>
            <Text bold>Confirm your model configuration:</Text>
            <Box flexDirection="column" width={70}>
              <Text color={theme.secondaryText}>
                Please review your selections before saving.
              </Text>
            </Box>

            {validationError && (
              <Box flexDirection="column" marginY={1} paddingX={1}>
                <Text color={theme.error} bold>
                  ⚠ Configuration Error:
                </Text>
                <Text color={theme.error}>{validationError}</Text>
              </Box>
            )}

            <Box flexDirection="column" marginY={1} paddingX={1}>
              <Text>
                <Text bold>Provider: </Text>
                <Text color={theme.suggestion}>{providerDisplayName}</Text>
              </Text>

              {selectedProvider === 'azure' && (
                <Text>
                  <Text bold>Resource Name: </Text>
                  <Text color={theme.suggestion}>{resourceName}</Text>
                </Text>
              )}

              {selectedProvider === 'ollama' && (
                <Text>
                  <Text bold>Server URL: </Text>
                  <Text color={theme.suggestion}>{ollamaBaseUrl}</Text>
                </Text>
              )}

              {selectedProvider === 'custom-openai' && (
                <Text>
                  <Text bold>API Base URL: </Text>
                  <Text color={theme.suggestion}>{customBaseUrl}</Text>
                </Text>
              )}

              <Text>
                <Text bold>Model: </Text>
                <Text color={theme.suggestion}>{selectedModel}</Text>
              </Text>

              {apiKey && showsApiKey && (
                <Text>
                  <Text bold>API Key: </Text>
                  <Text color={theme.suggestion}>****{apiKey.slice(-4)}</Text>
                </Text>
              )}

              {maxTokens && (
                <Text>
                  <Text bold>Max Tokens: </Text>
                  <Text color={theme.suggestion}>{maxTokens}</Text>
                </Text>
              )}

              <Text>
                <Text bold>Context Length: </Text>
                <Text color={theme.suggestion}>
                  {CONTEXT_LENGTH_OPTIONS.find(
                    opt => opt.value === contextLength,
                  )?.label || `${contextLength.toLocaleString()} tokens`}
                </Text>
              </Text>

              {supportsReasoningEffort && (
                <Text>
                  <Text bold>Reasoning Effort: </Text>
                  <Text color={theme.suggestion}>{reasoningEffort}</Text>
                </Text>
              )}
            </Box>

            <Box marginTop={1}>
              <Text dimColor>
                Press <Text color={theme.suggestion}>Esc</Text> to go back to
                model parameters or <Text color={theme.suggestion}>Enter</Text>{' '}
                to save configuration
              </Text>
            </Box>
          </Box>
        </Box>
      </Box>
    )
  }

  // Render Anthropic Sub-Menu Selection Screen
  if (currentScreen === 'anthropicSubMenu') {
    const anthropicOptions = [
      { label: 'Official Anthropic API', value: 'official' },
      { label: 'BigDream (Community Proxy)', value: 'bigdream' },
      { label: 'OpenDev (Community Proxy)', value: 'opendev' },
      { label: 'Custom Anthropic-Compatible API', value: 'custom' },
    ]

    return (
      <Box flexDirection="column" gap={1}>
        <Box
          flexDirection="column"
          gap={1}
          borderStyle="round"
          borderColor={theme.secondaryBorder}
          paddingX={2}
          paddingY={1}
        >
          <Text bold>
            Claude Provider Selection{' '}
            {exitState.pending
              ? `(press ${exitState.keyName} again to exit)`
              : ''}
          </Text>
          <Box flexDirection="column" gap={1}>
            <Text bold>
              Choose your Anthropic API access method for this model profile:
            </Text>
            <Box flexDirection="column" width={70}>
              <Text color={theme.secondaryText}>
                • <Text bold>Official Anthropic API:</Text> Direct access to
                Anthropic's official API
                <Newline />• <Text bold>BigDream:</Text> Community proxy
                providing Claude access
                <Newline />• <Text bold>Custom:</Text> Your own
                Anthropic-compatible API endpoint
              </Text>
            </Box>

            <Select
              options={anthropicOptions}
              onChange={handleAnthropicProviderSelection}
            />

            <Box marginTop={1}>
              <Text dimColor>
                Press <Text color={theme.suggestion}>Esc</Text> to go back to
                provider selection
              </Text>
            </Box>
          </Box>
        </Box>
      </Box>
    )
  }

  // Render Provider Selection Screen
  return (
    <ScreenContainer 
      title="Provider Selection" 
      exitState={exitState}
      children={
        <Box flexDirection="column" gap={1}>
          <Text bold>
            Select your preferred AI provider for this model profile:
          </Text>
          <Box flexDirection="column" width={70}>
            <Text color={theme.secondaryText}>
              Choose the provider you want to use for this model profile.
              <Newline />
              This will determine which models are available to you.
            </Text>
          </Box>

          <Select options={providerOptions} onChange={handleProviderSelection} />

          <Box marginTop={1}>
            <Text dimColor>
              You can change this later by running{' '}
              <Text color={theme.suggestion}>/model</Text> again
            </Text>
          </Box>
        </Box>
      }
    />
  )
}
