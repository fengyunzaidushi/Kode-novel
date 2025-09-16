/**
 * 🎯 配置管理核心系统 - Kode 应用程序的配置中枢
 *
 * 🏗️ 核心功能：
 * - 实现多层次配置管理架构（全局/项目级）
 * - 提供统一的模型配置文件系统
 * - 管理 MCP 服务器配置和集成
 * - 支持用户偏好和主题定制
 *
 * 🔄 依赖关系：
 * - 上游：被整个应用的配置相关功能使用
 * - 下游：依赖文件系统、JSON 解析和状态管理
 *
 * 📊 使用场景：
 * - 应用程序启动时的配置初始化
 * - 用户设置的读取和保存
 * - 项目特定配置的管理
 * - AI 模型配置的动态切换
 *
 * 🔧 技术实现：
 * - 基于文件系统的持久化存储
 * - 类型安全的配置模式验证
 * - 配置迁移和向后兼容机制
 * - 测试环境的配置隔离支持
 *
 * 🏗️ 配置架构：
 * - 全局配置：存储在用户主目录 ~/.kode.json
 * - 项目配置：存储在全局配置中的projects字段，按项目路径索引
 * - MCP配置：支持全局、项目和.mcprc文件三种作用域
 *
 * 🔒 安全特性：
 * - API密钥安全存储和截断
 * - 配置文件解析错误处理
 * - 权限和作用域验证
 * - 测试环境隔离
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve, join } from 'path'
import { cloneDeep, memoize, pick } from 'lodash-es'
import { homedir } from 'os'
import { GLOBAL_CLAUDE_FILE } from './env'
import { getCwd } from './state'
import { randomBytes } from 'crypto'
import { safeParseJSON } from './json'
import { ConfigParseError } from './errors'
import type { ThemeNames } from './theme'
import { debug as debugLogger } from './debugLogger'
import { getSessionState, setSessionState } from './sessionState'

/**
 * MCP Stdio 服务器配置 - 基于标准输入输出的 MCP 服务器配置
 *
 * 通过标准输入输出与子进程通信的 MCP 服务器配置，
 * 适用于本地 MCP 服务器的启动和管理。
 */
export type McpStdioServerConfig = {
  /** 服务器类型，可选，默认为 stdio，保持向后兼容性 */
  type?: 'stdio'
  /** 要执行的命令或可执行文件路径 */
  command: string
  /** 命令参数数组 */
  args: string[]
  /** 可选的环境变量设置 */
  env?: Record<string, string>
}

/**
 * MCP SSE 服务器配置 - 基于服务器发送事件的 MCP 服务器配置
 *
 * 通过 HTTP 服务器发送事件（Server-Sent Events）通信的
 * MCP 服务器配置，适用于远程 MCP 服务器的连接。
 */
export type McpSSEServerConfig = {
  /** 服务器类型，必须为 sse */
  type: 'sse'
  /** 服务器 URL 地址 */
  url: string
}

/**
 * MCP 服务器配置联合类型 - 统一的 MCP 服务器配置接口
 *
 * 支持 stdio 和 sse 两种不同的通信方式，提供灵活的
 * MCP 服务器连接选项以适应不同的部署场景。
 */
export type McpServerConfig = McpStdioServerConfig | McpSSEServerConfig

/**
 * 项目级配置类型 - 特定项目的完整配置结构
 *
 * 存储特定项目的所有配置信息，每个项目有独立的配置，
 * 支持项目级的工具权限、上下文管理和用户体验设置。
 */
export type ProjectConfig = {
  allowedTools: string[] // 项目中允许使用的工具列表
  context: Record<string, string> // 项目上下文信息键值对
  contextFiles?: string[] // 上下文文件路径列表
  history: string[] // 命令历史记录
  dontCrawlDirectory?: boolean // 是否禁用目录爬取（如用户主目录）
  enableArchitectTool?: boolean // 是否启用架构师工具
  mcpContextUris: string[] // MCP上下文URI列表
  mcpServers?: Record<string, McpServerConfig> // 项目级MCP服务器配置
  approvedMcprcServers?: string[] // 已批准的.mcprc服务器列表
  rejectedMcprcServers?: string[] // 已拒绝的.mcprc服务器列表
  // 会话统计信息
  lastAPIDuration?: number // 上次API调用持续时间
  lastCost?: number // 上次会话成本
  lastDuration?: number // 上次会话总持续时间
  lastSessionId?: string // 上次会话ID
  // 示例文件管理
  exampleFiles?: string[] // 示例文件路径列表
  exampleFilesGeneratedAt?: number // 示例文件生成时间戳
  // 用户体验状态
  hasTrustDialogAccepted?: boolean // 是否已接受信任对话框
  hasCompletedProjectOnboarding?: boolean // 是否完成项目引导
}

const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  allowedTools: [],
  context: {},
  history: [],
  dontCrawlDirectory: false,
  enableArchitectTool: false,
  mcpContextUris: [],
  mcpServers: {},
  approvedMcprcServers: [],
  rejectedMcprcServers: [],
  hasTrustDialogAccepted: false,
}

/**
 * 为指定项目生成默认配置 - 项目配置初始化函数
 *
 * 根据项目路径生成合适的默认配置，对于用户主目录
 * 等特殊路径会应用特定的安全设置。
 *
 * @param projectPath - 项目路径
 * @returns 该项目的默认配置对象
 */
function defaultConfigForProject(projectPath: string): ProjectConfig {
  const config = { ...DEFAULT_PROJECT_CONFIG }
  // 用户主目录默认禁用目录爬取以保护隐私
  if (projectPath === homedir()) {
    config.dontCrawlDirectory = true
  }
  return config
}

