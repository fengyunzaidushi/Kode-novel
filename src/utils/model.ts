/**
 * 模型管理核心系统 - Kode多模型支持的统一管理层
 *
 * 🎯 核心职责：
 * 1. 多AI模型配置和切换管理（OpenAI、Anthropic、国产模型等）
 * 2. 模型指针系统（main/task/reasoning/quick）的统一分发
 * 3. 上下文窗口管理和模型兼容性检查
 * 4. 动态模型切换和配置热更新
 * 5. 模型配置文件的生命周期管理
 *
 * 🏗️ 架构特点：
 * - ModelManager单例模式避免配置竞争
 * - 支持Bedrock、Vertex、First-party多种部署方式
 * - 模型指针抽象：不同任务使用最适合的模型
 * - 上下文溢出自动处理和模型回退机制
 * - 配置迁移和向后兼容支持
 *
 * 🔄 模型指针系统：
 * - main: 主对话模型（用户交互）
 * - task: 任务工具模型（工具调用）
 * - reasoning: 推理模型（复杂逻辑）
 * - quick: 快速模型（简单操作）
 *
 * 📊 上游依赖：./config.ts（配置管理）
 * 📈 下游使用者：./query.ts、./claude.ts、所有工具调用
 */
import { memoize } from 'lodash-es'

import { logError } from './log'
import {
  getGlobalConfig,
  ModelProfile,
  ModelPointerType,
  saveGlobalConfig,
} from './config'

// 环境变量控制的部署方式开关
export const USE_BEDROCK = !!process.env.CLAUDE_CODE_USE_BEDROCK  // AWS Bedrock部署
export const USE_VERTEX = !!process.env.CLAUDE_CODE_USE_VERTEX    // Google Vertex AI部署

/**
 * 模型配置接口 - 定义不同部署平台的默认模型
 * 支持多平台部署策略，根据环境自动选择最适合的模型版本
 */
export interface ModelConfig {
  bedrock: string     // AWS Bedrock平台的模型标识符
  vertex: string      // Google Vertex AI平台的模型标识符
  firstParty: string  // Anthropic官方API的模型标识符
}

/**
 * 默认模型配置 - 各平台的推荐模型版本
 * 这些是经过测试验证的稳定模型版本，提供一致的用户体验
 */
const DEFAULT_MODEL_CONFIG: ModelConfig = {
  bedrock: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',  // Bedrock特定格式
  vertex: 'claude-3-7-sonnet@20250219',                      // Vertex特定格式
  firstParty: 'claude-sonnet-4-20250514',                    // 官方API最新版本
}

/**
 * 获取模型配置的助手函数
 * 从statsig功能开关或默认配置获取模型设置
 * 依赖于StatsigClient的内置缓存机制来提高性能
 *
 * @returns Promise<ModelConfig> - 完整的模型配置对象
 *
 * 📝 注意：当前简化为直接返回默认配置
 * 未来版本可能会从远程配置服务获取动态模型设置
 */
async function getModelConfig(): Promise<ModelConfig> {
  return DEFAULT_MODEL_CONFIG
}

export const getSlowAndCapableModel = memoize(async (): Promise<string> => {
  const config = await getGlobalConfig()

  // Use ModelManager for proper model resolution
  const modelManager = new ModelManager(config)
  const model = modelManager.getMainAgentModel()

  if (model) {
    return model
  }

  // Final fallback to default model
  const modelConfig = await getModelConfig()
  if (USE_BEDROCK) return modelConfig.bedrock
  if (USE_VERTEX) return modelConfig.vertex
  return modelConfig.firstParty
})

export async function isDefaultSlowAndCapableModel(): Promise<boolean> {
  return (
    !process.env.ANTHROPIC_MODEL ||
    process.env.ANTHROPIC_MODEL === (await getSlowAndCapableModel())
  )
}

/**
 * Get the region for a specific Vertex model
 * Checks for hardcoded model-specific environment variables first,
 * then falls back to CLOUD_ML_REGION env var or default region
 */
export function getVertexRegionForModel(
  model: string | undefined,
): string | undefined {
  if (model?.startsWith('claude-3-5-haiku')) {
    return process.env.VERTEX_REGION_CLAUDE_3_5_HAIKU
  } else if (model?.startsWith('claude-3-5-sonnet')) {
    return process.env.VERTEX_REGION_CLAUDE_3_5_SONNET
  } else if (model?.startsWith('claude-3-7-sonnet')) {
    return process.env.VERTEX_REGION_CLAUDE_3_7_SONNET
  }
}

