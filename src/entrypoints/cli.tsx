#!/usr/bin/env -S node --no-warnings=ExperimentalWarning --enable-source-maps
/**
 * 🚀 Kode CLI入口点 - 交互式AI编程环境的核心启动器
 *
 * CLI启动架构：
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    Kode CLI 启动流程                            │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ 系统初始化 → 配置加载 → 参数解析 → 模式选择 → 界面启动         │
 * │     ↓          ↓         ↓        ↓         ↓                   │
 * │ Sentry监控 → 权限检查 → 命令定义 → REPL/Print → 工具加载        │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * 核心功能：
 * 1. 🔧 系统初始化：错误监控、UI引擎、环境配置
 * 2. 📋 命令行解析：参数处理、选项验证、模式选择
 * 3. 🎮 交互模式：启动REPL界面进行持续对话
 * 4. 📝 打印模式：单次查询和结果输出
 * 5. ⚙️ 配置管理：全局/项目配置的增删改查
 * 6. 🔌 MCP集成：模型上下文协议服务器管理
 * 7. 🛡️ 权限控制：工具使用权限和安全策略
 * 8. 📚 对话管理：历史记录、恢复、日志查看
 */
// 🌐 Node.js核心模块导入
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'

// 🚨 错误监控服务和产品常量
import { initSentry } from '../services/sentry'
import { PRODUCT_COMMAND, PRODUCT_NAME } from '../constants/product'

// 🔍 尽早初始化Sentry错误监控，用于捕获和报告应用程序错误
initSentry()

/**
 * 🎨 配置Yoga WASM路径 - Ink UI框架依赖的布局引擎
 *
 * 布局引擎初始化：
 * - 开发模式：相对于当前文件的上两级目录查找
 * - 分发模式：与当前文件同级目录查找
 * - 这对于终端UI的渲染至关重要
 */
try {
  if (!process.env.YOGA_WASM_PATH) {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)
    // 📂 开发模式：相对于当前文件的上两级目录
    const devCandidate = join(__dirname, '../../yoga.wasm')
    // 📦 分发模式：与当前文件同级目录
    const distCandidate = join(__dirname, './yoga.wasm')
    const resolved = existsSync(distCandidate)
      ? distCandidate
      : existsSync(devCandidate)
        ? devCandidate
        : undefined
    if (resolved) {
      process.env.YOGA_WASM_PATH = resolved
    }
  }
} catch {}

/**
 * 🪟 解决Bun在Windows上的特殊bug
 *
 * 重要提醒：不删除这两行！
 * 在Windows的Bun环境下，如果没有显式使用这个导入，
 * 构建工具会错误地移除它，导致SDK的Node.js适配层失效
 * Object.keys调用确保导入被"使用"，防止被删除
 */
import * as dontcare from '@anthropic-ai/sdk/shims/node'
Object.keys(dontcare)

// ⚛️ React和UI相关导入
import React from 'react'
import { ReadStream } from 'tty'
import { openSync } from 'fs'
// 🎨 ink和REPL延迟导入以避免模块初始化时的顶级await
import type { RenderOptions } from 'ink'

// 📚 核心应用功能模块
import { addToHistory } from '../history'
import { getContext, setContext, removeContext } from '../context'
import { Command } from '@commander-js/extra-typings'
import { ask } from '../utils/ask'
import { hasPermissionsToUseTool } from '../permissions'
import { getTools } from '../tools'
// ⚙️ 配置管理和系统设置
import {
  getGlobalConfig,
  getCurrentProjectConfig,
  saveGlobalConfig,
  saveCurrentProjectConfig,
  getCustomApiKeyStatus,
  normalizeApiKeyForConfig,
  setConfigForCLI,
  deleteConfigForCLI,
  getConfigForCLI,
  listConfigForCLI,
  enableConfigs,
  validateAndRepairAllGPT5Profiles,
} from '../utils/config'
import { cwd } from 'process'

// 📝 日志和调试系统
import { dateToFilename, logError, parseLogFilename } from '../utils/log'
import { initDebugLogger } from '../utils/debugLogger'

// 🎨 UI组件和界面屏幕
import { Onboarding } from '../components/Onboarding'
import { Doctor } from '../screens/Doctor'
import { ApproveApiKey } from '../components/ApproveApiKey'
import { TrustDialog } from '../components/TrustDialog'
import { LogList } from '../screens/LogList'
import { ResumeConversation } from '../screens/ResumeConversation'

// 🔧 系统工具和状态管理
import { checkHasTrustDialogAccepted, McpServerConfig } from '../utils/config'
import { isDefaultSlowAndCapableModel } from '../utils/model'
import { startMCPServer } from './mcp'
import { env } from '../utils/env'
import { getCwd, setCwd, setOriginalCwd } from '../utils/state'
import { omit } from 'lodash-es'
import { getCommands } from '../commands'
import { getNextAvailableLogForkNumber, loadLogList } from '../utils/log'
import { loadMessagesFromLog } from '../utils/conversationRecovery'
import { cleanupOldMessageFilesInBackground } from '../utils/cleanup'
// 🛡️ 权限和工具管理
import {
  handleListApprovedTools,
  handleRemoveApprovedTool,
} from '../commands/approvedTools'

// 🔌 MCP（模型上下文协议）集成
import {
  addMcpServer,
  getMcpServer,
  listMCPServers,
  parseEnvVars,
  removeMcpServer,
  getClients,
  ensureConfigScope,
} from '../services/mcpClient'
import { handleMcprcServerApprovals } from '../services/mcpServerApproval'

// 🔄 自动更新和版本管理
import { getExampleCommands } from '../utils/exampleCommands'
import { cursorShow } from 'ansi-escapes'
import { getLatestVersion, assertMinVersion, getUpdateCommandSuggestions } from '../utils/autoUpdater'
import { gt } from 'semver'
import { CACHE_PATHS } from '../utils/log'
// import { checkAndNotifyUpdate } from '../utils/autoUpdater'
import { PersistentShell } from '../utils/PersistentShell'
// Vendor beta gates removed