/**
 * 自动更新器状态类型 - 应用程序自动更新的状态枚举
 *
 * 定义自动更新功能的各种可能状态，用于控制
 * 应用程序的自动更新行为和用户体验。
 */
export type AutoUpdaterStatus =
  | 'disabled'        // 已禁用自动更新
  | 'enabled'         // 已启用自动更新
  | 'no_permissions'  // 缺乏更新权限
  | 'not_configured'  // 尚未配置

/**
 * 检查值是否为有效的自动更新器状态 - 类型守卫函数
 *
 * @param value - 待检查的字符串值
 * @returns 是否为有效的自动更新器状态
 */
export function isAutoUpdaterStatus(value: string): value is AutoUpdaterStatus {
  return ['disabled', 'enabled', 'no_permissions', 'not_configured'].includes(
    value as AutoUpdaterStatus,
  )
}

/**
 * 通知渠道类型 - 系统通知的输出方式
 *
 * 定义应用程序可以使用的各种通知渠道，
 * 适配不同的终端环境和用户偏好。
 */
export type NotificationChannel =
  | 'iterm2'                  // iTerm2 专用通知
  | 'terminal_bell'           // 终端铃声通知
  | 'iterm2_with_bell'        // iTerm2 + 铃声组合
  | 'notifications_disabled'  // 禁用通知

/**
 * AI 提供商类型 - 支持的 AI 模型提供商
 *
 * 定义 Kode 支持的所有 AI 模型提供商，包括
 * 国际主流提供商、国产 AI 平台和自定义配置。
 */
export type ProviderType =
  | 'anthropic'       // Anthropic (Claude)
  | 'openai'          // OpenAI (GPT)
  | 'mistral'         // Mistral AI
  | 'deepseek'        // DeepSeek
  | 'kimi'            // Moonshot AI (Kimi)
  | 'qwen'            // 阿里云通义千问
  | 'glm'             // 智谱清言 GLM
  | 'minimax'         // MiniMax
  | 'baidu-qianfan'   // 百度千帆
  | 'siliconflow'     // SiliconFlow
  | 'bigdream'        // BigDream
  | 'opendev'         // OpenDev
  | 'xai'             // xAI (Grok)
  | 'groq'            // Groq
  | 'gemini'          // Google Gemini
  | 'ollama'          // Ollama (本地模型)
  | 'azure'           // Azure OpenAI
  | 'custom'          // 自定义提供商
  | 'custom-openai'   // 自定义 OpenAI 兼容

/**
 * 模型配置文件类型 - 新一代模型管理系统
 * 每个模型配置文件包含完整的模型连接和行为参数
 *
 * 🎯 设计理念：
 * - 支持多AI提供商（OpenAI、Anthropic、国产模型等）
 * - 统一的配置接口，隐藏提供商差异
 * - 模型特殊优化（如GPT-5推理设置）
 * - 使用统计和性能监控
 */
export type ModelProfile = {
  name: string // 用户友好的显示名称
  provider: ProviderType // AI提供商类型
  modelName: string // 主键 - 实际的模型标识符（如gpt-4、claude-3-sonnet）
  baseURL?: string // 自定义API端点URL
  apiKey: string // API密钥
  maxTokens: number // 输出token限制（对于GPT-5，映射到max_completion_tokens）
  contextLength: number // 上下文窗口大小
  reasoningEffort?: 'low' | 'medium' | 'high' | 'minimal' | 'medium' // 推理强度（GPT-5等推理模型）
  isActive: boolean // 配置是否启用
  createdAt: number // 创建时间戳
  lastUsed?: number // 最后使用时间戳
  // 🔥 GPT-5特殊元数据
  isGPT5?: boolean // 自动检测的GPT-5模型标志
  validationStatus?: 'valid' | 'needs_repair' | 'auto_repaired' // 配置状态
  lastValidation?: number // 最后验证时间戳
}

/**
 * 模型指针类型 - 不同场景使用不同模型
 * 允许为不同的用途配置专门的模型
 */
export type ModelPointerType = 'main' | 'task' | 'reasoning' | 'quick'

/**
 * 模型指针映射 - 模型角色分工系统
 * 根据使用场景自动选择最适合的模型
 */
export type ModelPointers = {
  main: string // 主对话模型ID（用于常规交互）
  task: string // 任务工具模型ID（用于工具调用和任务执行）
  reasoning: string // 推理模型ID（用于复杂逻辑推理）
  quick: string // 快速模型ID（用于简单快速响应）
}

export type AccountInfo = {
  accountUuid: string
  emailAddress: string
  organizationUuid?: string
}

/**
 * 全局配置类型 - 用户级全局设置
 * 存储在用户主目录，影响所有项目的全局配置
 *
 * 🏠 配置层次结构：
 * - 用户偏好（主题、通知等）
 * - 模型配置文件和指针系统
 * - 全局MCP服务器
 * - 应用程序状态和统计
 */
