// OAuth认证服务 - Anthropic OAuth 2.0 PKCE流程的完整实现
// 实现了安全的OAuth 2.0 Authorization Code Flow with PKCE（Proof Key for Code Exchange）
// 主要功能：
// 1. 生成安全的代码验证器和挑战码（PKCE）
// 2. 启动本地HTTP服务器接收授权回调
// 3. 处理浏览器重定向和手动重定向两种模式
// 4. 安全验证state参数防止CSRF攻击
// 5. 交换授权码获取访问令牌
// 6. 创建和存储API密钥到全局配置
// 7. 管理用户账户信息和组织信息

import * as crypto from 'crypto'                     // 加密功能，用于生成安全随机值
import * as http from 'http'                         // HTTP服务器，接收OAuth回调
import { IncomingMessage, ServerResponse } from 'http'
import * as url from 'url'                           // URL解析工具

import { OAUTH_CONFIG } from '../constants/oauth'    // OAuth配置常量
import { openBrowser } from '../utils/browser'       // 浏览器打开工具
import { logError } from '../utils/log'              // 错误日志记录
import { resetAnthropicClient } from './claude'      // 重置Claude客户端
import {
  AccountInfo,
  getGlobalConfig,
  saveGlobalConfig,
  normalizeApiKeyForConfig,
} from '../utils/config.js'                         // 配置管理工具

/**
 * Base64URL编码函数（符合RFC 4648标准）
 * 用于OAuth PKCE流程中的代码验证器和挑战码编码
 * 与标准Base64不同，使用URL安全字符并移除填充
 * @param buffer 要编码的缓冲区数据
 * @returns Base64URL编码的字符串
 */
function base64URLEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')    // 替换+为-（URL安全）
    .replace(/\//g, '_')    // 替换/为_（URL安全）
    .replace(/=/g, '')      // 移除填充字符=
}

/**
 * 生成PKCE代码验证器
 * 根据RFC 7636标准，生成43-128位的URL安全随机字符串
 * @returns Base64URL编码的32字节随机代码验证器
 */
function generateCodeVerifier(): string {
  return base64URLEncode(crypto.randomBytes(32))  // 32字节 = 256位安全强度
}

/**
 * 生成PKCE代码挑战码
 * 使用SHA256哈希代码验证器，提供安全的挑战-响应机制
 * @param verifier 代码验证器字符串
 * @returns Base64URL编码的SHA256哈希挑战码
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)              // 将字符串转换为字节数组
  const digest = await crypto.subtle.digest('SHA-256', data)  // SHA256哈希
  return base64URLEncode(Buffer.from(digest))         // Base64URL编码
}

// OAuth令牌交换响应类型 - 定义从Anthropic OAuth服务器返回的数据结构
type OAuthTokenExchangeResponse = {
  access_token: string          // 访问令牌，用于后续API调用
  account?: {                   // 可选的账户信息
    uuid: string                // 账户唯一标识符
    email_address: string       // 用户邮箱地址
  }
  organization?: {              // 可选的组织信息
    uuid: string                // 组织唯一标识符
    name: string                // 组织名称
  }
}

// OAuth认证结果类型 - 对外提供的简化结果接口
export type OAuthResult = {
  accessToken: string           // 成功认证后的访问令牌
}

/**
 * OAuth认证服务类
 * 管理完整的OAuth 2.0 PKCE认证流程，包括本地服务器、浏览器集成和令牌交换
 * 支持自动和手动两种重定向模式，确保在各种环境下都能正常工作
 */
export class OAuthService {
  private server: http.Server | null = null           // 本地HTTP服务器实例，用于接收OAuth回调
  private codeVerifier: string                        // PKCE代码验证器，用于验证授权码交换
  private expectedState: string | null = null        // 预期的state参数，用于CSRF防护验证
  private pendingCodePromise: {                       // 等待授权码的Promise控制器
    resolve: (result: {
      authorizationCode: string                        // 从OAuth服务器返回的授权码
      useManualRedirect: boolean                      // 是否使用手动重定向模式
    }) => void
    reject: (err: Error) => void                      // 错误处理回调
  } | null = null

  /**
   * 构造函数 - 初始化OAuth服务
   * 生成唯一的PKCE代码验证器，确保每次认证流程的安全性
   */
  constructor() {
    this.codeVerifier = generateCodeVerifier()         // 生成32字节的安全随机验证器
  }