/**
 * 综合模型管理器类 - 中央化模型选择和管理的核心
 * 为整个应用程序提供清晰的模型选择接口
 *
 * 🎯 主要功能：
 * - 统一模型配置管理和生命周期控制
 * - 智能模型切换和回退机制
 * - 上下文窗口兼容性检查和优化
 * - 模型指针系统的动态分发
 * - 配置热更新和持久化存储
 *
 * 🔄 设计模式：
 * - 单例模式：避免配置文件读写竞争
 * - 策略模式：支持不同部署平台的模型选择
 * - 适配器模式：统一不同AI服务商的接口差异
 *
 * 💡 创新特点：
 * - 支持无限数量的AI模型配置
 * - 动态上下文兼容性分析
 * - 自动模型降级和恢复机制
 */
export class ModelManager {
  private config: any // Using any to handle legacy properties
  private modelProfiles: ModelProfile[]

  constructor(config: any) {
    this.config = config
    this.modelProfiles = config.modelProfiles || []
  }

  /**
   * 获取当前终端模型（用于交互式CLI会话）
   * 返回用户在终端界面交互时使用的模型
   *
   * @returns string | null - 当前激活的终端模型名称
   *
   * 🎯 使用场景：
   * - 终端REPL会话的主要对话模型
   * - 用户直接输入命令的响应模型
   * - 实时交互体验的核心模型
   *
   * 🔄 选择逻辑：
   * 1. 优先使用主指针(main)指向的模型
   * 2. 检查模型配置文件是否存在且激活
   * 3. 回退到主代理模型作为备选
   */
  getCurrentModel(): string | null {
    // Use main pointer from new ModelProfile system
    const mainModelName = this.config.modelPointers?.main
    if (mainModelName) {
      const profile = this.findModelProfile(mainModelName)
      if (profile && profile.isActive) {
        return profile.modelName
      }
    }

    // Fallback to main agent model
    return this.getMainAgentModel()
  }

  /**
   * 获取主代理默认模型（用于非终端模式和MCP调用）
   * 返回用于后台任务和服务间调用的默认模型
   *
   * @returns string | null - 主代理模型名称
   *
   * 🎯 使用场景：
   * - 非终端模式下的API调用
   * - MCP服务器间的通信
   * - 后台任务的自动化处理
   * - 系统级的AI推理任务
   *
   * 🔄 选择逻辑：
   * 1. 优先使用主指针(main)配置的模型
   * 2. 验证模型配置存在且处于激活状态
   * 3. 回退到第一个激活的模型配置文件
   * 4. 所有选项都失败时返回null
   */
  getMainAgentModel(): string | null {
    // Use main pointer from new ModelProfile system
    const mainModelName = this.config.modelPointers?.main
    if (mainModelName) {
      const profile = this.findModelProfile(mainModelName)
      if (profile && profile.isActive) {
        return profile.modelName
      }
    }

    // Fallback to first active profile
    const activeProfile = this.modelProfiles.find(p => p.isActive)
    if (activeProfile) {
      return activeProfile.modelName
    }

    return null
  }

  /**
   * 获取任务工具默认模型（用于Task工具子代理）
   * 返回专门用于工具调用和任务执行的模型
   *
   * @returns string | null - 任务工具模型名称
   *
   * 🎯 使用场景：
   * - Task工具创建的子代理
   * - 专门的工具执行上下文
   * - 需要特定能力的任务处理
   * - 独立于主对话的工具调用链
   *
   * 🔄 选择逻辑：
   * 1. 优先使用任务指针(task)指向的专用模型
   * 2. 验证任务模型配置的有效性和活跃状态
   * 3. 回退到主代理模型确保功能连续性
   *
   * 💡 设计理念：
   * - 允许为不同类型的任务配置专门的模型
   * - 平衡性能和成本的模型选择策略
   */
  getTaskToolModel(): string | null {
    // Use task pointer from new ModelProfile system
    const taskModelName = this.config.modelPointers?.task
    if (taskModelName) {
      const profile = this.findModelProfile(taskModelName)
      if (profile && profile.isActive) {
        return profile.modelName
      }
    }

    // Fallback to main agent model
    return this.getMainAgentModel()
  }