export type GlobalConfig = {
  projects?: Record<string, ProjectConfig> // 按项目路径索引的项目配置
  numStartups: number // 应用启动次数统计
  autoUpdaterStatus?: AutoUpdaterStatus // 自动更新状态
  userID?: string // 匿名用户ID（用于统计）
  theme: ThemeNames // 界面主题
  hasCompletedOnboarding?: boolean // 是否完成初始引导
  // 版本管理 - 跟踪需要重置引导的最后版本
  lastOnboardingVersion?: string
  // 版本管理 - 跟踪已查看发布说明的最后版本
  lastReleaseNotesSeen?: string
  mcpServers?: Record<string, McpServerConfig> // 全局MCP服务器配置
  preferredNotifChannel: NotificationChannel // 首选通知渠道
  verbose: boolean // 详细输出模式
  // API密钥管理
  customApiKeyResponses?: {
    approved?: string[] // 已批准的自定义API密钥
    rejected?: string[] // 已拒绝的自定义API密钥
  }
  primaryProvider?: ProviderType // 主要AI提供商
  maxTokens?: number // 全局最大token限制
  hasAcknowledgedCostThreshold?: boolean // 是否已确认成本阈值警告
  oauthAccount?: AccountInfo // OAuth账户信息
  // 终端集成设置
  iterm2KeyBindingInstalled?: boolean // 遗留字段 - 保持向后兼容性
  shiftEnterKeyBindingInstalled?: boolean // Shift+Enter键绑定是否已安装
  proxy?: string // 代理服务器设置
  stream?: boolean // 是否启用流式响应

  // 新模型系统
  modelProfiles?: ModelProfile[] // 模型配置文件列表
  modelPointers?: ModelPointers // 模型指针系统
  defaultModelName?: string // 默认模型名称
  // 更新通知管理
  lastDismissedUpdateVersion?: string // 最后忽略的更新版本
}

export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  numStartups: 0,
  autoUpdaterStatus: 'not_configured',
  theme: 'dark' as ThemeNames,
  preferredNotifChannel: 'iterm2',
  verbose: false,
  primaryProvider: 'anthropic' as ProviderType,
  customApiKeyResponses: {
    approved: [],
    rejected: [],
  },
  stream: true,

  // New model system defaults
  modelProfiles: [],
  modelPointers: {
    main: '',
    task: '',
    reasoning: '',
    quick: '',
  },
  lastDismissedUpdateVersion: undefined,
}

export const GLOBAL_CONFIG_KEYS = [
  'autoUpdaterStatus',
  'theme',
  'hasCompletedOnboarding',
  'lastOnboardingVersion',
  'lastReleaseNotesSeen',
  'verbose',
  'customApiKeyResponses',
  'primaryProvider',
  'preferredNotifChannel',
  'shiftEnterKeyBindingInstalled',
  'maxTokens',
] as const

export type GlobalConfigKey = (typeof GLOBAL_CONFIG_KEYS)[number]

export function isGlobalConfigKey(key: string): key is GlobalConfigKey {
  return GLOBAL_CONFIG_KEYS.includes(key as GlobalConfigKey)
}

export const PROJECT_CONFIG_KEYS = [
  'dontCrawlDirectory',
  'enableArchitectTool',
  'hasTrustDialogAccepted',
  'hasCompletedProjectOnboarding',
] as const

export type ProjectConfigKey = (typeof PROJECT_CONFIG_KEYS)[number]

/**
 * 检查信任对话框是否已被接受
 * 向上遍历目录树，寻找任何父级目录中是否已接受信任对话框
 *
 * @returns boolean - 如果当前路径或任何父级路径已接受信任对话框则返回true
 *
 * 🔍 工作机制：
 * 1. 从当前工作目录开始向上遍历
 * 2. 检查每个目录级别的项目配置
 * 3. 如果找到已接受的信任设置，立即返回true
 * 4. 遍历到根目录后仍未找到则返回false
 *
 * 这种设计允许子目录继承父目录的信任设置
 */
export function checkHasTrustDialogAccepted(): boolean {
  let currentPath = getCwd()
  const config = getConfig(GLOBAL_CLAUDE_FILE, DEFAULT_GLOBAL_CONFIG)

  while (true) {
    const projectConfig = config.projects?.[currentPath]
    if (projectConfig?.hasTrustDialogAccepted) {
      return true
    }
    const parentPath = resolve(currentPath, '..')
    // Stop if we've reached the root (when parent is same as current)
    if (parentPath === currentPath) {
      break
    }
    currentPath = parentPath
  }

  return false
}

// We have to put this test code here because Jest doesn't support mocking ES modules :O
const TEST_GLOBAL_CONFIG_FOR_TESTING: GlobalConfig = {
  ...DEFAULT_GLOBAL_CONFIG,
  autoUpdaterStatus: 'disabled',
}
const TEST_PROJECT_CONFIG_FOR_TESTING: ProjectConfig = {
  ...DEFAULT_PROJECT_CONFIG,
}

export function isProjectConfigKey(key: string): key is ProjectConfigKey {
  return PROJECT_CONFIG_KEYS.includes(key as ProjectConfigKey)
}

/**
 * 保存全局配置到磁盘
 * 将全局设置保存到用户主目录的配置文件中
 *
 * @param config - 要保存的全局配置对象
 *
 * ⚡ 保存策略：
 * - 测试环境：写入内存测试配置对象
 * - 生产环境：写入~/.kode.json文件
 * - 保持项目配置完整性：合并现有项目配置
 * - 只保存与默认值不同的配置项
 *
 * 🔄 工作流程：
 * 1. 检测运行环境（测试/生产）
 * 2. 读取当前配置以保留项目设置
 * 3. 合并新的全局配置
 * 4. 过滤默认值后写入文件
 */
export function saveGlobalConfig(config: GlobalConfig): void {
  if (process.env.NODE_ENV === 'test') {
    for (const key in config) {
      TEST_GLOBAL_CONFIG_FOR_TESTING[key] = config[key]
    }
    return
  }

  // 直接保存配置（无需清除缓存，因为已移除缓存）
  saveConfig(
    GLOBAL_CLAUDE_FILE,
    {
      ...config,
      projects: getConfig(GLOBAL_CLAUDE_FILE, DEFAULT_GLOBAL_CONFIG).projects,
    },
    DEFAULT_GLOBAL_CONFIG,
  )
}

