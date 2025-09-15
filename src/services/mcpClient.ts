/**
 * MCP客户端服务 - 模型上下文协议的核心集成层
 *
 * 🌐 MCP (Model Context Protocol) 是一个开放标准协议，用于：
 * - 让AI模型安全地访问外部数据和工具
 * - 标准化AI应用与外部服务的集成方式
 * - 支持工具调用、提示模板、资源访问等功能
 *
 * 🏗️ 本服务的职责：
 * 1. 管理MCP服务器配置（项目级/全局/mcprc文件）
 * 2. 建立和维护与MCP服务器的连接
 * 3. 将MCP工具和命令转换为Kode工具系统格式
 * 4. 处理工具调用和结果传递
 * 5. 提供权限管理和错误处理
 *
 * 📁 支持的配置作用域：
 * - project: 项目级配置 (.kode.json)
 * - global: 全局配置 (~/.kode.json)
 * - mcprc: 项目根目录的 .mcprc 文件
 *
 * 🔌 支持的传输协议：
 * - stdio: 标准输入输出（子进程）
 * - sse: 服务器发送事件（HTTP）
 */
import { zipObject } from 'lodash-es'
import {
  getCurrentProjectConfig,
  McpServerConfig,
  saveCurrentProjectConfig,
  getGlobalConfig,
  saveGlobalConfig,
  getMcprcConfig,
  addMcprcServerForTesting,
  removeMcprcServerForTesting,
} from '../utils/config.js'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getCwd } from '../utils/state'
import { safeParseJSON } from '../utils/json'
import {
  ImageBlockParam,
  MessageParam,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import {
  CallToolResultSchema,
  ClientRequest,
  ListPromptsResult,
  ListPromptsResultSchema,
  ListToolsResult,
  ListToolsResultSchema,
  Result,
  ResultSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { memoize, pickBy } from 'lodash-es'
import type { Tool } from '../Tool'
import { MCPTool } from '../tools/MCPTool/MCPTool'
import { logMCPError } from '../utils/log'
import { Command } from '../commands'
import { PRODUCT_COMMAND } from '../constants/product.js'

// MCP服务器名称类型别名
type McpName = string

/**
 * 解析环境变量参数
 * 将命令行传入的环境变量字符串数组转换为键值对对象
 *
 * @param rawEnvArgs - 原始环境变量字符串数组，格式：["KEY1=value1", "KEY2=value2"]
 * @returns Record<string, string> - 环境变量键值对对象
 * @throws Error - 当环境变量格式不正确时
 *
 * @example
 * parseEnvVars(["API_KEY=abc123", "PORT=3000"])
 * // 返回: { API_KEY: "abc123", PORT: "3000" }
 */
export function parseEnvVars(
  rawEnvArgs: string[] | undefined,
): Record<string, string> {
  const parsedEnv: Record<string, string> = {}

  // 解析各个环境变量
  if (rawEnvArgs) {
    for (const envStr of rawEnvArgs) {
      const [key, ...valueParts] = envStr.split('=')
      if (!key || valueParts.length === 0) {
        throw new Error(
          `Invalid environment variable format: ${envStr}, environment variables should be added as: -e KEY1=value1 -e KEY2=value2`,
        )
      }
      // 重新组合值部分，处理值中包含等号的情况
      parsedEnv[key] = valueParts.join('=')
    }
  }
  return parsedEnv
}

// 所有有效的配置作用域
const VALID_SCOPES = ['project', 'global', 'mcprc'] as const
// 配置作用域类型定义
type ConfigScope = (typeof VALID_SCOPES)[number]
// 外部用户可用的作用域（不包括内部mcprc）
const EXTERNAL_SCOPES = ['project', 'global'] as ConfigScope[]

/**
 * 确保配置作用域有效性
 * 根据用户类型验证并返回有效的配置作用域
 *
 * @param scope - 要验证的作用域字符串
 * @returns ConfigScope - 验证后的作用域
 * @throws Error - 当作用域无效时
 *
 * 作用域优先级（高到低）：
 * 1. project - 项目级配置，仅对当前项目有效
 * 2. mcprc - 项目根目录的.mcprc文件（需要用户确认）
 * 3. global - 全局配置，对所有项目有效
 */
export function ensureConfigScope(scope?: string): ConfigScope {
  if (!scope) return 'project'

  // 根据用户类型确定可用作用域
  const scopesToCheck =
    process.env.USER_TYPE === 'external' ? EXTERNAL_SCOPES : VALID_SCOPES

  if (!scopesToCheck.includes(scope as ConfigScope)) {
    throw new Error(
      `Invalid scope: ${scope}. Must be one of: ${scopesToCheck.join(', ')}`,
    )
  }

  return scope as ConfigScope
}

export function addMcpServer(
  name: McpName,
  server: McpServerConfig,
  scope: ConfigScope = 'project',
): void {
  if (scope === 'mcprc') {
    if (process.env.NODE_ENV === 'test') {
      addMcprcServerForTesting(name, server)
    } else {
      const mcprcPath = join(getCwd(), '.mcprc')
      let mcprcConfig: Record<string, McpServerConfig> = {}

      // Read existing config if present
      if (existsSync(mcprcPath)) {
        try {
          const mcprcContent = readFileSync(mcprcPath, 'utf-8')
          const existingConfig = safeParseJSON(mcprcContent)
          if (existingConfig && typeof existingConfig === 'object') {
            mcprcConfig = existingConfig as Record<string, McpServerConfig>
          }
        } catch {
          // If we can't read/parse, start with empty config
        }
      }

      // Add the server
      mcprcConfig[name] = server

      // Write back to .mcprc
      try {
        writeFileSync(mcprcPath, JSON.stringify(mcprcConfig, null, 2), 'utf-8')
      } catch (error) {
        throw new Error(`Failed to write to .mcprc: ${error}`)
      }
    }
  } else if (scope === 'global') {
    const config = getGlobalConfig()
    if (!config.mcpServers) {
      config.mcpServers = {}
    }
    config.mcpServers[name] = server
    saveGlobalConfig(config)
  } else {
    const config = getCurrentProjectConfig()
    if (!config.mcpServers) {
      config.mcpServers = {}
    }
    config.mcpServers[name] = server
    saveCurrentProjectConfig(config)
  }
}

export function removeMcpServer(
  name: McpName,
  scope: ConfigScope = 'project',
): void {
  if (scope === 'mcprc') {
    if (process.env.NODE_ENV === 'test') {
      removeMcprcServerForTesting(name)
    } else {
      const mcprcPath = join(getCwd(), '.mcprc')
      if (!existsSync(mcprcPath)) {
        throw new Error('No .mcprc file found in this directory')
      }

      try {
        const mcprcContent = readFileSync(mcprcPath, 'utf-8')
        const mcprcConfig = safeParseJSON(mcprcContent) as Record<
          string,
          McpServerConfig
        > | null

        if (
          !mcprcConfig ||
          typeof mcprcConfig !== 'object' ||
          !mcprcConfig[name]
        ) {
          throw new Error(`No MCP server found with name: ${name} in .mcprc`)
        }

        delete mcprcConfig[name]
        writeFileSync(mcprcPath, JSON.stringify(mcprcConfig, null, 2), 'utf-8')
      } catch (error) {
        if (error instanceof Error) {
          throw error
        }
        throw new Error(`Failed to remove from .mcprc: ${error}`)
      }
    }
  } else if (scope === 'global') {
    const config = getGlobalConfig()
    if (!config.mcpServers?.[name]) {
      throw new Error(`No global MCP server found with name: ${name}`)
    }
    delete config.mcpServers[name]
    saveGlobalConfig(config)
  } else {
    const config = getCurrentProjectConfig()
    if (!config.mcpServers?.[name]) {
      throw new Error(`No local MCP server found with name: ${name}`)
    }
    delete config.mcpServers[name]
    saveCurrentProjectConfig(config)
  }
}

export function listMCPServers(): Record<string, McpServerConfig> {
  const globalConfig = getGlobalConfig()
  const mcprcConfig = getMcprcConfig()
  const projectConfig = getCurrentProjectConfig()
  return {
    ...(globalConfig.mcpServers ?? {}),
    ...(mcprcConfig ?? {}), // mcprc configs override global ones
    ...(projectConfig.mcpServers ?? {}), // Project configs override mcprc ones
  }
}

export type ScopedMcpServerConfig = McpServerConfig & {
  scope: ConfigScope
}

export function getMcpServer(name: McpName): ScopedMcpServerConfig | undefined {
  const projectConfig = getCurrentProjectConfig()
  const mcprcConfig = getMcprcConfig()
  const globalConfig = getGlobalConfig()

  // Check each scope in order of precedence
  if (projectConfig.mcpServers?.[name]) {
    return { ...projectConfig.mcpServers[name], scope: 'project' }
  }

  if (mcprcConfig?.[name]) {
    return { ...mcprcConfig[name], scope: 'mcprc' }
  }

  if (globalConfig.mcpServers?.[name]) {
    return { ...globalConfig.mcpServers[name], scope: 'global' }
  }

  return undefined
}

/**
 * 连接到MCP服务器
 * 根据服务器配置建立适当的传输连接（stdio或sse）
 *
 * @param name - MCP服务器名称，用于日志记录
 * @param serverRef - MCP服务器配置对象
 * @returns Promise<Client> - 已连接的MCP客户端实例
 * @throws Error - 连接超时或失败时
 *
 * 🔌 支持的传输方式：
 * - stdio: 通过子进程的标准输入输出通信
 * - sse: 通过HTTP服务器发送事件通信
 */
async function connectToServer(
  name: string,
  serverRef: McpServerConfig,
): Promise<Client> {
  // 根据服务器类型创建相应的传输层
  const transport =
    serverRef.type === 'sse'
      ? // SSE传输：用于HTTP-based MCP服务器
        new SSEClientTransport(new URL(serverRef.url))
      : // Stdio传输：用于本地命令行MCP服务器
        new StdioClientTransport({
          command: serverRef.command,
          args: serverRef.args,
          env: {
            ...process.env, // 继承当前环境变量
            ...serverRef.env, // 覆盖服务器特定的环境变量
          } as Record<string, string>,
          stderr: 'pipe', // 防止MCP服务器的错误输出直接显示在UI中
        })

  // 创建MCP客户端实例
  const client = new Client(
    {
      name: PRODUCT_COMMAND,
      version: '0.1.0',
    },
    {
      capabilities: {}, // 目前不声明特殊能力
    },
  )

  // 添加连接超时机制，防止测试或启动时无限等待
  const CONNECTION_TIMEOUT_MS = 5000
  const connectPromise = client.connect(transport)
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timeoutId = setTimeout(() => {
      reject(
        new Error(
          `Connection to MCP server "${name}" timed out after ${CONNECTION_TIMEOUT_MS}ms`,
        ),
      )
    }, CONNECTION_TIMEOUT_MS)

    // 连接完成时清理超时器
    connectPromise.then(
      () => clearTimeout(timeoutId),
      () => clearTimeout(timeoutId),
    )
  })

  // 竞争连接和超时，先完成的获胜
  await Promise.race([connectPromise, timeoutPromise])

  // 为stdio类型的服务器设置错误输出监听
  if (serverRef.type === 'stdio') {
    ;(transport as StdioClientTransport).stderr?.on('data', (data: Buffer) => {
      const errorText = data.toString().trim()
      if (errorText) {
        logMCPError(name, `Server stderr: ${errorText}`)
      }
    })
  }
  return client
}