  /**
   * Switch to the next available model with simple context overflow handling
   * If target model can't handle current context, shows warning and reverts after delay
   *
   * @param currentContextTokens - Current conversation token count for validation
   * @returns Object with model name and context status information
   */
  switchToNextModelWithContextCheck(currentContextTokens: number = 0): {
    success: boolean
    modelName: string | null
    previousModelName: string | null
    contextOverflow: boolean
    usagePercentage: number
  } {
    // Use ALL configured models, not just active ones
    const allProfiles = this.getAllConfiguredModels()
    if (allProfiles.length === 0) {
      return {
        success: false,
        modelName: null,
        previousModelName: null,
        contextOverflow: false,
        usagePercentage: 0,
      }
    }

    // Sort by createdAt for consistent cycling order (don't use lastUsed)
    // Using lastUsed causes the order to change each time, preventing proper cycling
    allProfiles.sort((a, b) => {
      return a.createdAt - b.createdAt // Oldest first for consistent order
    })

    const currentMainModelName = this.config.modelPointers?.main
    const currentModel = currentMainModelName
      ? this.findModelProfile(currentMainModelName)
      : null
    const previousModelName = currentModel?.name || null

    if (!currentMainModelName) {
      // No current main model, select first available (activate if needed)
      const firstModel = allProfiles[0]
      if (!firstModel.isActive) {
        firstModel.isActive = true
      }
      this.setPointer('main', firstModel.modelName)
      this.updateLastUsed(firstModel.modelName)

      const analysis = this.analyzeContextCompatibility(
        firstModel,
        currentContextTokens,
      )
      return {
        success: true,
        modelName: firstModel.name,
        previousModelName: null,
        contextOverflow: !analysis.compatible,
        usagePercentage: analysis.usagePercentage,
      }
    }

    // Find current model index in ALL models
    const currentIndex = allProfiles.findIndex(
      p => p.modelName === currentMainModelName,
    )
    if (currentIndex === -1) {
      // Current model not found, select first available (activate if needed)
      const firstModel = allProfiles[0]
      if (!firstModel.isActive) {
        firstModel.isActive = true
      }
      this.setPointer('main', firstModel.modelName)
      this.updateLastUsed(firstModel.modelName)

      const analysis = this.analyzeContextCompatibility(
        firstModel,
        currentContextTokens,
      )
      return {
        success: true,
        modelName: firstModel.name,
        previousModelName,
        contextOverflow: !analysis.compatible,
        usagePercentage: analysis.usagePercentage,
      }
    }

    // Check if only one model is available
    if (allProfiles.length === 1) {
      return {
        success: false,
        modelName: null,
        previousModelName,
        contextOverflow: false,
        usagePercentage: 0,
      }
    }

    // Get next model in cycle (from ALL models)
    const nextIndex = (currentIndex + 1) % allProfiles.length
    const nextModel = allProfiles[nextIndex]
    
    // Activate the model if it's not already active
    const wasInactive = !nextModel.isActive
    if (!nextModel.isActive) {
      nextModel.isActive = true
    }

    // Analyze context compatibility for next model
    const analysis = this.analyzeContextCompatibility(
      nextModel,
      currentContextTokens,
    )

    // Always switch to next model, but return context status
    this.setPointer('main', nextModel.modelName)
    this.updateLastUsed(nextModel.modelName)
    
    // Save configuration if we activated a new model
    if (wasInactive) {
      this.saveConfig()
    }

    return {
      success: true,
      modelName: nextModel.name,
      previousModelName,
      contextOverflow: !analysis.compatible,
      usagePercentage: analysis.usagePercentage,
    }
  }