// 🎛️ 终端和系统控制
import { clearTerminal } from '../utils/terminal'
import { showInvalidConfigDialog } from '../components/InvalidConfigDialog'
import { ConfigParseError } from '../utils/errors'
import { grantReadPermissionForOriginalDir } from '../utils/permissions/filesystem'
import { MACRO } from '../constants/macros'
/**
 * 🎓 完成用户首次使用引导流程
 *
 * 引导完成标记：
 * - 将用户标记为已完成初始化设置
 * - 避免重复显示引导界面
 * - 记录当前版本号，用于判断是否需要显示版本更新后的新功能介绍
 */
export function completeOnboarding(): void {
  const config = getGlobalConfig()
  saveGlobalConfig({
    ...config,
    hasCompletedOnboarding: true,
    lastOnboardingVersion: MACRO.VERSION,
  })
}

/**
 * 🎨 显示设置界面流程 - 首次使用引导和安全确认
 *
 * 设置界面流程：
 * 1. 检查是否为测试环境，是则跳过
 * 2. 显示首次使用引导（如果未完成）
 * 3. 显示信任确认对话框（安全模式下）
 * 4. 处理MCP服务器批准流程
 *
 * @param safeMode - 是否启用安全模式
 * @param print - 是否为打印模式（非交互模式）
 */
async function showSetupScreens(
  safeMode?: boolean,
  print?: boolean,
): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    return
  }

  const config = getGlobalConfig()
  if (
    !config.theme ||
    !config.hasCompletedOnboarding // 🎯 首次使用时总是显示引导界面
  ) {
    await clearTerminal()
    const { render } = await import('ink')
    await new Promise<void>(resolve => {
      render(
        <Onboarding
          onDone={async () => {
            completeOnboarding()
            await clearTerminal()
            resolve()
          }}
        />,
        {
          exitOnCtrlC: false,
        },
      )
    })
  }

  // // Check for custom API key (only allowed for ants)
  // if (process.env.ANTHROPIC_API_KEY && process.env.USER_TYPE === 'ant') {
  //   const customApiKeyTruncated = normalizeApiKeyForConfig(
  //     process.env.ANTHROPIC_API_KEY!,
  //   )
  //   const keyStatus = getCustomApiKeyStatus(customApiKeyTruncated)
  //   if (keyStatus === 'new') {
  //     await new Promise<void>(resolve => {
  //       render(
  //         <ApproveApiKey
  //           customApiKeyTruncated={customApiKeyTruncated}
  //           onDone={async () => {
  //             await clearTerminal()
  //             resolve()
  //           }}
  //         />,
  //         {
  //           exitOnCtrlC: false,
  //         },
  //       )
  //     })
  //   }
  // }

  // 🛡️ 非交互模式下，仅在安全模式中显示信任对话框
  if (!print && safeMode) {
    if (!checkHasTrustDialogAccepted()) {
      await new Promise<void>(resolve => {
        const onDone = () => {
          // 🔓 为当前工作目录授予读取权限
          grantReadPermissionForOriginalDir()
          resolve()
        }
        ;(async () => {
          const { render } = await import('ink')
          render(<TrustDialog onDone={onDone} />, {
            exitOnCtrlC: false,
          })
        })()
      })
    }

    // 🔌 信任对话框后，检查需要批准的mcprc服务器
    if (process.env.USER_TYPE === 'ant') {
      await handleMcprcServerApprovals()
    }
  }
}

/**
 * 📊 记录启动统计 - 增加启动次数计数器
 */
function logStartup(): void {
  const config = getGlobalConfig()
  saveGlobalConfig({
    ...config,
    numStartups: (config.numStartups ?? 0) + 1,
  })
}

/**
 * 🔧 系统设置和初始化 - 核心的系统准备流程
 *
 * 设置流程：
 * 1. 配置工作目录和权限
 * 2. 启动代理配置文件监控
 * 3. 安全模式验证
 * 4. 后台任务初始化
 * 5. 配置迁移和更新
 *
 * @param cwd - 当前工作目录路径
 * @param safeMode - 是否启用安全模式
 */
async function setup(cwd: string, safeMode?: boolean): Promise<void> {
  // 📂 如果提供了--cwd参数，设置当前和原始工作目录
  if (cwd !== process.cwd()) {
    setOriginalCwd(cwd)
  }
  await setCwd(cwd)

  // 🔓 总是为原始工作目录授予读取权限
  grantReadPermissionForOriginalDir()

  // 🔄 开始监视代理配置文件的变更
  // 优先尝试ESM友好的路径（编译后的dist），然后回退到无扩展名（dev/tsx）
  let agentLoader: any
  try {
    agentLoader = await import('../utils/agentLoader.js')
  } catch {
    agentLoader = await import('../utils/agentLoader')
  }
  const { startAgentWatcher, clearAgentCache } = agentLoader
  await startAgentWatcher(() => {
    // 缓存已在监视器中清除，仅记录日志
    console.log('✅ Agent configurations hot-reloaded')
  })

  // 🛡️ 如果启用--safe模式，出于安全原因阻止root/sudo使用
  if (safeMode) {
    // 🔍 检查是否在Unix-like系统上以root/sudo身份运行
    if (
      process.platform !== 'win32' &&
      typeof process.getuid === 'function' &&
      process.getuid() === 0
    ) {
      console.error(
        `--safe mode cannot be used with root/sudo privileges for security reasons`,
      )
      process.exit(1)
    }
  }

  if (process.env.NODE_ENV === 'test') {
    return
  }

  // 🧹 后台任务和预加载
  cleanupOldMessageFilesInBackground()
  // getExampleCommands() // 预获取示例命令
  getContext() // 一次性预获取所有上下文数据
  // initializeStatsig() // 启动statsig初始化

  // 🔄 迁移旧的iterm2KeyBindingInstalled配置到新的shiftEnterKeyBindingInstalled
  const globalConfig = getGlobalConfig()
  if (
    globalConfig.iterm2KeyBindingInstalled === true &&
    globalConfig.shiftEnterKeyBindingInstalled !== true
  ) {
    const updatedConfig = {
      ...globalConfig,
      shiftEnterKeyBindingInstalled: true,
    }
    // 🗑️ 删除旧的配置属性
    delete updatedConfig.iterm2KeyBindingInstalled
    saveGlobalConfig(updatedConfig)
  }

  // 💰 检查上次会话的成本和持续时间
  const projectConfig = getCurrentProjectConfig()
  if (
    projectConfig.lastCost !== undefined &&
    projectConfig.lastDuration !== undefined
  ) {

    // 🧹 记录后清除值
    // saveCurrentProjectConfig({
    //   ...projectConfig,
    //   lastCost: undefined,
    //   lastAPIDuration: undefined,
    //   lastDuration: undefined,
    //   lastSessionId: undefined,
    // })
  }

  // 🔄 启动期间跳过交互式自动更新器权限提示
  // 用户仍可以根据需要手动运行doctor命令
}