/**
 * 获取全局配置
 * 从用户主目录读取并返回经过迁移处理的全局配置
 *
 * @returns GlobalConfig - 完整的全局配置对象
 *
 * 🔧 配置处理流程：
 * 1. 测试环境：返回内存中的测试配置
 * 2. 生产环境：从~/.kode.json读取配置
 * 3. 应用配置迁移（清理旧字段，更新格式）
 * 4. 返回标准化的配置对象
 *
 * 📝 注意：临时移除了缓存机制，确保总是获取最新配置
 * 这样可以避免配置更新后的不一致问题
 */
export function getGlobalConfig(): GlobalConfig {
  if (process.env.NODE_ENV === 'test') {
    return TEST_GLOBAL_CONFIG_FOR_TESTING
  }
  const config = getConfig(GLOBAL_CLAUDE_FILE, DEFAULT_GLOBAL_CONFIG)
  return migrateModelProfilesRemoveId(config)
}

/**
 * 获取 Anthropic API 密钥 - 从环境变量读取 Claude API 密钥
 *
 * @returns Anthropic API 密钥或 null（如果未设置）
 */
export function getAnthropicApiKey(): null | string {
  return process.env.ANTHROPIC_API_KEY || null
}

/**
 * 标准化 API 密钥用于配置存储 - 安全截断 API 密钥
 *
 * 只保留 API 密钥的最后 20 个字符用于配置存储和识别，
 * 避免在配置文件中存储完整的敏感信息。
 *
 * @param apiKey - 完整的 API 密钥
 * @returns 截断后的 API 密钥字符串
 */
export function normalizeApiKeyForConfig(apiKey: string): string {
  return apiKey?.slice(-20) ?? ''
}

/**
 * 获取自定义 API 密钥状态 - 检查 API 密钥的授权状态
 *
 * 根据截断的 API 密钥检查用户之前是否已经批准或拒绝使用该密钥，
 * 用于避免重复的用户授权提示。
 *
 * @param truncatedApiKey - 截断后的 API 密钥
 * @returns API 密钥的授权状态
 */
export function getCustomApiKeyStatus(
  truncatedApiKey: string,
): 'approved' | 'rejected' | 'new' {
  const config = getGlobalConfig()
  if (config.customApiKeyResponses?.approved?.includes(truncatedApiKey)) {
    return 'approved'
  }
  if (config.customApiKeyResponses?.rejected?.includes(truncatedApiKey)) {
    return 'rejected'
  }
  return 'new'
}

/**
 * 通用配置保存函数
 * 将配置对象写入指定文件，只保存与默认值不同的配置项
 *
 * @param file - 目标配置文件路径
 * @param config - 要保存的配置对象
 * @param defaultConfig - 默认配置对象（用于过滤）
 *
 * 💾 优化策略：
 * - 只保存与默认值不同的配置项
 * - 减少配置文件大小和读取时间
 * - 使配置文件更易于人工阅读和维护
 * - 避免存储冗余的默认值
 *
 * 🔍 工作原理：
 * 1. 深度比较每个配置项与默认值
 * 2. 过滤出需要保存的非默认配置
 * 3. 格式化为可读的JSON并写入文件
 */
function saveConfig<A extends object>(
  file: string,
  config: A,
  defaultConfig: A,
): void {
  // Filter out any values that match the defaults
  const filteredConfig = Object.fromEntries(
    Object.entries(config).filter(
      ([key, value]) =>
        JSON.stringify(value) !== JSON.stringify(defaultConfig[key as keyof A]),
    ),
  )
  writeFileSync(file, JSON.stringify(filteredConfig, null, 2), 'utf-8')
}

// Flag to track if config reading is allowed
let configReadingAllowed = false

/**
 * 启用配置系统 - 初始化配置读取功能
 *
 * 设置配置读取标志并验证全局配置文件的有效性，
 * 防止在模块初始化期间进行配置读取操作。
 */
export function enableConfigs(): void {
  // 在设置此标志之前读取配置会显示控制台警告
  // 防止在模块初始化期间添加配置读取
  configReadingAllowed = true
  // 只检查全局配置，因为目前所有配置共享一个文件
  getConfig(
    GLOBAL_CLAUDE_FILE,
    DEFAULT_GLOBAL_CONFIG,
    true /* throw on invalid */,
  )
}

/**
 * 核心配置读取函数
 * 从指定文件读取配置，合并默认值，并处理各种错误情况
 *
 * @param file - 配置文件路径
 * @param defaultConfig - 默认配置对象
 * @param throwOnInvalid - 是否在配置无效时抛出异常
 * @returns A - 完整的配置对象
 *
 * 🔄 配置读取流程：
 * 1. 检查文件是否存在
 * 2. 读取并解析JSON内容
 * 3. 与默认配置合并
 * 4. 处理向后兼容性
 * 5. 错误时回退到默认配置
 *
 * 🛡️ 错误处理策略：
 * - 文件不存在：使用默认配置
 * - JSON解析错误：抛出ConfigParseError或回退到默认
 * - 文件读取错误：记录日志并使用默认配置
 * - 详细的调试日志记录整个读取过程
 *
 * 🎯 设计原则：
 * - 宽松读取：尽量不因配置错误导致程序崩溃
 * - 详细日志：便于调试配置问题
 * - 深拷贝保护：避免意外修改默认配置
 */