  /**
   * Simple model switching for UI components (compatible interface)
   * @param currentContextTokens - Current conversation token count for validation
   * @returns Compatible interface for PromptInput component
   */
  switchToNextModel(currentContextTokens: number = 0): {
    success: boolean
    modelName: string | null
    blocked?: boolean
    message?: string
  } {
    // Use the enhanced context check method for consistency
    const result = this.switchToNextModelWithContextCheck(currentContextTokens)
    
    if (!result.success) {
      const allModels = this.getAllConfiguredModels()
      if (allModels.length === 0) {
        return {
          success: false,
          modelName: null,
          blocked: false,
          message: '❌ No models configured. Use /model to add models.',
        }
      } else if (allModels.length === 1) {
        return {
          success: false,
          modelName: null,
          blocked: false,
          message: `⚠️ Only one model configured (${allModels[0].modelName}). Use /model to add more models for switching.`,
        }
      }
    }
    
    // Convert the detailed result to the simple interface
    const currentModel = this.findModelProfile(this.config.modelPointers?.main)
    const allModels = this.getAllConfiguredModels()
    const currentIndex = allModels.findIndex(m => m.modelName === currentModel?.modelName)
    const totalModels = allModels.length
    
    return {
      success: result.success,
      modelName: result.modelName,
      blocked: result.contextOverflow,
      message: result.success
        ? result.contextOverflow
          ? `⚠️ Context usage: ${result.usagePercentage.toFixed(1)}% - ${result.modelName}`
          : `✅ Switched to ${result.modelName} (${currentIndex + 1}/${totalModels})${currentModel?.provider ? ` [${currentModel.provider}]` : ''}`
        : `❌ Failed to switch models`,
    }
  }

  /**
   * Revert to previous model (used when context overflow requires rollback)
   */
  revertToPreviousModel(previousModelName: string): boolean {
    const previousModel = this.modelProfiles.find(
      p => p.name === previousModelName && p.isActive,
    )
    if (!previousModel) {
      return false
    }

    this.setPointer('main', previousModel.modelName)
    this.updateLastUsed(previousModel.modelName)
    return true
  }

  /**
   * Enhanced context validation with different severity levels
   */
  analyzeContextCompatibility(
    model: ModelProfile,
    contextTokens: number,
  ): {
    compatible: boolean
    severity: 'safe' | 'warning' | 'critical'
    usagePercentage: number
    recommendation: string
  } {
    const usableContext = Math.floor(model.contextLength * 0.8) // Reserve 20% for output
    const usagePercentage = (contextTokens / usableContext) * 100

    if (usagePercentage <= 70) {
      return {
        compatible: true,
        severity: 'safe',
        usagePercentage,
        recommendation: 'Full context preserved',
      }
    } else if (usagePercentage <= 90) {
      return {
        compatible: true,
        severity: 'warning',
        usagePercentage,
        recommendation: 'Context usage high, consider compression',
      }
    } else {
      return {
        compatible: false,
        severity: 'critical',
        usagePercentage,
        recommendation: 'Auto-compression or message truncation required',
      }
    }
  }

  /**
   * Switch to next model with enhanced context analysis
   */
  switchToNextModelWithAnalysis(currentContextTokens: number = 0): {
    modelName: string | null
    contextAnalysis: ReturnType<typeof this.analyzeContextCompatibility> | null
    requiresCompression: boolean
    estimatedTokensAfterSwitch: number
  } {
    const result = this.switchToNextModel(currentContextTokens)

    if (!result.success || !result.modelName) {
      return {
        modelName: null,
        contextAnalysis: null,
        requiresCompression: false,
        estimatedTokensAfterSwitch: 0,
      }
    }

    const newModel = this.getModel('main')
    if (!newModel) {
      return {
        modelName: result.modelName,
        contextAnalysis: null,
        requiresCompression: false,
        estimatedTokensAfterSwitch: currentContextTokens,
      }
    }

    const analysis = this.analyzeContextCompatibility(
      newModel,
      currentContextTokens,
    )

    return {
      modelName: result.modelName,
      contextAnalysis: analysis,
      requiresCompression: analysis.severity === 'critical',
      estimatedTokensAfterSwitch: currentContextTokens,
    }
  }

  /**
   * Check if a model can handle the given context size (legacy method)
   */
  canModelHandleContext(model: ModelProfile, contextTokens: number): boolean {
    const analysis = this.analyzeContextCompatibility(model, contextTokens)
    return analysis.compatible
  }

  /**
   * Find the first model that can handle the given context size
   */
  findModelWithSufficientContext(
    models: ModelProfile[],
    contextTokens: number,
  ): ModelProfile | null {
    return (
      models.find(model => this.canModelHandleContext(model, contextTokens)) ||
      null
    )
  }

  /**
   * Unified model getter for different contexts
   */
  getModelForContext(
    contextType: 'terminal' | 'main-agent' | 'task-tool',
  ): string | null {
    switch (contextType) {
      case 'terminal':
        return this.getCurrentModel()
      case 'main-agent':
        return this.getMainAgentModel()
      case 'task-tool':
        return this.getTaskToolModel()
      default:
        return this.getMainAgentModel()
    }
  }