  /**
   * 生成OAuth认证URL
   * 创建自动和手动两种重定向模式的授权URL，支持不同的使用场景
   * @param codeChallenge PKCE挑战码，用于安全验证
   * @param state 随机状态参数，防止CSRF攻击
   * @returns 包含两种模式URL的对象
   */
  private generateAuthUrls(
    codeChallenge: string,
    state: string,
  ): { autoUrl: string; manualUrl: string } {
    /**
     * 内部URL构建函数
     * @param isManual 是否为手动重定向模式
     * @returns 完整的OAuth授权URL
     */
    function makeUrl(isManual: boolean): string {
      const authUrl = new URL(OAUTH_CONFIG.AUTHORIZE_URL)              // Anthropic授权端点
      authUrl.searchParams.append('client_id', OAUTH_CONFIG.CLIENT_ID) // 客户端标识符
      authUrl.searchParams.append('response_type', 'code')             // 授权码流程
      authUrl.searchParams.append(
        'redirect_uri',
        isManual
          ? OAUTH_CONFIG.MANUAL_REDIRECT_URL                           // 手动模式：官方重定向页面
          : `http://localhost:${OAUTH_CONFIG.REDIRECT_PORT}/callback`,  // 自动模式：本地服务器
      )
      authUrl.searchParams.append('scope', OAUTH_CONFIG.SCOPES.join(' ')) // 请求的权限范围
      authUrl.searchParams.append('code_challenge', codeChallenge)     // PKCE挑战码
      authUrl.searchParams.append('code_challenge_method', 'S256')     // SHA256哈希方法
      authUrl.searchParams.append('state', state)                     // CSRF保护状态
      return authUrl.toString()
    }

    return {
      autoUrl: makeUrl(false),   // 自动重定向URL（本地服务器模式）
      manualUrl: makeUrl(true),  // 手动重定向URL（用户复制粘贴模式）
    }
  }

  /**
   * 启动完整的OAuth认证流程
   * 这是OAuth服务的主要入口点，协调整个认证过程从URL生成到令牌获取
   * @param authURLHandler URL处理函数，用于向用户显示认证链接
   * @returns Promise<OAuthResult> 包含访问令牌的认证结果
   */
  async startOAuthFlow(
    authURLHandler: (url: string) => Promise<void>,
  ): Promise<OAuthResult> {
    // 1. 生成PKCE参数和状态验证码
    const codeChallenge = await generateCodeChallenge(this.codeVerifier) // 从验证器生成挑战码
    const state = base64URLEncode(crypto.randomBytes(32))                // 32字节随机状态码
    this.expectedState = state                                           // 保存状态码用于后续验证
    const { autoUrl, manualUrl } = this.generateAuthUrls(codeChallenge, state)

    // 2. 准备服务器和浏览器启动回调
    const onReady = async () => {
      await authURLHandler(manualUrl)  // 显示手动重定向URL给用户
      await openBrowser(autoUrl)       // 尝试自动打开浏览器
    }

    // 3. 启动本地服务器并等待授权码回调
    const { authorizationCode, useManualRedirect } = await new Promise<{
      authorizationCode: string
      useManualRedirect: boolean
    }>((resolve, reject) => {
      this.pendingCodePromise = { resolve, reject }    // 设置Promise控制器
      this.startLocalServer(state, onReady)            // 启动HTTP服务器监听回调
    })

    // 4. 使用授权码交换访问令牌
    const {
      access_token: accessToken,
      account,
      organization,
    } = await this.exchangeCodeForTokens(
      authorizationCode,
      state,
      useManualRedirect,
    )

    // 5. 存储账户信息到全局配置
    if (account) {
      const accountInfo: AccountInfo = {
        accountUuid: account.uuid,                     // 账户唯一标识
        emailAddress: account.email_address,          // 用户邮箱
        organizationUuid: organization?.uuid,         // 组织标识（可选）
      }
      const config = getGlobalConfig()
      config.oauthAccount = accountInfo               // 更新配置中的账户信息
      saveGlobalConfig(config)                       // 持久化配置
    }

    return { accessToken }                            // 返回访问令牌供后续API调用使用
  }