function getConfig<A>(
  file: string,
  defaultConfig: A,
  throwOnInvalid?: boolean,
): A {
  // 简化配置访问逻辑，移除复杂的时序检查

  debugLogger.state('CONFIG_LOAD_START', {
    file,
    fileExists: String(existsSync(file)),
    throwOnInvalid: String(!!throwOnInvalid),
  })

  if (!existsSync(file)) {
    debugLogger.state('CONFIG_LOAD_DEFAULT', {
      file,
      reason: 'file_not_exists',
      defaultConfigKeys: Object.keys(defaultConfig as object).join(', '),
    })
    return cloneDeep(defaultConfig)
  }

  try {
    const fileContent = readFileSync(file, 'utf-8')
    debugLogger.state('CONFIG_FILE_READ', {
      file,
      contentLength: String(fileContent.length),
      contentPreview:
        fileContent.substring(0, 100) + (fileContent.length > 100 ? '...' : ''),
    })

    try {
      const parsedConfig = JSON.parse(fileContent)
      debugLogger.state('CONFIG_JSON_PARSED', {
        file,
        parsedKeys: Object.keys(parsedConfig).join(', '),
      })

      // Handle backward compatibility - remove logic for deleted fields
      const finalConfig = {
        ...cloneDeep(defaultConfig),
        ...parsedConfig,
      }

      debugLogger.state('CONFIG_LOAD_SUCCESS', {
        file,
        finalConfigKeys: Object.keys(finalConfig as object).join(', '),
      })

      return finalConfig
    } catch (error) {
      // Throw a ConfigParseError with the file path and default config
      const errorMessage =
        error instanceof Error ? error.message : String(error)

      debugLogger.error('CONFIG_JSON_PARSE_ERROR', {
        file,
        errorMessage,
        errorType:
          error instanceof Error ? error.constructor.name : typeof error,
        contentLength: String(fileContent.length),
      })

      throw new ConfigParseError(errorMessage, file, defaultConfig)
    }
  } catch (error: unknown) {
    // Re-throw ConfigParseError if throwOnInvalid is true
    if (error instanceof ConfigParseError && throwOnInvalid) {
      debugLogger.error('CONFIG_PARSE_ERROR_RETHROWN', {
        file,
        throwOnInvalid: String(throwOnInvalid),
        errorMessage: error.message,
      })
      throw error
    }

    debugLogger.warn('CONFIG_FALLBACK_TO_DEFAULT', {
      file,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      action: 'using_default_config',
    })

    return cloneDeep(defaultConfig)
  }
}

/**
 * 获取当前项目的配置
 * 从全局配置中提取特定于当前工作目录的项目配置
 *
 * @returns ProjectConfig - 当前项目的配置对象
 *
 * 🎯 项目配置解析流程：
 * 1. 测试环境：返回内存中的测试配置
 * 2. 获取当前工作目录的绝对路径作为项目标识符
 * 3. 从全局配置中查找对应项目的配置
 * 4. 如果不存在，使用默认项目配置
 * 5. 处理历史遗留数据格式问题
 *
 * 🔧 数据修复机制：
 * - allowedTools可能因历史原因变成字符串，需要解析回数组
 * - 为用户主目录自动设置dontCrawlDirectory=true
 * - 确保返回完整的ProjectConfig结构
 *
 * 📂 项目配置作用域：
 * - 每个项目（目录路径）有独立的配置
 * - 项目配置不会相互影响
 * - 支持项目级的工具权限和上下文设置
 */
export function getCurrentProjectConfig(): ProjectConfig {
  if (process.env.NODE_ENV === 'test') {
    return TEST_PROJECT_CONFIG_FOR_TESTING
  }

  const absolutePath = resolve(getCwd())
  const config = getConfig(GLOBAL_CLAUDE_FILE, DEFAULT_GLOBAL_CONFIG)

  if (!config.projects) {
    return defaultConfigForProject(absolutePath)
  }

  const projectConfig =
    config.projects[absolutePath] ?? defaultConfigForProject(absolutePath)
  // Not sure how this became a string
  // TODO: Fix upstream
  if (typeof projectConfig.allowedTools === 'string') {
    projectConfig.allowedTools =
      (safeParseJSON(projectConfig.allowedTools) as string[]) ?? []
  }
  return projectConfig
}

/**
 * 保存当前项目的配置
 * 将项目配置更新到全局配置文件中对应的项目部分
 *
 * @param projectConfig - 要保存的项目配置对象
 *
 * 💾 保存机制：
 * - 测试环境：更新内存中的测试配置
 * - 生产环境：更新全局配置文件中的projects字段
 * - 使用当前工作目录的绝对路径作为项目键
 * - 保持其他项目配置不变
 *
 * 🔄 数据流程：
 * 1. 读取当前完整的全局配置
 * 2. 更新或添加当前项目的配置
 * 3. 保持其他项目和全局设置不变
 * 4. 写入配置文件
 *
 * 📝 注意：项目配置实际存储在全局配置文件的projects字段中
 * 这种设计避免了在每个项目目录创建配置文件的复杂性
 */
export function saveCurrentProjectConfig(projectConfig: ProjectConfig): void {
  if (process.env.NODE_ENV === 'test') {
    for (const key in projectConfig) {
      TEST_PROJECT_CONFIG_FOR_TESTING[key] = projectConfig[key]
    }
    return
  }
  const config = getConfig(GLOBAL_CLAUDE_FILE, DEFAULT_GLOBAL_CONFIG)
  saveConfig(
    GLOBAL_CLAUDE_FILE,
    {
      ...config,
      projects: {
        ...config.projects,
        [resolve(getCwd())]: projectConfig,
      },
    },
    DEFAULT_GLOBAL_CONFIG,
  )
}