  /**
   * Get all active model profiles
   */
  getActiveModelProfiles(): ModelProfile[] {
    return this.modelProfiles.filter(p => p.isActive)
  }

  /**
   * Check if any models are configured
   */
  hasConfiguredModels(): boolean {
    return this.getActiveModelProfiles().length > 0
  }

  // New model pointer system methods

  /**
   * Get model by pointer type (main, task, reasoning, quick)
   */
  getModel(pointer: ModelPointerType): ModelProfile | null {
    const pointerId = this.config.modelPointers?.[pointer]
    if (!pointerId) {
      return this.getDefaultModel()
    }

    const profile = this.findModelProfile(pointerId)
    return profile && profile.isActive ? profile : this.getDefaultModel()
  }

  /**
   * Get model name by pointer type
   */
  getModelName(pointer: ModelPointerType): string | null {
    const profile = this.getModel(pointer)
    return profile ? profile.modelName : null
  }

  /**
   * Get reasoning model (with fallback)
   */
  getReasoningModel(): string | null {
    return this.getModelName('reasoning') || this.getModelName('main')
  }

  /**
   * Get quick model (with fallback)
   */
  getQuickModel(): string | null {
    return (
      this.getModelName('quick') ||
      this.getModelName('task') ||
      this.getModelName('main')
    )
  }

  /**
   * Add a new model profile with duplicate validation
   */
  async addModel(
    config: Omit<ModelProfile, 'createdAt' | 'isActive'>,
  ): Promise<string> {
    // Check for duplicate modelName (actual model identifier)
    const existingByModelName = this.modelProfiles.find(
      p => p.modelName === config.modelName,
    )
    if (existingByModelName) {
      throw new Error(
        `Model with modelName '${config.modelName}' already exists: ${existingByModelName.name}`,
      )
    }

    // Check for duplicate friendly name
    const existingByName = this.modelProfiles.find(p => p.name === config.name)
    if (existingByName) {
      throw new Error(`Model with name '${config.name}' already exists`)
    }

    const newModel: ModelProfile = {
      ...config,
      createdAt: Date.now(),
      isActive: true,
    }

    this.modelProfiles.push(newModel)

    // If this is the first model, set all pointers to it
    if (this.modelProfiles.length === 1) {
      this.config.modelPointers = {
        main: config.modelName,
        task: config.modelName,
        reasoning: config.modelName,
        quick: config.modelName,
      }
      this.config.defaultModelName = config.modelName
    }

    this.saveConfig()
    return config.modelName
  }

  /**
   * Set model pointer assignment
   */
  setPointer(pointer: ModelPointerType, modelName: string): void {
    if (!this.findModelProfile(modelName)) {
      throw new Error(`Model '${modelName}' not found`)
    }

    if (!this.config.modelPointers) {
      this.config.modelPointers = {
        main: '',
        task: '',
        reasoning: '',
        quick: '',
      }
    }

    this.config.modelPointers[pointer] = modelName
    this.saveConfig()
  }

  /**
   * Get all active models for pointer assignment
   */
  getAvailableModels(): ModelProfile[] {
    return this.modelProfiles.filter(p => p.isActive)
  }

  /**
   * Get all configured models (both active and inactive) for switching
   */
  getAllConfiguredModels(): ModelProfile[] {
    return this.modelProfiles
  }

  /**
   * Get all available model names (modelName field) - active only
   */
  getAllAvailableModelNames(): string[] {
    return this.getAvailableModels().map(p => p.modelName)
  }

  /**
   * Get all configured model names (both active and inactive)
   */
  getAllConfiguredModelNames(): string[] {
    return this.getAllConfiguredModels().map(p => p.modelName)
  }

  /**
   * Debug method to get detailed model switching information
   */
  getModelSwitchingDebugInfo(): {
    totalModels: number
    activeModels: number
    inactiveModels: number
    currentMainModel: string | null
    availableModels: Array<{
      name: string
      modelName: string 
      provider: string
      isActive: boolean
      lastUsed?: number
    }>
    modelPointers: Record<string, string | undefined>
  } {
    const availableModels = this.getAvailableModels()
    const currentMainModelName = this.config.modelPointers?.main
    
    return {
      totalModels: this.modelProfiles.length,
      activeModels: availableModels.length,
      inactiveModels: this.modelProfiles.length - availableModels.length,
      currentMainModel: currentMainModelName || null,
      availableModels: this.modelProfiles.map(p => ({
        name: p.name,
        modelName: p.modelName,
        provider: p.provider,
        isActive: p.isActive,
        lastUsed: p.lastUsed,
      })),
      modelPointers: this.config.modelPointers || {},
    }
  }