  /**
   * 启动本地HTTP服务器接收OAuth回调
   * 在指定端口创建HTTP服务器，处理来自OAuth提供商的重定向回调
   * 验证授权码和状态参数的有效性，确保认证流程的安全性
   * @param state 预期的状态参数，用于CSRF攻击防护
   * @param onReady 可选的回调函数，在服务器准备就绪时执行
   */
  private startLocalServer(state: string, onReady?: () => void): void {
    // 如果已有服务器实例，先关闭避免端口冲突
    if (this.server) {
      this.closeServer()
    }

    // 创建HTTP服务器处理OAuth重定向回调
    this.server = http.createServer(
      (req: IncomingMessage, res: ServerResponse) => {
        const parsedUrl = url.parse(req.url || '', true)  // 解析请求URL和查询参数

        // 处理OAuth回调端点
        if (parsedUrl.pathname === '/callback') {
          const authorizationCode = parsedUrl.query.code as string   // 提取授权码
          const returnedState = parsedUrl.query.state as string      // 提取状态参数

          // 验证授权码是否存在
          if (!authorizationCode) {
            res.writeHead(400)                           // 返回400错误状态码
            res.end('Authorization code not found')     // 错误响应消息
            if (this.pendingCodePromise) {
              this.pendingCodePromise.reject(
                new Error('No authorization code received'),
              )
            }
            return
          }

          // 验证状态参数，防止CSRF攻击
          if (returnedState !== state) {
            res.writeHead(400)
            res.end('Invalid state parameter')
            if (this.pendingCodePromise) {
              this.pendingCodePromise.reject(
                new Error('Invalid state parameter'), // 可能的CSRF攻击
              )
            }
            return
          }

          // 成功验证，重定向到成功页面
          res.writeHead(302, {
            Location: OAUTH_CONFIG.SUCCESS_URL,          // 重定向到Anthropic成功页面
          })
          res.end()

          // 处理有效的回调数据
          this.processCallback({
            authorizationCode,
            state,
            useManualRedirect: false,                    // 标记为自动重定向模式
          })
        } else {
          // 处理其他路径请求，返回404
          res.writeHead(404)
          res.end()
        }
      },
    )

    // 启动服务器监听指定端口
    this.server.listen(OAUTH_CONFIG.REDIRECT_PORT, async () => {
      onReady?.()  // 服务器就绪后执行回调函数
    })

    // 处理服务器错误事件
    this.server.on('error', (err: Error) => {
      const portError = err as NodeJS.ErrnoException
      if (portError.code === 'EADDRINUSE') {
        // 端口被占用错误的特殊处理
        const error = new Error(
          `Port ${OAUTH_CONFIG.REDIRECT_PORT} is already in use. Please ensure no other applications are using this port.`,
        )
        logError(error)                              // 记录错误日志
        this.closeServer()                          // 清理服务器资源
        if (this.pendingCodePromise) {
          this.pendingCodePromise.reject(error)     // 拒绝等待中的Promise
        }
        return
      } else {
        // 其他服务器错误的处理
        logError(err)
        this.closeServer()
        if (this.pendingCodePromise) {
          this.pendingCodePromise.reject(err)
        }
        return
      }
    })
  }