/**
 * 检查自动更新器是否被禁用 - 异步检查自动更新状态
 *
 * @returns Promise<boolean> - 如果自动更新被禁用则返回 true
 */
export async function isAutoUpdaterDisabled(): Promise<boolean> {
  return getGlobalConfig().autoUpdaterStatus === 'disabled'
}

export const TEST_MCPRC_CONFIG_FOR_TESTING: Record<string, McpServerConfig> = {}

export function clearMcprcConfigForTesting(): void {
  if (process.env.NODE_ENV === 'test') {
    Object.keys(TEST_MCPRC_CONFIG_FOR_TESTING).forEach(key => {
      delete TEST_MCPRC_CONFIG_FOR_TESTING[key]
    })
  }
}

export function addMcprcServerForTesting(
  name: string,
  server: McpServerConfig,
): void {
  if (process.env.NODE_ENV === 'test') {
    TEST_MCPRC_CONFIG_FOR_TESTING[name] = server
  }
}

export function removeMcprcServerForTesting(name: string): void {
  if (process.env.NODE_ENV === 'test') {
    if (!TEST_MCPRC_CONFIG_FOR_TESTING[name]) {
      throw new Error(`No MCP server found with name: ${name} in .mcprc`)
    }
    delete TEST_MCPRC_CONFIG_FOR_TESTING[name]
  }
}

export const getMcprcConfig = memoize(
  (): Record<string, McpServerConfig> => {
    if (process.env.NODE_ENV === 'test') {
      return TEST_MCPRC_CONFIG_FOR_TESTING
    }

    const mcprcPath = join(getCwd(), '.mcprc')
    if (!existsSync(mcprcPath)) {
      return {}
    }

    try {
      const mcprcContent = readFileSync(mcprcPath, 'utf-8')
      const config = safeParseJSON(mcprcContent)
      if (config && typeof config === 'object') {
        // Logging removed
        return config as Record<string, McpServerConfig>
      }
    } catch {
      // Ignore errors reading/parsing .mcprc (they're logged in safeParseJSON)
    }
    return {}
  },
  // This function returns the same value as long as the cwd and mcprc file content remain the same
  () => {
    const cwd = getCwd()
    const mcprcPath = join(cwd, '.mcprc')
    if (existsSync(mcprcPath)) {
      try {
        const stat = readFileSync(mcprcPath, 'utf-8')
        return `${cwd}:${stat}`
      } catch {
        return cwd
      }
    }
    return cwd
  },
)

/**
 * 获取或创建用户 ID - 获取匿名用户标识符
 *
 * 如果用户 ID 不存在，则生成一个新的随机 ID 并保存到配置中。
 * 用于匿名统计和用户会话跟踪。
 *
 * @returns 用户 ID 字符串
 */
export function getOrCreateUserID(): string {
  const config = getGlobalConfig()
  if (config.userID) {
    return config.userID
  }

  const userID = randomBytes(32).toString('hex')
  saveGlobalConfig({ ...config, userID })
  return userID
}

export function getConfigForCLI(key: string, global: boolean): unknown {
  
  if (global) {
    if (!isGlobalConfigKey(key)) {
      console.error(
        `Error: '${key}' is not a valid config key. Valid keys are: ${GLOBAL_CONFIG_KEYS.join(', ')}`,
      )
      process.exit(1)
    }
    return getGlobalConfig()[key]
  } else {
    if (!isProjectConfigKey(key)) {
      console.error(
        `Error: '${key}' is not a valid config key. Valid keys are: ${PROJECT_CONFIG_KEYS.join(', ')}`,
      )
      process.exit(1)
    }
    return getCurrentProjectConfig()[key]
  }
}

export function setConfigForCLI(
  key: string,
  value: unknown,
  global: boolean,
): void {
  
  if (global) {
    if (!isGlobalConfigKey(key)) {
      console.error(
        `Error: Cannot set '${key}'. Only these keys can be modified: ${GLOBAL_CONFIG_KEYS.join(', ')}`,
      )
      process.exit(1)
    }

    if (key === 'autoUpdaterStatus' && !isAutoUpdaterStatus(value as string)) {
      console.error(
        `Error: Invalid value for autoUpdaterStatus. Must be one of: disabled, enabled, no_permissions, not_configured`,
      )
      process.exit(1)
    }

    const currentConfig = getGlobalConfig()
    saveGlobalConfig({
      ...currentConfig,
      [key]: value,
    })
  } else {
    if (!isProjectConfigKey(key)) {
      console.error(
        `Error: Cannot set '${key}'. Only these keys can be modified: ${PROJECT_CONFIG_KEYS.join(', ')}. Did you mean --global?`,
      )
      process.exit(1)
    }
    const currentConfig = getCurrentProjectConfig()
    saveCurrentProjectConfig({
      ...currentConfig,
      [key]: value,
    })
  }
  // Wait for the output to be flushed, to avoid clearing the screen.
  setTimeout(() => {
    // Without this we hang indefinitely.
    process.exit(0)
  }, 100)
}

export function deleteConfigForCLI(key: string, global: boolean): void {
  
  if (global) {
    if (!isGlobalConfigKey(key)) {
      console.error(
        `Error: Cannot delete '${key}'. Only these keys can be modified: ${GLOBAL_CONFIG_KEYS.join(', ')}`,
      )
      process.exit(1)
    }
    const currentConfig = getGlobalConfig()
    delete currentConfig[key]
    saveGlobalConfig(currentConfig)
  } else {
    if (!isProjectConfigKey(key)) {
      console.error(
        `Error: Cannot delete '${key}'. Only these keys can be modified: ${PROJECT_CONFIG_KEYS.join(', ')}. Did you mean --global?`,
      )
      process.exit(1)
    }
    const currentConfig = getCurrentProjectConfig()
    delete currentConfig[key]
    saveCurrentProjectConfig(currentConfig)
  }
}