/**
 * 🚀 主函数 - 应用程序的核心启动逻辑
 *
 * 启动流程：
 * 1. 初始化调试日志系统
 * 2. 验证和修复配置文件
 * 3. 处理标准输入流
 * 4. 解析命令行参数
 * 5. 启动相应的运行模式
 *
 * 错误处理：
 * - 配置解析错误：显示友好的错误对话框
 * - GPT-5配置问题：自动修复并继续运行
 * - 系统级错误：记录并优雅退出
 */
async function main() {
  // 🔍 初始化调试日志系统，用于开发者调试和问题排查
  initDebugLogger()

  /**
   * ⚙️ 配置系统初始化和验证
   * 加载用户的全局配置和项目配置，确保配置文件格式正确
   */
  try {
    enableConfigs()

    /**
     * 🤖 GPT-5模型配置自动修复
     * 由于GPT-5模型配置可能因为版本更新而过期，
     * 这里自动检查和修复配置，确保模型能正常工作
     */
    try {
      const repairResult = validateAndRepairAllGPT5Profiles()
      if (repairResult.repaired > 0) {
        console.log(`🔧 Auto-repaired ${repairResult.repaired} GPT-5 model configurations`)
      }
    } catch (repairError) {
      // ⚠️ GPT-5验证失败不应该阻止程序启动，仅发出警告
      console.warn('⚠️ GPT-5 configuration validation failed:', repairError)
    }
  } catch (error: unknown) {
    if (error instanceof ConfigParseError) {
      // 🚨 配置文件解析错误 - 显示用户友好的错误对话框
      await showInvalidConfigDialog({ error })
      return // 处理配置错误后退出
    }
  }

  // 🔕 禁用后台通知器以避免REPL期间的屏幕中日志

  let inputPrompt = ''
  let renderContext: RenderOptions | undefined = {
    exitOnCtrlC: false,

    onFlicker() {},
  } as any

  // 📥 处理非TTY输入（管道输入）
  if (
    !process.stdin.isTTY &&
    !process.env.CI &&
    // 🔌 输入劫持会破坏MCP功能
    !process.argv.includes('mcp')
  ) {
    inputPrompt = await stdin()
    if (process.platform !== 'win32') {
      try {
        const ttyFd = openSync('/dev/tty', 'r')
        renderContext = { ...renderContext, stdin: new ReadStream(ttyFd) }
      } catch (err) {
        logError(`Could not open /dev/tty: ${err}`)
      }
    }
  }
  await parseArgs(inputPrompt, renderContext)
}

/**
 * 📋 解析命令行参数并设置所有可用的命令
 *
 * 这个函数是命令行界面的核心，定义了所有用户可以使用的命令和选项：
 *
 * 主要命令类别：
 * 1. 🎮 主命令：启动交互式REPL或打印模式
 * 2. ⚙️ 配置管理：get/set/list/remove配置项
 * 3. 🛡️ 工具权限：管理approved-tools列表
 * 4. 🔌 MCP服务器：add/remove/list MCP服务器
 * 5. 🩺 系统诊断：doctor健康检查
 * 6. 📚 对话管理：log/resume/error查看
 * 7. 🔄 更新管理：update版本检查
 * 8. 📝 上下文管理：context操作（已弃用）
 *
 * @param stdinContent - 从标准输入读取的内容（如管道输入）
 * @param renderContext - 终端渲染上下文配置
 * @returns Promise<Command> - commander.js的程序对象
 */
