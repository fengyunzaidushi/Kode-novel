/**
 * 模型适配器工厂 - AI模型API的统一访问层
 *
 * 🎯 核心职责：
 * - 根据模型配置自动选择合适的API适配器
 * - 处理不同AI服务商的API差异（OpenAI、Anthropic等）
 * - 支持新旧API架构的平滑过渡
 *
 * 🔄 支持的API类型：
 * - responses_api: 新一代流式响应API（支持工具调用、思考等高级特性）
 * - chat_completions: 传统聊天完成API（通用兼容性好）
 *
 * 📡 适配器选择逻辑：
 * 1. 检查模型能力定义
 * 2. 判断API端点类型（官方/第三方）
 * 3. 选择最优API架构
 * 4. 创建相应适配器实例
 */
import { ModelAPIAdapter } from './adapters/base'
import { ResponsesAPIAdapter } from './adapters/responsesAPI'
import { ChatCompletionsAdapter } from './adapters/chatCompletions'
import { getModelCapabilities } from '../constants/modelCapabilities'
import { ModelProfile, getGlobalConfig } from '../utils/config'
import { ModelCapabilities } from '../types/modelCapabilities'

/**
 * 模型适配器工厂类
 * 负责根据模型配置和能力创建合适的API适配器
 */
export class ModelAdapterFactory {
  /**
   * 根据模型配置创建适当的API适配器
   * 这是工厂的主要入口点，自动选择最优的API接口
   *
   * @param modelProfile - 模型配置文件，包含模型名称、API密钥、端点等信息
   * @returns ModelAPIAdapter - 对应的API适配器实例
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
   * 决定应该使用哪种API接口
   * 这是适配器选择的核心逻辑，考虑模型能力、端点类型等因素
   *
   * @param modelProfile - 模型配置信息
   * @param capabilities - 模型能力定义
   * @returns 'responses_api' | 'chat_completions' - 选定的API类型
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
   * 检查模型是否应该使用Responses API
   * 便利方法，用于外部组件快速判断API类型
   *
   * @param modelProfile - 模型配置信息
   * @returns boolean - 是否应该使用Responses API
   */
  static shouldUseResponsesAPI(modelProfile: ModelProfile): boolean {
    const capabilities = getModelCapabilities(modelProfile.modelName)
    const apiType = this.determineAPIType(modelProfile, capabilities)
    return apiType === 'responses_api'
  }
}