type ConnectedClient = {
  client: Client
  name: string
  type: 'connected'
}
type FailedClient = {
  name: string
  type: 'failed'
}
export type WrappedClient = ConnectedClient | FailedClient

export function getMcprcServerStatus(
  serverName: string,
): 'approved' | 'rejected' | 'pending' {
  const config = getCurrentProjectConfig()
  if (config.approvedMcprcServers?.includes(serverName)) {
    return 'approved'
  }
  if (config.rejectedMcprcServers?.includes(serverName)) {
    return 'rejected'
  }
  return 'pending'
}

export const getClients = memoize(async (): Promise<WrappedClient[]> => {
  // TODO: This is a temporary fix for a hang during npm run verify in CI.
  // We need to investigate why MCP client connections hang in CI verify but not in CI tests.
  if (process.env.CI && process.env.NODE_ENV !== 'test') {
    return []
  }

  const globalServers = getGlobalConfig().mcpServers ?? {}
  const mcprcServers = getMcprcConfig()
  const projectServers = getCurrentProjectConfig().mcpServers ?? {}

  // Filter mcprc servers to only include approved ones
  const approvedMcprcServers = pickBy(
    mcprcServers,
    (_, name) => getMcprcServerStatus(name) === 'approved',
  )

  const allServers = {
    ...globalServers,
    ...approvedMcprcServers, // Approved .mcprc servers override global ones
    ...projectServers, // Project servers take highest precedence
  }

  return await Promise.all(
    Object.entries(allServers).map(async ([name, serverRef]) => {
      try {
        const client = await connectToServer(name, serverRef as McpServerConfig)
        return { name, client, type: 'connected' as const }
      } catch (error) {
        logMCPError(
          name,
          `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
        )
        return { name, type: 'failed' as const }
      }
    }),
  )
})

async function requestAll<
  ResultT extends Result,
  ResultSchemaT extends typeof ResultSchema,
>(
  req: ClientRequest,
  resultSchema: ResultSchemaT,
  requiredCapability: string,
): Promise<{ client: ConnectedClient; result: ResultT }[]> {
  const clients = await getClients()
  const results = await Promise.allSettled(
    clients.map(async client => {
      if (client.type === 'failed') return null

      try {
        const capabilities = await client.client.getServerCapabilities()
        if (!capabilities?.[requiredCapability]) {
          return null
        }
        return {
          client,
          result: (await client.client.request(req, resultSchema)) as ResultT,
        }
      } catch (error) {
        if (client.type === 'connected') {
          logMCPError(
            client.name,
            `Failed to request '${req.method}': ${error instanceof Error ? error.message : String(error)}`,
          )
        }
        return null
      }
    }),
  )
  return results
    .filter(
      (
        result,
      ): result is PromiseFulfilledResult<{
        client: ConnectedClient
        result: ResultT
      } | null> => result.status === 'fulfilled',
    )
    .map(result => result.value)
    .filter(
      (result): result is { client: ConnectedClient; result: ResultT } =>
        result !== null,
    )
}

/**
 * 获取所有MCP工具并转换为Kode工具格式
 * 这是MCP工具集成的核心函数，将外部MCP服务器的工具转换为Kode可用的工具
 *
 * @returns Promise<Tool[]> - 转换后的工具数组
 *
 * 🔄 转换流程：
 * 1. 向所有连接的MCP服务器请求工具列表
 * 2. 为每个工具创建统一的Kode工具包装器
 * 3. 设置工具名称命名空间（mcp__serverName__toolName）
 * 4. 配置工具的描述、验证和调用逻辑
 *
 * 🏷️ 工具命名规范：
 * - 格式：mcp__[服务器名]__[工具名]
 * - 例如：mcp__filesystem__read_file
 * - 避免不同服务器间的工具名冲突
 */
export const getMCPTools = memoize(async (): Promise<Tool[]> => {
  // 向所有支持工具的MCP服务器请求工具列表
  const toolsList = await requestAll<
    ListToolsResult,
    typeof ListToolsResultSchema
  >(
    {
      method: 'tools/list',
    },
    ListToolsResultSchema,
    'tools', // 要求服务器支持tools能力
  )

  // TODO: 添加zod模式验证以确保工具定义的安全性
  return toolsList.flatMap(({ client, result: { tools } }) =>
    tools.map(
      (tool): Tool => ({
        // 继承基础MCP工具的通用属性和行为
        ...MCPTool,
        // 使用命名空间防止冲突：mcp__服务器名__工具名
        name: 'mcp__' + client.name + '__' + tool.name,
        // 异步描述生成器
        async description() {
          return tool.description ?? ''
        },
        // 工具提示词（用于AI模型理解工具功能）
        async prompt() {
          return tool.description ?? ''
        },
        // 使用MCP工具提供的JSON Schema作为输入验证
        inputJSONSchema: tool.inputSchema as Tool['inputJSONSchema'],
        // 输入验证：MCP工具通过自己的schema处理验证
        async validateInput(input, context) {
          return { result: true } // 信任MCP服务器的验证逻辑
        },
        // 工具调用的核心实现：异步生成器模式
        async *call(args: Record<string, unknown>, context) {
          // 调用实际的MCP工具并获取结果
          const data = await callMCPTool({ client, tool: tool.name, args })
          // 将结果包装为标准格式并返回给AI助手
          yield {
            type: 'result' as const,
            data,
            resultForAssistant: data,
          }
        },
        // 用户界面显示的友好名称
        userFacingName() {
          return `${client.name}:${tool.name} (MCP)`
        },
      }),
    ),
  )
})

async function callMCPTool({
  client: { client, name },
  tool,
  args,
}: {
  client: ConnectedClient
  tool: string
  args: Record<string, unknown>
}): Promise<ToolResultBlockParam['content']> {
  const result = await client.callTool(
    {
      name: tool,
      arguments: args,
    },
    CallToolResultSchema,
  )

  if ('isError' in result && result.isError) {
    const errorMessage = `Error calling tool ${tool}: ${result.error}`
    logMCPError(name, errorMessage)
    throw Error(errorMessage)
  }

  // Handle toolResult-type response
  if ('toolResult' in result) {
    return String(result.toolResult)
  }

  // Handle content array response
  if ('content' in result && Array.isArray(result.content)) {
    return result.content.map(item => {
      if (item.type === 'image') {
        return {
          type: 'image',
          source: {
            type: 'base64',
            data: String(item.data),
            media_type: item.mimeType as ImageBlockParam.Source['media_type'],
          },
        }
      }
      return item
    })
  }

  throw Error(`Unexpected response format from tool ${tool}`)
}

export const getMCPCommands = memoize(async (): Promise<Command[]> => {
  const results = await requestAll<
    ListPromptsResult,
    typeof ListPromptsResultSchema
  >(
    {
      method: 'prompts/list',
    },
    ListPromptsResultSchema,
    'prompts',
  )

  return results.flatMap(({ client, result }) =>
    result.prompts?.map(_ => {
      const argNames = Object.values(_.arguments ?? {}).map(k => k.name)
      return {
        type: 'prompt',
        name: 'mcp__' + client.name + '__' + _.name,
        description: _.description ?? '',
        isEnabled: true,
        isHidden: false,
        progressMessage: 'running',
        userFacingName() {
          return `${client.name}:${_.name} (MCP)`
        },
        argNames,
        async getPromptForCommand(args: string) {
          const argsArray = args.split(' ')
          return await runCommand(
            { name: _.name, client },
            zipObject(argNames, argsArray),
          )
        },
      }
    }),
  )
})

export async function runCommand(
  { name, client }: { name: string; client: ConnectedClient },
  args: Record<string, string>,
): Promise<MessageParam[]> {
  try {
    const result = await client.client.getPrompt({ name, arguments: args })
    // TODO: Support type == resource
    return result.messages.map(
      (message): MessageParam => ({
        role: message.role,
        content: [
          message.content.type === 'text'
            ? {
                type: 'text',
                text: message.content.text,
              }
            : {
                type: 'image',
                source: {
                  data: String(message.content.data),
                  media_type: message.content
                    .mimeType as ImageBlockParam.Source['media_type'],
                  type: 'base64',
                },
              },
        ],
      }),
    )
  } catch (error) {
    logMCPError(
      client.name,
      `Error running command '${name}': ${error instanceof Error ? error.message : String(error)}`,
    )
    throw error
  }
}