  /**
   * Remove a model profile
   */
  removeModel(modelName: string): void {
    this.modelProfiles = this.modelProfiles.filter(
      p => p.modelName !== modelName,
    )

    // Clean up pointers that reference deleted model
    if (this.config.modelPointers) {
      Object.keys(this.config.modelPointers).forEach(pointer => {
        if (
          this.config.modelPointers[pointer as ModelPointerType] === modelName
        ) {
          this.config.modelPointers[pointer as ModelPointerType] =
            this.config.defaultModelName || ''
        }
      })
    }

    this.saveConfig()
  }

  /**
   * Get default model profile
   */
  private getDefaultModel(): ModelProfile | null {
    if (this.config.defaultModelId) {
      const profile = this.findModelProfile(this.config.defaultModelId)
      if (profile && profile.isActive) {
        return profile
      }
    }
    return this.modelProfiles.find(p => p.isActive) || null
  }

  /**
   * Save configuration changes
   */
  private saveConfig(): void {
    const updatedConfig = {
      ...this.config,
      modelProfiles: this.modelProfiles,
    }
    saveGlobalConfig(updatedConfig)
  }

  /**
   * Get a fallback model when no specific model is configured
   */
  async getFallbackModel(): Promise<string> {
    const modelConfig = await getModelConfig()
    if (USE_BEDROCK) return modelConfig.bedrock
    if (USE_VERTEX) return modelConfig.vertex
    return modelConfig.firstParty
  }

  /**
   * 统一的模型解析方法：支持指针、model ID 和真实模型名称
   * @param modelParam - 可以是模型指针 ('main', 'task', etc.)、内部model ID 或真实模型名称 ('gpt-4o', 'claude-3-5-sonnet')
   * @returns ModelProfile 或 null
   */
  resolveModel(modelParam: string | ModelPointerType): ModelProfile | null {
    // 首先检查是否是模型指针
    if (['main', 'task', 'reasoning', 'quick'].includes(modelParam)) {
      const pointerId =
        this.config.modelPointers?.[modelParam as ModelPointerType]
      if (pointerId) {
        // pointerId 可能是内部ID或真实模型名称，尝试两种查找方式
        let profile = this.findModelProfile(pointerId) // 按内部ID查找
        if (!profile) {
          profile = this.findModelProfileByModelName(pointerId) // 按真实模型名查找
        }
        if (profile && profile.isActive) {
          return profile
        }
      }
      // 指针无效时，尝试 fallback 到默认模型
      return this.getDefaultModel()
    }

    // 不是指针，尝试多种查找方式
    // 1. 尝试按内部 model ID 查找
    let profile = this.findModelProfile(modelParam)
    if (profile && profile.isActive) {
      return profile
    }

    // 2. 尝试按真实模型名称查找
    profile = this.findModelProfileByModelName(modelParam)
    if (profile && profile.isActive) {
      return profile
    }

    // 3. 尝试按友好名称查找
    profile = this.findModelProfileByName(modelParam)
    if (profile && profile.isActive) {
      return profile
    }

    // 所有查找方式都失败，尝试 fallback 到默认模型
    return this.getDefaultModel()
  }

  /**
   * 解析模型参数并返回完整信息
   */
  resolveModelWithInfo(modelParam: string | ModelPointerType): {
    success: boolean
    profile: ModelProfile | null
    error?: string
  } {
    const isPointer = ['main', 'task', 'reasoning', 'quick'].includes(
      modelParam,
    )

    if (isPointer) {
      const pointerId =
        this.config.modelPointers?.[modelParam as ModelPointerType]
      if (!pointerId) {
        return {
          success: false,
          profile: null,
          error: `Model pointer '${modelParam}' is not configured. Use /model to set up models.`,
        }
      }

      // pointerId 可能是内部ID或真实模型名称
      let profile = this.findModelProfile(pointerId)
      if (!profile) {
        profile = this.findModelProfileByModelName(pointerId)
      }

      if (!profile) {
        return {
          success: false,
          profile: null,
          error: `Model pointer '${modelParam}' points to invalid model '${pointerId}'. Use /model to reconfigure.`,
        }
      }

      if (!profile.isActive) {
        return {
          success: false,
          profile: null,
          error: `Model '${profile.name}' (pointed by '${modelParam}') is inactive. Use /model to activate it.`,
        }
      }

      return {
        success: true,
        profile,
      }
    } else {
      // 直接的 model ID 或模型名称，尝试多种查找方式
      let profile = this.findModelProfile(modelParam)
      if (!profile) {
        profile = this.findModelProfileByModelName(modelParam)
      }
      if (!profile) {
        profile = this.findModelProfileByName(modelParam)
      }

      if (!profile) {
        return {
          success: false,
          profile: null,
          error: `Model '${modelParam}' not found. Use /model to add models.`,
        }
      }

      if (!profile.isActive) {
        return {
          success: false,
          profile: null,
          error: `Model '${profile.name}' is inactive. Use /model to activate it.`,
        }
      }

      return {
        success: true,
        profile,
      }
    }
  }