export function listConfigForCLI(global: true): GlobalConfig
export function listConfigForCLI(global: false): ProjectConfig
export function listConfigForCLI(global: boolean): object {
  
  if (global) {
    const currentConfig = pick(getGlobalConfig(), GLOBAL_CONFIG_KEYS)
    return currentConfig
  } else {
    return pick(getCurrentProjectConfig(), PROJECT_CONFIG_KEYS)
  }
}

/**
 * 获取 OpenAI API 密钥 - 从环境变量读取 GPT API 密钥
 *
 * @returns OpenAI API 密钥或 undefined（如果未设置）
 */
export function getOpenAIApiKey(): string | undefined {
  return process.env.OPENAI_API_KEY
}

// Configuration migration utility functions
function migrateModelProfilesRemoveId(config: GlobalConfig): GlobalConfig {
  if (!config.modelProfiles) return config

  // 1. Remove id field from ModelProfile objects and build ID to modelName mapping
  const idToModelNameMap = new Map<string, string>()
  const migratedProfiles = config.modelProfiles.map(profile => {
    // Build mapping before removing id field
    if ((profile as any).id && profile.modelName) {
      idToModelNameMap.set((profile as any).id, profile.modelName)
    }

    // Remove id field, keep everything else
    const { id, ...profileWithoutId } = profile as any
    return profileWithoutId as ModelProfile
  })

  // 2. Migrate ModelPointers from IDs to modelNames
  const migratedPointers: ModelPointers = {
    main: '',
    task: '',
    reasoning: '',
    quick: '',
  }

  if (config.modelPointers) {
    Object.entries(config.modelPointers).forEach(([pointer, value]) => {
      if (value) {
        // If value looks like an old ID (model_xxx), map it to modelName
        const modelName = idToModelNameMap.get(value) || value
        migratedPointers[pointer as ModelPointerType] = modelName
      }
    })
  }

  // 3. Migrate legacy config fields
  let defaultModelName: string | undefined
  if ((config as any).defaultModelId) {
    defaultModelName =
      idToModelNameMap.get((config as any).defaultModelId) ||
      (config as any).defaultModelId
  } else if ((config as any).defaultModelName) {
    defaultModelName = (config as any).defaultModelName
  }

  // 4. Remove legacy fields and return migrated config
  const migratedConfig = { ...config }
  delete (migratedConfig as any).defaultModelId
  delete (migratedConfig as any).currentSelectedModelId
  delete (migratedConfig as any).mainAgentModelId
  delete (migratedConfig as any).taskToolModelId

  return {
    ...migratedConfig,
    modelProfiles: migratedProfiles,
    modelPointers: migratedPointers,
    defaultModelName,
  }
}

// New model system utility functions

/**
 * 设置所有模型指针指向同一个模型
 * 将主要、任务、推理、快速四个模型指针都设置为指定的模型
 *
 * @param modelName - 目标模型名称
 *
 * 🎯 使用场景：
 * - 初始化配置：第一次设置模型时
 * - 简化配置：用户希望所有场景都使用同一个模型
 * - 模型测试：快速切换到新模型进行全面测试
 * - 配置重置：恢复到单一模型配置
 *
 * 📝 影响的指针：
 * - main: 主对话模型
 * - task: 任务工具模型
 * - reasoning: 推理模型
 * - quick: 快速模型
 * - defaultModelName: 默认模型名称
 */
export function setAllPointersToModel(modelName: string): void {
  const config = getGlobalConfig()
  const updatedConfig = {
    ...config,
    modelPointers: {
      main: modelName,
      task: modelName,
      reasoning: modelName,
      quick: modelName,
    },
    defaultModelName: modelName,
  }
  saveGlobalConfig(updatedConfig)
}

/**
 * 设置模型指针 - 为特定用途配置模型
 *
 * 设置指定类型的模型指针指向特定模型，并强制重新加载
 * 模型管理器以应用更改。
 *
 * @param pointer - 模型指针类型（main, task, reasoning, quick）
 * @param modelName - 目标模型名称
 */
export function setModelPointer(
  pointer: ModelPointerType,
  modelName: string,
): void {
  const config = getGlobalConfig()
  const updatedConfig = {
    ...config,
    modelPointers: {
      ...config.modelPointers,
      [pointer]: modelName,
    },
  }
  saveGlobalConfig(updatedConfig)

  // 🔧 修复：配置更改后强制重新加载模型管理器
  // 在此处导入以避免循环依赖
  import('./model').then(({ reloadModelManager }) => {
    reloadModelManager()
  })
}

// 🔥 GPT-5 Configuration Validation and Auto-Repair Functions

/**
 * 检查模型名称是否为 GPT-5 模型 - GPT-5 模型识别函数
 *
 * 通过模型名称判断是否为 GPT-5 系列模型，用于应用
 * GPT-5 特定的配置和优化。
 *
 * @param modelName - 模型名称字符串
 * @returns 是否为 GPT-5 模型
 */
export function isGPT5ModelName(modelName: string): boolean {
  if (!modelName || typeof modelName !== 'string') return false
  const lowerName = modelName.toLowerCase()
  return lowerName.startsWith('gpt-5') || lowerName.includes('gpt-5')
}

/**
 * 验证并自动修复 GPT-5 模型配置 - GPT-5 配置自动优化
 *
 * 对 GPT-5 模型配置进行验证和自动修复，确保配置符合
 * GPT-5 的最佳实践和参数要求。
 *
 * @param profile - 模型配置对象
 * @returns 修复后的模型配置对象
 */
