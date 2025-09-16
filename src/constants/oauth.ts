/**
 * 🎯 OAuth 认证配置常量 - 用户身份验证设置
 *
 * 🏗️ 核心功能：
 * - 提供 OAuth 2.0 认证流程的配置参数
 * - 定义重定向端口和回调 URL
 * - 管理 API 权限作用域设置
 * - 支持生产和测试环境配置切换
 *
 * 🔄 依赖关系：
 * - 上游：被认证服务和 OAuth 客户端使用
 * - 下游：无外部依赖，提供认证配置
 *
 * 📊 使用场景：
 * - 用户登录和身份验证
 * - API 密钥获取和管理
 * - OAuth 回调处理
 * - 权限作用域验证
 *
 * 🔧 技术实现：
 * - 基于环境的配置覆盖机制
 * - 类型安全的配置对象定义
 * - 支持多环境部署配置
 * - 统一的 OAuth 参数管理
 */

/**
 * 基础 OAuth 配置 - 所有环境共享的基础设置
 */
const BASE_CONFIG = {
  /** 本地重定向服务器端口 */
  REDIRECT_PORT: 54545,
  /** 手动重定向回调 URL 路径 */
  MANUAL_REDIRECT_URL: '/oauth/code/callback',
  /** OAuth 权限作用域 - 组织 API 密钥创建和用户配置文件访问 */
  SCOPES: ['org:create_api_key', 'user:profile'] as const,
}

/**
 * 生产环境 OAuth 配置 - 正常运行时使用的配置
 *
 * 继承基础配置并添加生产环境特定的 URL 和客户端 ID。
 * 注意：实际的 URL 和客户端 ID 需要在部署时设置。
 */
const PROD_OAUTH_CONFIG = {
  ...BASE_CONFIG,
  /** OAuth 授权 URL */
  AUTHORIZE_URL: '',
  /** 令牌交换 URL */
  TOKEN_URL: '',
  /** API 密钥获取 URL */
  API_KEY_URL: '',
  /** 认证成功跳转 URL */
  SUCCESS_URL: '',
  /** OAuth 客户端 ID */
  CLIENT_ID: '',
} as const

/**
 * 当前 OAuth 配置 - 默认使用生产配置
 *
 * 可以根据环境变量或构建配置覆盖为测试/开发环境配置。
 */
export const OAUTH_CONFIG = PROD_OAUTH_CONFIG