  // Private helper methods
  private findModelProfile(modelName: string): ModelProfile | null {
    return this.modelProfiles.find(p => p.modelName === modelName) || null
  }

  private findModelProfileByModelName(modelName: string): ModelProfile | null {
    return this.modelProfiles.find(p => p.modelName === modelName) || null
  }

  private findModelProfileByName(name: string): ModelProfile | null {
    return this.modelProfiles.find(p => p.name === name) || null
  }

  private updateLastUsed(modelName: string): void {
    const profile = this.findModelProfile(modelName)
    if (profile) {
      profile.lastUsed = Date.now()
    }
  }
}

// 全局ModelManager实例 - 避免配置文件读写竞争条件
let globalModelManager: ModelManager | null = null

/**
 * 获取全局ModelManager实例（单例模式修复竞争条件）
 * 确保整个应用程序中只有一个ModelManager实例，避免配置冲突
 *
 * @returns ModelManager - 全局单例的模型管理器实例
 *
 * 🔧 单例设计原因：
 * - 避免多个组件同时读写配置文件造成的竞争条件
 * - 确保模型状态在应用程序范围内的一致性
 * - 提高性能：减少重复的配置文件读取
 * - 简化调试：集中的模型管理状态
 *
 * 🛡️ 错误处理策略：
 * - 配置读取失败时创建空配置的备用实例
 * - 记录详细错误信息便于问题诊断
 * - 保证函数总是返回可用的ModelManager实例
 *
 * 💡 使用模式：
 * - 在任何需要模型操作的地方调用此函数
 * - 不需要手动传递ModelManager实例
 * - 配置更改后可通过reloadModelManager()强制刷新
 */
export const getModelManager = (): ModelManager => {
  try {
    if (!globalModelManager) {
      const config = getGlobalConfig()
      if (!config) {
        console.warn(
          'No global config available, creating ModelManager with empty config',
        )
        globalModelManager = new ModelManager({
          modelProfiles: [],
          modelPointers: { main: '', task: '', reasoning: '', quick: '' },
        })
      } else {
        globalModelManager = new ModelManager(config)
      }
    }
    return globalModelManager
  } catch (error) {
    console.error('Error creating ModelManager:', error)
    // Return a fallback ModelManager with empty configuration
    return new ModelManager({
      modelProfiles: [],
      modelPointers: { main: '', task: '', reasoning: '', quick: '' },
    })
  }
}

/**
 * 强制重载全局ModelManager实例
 * 配置更改后使用此函数确保获取最新数据
 *
 * 🔄 使用时机：
 * - 用户通过/model命令添加或删除模型后
 * - 模型配置文件发生更改后
 * - 模型指针重新分配后
 * - 需要强制刷新模型状态的任何时候
 *
 * ⚡ 工作原理：
 * 1. 清除现有的全局实例引用
 * 2. 强制下次调用时重新创建实例
 * 3. 从最新的配置文件加载模型设置
 *
 * 📝 注意：此操作是轻量级的，因为只是重置引用
 * 实际的配置重新加载在下次getModelManager()调用时发生
 */
export const reloadModelManager = (): void => {
  globalModelManager = null
  // Force creation of new instance with fresh config
  getModelManager()
}

/**
 * Get the quick model for fast operations
 */
export const getQuickModel = (): string => {
  const manager = getModelManager()
  const quickModel = manager.getModel('quick')
  return quickModel?.modelName || 'quick' // Return pointer if model not resolved
}
