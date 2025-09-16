/**
 * 🎯 模型适配器工厂 - AI 模型 API 的统一访问和适配层
 *
 * 🏗️ 核心功能：
 * - 实现多 AI 模型的统一适配器创建机制
 * - 提供智能 API 架构选择和版本兼容
 * - 管理不同 AI 服务商的 API 差异适配
 * - 支持新旧 API 架构的平滑过渡和回退
 *
 * 🔄 依赖关系：
 * - 上游：被 Claude 服务和查询系统使用
 * - 下游：依赖模型能力定义和适配器实现
 *
 * 📊 使用场景：
 * - 根据模型配置自动选择最优 API 接口
 * - 新模型集成时的适配器创建
 * - API 版本升级的兼容性管理
 * - 第三方服务的 API 差异处理
 *
 * 🔧 技术实现：
 * - 工厂模式：基于配置的适配器实例化
 * - 策略模式：多种 API 架构的动态选择
 * - 能力驱动：基于模型能力的智能适配
 * - 回退机制：API 不可用时的自动降级
 *
 * 🔄 支持的 API 类型：
 * - responses_api: 新一代流式响应 API（支持工具调用、思考等高级特性）
 * - chat_completions: 传统聊天完成 API（通用兼容性好）
 *
 * 📡 适配器选择逻辑：
 * 1. 检查模型能力定义
 * 2. 判断 API 端点类型（官方/第三方）
 * 3. 选择最优 API 架构
 * 4. 创建相应适配器实例
 */
import { ModelAPIAdapter } from './adapters/base'
import { ResponsesAPIAdapter } from './adapters/responsesAPI'
import { ChatCompletionsAdapter } from './adapters/chatCompletions'
import { getModelCapabilities } from '../constants/modelCapabilities'
import { ModelProfile, getGlobalConfig } from '../utils/config'
import { ModelCapabilities } from '../types/modelCapabilities'

/**
 * 模型适配器工厂类 - 智能 API 适配器创建的核心实现
 *
 * 负责根据模型配置和能力创建合适的 API 适配器，提供统一的
 * 多模型访问接口和智能的 API 架构选择机制。
 *
 * 🎯 主要功能：
 * - 自动化适配器实例创建
 * - 智能 API 类型选择
 * - 配置驱动的适配策略
 * - 扩展友好的工厂接口
 *
 * 💡 设计模式：
 * - 工厂方法模式：createAdapter 统一创建接口
 * - 策略模式：determineAPIType 动态选择策略
 * - 单一职责：专注于适配器创建逻辑
 */
export class ModelAdapterFactory {
  /**
   * 创建模型 API 适配器 - 工厂的主要入口点
   *
   * 根据模型配置和能力定义自动选择最优的 API 接口，
   * 创建对应的适配器实例以屏蔽不同 AI 服务商的差异。
   *
   * @param modelProfile - 模型配置文件，包含模型名称、API 密钥、端点等信息
   * @returns ModelAPIAdapter - 对应的 API 适配器实例
   *
   * 🔄 创建流程：
   * 1. 获取模型能力定义
   * 2. 智能选择 API 架构类型
   * 3. 实例化对应的适配器
   * 4. 返回统一接口
   *
   * 🎯 适配器类型：
   * - ResponsesAPIAdapter: 用于支持高级特性的新 API
   * - ChatCompletionsAdapter: 用于传统兼容的标准 API
   */
  static createAdapter(modelProfile: ModelProfile): ModelAPIAdapter {
    // 获取模型的能力定义（支持哪些功能、使用什么API等）
    const capabilities = getModelCapabilities(modelProfile.modelName)

    // 根据模型能力和配置确定应该使用哪种API
    const apiType = this.determineAPIType(modelProfile, capabilities)

    // 创建相应的适配器实例
    switch (apiType) {
      case 'responses_api':
        // 新一代响应API - 支持高级特性如工具调用、思考过程等
        return new ResponsesAPIAdapter(capabilities, modelProfile)
      case 'chat_completions':
      default:
        // 传统聊天完成API - 通用性好，兼容性强
        return new ChatCompletionsAdapter(capabilities, modelProfile)
    }
  }
  
  /**
   * 确定 API 架构类型 - 智能 API 选择的核心逻辑
   *
   * 基于模型能力、端点类型、兼容性等多个因素综合判断，
   * 选择最适合的 API 架构类型以确保最佳性能和兼容性。
   *
   * @param modelProfile - 模型配置信息
   * @param capabilities - 模型能力定义
   * @returns 'responses_api' | 'chat_completions' - 选定的 API 类型
   *
   * 🧠 选择策略：
   * 1. 模型能力优先：检查是否支持 responses_api
   * 2. 端点兼容性：官方端点优先使用新 API
   * 3. 第三方回退：非官方端点使用兼容 API
   * 4. 备选方案：支持多级回退机制
   *
   * 💡 决策树：
   * - 不支持 responses_api → chat_completions
   * - 非官方端点 → 优先 chat_completions
   * - 官方端点 + 支持 → responses_api
   */
  private static determineAPIType(
    modelProfile: ModelProfile,
    capabilities: ModelCapabilities
  ): 'responses_api' | 'chat_completions' {
    // 如果模型不支持Responses API，直接使用Chat Completions
    if (capabilities.apiArchitecture.primary !== 'responses_api') {
      return 'chat_completions'
    }

    // 检查是否为官方OpenAI端点
    const isOfficialOpenAI = !modelProfile.baseURL ||
      modelProfile.baseURL.includes('api.openai.com')

    // 非官方端点使用Chat Completions（即使模型支持Responses API）
    // 因为第三方代理通常不支持新API特性
    if (!isOfficialOpenAI) {
      // 如果有备选方案，使用备选方案
      if (capabilities.apiArchitecture.fallback === 'chat_completions') {
        return 'chat_completions'
      }
      // 否则使用主要方案（可能失败，但让它尝试）
      return capabilities.apiArchitecture.primary
    }

    // 对于官方端点支持的模型，目前总是使用Responses API
    // 流式传输的备选方案将在运行时处理（如果需要）

    // 使用主要API类型
    return capabilities.apiArchitecture.primary
  }
  
  /**
   * 检查是否使用 Responses API - 便利的 API 类型判断方法
   *
   * 为外部组件提供快速的 API 类型判断接口，无需了解
   * 内部的复杂选择逻辑即可确定模型的 API 架构类型。
   *
   * @param modelProfile - 模型配置信息
   * @returns boolean - 是否应该使用 Responses API
   *
   * 🎯 使用场景：
   * - API 调用前的类型检查
   * - 功能特性的条件判断
   * - 错误处理的分支逻辑
   * - 性能优化的预判断
   *
   * 💡 实现原理：
   * 内部调用 determineAPIType 获取完整的 API 类型判断结果，
   * 然后简化为布尔值返回给调用方。
   */
  static shouldUseResponsesAPI(modelProfile: ModelProfile): boolean {
    const capabilities = getModelCapabilities(modelProfile.modelName)
    const apiType = this.determineAPIType(modelProfile, capabilities)
    return apiType === 'responses_api'
  }
}