  /**
   * 使用授权码交换访问令牌
   * 实现OAuth 2.0令牌端点调用，通过PKCE验证获取用户访问令牌和账户信息
   * 这是OAuth流程的关键步骤，将临时授权码转换为可用于API调用的访问令牌
   * @param authorizationCode 从OAuth服务器获得的授权码
   * @param state 状态参数，用于请求验证
   * @param useManualRedirect 是否使用手动重定向模式，影响redirect_uri参数
   * @returns Promise<OAuthTokenExchangeResponse> 包含访问令牌和用户信息的响应
   */
  private async exchangeCodeForTokens(
    authorizationCode: string,
    state: string,
    useManualRedirect: boolean = false,
  ): Promise<OAuthTokenExchangeResponse> {
    // 构建令牌交换请求体，符合OAuth 2.0 PKCE标准
    const requestBody = {
      grant_type: 'authorization_code',              // OAuth 2.0授权码流程类型
      code: authorizationCode,                       // 从授权服务器获得的授权码
      redirect_uri: useManualRedirect
        ? OAUTH_CONFIG.MANUAL_REDIRECT_URL           // 手动重定向：官方重定向页面
        : `http://localhost:${OAUTH_CONFIG.REDIRECT_PORT}/callback`, // 自动重定向：本地服务器
      client_id: OAUTH_CONFIG.CLIENT_ID,             // 客户端标识符
      code_verifier: this.codeVerifier,              // PKCE代码验证器，证明请求合法性
      state,                                         // 状态参数，保持请求一致性
    }

    // 向Anthropic令牌端点发送POST请求
    const response = await fetch(OAUTH_CONFIG.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',          // 指定JSON请求体格式
      },
      body: JSON.stringify(requestBody),             // 序列化请求参数
    })

    // 检查响应状态，抛出错误如果令牌交换失败
    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`)
    }

    // 解析并返回令牌响应数据
    const data = await response.json()
    return data  // 包含access_token、账户信息和组织信息
  }

  /**
   * 处理OAuth回调数据
   * 验证回调参数的有效性，并解析Promise以继续认证流程
   * 这个方法既处理本地服务器回调，也支持手动重定向模式的回调处理
   * @param authorizationCode 授权码
   * @param state 状态参数
   * @param useManualRedirect 是否为手动重定向模式
   */
  processCallback({
    authorizationCode,
    state,
    useManualRedirect,
  }: {
    authorizationCode: string    // 从OAuth提供商接收到的授权码
    state: string               // 用于CSRF防护的状态参数
    useManualRedirect: boolean  // 重定向模式标识
  }): void {
    // 关闭本地服务器，释放端口资源
    this.closeServer()

    // 验证状态参数，防止CSRF攻击
    if (state !== this.expectedState) {
      if (this.pendingCodePromise) {
        this.pendingCodePromise.reject(
          new Error('Invalid state parameter'), // 可能的CSRF攻击
        )
        this.pendingCodePromise = null         // 清理Promise引用
      }
      return
    }

    // 状态验证成功，解析Promise继续认证流程
    if (this.pendingCodePromise) {
      this.pendingCodePromise.resolve({
        authorizationCode,        // 传递授权码用于令牌交换
        useManualRedirect        // 传递重定向模式信息
      })
      this.pendingCodePromise = null  // 清理Promise引用避免内存泄漏
    }
  }

  /**
   * 关闭本地HTTP服务器
   * 清理服务器实例并释放端口资源，确保系统资源的正确回收
   * 在认证完成或出现错误时调用，防止端口泄漏
   */
  private closeServer(): void {
    if (this.server) {
      this.server.close()    // 关闭HTTP服务器，停止监听端口
      this.server = null     // 清空引用，帮助垃圾回收
    }
  }
}

/**
 * 创建并存储API密钥
 * 使用OAuth访问令牌调用Anthropic API密钥创建端点，获取持久性API密钥
 * 将新API密钥添加到全局配置的已批准列表，并重置Anthropic客户端
 * @param accessToken OAuth认证获得的访问令牌
 * @returns Promise<string | null> 创建成功返回API密钥，失败返回null
 */
export async function createAndStoreApiKey(
  accessToken: string,
): Promise<string | null> {
  try {
    // 调用Anthropic API密钥创建端点
    const createApiKeyResp = await fetch(OAUTH_CONFIG.API_KEY_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` }, // 使用OAuth令牌认证
    })

    let apiKeyData      // API密钥响应数据
    let errorText = ''  // 错误文本信息（用于调试）

    try {
      // 尝试解析JSON响应
      apiKeyData = await createApiKeyResp.json()
    } catch (_e) {
      // 如果响应不是有效JSON，获取文本用于错误记录
      errorText = await createApiKeyResp.text()
    }

    // 检查API密钥创建是否成功
    if (createApiKeyResp.ok && apiKeyData && apiKeyData.raw_key) {
      const apiKey = apiKeyData.raw_key  // 提取原始API密钥

      // 存储到全局配置
      const config = getGlobalConfig()

      // 注意：API密钥现在按模型配置管理

      // 添加到已批准列表
      if (!config.customApiKeyResponses) {
        config.customApiKeyResponses = { approved: [], rejected: [] }
      }
      if (!config.customApiKeyResponses.approved) {
        config.customApiKeyResponses.approved = []
      }

      // 规范化API密钥用于配置存储（删除敏感信息）
      const normalizedKey = normalizeApiKeyForConfig(apiKey)
      if (!config.customApiKeyResponses.approved.includes(normalizedKey)) {
        config.customApiKeyResponses.approved.push(normalizedKey)
      }

      // 保存配置到文件
      saveGlobalConfig(config)

      // 重置Anthropic客户端，强制使用新的API密钥创建实例
      resetAnthropicClient()

      return apiKey  // 返回原始API密钥供直接使用
    }

    return null  // API密钥创建失败
  } catch (error) {
    // 在遇到错误时重新抛出，让调用者处理
    throw error
  }
}