export function validateAndRepairGPT5Profile(profile: ModelProfile): ModelProfile {
  const isGPT5 = isGPT5ModelName(profile.modelName)
  const now = Date.now()
  
  // Create a working copy
  const repairedProfile: ModelProfile = { ...profile }
  let wasRepaired = false
  
  // 🔧 Set GPT-5 detection flag
  if (isGPT5 !== profile.isGPT5) {
    repairedProfile.isGPT5 = isGPT5
    wasRepaired = true
  }
  
  if (isGPT5) {
    // 🔧 GPT-5 Parameter Validation and Repair
    
    // 1. Reasoning effort validation
    const validReasoningEfforts = ['minimal', 'low', 'medium', 'high']
    if (!profile.reasoningEffort || !validReasoningEfforts.includes(profile.reasoningEffort)) {
      repairedProfile.reasoningEffort = 'medium' // Default for coding tasks
      wasRepaired = true
      console.log(`🔧 GPT-5 Config: Set reasoning effort to 'medium' for ${profile.modelName}`)
    }
    
    // 2. Context length validation (GPT-5 models typically have 128k context)
    if (profile.contextLength < 128000) {
      repairedProfile.contextLength = 128000
      wasRepaired = true
      console.log(`🔧 GPT-5 Config: Updated context length to 128k for ${profile.modelName}`)
    }
    
    // 3. Output tokens validation (reasonable defaults for GPT-5)
    if (profile.maxTokens < 4000) {
      repairedProfile.maxTokens = 8192 // Good default for coding tasks
      wasRepaired = true
      console.log(`🔧 GPT-5 Config: Updated max tokens to 8192 for ${profile.modelName}`)
    }
    
    // 4. Provider validation
    if (profile.provider !== 'openai' && profile.provider !== 'custom-openai' && profile.provider !== 'azure') {
      console.warn(`⚠️  GPT-5 Config: Unexpected provider '${profile.provider}' for GPT-5 model ${profile.modelName}. Consider using 'openai' or 'custom-openai'.`)
    }
    
    // 5. Base URL validation for official models
    if (profile.modelName.includes('gpt-5') && !profile.baseURL) {
      repairedProfile.baseURL = 'https://api.openai.com/v1'
      wasRepaired = true
      console.log(`🔧 GPT-5 Config: Set default base URL for ${profile.modelName}`)
    }
  }
  
  // Update validation metadata
  repairedProfile.validationStatus = wasRepaired ? 'auto_repaired' : 'valid'
  repairedProfile.lastValidation = now
  
  if (wasRepaired) {
    console.log(`✅ GPT-5 Config: Auto-repaired configuration for ${profile.modelName}`)
  }
  
  return repairedProfile
}

/**
 * Validate and repair all GPT-5 profiles in the global configuration
 */
export function validateAndRepairAllGPT5Profiles(): { repaired: number; total: number } {
  const config = getGlobalConfig()
  if (!config.modelProfiles) {
    return { repaired: 0, total: 0 }
  }
  
  let repairCount = 0
  const repairedProfiles = config.modelProfiles.map(profile => {
    const repairedProfile = validateAndRepairGPT5Profile(profile)
    if (repairedProfile.validationStatus === 'auto_repaired') {
      repairCount++
    }
    return repairedProfile
  })
  
  // Save the repaired configuration
  if (repairCount > 0) {
    const updatedConfig = {
      ...config,
      modelProfiles: repairedProfiles,
    }
    saveGlobalConfig(updatedConfig)
    console.log(`🔧 GPT-5 Config: Auto-repaired ${repairCount} model profiles`)
  }
  
  return { repaired: repairCount, total: config.modelProfiles.length }
}

/**
 * Get GPT-5 configuration recommendations for a specific model
 */
export function getGPT5ConfigRecommendations(modelName: string): Partial<ModelProfile> {
  if (!isGPT5ModelName(modelName)) {
    return {}
  }
  
  const recommendations: Partial<ModelProfile> = {
    contextLength: 128000, // GPT-5 standard context length
    maxTokens: 8192, // Good default for coding tasks
    reasoningEffort: 'medium', // Balanced for most coding tasks
    isGPT5: true,
  }
  
  // Model-specific optimizations
  if (modelName.includes('gpt-5-mini')) {
    recommendations.maxTokens = 4096 // Smaller default for mini
    recommendations.reasoningEffort = 'low' // Faster for simple tasks
  } else if (modelName.includes('gpt-5-nano')) {
    recommendations.maxTokens = 2048 // Even smaller for nano
    recommendations.reasoningEffort = 'minimal' // Fastest option
  }
  
  return recommendations
}

/**
 * Create a properly configured GPT-5 model profile
 */
export function createGPT5ModelProfile(
  name: string,
  modelName: string,
  apiKey: string,
  baseURL?: string,
  provider: ProviderType = 'openai'
): ModelProfile {
  const recommendations = getGPT5ConfigRecommendations(modelName)
  
  const profile: ModelProfile = {
    name,
    provider,
    modelName,
    baseURL: baseURL || 'https://api.openai.com/v1',
    apiKey,
    maxTokens: recommendations.maxTokens || 8192,
    contextLength: recommendations.contextLength || 128000,
    reasoningEffort: recommendations.reasoningEffort || 'medium',
    isActive: true,
    createdAt: Date.now(),
    isGPT5: true,
    validationStatus: 'valid',
    lastValidation: Date.now(),
  }
  
  console.log(`✅ Created GPT-5 model profile: ${name} (${modelName})`)
  return profile
}