async function parseArgs(
  stdinContent: string,
  renderContext: RenderOptions | undefined,
): Promise<Command> {
  const program = new Command()

  // 🎛️ 设置渲染上下文，允许Ctrl+C退出
  const renderContextWithExitOnCtrlC = {
    ...renderContext,
    exitOnCtrlC: true,
  }

  // 📋 获取所有可用命令，根据用户类型过滤（普通用户 vs 内部员工）
  const commands = await getCommands()

  // 📝 生成帮助文本中显示的命令列表，过滤掉隐藏命令
  const commandList = commands
    .filter(cmd => !cmd.isHidden)
    .map(cmd => `/${cmd.name} - ${cmd.description}`)
    .join('\n')

  program
    .name(PRODUCT_COMMAND)
    .description(
      `${PRODUCT_NAME} - starts an interactive session by default, use -p/--print for non-interactive output

Slash commands available during an interactive session:
${commandList}`,
    )
    .argument('[prompt]', 'Your prompt', String)
    .option('-c, --cwd <cwd>', 'The current working directory', String, cwd())
    .option('-d, --debug', 'Enable debug mode', () => true)
    .option(
      '--debug-verbose',
      'Enable verbose debug terminal output',
      () => true,
    )
    .option(
      '--verbose',
      'Override verbose mode setting from config',
      () => true,
    )
    .option('-e, --enable-architect', 'Enable the Architect tool', () => true)
    .option(
      '-p, --print',
      'Print response and exit (useful for pipes)',
      () => true,
    )
    .option(
      '--safe',
      'Enable strict permission checking mode (default is permissive)',
      () => true,
    )
    .action(
      async (prompt, { cwd, debug, verbose, enableArchitect, print, safe }) => {
        await showSetupScreens(safe, print)
        
        await setup(cwd, safe)

        assertMinVersion()

        const [tools, mcpClients] = await Promise.all([
          getTools(
            enableArchitect ?? getCurrentProjectConfig().enableArchitectTool,
          ),
          getClients(),
        ])
        // logStartup()
        const inputPrompt = [prompt, stdinContent].filter(Boolean).join('\n')
        if (print) {
          if (!inputPrompt) {
            console.error(
              'Error: Input must be provided either through stdin or as a prompt argument when using --print',
            )
            process.exit(1)
          }

          addToHistory(inputPrompt)
          const { resultText: response } = await ask({
            commands,
            hasPermissionsToUseTool,
            messageLogName: dateToFilename(new Date()),
            prompt: inputPrompt,
            cwd,
            tools,
            safeMode: safe,
          })
          console.log(response)
          process.exit(0)
        } else {
          const isDefaultModel = await isDefaultSlowAndCapableModel()

          // Prefetch update info before first render to place banner at top
          const updateInfo = await (async () => {
            try {
              const latest = await getLatestVersion()
              if (latest && gt(latest, MACRO.VERSION)) {
                const cmds = await getUpdateCommandSuggestions()
                return { version: latest as string, commands: cmds as string[] }
              }
            } catch {}
            return { version: null as string | null, commands: null as string[] | null }
          })()

          {
            const { render } = await import('ink')
            const { REPL } = await import('../screens/REPL')
            render(
              <REPL
              commands={commands}
              debug={debug}
              initialPrompt={inputPrompt}
              messageLogName={dateToFilename(new Date())}
              shouldShowPromptInput={true}
              verbose={verbose}
              tools={tools}
              safeMode={safe}
              mcpClients={mcpClients}
              isDefaultModel={isDefaultModel}
              initialUpdateVersion={updateInfo.version}
              initialUpdateCommands={updateInfo.commands}
            />,
            renderContext,
            )
          }
        }
      },
    )
    .version(MACRO.VERSION, '-v, --version')

  // Enable melon mode for ants if --melon is passed
  // For bun tree shaking to work, this has to be a top level --define, not inside MACRO
  // if (process.env.USER_TYPE === 'ant') {
  //   program
  //     .option('--melon', 'Enable melon mode')
  //     .hook('preAction', async () => {
  //       if ((program.opts() as { melon?: boolean }).melon) {
  //         const { runMelonWrapper } = await import('../utils/melonWrapper')
  //         const melonArgs = process.argv.slice(
  //           process.argv.indexOf('--melon') + 1,
  //         )
  //         const exitCode = runMelonWrapper(melonArgs)
  //         process.exit(exitCode)
  //       }
  //     })
  // }

  // claude config
  const config = program
    .command('config')
    .description(
      `Manage configuration (eg. ${PRODUCT_COMMAND} config set -g theme dark)`,
    )

  config
    .command('get <key>')
    .description('Get a config value')
    .option('-c, --cwd <cwd>', 'The current working directory', String, cwd())
    .option('-g, --global', 'Use global config')
    .action(async (key, { cwd, global }) => {
      await setup(cwd, false)
      console.log(getConfigForCLI(key, global ?? false))
      process.exit(0)
    })

  config
    .command('set <key> <value>')
    .description('Set a config value')
    .option('-c, --cwd <cwd>', 'The current working directory', String, cwd())
    .option('-g, --global', 'Use global config')
    .action(async (key, value, { cwd, global }) => {
      await setup(cwd, false)
      setConfigForCLI(key, value, global ?? false)
      console.log(`Set ${key} to ${value}`)
      process.exit(0)
    })

  config
    .command('remove <key>')
    .description('Remove a config value')
    .option('-c, --cwd <cwd>', 'The current working directory', String, cwd())
    .option('-g, --global', 'Use global config')
    .action(async (key, { cwd, global }) => {
      await setup(cwd, false)
      deleteConfigForCLI(key, global ?? false)
      console.log(`Removed ${key}`)
      process.exit(0)
    })

  config
    .command('list')
    .description('List all config values')
    .option('-c, --cwd <cwd>', 'The current working directory', String, cwd())
    .option('-g, --global', 'Use global config', false)
    .action(async ({ cwd, global }) => {
      await setup(cwd, false)
      console.log(
        JSON.stringify(global ? listConfigForCLI(true) : listConfigForCLI(false), null, 2),
      )
      process.exit(0)
    })

  // claude approved-tools

  const allowedTools = program
    .command('approved-tools')
    .description('Manage approved tools')

  allowedTools
    .command('list')
    .description('List all approved tools')
    .action(async () => {
      const result = handleListApprovedTools(getCwd())
      console.log(result)
      process.exit(0)
    })

  allowedTools
    .command('remove <tool>')
    .description('Remove a tool from the list of approved tools')
    .action(async (tool: string) => {
      const result = handleRemoveApprovedTool(tool)
      console.log(result.message)
      process.exit(result.success ? 0 : 1)
    })

  // claude mcp

  const mcp = program
    .command('mcp')
    .description('Configure and manage MCP servers')

  mcp
    .command('serve')
    .description(`Start the ${PRODUCT_NAME} MCP server`)
    .action(async () => {
      const providedCwd = (program.opts() as { cwd?: string }).cwd ?? cwd()

      // Verify the directory exists
      if (!existsSync(providedCwd)) {
        console.error(`Error: Directory ${providedCwd} does not exist`)
        process.exit(1)
      }

      try {
        await setup(providedCwd, false)
        await startMCPServer(providedCwd)
      } catch (error) {
        console.error('Error: Failed to start MCP server:', error)
        process.exit(1)
      }
    })

  mcp
    .command('add-sse <name> <url>')
    .description('Add an SSE server')
    .option(
      '-s, --scope <scope>',
      'Configuration scope (project or global)',
      'project',
    )
    .action(async (name, url, options) => {
      try {
        const scope = ensureConfigScope(options.scope)

        addMcpServer(name, { type: 'sse', url }, scope)
        console.log(
          `Added SSE MCP server ${name} with URL ${url} to ${scope} config`,
        )
        process.exit(0)
      } catch (error) {
        console.error((error as Error).message)
        process.exit(1)
      }
    })

  mcp
    .command('add [name] [commandOrUrl] [args...]')
    .description('Add a server (run without arguments for interactive wizard)')
    .option(
      '-s, --scope <scope>',
      'Configuration scope (project or global)',
      'project',
    )
    .option(
      '-e, --env <env...>',
      'Set environment variables (e.g. -e KEY=value)',
    )
    .action(async (name, commandOrUrl, args, options) => {
      try {
        // If name is not provided, start interactive wizard
        if (!name) {
          console.log('Interactive wizard mode: Enter the server details')
          const { createInterface } = await import('readline')
          const rl = createInterface({
            input: process.stdin,
            output: process.stdout,
          })

          const question = (query: string) =>
            new Promise<string>(resolve => rl.question(query, resolve))

          // Get server name
          const serverName = await question('Server name: ')
          if (!serverName) {
            console.error('Error: Server name is required')
            rl.close()
            process.exit(1)
          }

          // Get server type
          const serverType = await question(
            'Server type (stdio or sse) [stdio]: ',
          )
          const type =
            serverType && ['stdio', 'sse'].includes(serverType)
              ? serverType
              : 'stdio'

          // Get command or URL
          const prompt = type === 'stdio' ? 'Command: ' : 'URL: '
          const commandOrUrlValue = await question(prompt)
          if (!commandOrUrlValue) {
            console.error(
              `Error: ${type === 'stdio' ? 'Command' : 'URL'} is required`,
            )
            rl.close()
            process.exit(1)
          }

          // Get args and env if stdio
          let serverArgs: string[] = []
          let serverEnv: Record<string, string> = {}

          if (type === 'stdio') {
            const argsStr = await question(
              'Command arguments (space-separated): ',
            )
            serverArgs = argsStr ? argsStr.split(' ').filter(Boolean) : []

            const envStr = await question(
              'Environment variables (format: KEY1=value1,KEY2=value2): ',
            )
            if (envStr) {
              const envPairs = envStr.split(',').map(pair => pair.trim())
              serverEnv = parseEnvVars(envPairs.map(pair => pair))
            }
          }

          // Get scope
          const scopeStr = await question(
            'Configuration scope (project or global) [project]: ',
          )
          const serverScope = ensureConfigScope(scopeStr || 'project')

          rl.close()

          // Add the server
          if (type === 'sse') {
            
            addMcpServer(
              serverName,
              { type: 'sse', url: commandOrUrlValue },
              serverScope,
            )
            console.log(
              `Added SSE MCP server ${serverName} with URL ${commandOrUrlValue} to ${serverScope} config`,
            )
          } else {
            
            addMcpServer(
              serverName,
              {
                type: 'stdio',
                command: commandOrUrlValue,
                args: serverArgs,
                env: serverEnv,
              },
              serverScope,
            )

            console.log(
              `Added stdio MCP server ${serverName} with command: ${commandOrUrlValue} ${serverArgs.join(' ')} to ${serverScope} config`,
            )
          }
        } else if (name && commandOrUrl) {
          // Regular non-interactive flow
          const scope = ensureConfigScope(options.scope)

          // Check if it's an SSE URL (starts with http:// or https://)
          if (commandOrUrl.match(/^https?:\/\//)) {
            
            addMcpServer(name, { type: 'sse', url: commandOrUrl }, scope)
            console.log(
              `Added SSE MCP server ${name} with URL ${commandOrUrl} to ${scope} config`,
            )
          } else {
            
            const env = parseEnvVars(options.env)
            addMcpServer(
              name,
              { type: 'stdio', command: commandOrUrl, args: args || [], env },
              scope,
            )

            console.log(
              `Added stdio MCP server ${name} with command: ${commandOrUrl} ${(args || []).join(' ')} to ${scope} config`,
            )
          }
        } else {
          console.error(
            'Error: Missing required arguments. Either provide no arguments for interactive mode or specify name and command/URL.',
          )
          process.exit(1)
        }

        process.exit(0)
      } catch (error) {
        console.error((error as Error).message)
        process.exit(1)
      }
    })
  mcp
    .command('remove <name>')
    .description('Remove an MCP server')
    .option(
      '-s, --scope <scope>',
      'Configuration scope (project, global, or mcprc)',
      'project',
    )
    .action(async (name: string, options: { scope?: string }) => {
      try {
        const scope = ensureConfigScope(options.scope)
        

        removeMcpServer(name, scope)
        console.log(`Removed MCP server ${name} from ${scope} config`)
        process.exit(0)
      } catch (error) {
        console.error((error as Error).message)
        process.exit(1)
      }
    })

  mcp
    .command('list')
    .description('List configured MCP servers')
    .action(() => {
      const servers = listMCPServers()
      if (Object.keys(servers).length === 0) {
        console.log(
          `No MCP servers configured. Use \`${PRODUCT_COMMAND} mcp add\` to add a server.`,
        )
      } else {
        for (const [name, server] of Object.entries(servers)) {
          if (server.type === 'sse') {
            console.log(`${name}: ${server.url} (SSE)`)
          } else {
            console.log(`${name}: ${server.command} ${server.args.join(' ')}`)
          }
        }
      }
      process.exit(0)
    })

  mcp
    .command('add-json <name> <json>')
    .description('Add an MCP server (stdio or SSE) with a JSON string')
    .option(
      '-s, --scope <scope>',
      'Configuration scope (project or global)',
      'project',
    )
    .action(async (name, jsonStr, options) => {
      try {
        const scope = ensureConfigScope(options.scope)

        // Parse JSON string
        let serverConfig
        try {
          serverConfig = JSON.parse(jsonStr)
        } catch (e) {
          console.error('Error: Invalid JSON string')
          process.exit(1)
        }

        // Validate the server config
        if (
          !serverConfig.type ||
          !['stdio', 'sse'].includes(serverConfig.type)
        ) {
          console.error('Error: Server type must be "stdio" or "sse"')
          process.exit(1)
        }

        if (serverConfig.type === 'sse' && !serverConfig.url) {
          console.error('Error: SSE server must have a URL')
          process.exit(1)
        }

        if (serverConfig.type === 'stdio' && !serverConfig.command) {
          console.error('Error: stdio server must have a command')
          process.exit(1)
        }

        // Add server with the provided config
        
        addMcpServer(name, serverConfig, scope)

        if (serverConfig.type === 'sse') {
          console.log(
            `Added SSE MCP server ${name} with URL ${serverConfig.url} to ${scope} config`,
          )
        } else {
          console.log(
            `Added stdio MCP server ${name} with command: ${serverConfig.command} ${(
              serverConfig.args || []
            ).join(' ')} to ${scope} config`,
          )
        }

        process.exit(0)
      } catch (error) {
        console.error((error as Error).message)
        process.exit(1)
      }
    })

  mcp
    .command('get <name>')
    .description('Get details about an MCP server')
    .action((name: string) => {
      
      const server = getMcpServer(name)
      if (!server) {
        console.error(`No MCP server found with name: ${name}`)
        process.exit(1)
      }
      console.log(`${name}:`)
      console.log(`  Scope: ${server.scope}`)
      if (server.type === 'sse') {
        console.log(`  Type: sse`)
        console.log(`  URL: ${server.url}`)
      } else {
        console.log(`  Type: stdio`)
        console.log(`  Command: ${server.command}`)
        console.log(`  Args: ${server.args.join(' ')}`)
        if (server.env) {
          console.log('  Environment:')
          for (const [key, value] of Object.entries(server.env)) {
            console.log(`    ${key}=${value}`)
          }
        }
      }
      process.exit(0)
    })

  // Import servers from Claude Desktop
  mcp
    .command('add-from-claude-desktop')
    .description(
      'Import MCP servers from Claude Desktop (Mac, Windows and WSL)',
    )
    .option(
      '-s, --scope <scope>',
      'Configuration scope (project or global)',
      'project',
    )
    .action(async options => {
      try {
        const scope = ensureConfigScope(options.scope)
        const platform = process.platform

        // Import fs and path modules
        const { existsSync, readFileSync } = await import('fs')
        const { join } = await import('path')
        const { exec } = await import('child_process')

        // Determine if running in WSL
        const isWSL =
          platform === 'linux' &&
          existsSync('/proc/version') &&
          readFileSync('/proc/version', 'utf-8')
            .toLowerCase()
            .includes('microsoft')

        if (platform !== 'darwin' && platform !== 'win32' && !isWSL) {
          console.error(
            'Error: This command is only supported on macOS, Windows, and WSL',
          )
          process.exit(1)
        }

        // Get Claude Desktop config path
        let configPath
        if (platform === 'darwin') {
          configPath = join(
            process.env.HOME || '~',
            'Library/Application Support/Claude/claude_desktop_config.json',
          )
        } else if (platform === 'win32') {
          configPath = join(
            process.env.APPDATA || '',
            'Claude/claude_desktop_config.json',
          )
        } else if (isWSL) {
          // Get Windows username
          const whoamiCommand = await new Promise<string>((resolve, reject) => {
            exec(
              'powershell.exe -Command "whoami"',
              (err: Error, stdout: string) => {
                if (err) reject(err)
                else resolve(stdout.trim().split('\\').pop() || '')
              },
            )
          })

          configPath = `/mnt/c/Users/${whoamiCommand}/AppData/Roaming/Claude/claude_desktop_config.json`
        }

        // Check if config file exists
        if (!existsSync(configPath)) {
          console.error(
            `Error: Claude Desktop config file not found at ${configPath}`,
          )
          process.exit(1)
        }

        // Read config file
        let config
        try {
          const configContent = readFileSync(configPath, 'utf-8')
          config = JSON.parse(configContent)
        } catch (err) {
          console.error(`Error reading config file: ${err}`)
          process.exit(1)
        }

        // Extract MCP servers
        const mcpServers = config.mcpServers || {}
        const serverNames = Object.keys(mcpServers)
        const numServers = serverNames.length

        if (numServers === 0) {
          console.log('No MCP servers found in Claude Desktop config')
          process.exit(0)
        }

        // Create server information for display
        const serversInfo = serverNames.map(name => {
          const server = mcpServers[name]
          let description = ''

          if (server.type === 'sse') {
            description = `SSE: ${server.url}`
          } else {
            description = `stdio: ${server.command} ${(server.args || []).join(' ')}`
          }

          return { name, description, server }
        })

        // First import all required modules outside the component
        // Import modules separately to avoid any issues
        const ink = await import('ink')
        const reactModule = await import('react')
        const inkjsui = await import('@inkjs/ui')
        const utilsTheme = await import('../utils/theme')

        const { render } = ink
        const React = reactModule // React is already the default export when imported this way
        const { MultiSelect } = inkjsui
        const { Box, Text } = ink
        const { getTheme } = utilsTheme

        // Use Ink to render a nice UI for selection
        await new Promise<void>(resolve => {
          // Create a component for the server selection
          function ClaudeDesktopImport() {
            const { useState } = reactModule
            const [isFinished, setIsFinished] = useState(false)
            const [importResults, setImportResults] = useState([] as { name: string; success: boolean }[])
            const [isImporting, setIsImporting] = useState(false)
            const theme = getTheme()

            // Function to import selected servers
            const importServers = async (selectedServers: string[]) => {
              setIsImporting(true)
              const results = []

              for (const name of selectedServers) {
                try {
                  const server = mcpServers[name]

                  // Check if server already exists
                  const existingServer = getMcpServer(name)
                  if (existingServer) {
                    // Skip duplicates - we'll handle them in the confirmation step
                    continue
                  }

                  addMcpServer(name, server as McpServerConfig, scope)
                  results.push({ name, success: true })
                } catch (err) {
                  results.push({ name, success: false })
                }
              }

              setImportResults(results)
              setIsImporting(false)
              setIsFinished(true)

              // Give time to show results
              setTimeout(() => {
                resolve()
              }, 1000)
            }

            // Handle confirmation of selections
            const handleConfirm = async (selectedServers: string[]) => {
              // Check for existing servers and confirm overwrite
              const existingServers = selectedServers.filter(name =>
                getMcpServer(name),
              )

              if (existingServers.length > 0) {
                // We'll just handle it directly since we have a simple UI
                const results = []

                // Process non-existing servers first
                const newServers = selectedServers.filter(
                  name => !getMcpServer(name),
                )
                for (const name of newServers) {
                  try {
                    const server = mcpServers[name]
                    addMcpServer(name, server as McpServerConfig, scope)
                    results.push({ name, success: true })
                  } catch (err) {
                    results.push({ name, success: false })
                  }
                }

                // Now handle existing servers by prompting for each one
                for (const name of existingServers) {
                  try {
                    const server = mcpServers[name]
                    // Overwrite existing server - in a real interactive UI you'd prompt here
                    addMcpServer(name, server as McpServerConfig, scope)
                    results.push({ name, success: true })
                  } catch (err) {
                    results.push({ name, success: false })
                  }
                }

                setImportResults(results)
                setIsImporting(false)
                setIsFinished(true)

                // Give time to show results before resolving
                setTimeout(() => {
                  resolve()
                }, 1000)
              } else {
                // No existing servers, proceed with import
                await importServers(selectedServers)
              }
            }

            return (
              <Box flexDirection="column" padding={1}>
                <Box
                  flexDirection="column"
                  borderStyle="round"
                borderColor={theme.kode}
                  padding={1}
                  width={'100%'}
                >
                  <Text bold color={theme.kode}>
                    Import MCP Servers from Claude Desktop
                  </Text>

                  <Box marginY={1}>
                    <Text>
                      Found {numServers} MCP servers in Claude Desktop.
                    </Text>
                  </Box>

                  <Text>Please select the servers you want to import:</Text>

                  <Box marginTop={1}>
                    <MultiSelect
                      options={serverNames.map(name => ({
                        label: name,
                        value: name,
                      }))}
                      defaultValue={serverNames}
                      onSubmit={handleConfirm}
                    />
                  </Box>
                </Box>

                <Box marginTop={0} marginLeft={3}>
                  <Text dimColor>
                    Space to select · Enter to confirm · Esc to cancel
                  </Text>
                </Box>

                {isFinished && (
                  <Box marginTop={1}>
                    <Text color={theme.success}>
                      Successfully imported{' '}
                      {importResults.filter(r => r.success).length} MCP server
                      to local config.
                    </Text>
                  </Box>
                )}
              </Box>
            )
          }

          // Render the component
          const { unmount } = render(<ClaudeDesktopImport />)

          // Clean up when done
          setTimeout(() => {
            unmount()
            resolve()
          }, 30000) // Timeout after 30 seconds as a fallback
        })

        process.exit(0)
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`)
        process.exit(1)
      }
    })

  // Function to reset MCP server choices
  const resetMcpChoices = () => {
    const config = getCurrentProjectConfig()
    saveCurrentProjectConfig({
      ...config,
      approvedMcprcServers: [],
      rejectedMcprcServers: [],
    })
    console.log('All .mcprc server approvals and rejections have been reset.')
    console.log(
      `You will be prompted for approval next time you start ${PRODUCT_NAME}.`,
    )
    process.exit(0)
  }

  // New command name to match Kode
  mcp
    .command('reset-project-choices')
    .description(
      'Reset all approved and rejected project-scoped (.mcp.json) servers within this project',
    )
    .action(() => {
      
      resetMcpChoices()
    })

  // Keep old command for backward compatibility (visible only to ants)
  if (process.env.USER_TYPE === 'ant') {
    mcp
      .command('reset-mcprc-choices')
      .description(
        'Reset all approved and rejected .mcprc servers for this project',
      )
      .action(() => {
        
        resetMcpChoices()
      })
  }

  // Doctor command - simple installation health check (no auto-update)
  program
    .command('doctor')
    .description(`Check the health of your ${PRODUCT_NAME} installation`)
    .action(async () => {
      

      await new Promise<void>(resolve => {
        ;(async () => {
          const { render } = await import('ink')
          render(<Doctor onDone={() => resolve()} doctorMode={true} />)
        })()
      })
      process.exit(0)
    })

  // ant-only commands

  // claude update
  program
    .command('update')
    .description('Show manual upgrade commands (no auto-install)')
    .action(async () => {
      
      console.log(`Current version: ${MACRO.VERSION}`)
      console.log('Checking for updates...')

      const latestVersion = await getLatestVersion()

      if (!latestVersion) {
        console.error('Failed to check for updates')
        process.exit(1)
      }

      if (latestVersion === MACRO.VERSION) {
        console.log(`${PRODUCT_NAME} is up to date`)
        process.exit(0)
      }

      console.log(`New version available: ${latestVersion}`)
      const { getUpdateCommandSuggestions } = await import('../utils/autoUpdater')
      const cmds = await getUpdateCommandSuggestions()
      console.log('\nRun one of the following commands to update:')
      for (const c of cmds) console.log(`  ${c}`)
      if (process.platform !== 'win32') {
        console.log('\nNote: you may need to prefix with "sudo" on macOS/Linux.')
      }
      process.exit(0)
    })

  // claude log
  program
    .command('log')
    .description('Manage conversation logs.')
    .argument(
      '[number]',
      'A number (0, 1, 2, etc.) to display a specific log',
      parseInt,
    )
    .option('-c, --cwd <cwd>', 'The current working directory', String, cwd())
    .action(async (number, { cwd }) => {
      await setup(cwd, false)
      
      const context: { unmount?: () => void } = {}
      ;(async () => {
        const { render } = await import('ink')
        const { unmount } = render(
          <LogList context={context} type="messages" logNumber={number} />,
          renderContextWithExitOnCtrlC,
        )
        context.unmount = unmount
      })()
    })

  // claude resume
  program
    .command('resume')
    .description(
      'Resume a previous conversation. Optionally provide a number (0, 1, 2, etc.) or file path to resume a specific conversation.',
    )
    .argument(
      '[identifier]',
      'A number (0, 1, 2, etc.) or file path to resume a specific conversation',
    )
    .option('-c, --cwd <cwd>', 'The current working directory', String, cwd())
    .option('-e, --enable-architect', 'Enable the Architect tool', () => true)
    .option('-v, --verbose', 'Do not truncate message output', () => true)
    .option(
      '--safe',
      'Enable strict permission checking mode (default is permissive)',
      () => true,
    )
    .action(async (identifier, { cwd, enableArchitect, safe, verbose }) => {
      await setup(cwd, safe)
      assertMinVersion()

      const [tools, commands, logs, mcpClients] = await Promise.all([
        getTools(
          enableArchitect ?? getCurrentProjectConfig().enableArchitectTool,
        ),
        getCommands(),
        loadLogList(CACHE_PATHS.messages()),
        getClients(),
      ])
      // logStartup()

      // If a specific conversation is requested, load and resume it directly
      if (identifier !== undefined) {
        // Check if identifier is a number or a file path
        const number = Math.abs(parseInt(identifier))
        const isNumber = !isNaN(number)
        let messages, date, forkNumber
        try {
          if (isNumber) {
            
            const log = logs[number]
            if (!log) {
              console.error('No conversation found at index', number)
              process.exit(1)
            }
            messages = await loadMessagesFromLog(log.fullPath, tools)
            ;({ date, forkNumber } = log)
          } else {
            // Handle file path case
            
            if (!existsSync(identifier)) {
              console.error('File does not exist:', identifier)
              process.exit(1)
            }
            messages = await loadMessagesFromLog(identifier, tools)
            const pathSegments = identifier.split('/')
            const filename = pathSegments[pathSegments.length - 1] ?? 'unknown'
            ;({ date, forkNumber } = parseLogFilename(filename))
          }
          const fork = getNextAvailableLogForkNumber(date, forkNumber ?? 1, 0)
          const isDefaultModel = await isDefaultSlowAndCapableModel()
          {
            const { render } = await import('ink')
            const { REPL } = await import('../screens/REPL')
            render(
              <REPL
              initialPrompt=""
              messageLogName={date}
              initialForkNumber={fork}
              shouldShowPromptInput={true}
              verbose={verbose}
              commands={commands}
              tools={tools}
              safeMode={safe}
              initialMessages={messages}
              mcpClients={mcpClients}
              isDefaultModel={isDefaultModel}
            />,
            { exitOnCtrlC: false },
            )
          }
        } catch (error) {
          logError(`Failed to load conversation: ${error}`)
          process.exit(1)
        }
      } else {
        // Show the conversation selector UI
        const context: { unmount?: () => void } = {}
        ;(async () => {
          const { render } = await import('ink')
          const { unmount } = render(
            <ResumeConversation
              context={context}
              commands={commands}
              logs={logs}
              tools={tools}
              verbose={verbose}
            />,
            renderContextWithExitOnCtrlC,
          )
          context.unmount = unmount
        })()
      }
    })

  // claude error
  program
    .command('error')
    .description(
      'View error logs. Optionally provide a number (0, -1, -2, etc.) to display a specific log.',
    )
    .argument(
      '[number]',
      'A number (0, 1, 2, etc.) to display a specific log',
      parseInt,
    )
    .option('-c, --cwd <cwd>', 'The current working directory', String, cwd())
    .action(async (number, { cwd }) => {
      await setup(cwd, false)
      
      const context: { unmount?: () => void } = {}
      ;(async () => {
        const { render } = await import('ink')
        const { unmount } = render(
          <LogList context={context} type="errors" logNumber={number} />,
          renderContextWithExitOnCtrlC,
        )
        context.unmount = unmount
      })()
    })

  // claude context (TODO: deprecate)
  const context = program
    .command('context')
    .description(
      `Set static context (eg. ${PRODUCT_COMMAND} context add-file ./src/*.py)`,
    )

  context
    .command('get <key>')
    .option('-c, --cwd <cwd>', 'The current working directory', String, cwd())
    .description('Get a value from context')
    .action(async (key, { cwd }) => {
      await setup(cwd, false)
      
      const context = omit(
        await getContext(),
        'codeStyle',
        'directoryStructure',
      )
      console.log(context[key])
      process.exit(0)
    })

  context
    .command('set <key> <value>')
    .description('Set a value in context')
    .option('-c, --cwd <cwd>', 'The current working directory', String, cwd())
    .action(async (key, value, { cwd }) => {
      await setup(cwd, false)
      
      setContext(key, value)
      console.log(`Set context.${key} to "${value}"`)
      process.exit(0)
    })

  context
    .command('list')
    .description('List all context values')
    .option('-c, --cwd <cwd>', 'The current working directory', String, cwd())
    .action(async ({ cwd }) => {
      await setup(cwd, false)
      
      const context = omit(
        await getContext(),
        'codeStyle',
        'directoryStructure',
        'gitStatus',
      )
      console.log(JSON.stringify(context, null, 2))
      process.exit(0)
    })

  context
    .command('remove <key>')
    .description('Remove a value from context')
    .option('-c, --cwd <cwd>', 'The current working directory', String, cwd())
    .action(async (key, { cwd }) => {
      await setup(cwd, false)
      
      removeContext(key)
      console.log(`Removed context.${key}`)
      process.exit(0)
    })

  await program.parseAsync(process.argv)
  return program
}

/**
 * 📥 标准输入读取器 - 处理管道输入和重定向数据
 *
 * 用途：
 * - 读取通过管道传入的数据（如：echo "hello" | kode）
 * - 支持文件重定向输入（如：kode < input.txt）
 * - 在非TTY环境下收集所有输入数据
 *
 * @returns Promise<string> - 标准输入中的所有数据
 */
async function stdin() {
  if (process.stdin.isTTY) {
    return ''
  }

  let data = ''
  for await (const chunk of process.stdin) data += chunk
  return data
}

// 🚪 进程退出事件处理：正常退出时的清理工作
process.on('exit', () => {
  resetCursor()
  PersistentShell.getInstance().close()
})

/**
 * 🛡️ 优雅退出处理器 - 确保资源正确清理
 *
 * 清理任务：
 * 1. 重置终端光标状态
 * 2. 关闭持久化Shell实例
 * 3. 使用指定退出码退出进程
 *
 * @param code - 进程退出码（默认为0）
 */
function gracefulExit(code = 0) {
  try { resetCursor() } catch {}
  try { PersistentShell.getInstance().close() } catch {}
  process.exit(code)
}

// 🔧 信号处理器：捕获各种进程信号并优雅退出
process.on('SIGINT', () => gracefulExit(0))      // Ctrl+C
process.on('SIGTERM', () => gracefulExit(0))     // 终止信号
process.on('SIGBREAK', () => gracefulExit(0))    // Windows CTRL+BREAK

// 🚨 错误处理器：捕获未处理的异常和Promise拒绝
process.on('unhandledRejection', err => {
  console.error('Unhandled rejection:', err)
  gracefulExit(1)
})
process.on('uncaughtException', err => {
  console.error('Uncaught exception:', err)
  gracefulExit(1)
})

/**
 * 🖱️ 重置终端光标 - 恢复光标显示状态
 *
 * 确保终端光标在程序退出后可见，
 * 优先使用stderr，其次使用stdout
 */
function resetCursor() {
  const terminal = process.stderr.isTTY
    ? process.stderr
    : process.stdout.isTTY
      ? process.stdout
      : undefined
  terminal?.write(`\u001B[?25h${cursorShow}`)
}

// 🚀 启动应用程序
main()
