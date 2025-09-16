/**
 * 🎯 Bash 工具实现 - 系统命令执行工具的核心实现
 *
 * 🏗️ 核心功能：
 * - 提供安全的 Shell 命令执行接口
 * - 支持持久化会话和状态管理
 * - 集成完整的权限控制和安全检查
 * - 实现命令输出的格式化和截断
 * - 支持命令超时和中断机制
 *
 * 🔄 依赖关系：
 * - 上游：被 AI 代理调用执行系统操作
 * - 下游：依赖持久化 Shell、权限系统、格式化工具
 *
 * 📊 使用场景：
 * - 系统命令的安全执行
 * - Git 操作和版本控制
 * - 文件系统的批量操作
 * - 开发工具的集成调用
 *
 * 🔧 技术实现：
 * - 持久化会话：跨命令的状态保持
 * - 安全控制：禁用命令列表和权限验证
 * - 输出管理：智能截断和格式化
 * - 错误处理：完善的异常捕获和恢复
 *
 * 💡 设计原则：
 * - 安全第一：严格的命令过滤和权限控制
 * - 用户友好：清晰的输出格式和错误提示
 * - 性能优化：持久化会话减少启动开销
 * - 可控性：超时和中断机制确保系统稳定
 */

import { statSync } from 'fs'
import { EOL } from 'os'
import { isAbsolute, relative, resolve } from 'path'
import * as React from 'react'
import { z } from 'zod'  // 输入验证库
import { FallbackToolUseRejectedMessage } from '../../components/FallbackToolUseRejectedMessage'
import { PRODUCT_NAME } from '../../constants/product'
import { queryQuick } from '../../services/claude'  // AI模型快速查询服务
import { Tool, ValidationResult } from '../../Tool'
import { splitCommand } from '../../utils/commands'
import { isInDirectory } from '../../utils/file'
import { logError } from '../../utils/log'
import { PersistentShell } from '../../utils/PersistentShell'
import { getCwd, getOriginalCwd } from '../../utils/state'
import { getGlobalConfig } from '../../utils/config'
import { getModelManager } from '../../utils/model'
import BashToolResultMessage from './BashToolResultMessage'
import { BANNED_COMMANDS, PROMPT } from './prompt'
import { formatOutput, getCommandFilePaths } from './utils'

// 输入参数模式定义 - 使用Zod进行严格的类型验证
export const inputSchema = z.strictObject({
  command: z.string().describe('要执行的shell命令'),  // 必需的命令字符串
  timeout: z
    .number()
    .optional()
    .describe('可选的超时时间，单位毫秒（最大600000）'),  // 可选的超时设置
})

// 输入类型定义
type In = typeof inputSchema

// 输出类型定义 - 包含命令执行的完整结果信息
export type Out = {
  stdout: string         // 标准输出内容
  stdoutLines: number    // 原始标准输出的总行数（即使内容被截断）
  stderr: string         // 标准错误输出内容
  stderrLines: number    // 原始标准错误输出的总行数（即使内容被截断）
  interrupted: boolean   // 是否被用户中断
}

/**
 * BashTool - Shell命令执行工具
 * 提供安全的命令行界面，支持持久化会话、权限控制和输出格式化
 */
export const BashTool = {
  name: 'Bash',
  // 工具描述 - 返回工具的功能说明
  async description() {
    return '在您的计算机上执行shell命令'
  },
  // 生成工具的系统提示词 - 包含安全指导和使用说明
  async prompt() {
    const config = getGlobalConfig()
    // 获取当前配置的AI模型名称
    const modelManager = getModelManager()
    const modelName =
      modelManager.getModelName('main') || '<未配置模型>'
    // 将模型名称替换到提示词模板中
    return PROMPT.replace(/{MODEL_NAME}/g, modelName)
  },
  // 判断是否为只读工具 - Bash可以修改文件系统，所以不是只读的
  isReadOnly() {
    return false
  },
  // 判断是否支持并发执行 - 由于会修改状态和文件，不支持并发
  isConcurrencySafe() {
    return false  // BashTool会修改状态和文件，不能并发执行
  },
  inputSchema,
  userFacingName() {
    return 'Bash'
  },
  async isEnabled() {
    return true
  },
  // 判断是否需要权限检查 - 总是需要检查项目级权限
  needsPermissions(): boolean {
    return true  // Bash工具总是需要权限检查，确保安全性
  },
  /**
   * 🔒 输入验证方法 - 命令安全性和合法性的多层检查系统
   *
   * 这是Bash工具安全防护的第一道防线，负责在命令执行前进行
   * 全面的安全检查和合规性验证，确保系统的稳定性和安全性。
   *
   * @param {Object} input - 包含待验证命令的输入对象
   * @param {string} input.command - 待执行的shell命令字符串
   * @returns {Promise<ValidationResult>} 验证结果，包含是否通过和详细信息
   *
   * 🛡️ 安全检查层级：
   * ┌─────────────────────────────────────────────────────────────┐
   * │                    命令安全验证流程                          │
   * ├─────────────────────────────────────────────────────────────┤
   * │ 1. 命令分割      │ • 解析复合命令（; && || 连接符）           │
   * │                 │ • 分别验证每个子命令的安全性               │
   * ├─────────────────────────────────────────────────────────────┤
   * │ 2. 禁用命令检查  │ • 检查基础命令名是否在黑名单中             │
   * │                 │ • 拒绝执行危险的系统命令                   │
   * ├─────────────────────────────────────────────────────────────┤
   * │ 3. 目录访问控制  │ • cd命令的特殊路径安全检查                 │
   * │                 │ • 限制只能访问原始工作目录的子目录         │
   * ├─────────────────────────────────────────────────────────────┤
   * │ 4. 路径解析验证  │ • 绝对路径和相对路径的安全转换             │
   * │                 │ • 防止目录遍历攻击（../ 路径注入）         │
   * └─────────────────────────────────────────────────────────────┘
   *
   * 🚫 安全策略详解：
   * • 禁用命令清单：包含系统级危险命令（如 rm -rf, format, shutdown 等）
   * • 沙箱目录限制：防止访问系统敏感目录和上级目录
   * • 命令注入防护：通过严格解析防止恶意命令注入
   * • 权限最小化：确保命令执行在受控的权限范围内
   *
   * 💡 特殊处理机制：
   * - cd 命令：特殊的路径验证逻辑，确保只能在安全目录内切换
   * - 引号处理：正确解析带引号的路径参数
   * - 复合命令：递归验证所有连接的子命令
   * - 错误反馈：提供详细的安全拒绝原因
   */
  async validateInput({ command }): Promise<ValidationResult> {
    const commands = splitCommand(command)  // 分割复合命令
    for (const cmd of commands) {
      const parts = cmd.split(' ')
      const baseCmd = parts[0]  // 获取基础命令名

      // 检查命令是否在禁用列表中
      if (baseCmd && BANNED_COMMANDS.includes(baseCmd.toLowerCase())) {
        return {
          result: false,
          message: `出于安全考虑，不允许执行命令 '${baseCmd}'`,
        }
      }

      // Special handling for cd command
      if (baseCmd === 'cd' && parts[1]) {
        const targetDir = parts[1]!.replace(/^['"]|['"]$/g, '') // Remove quotes if present
        const fullTargetDir = isAbsolute(targetDir)
          ? targetDir
          : resolve(getCwd(), targetDir)
        if (
          !isInDirectory(
            relative(getOriginalCwd(), fullTargetDir),
            relative(getCwd(), getOriginalCwd()),
          )
        ) {
          return {
            result: false,
            message: `ERROR: cd to '${fullTargetDir}' was blocked. For security, ${PRODUCT_NAME} may only change directories to child directories of the original working directory (${getOriginalCwd()}) for this session.`,
          }
        }
      }
    }

    return { result: true }
  },
  /**
   * 🎨 命令显示格式化方法 - 用户友好的命令展示处理
   *
   * 负责格式化要显示给用户的命令内容，特别处理复杂的命令模式
   * 如HEREDOC语法，使其更易于阅读和理解。
   *
   * @param {Object} input - 包含命令的输入对象
   * @param {string} input.command - 要格式化显示的命令
   * @returns {string} 格式化后的命令字符串
   *
   * 🔄 特殊处理逻辑：
   * • HEREDOC清理：将复杂的HEREDOC语法转换为简洁的引用格式
   * • 命令简化：移除不必要的shell语法噪音
   * • 可读性优化：确保用户能够清晰理解实际执行的命令
   */
  renderToolUseMessage({ command }) {
    // Clean up any command that uses the quoted HEREDOC pattern
    if (command.includes("\"$(cat <<'EOF'")) {
      const match = command.match(
        /^(.*?)"?\$\(cat <<'EOF'\n([\s\S]*?)\n\s*EOF\n\s*\)"(.*)$/,
      )
      if (match && match[1] && match[2]) {
        const prefix = match[1]
        const content = match[2]
        const suffix = match[3] || ''
        return `${prefix.trim()} "${content.trim()}"${suffix.trim()}`
      }
    }
    return command
  },
  renderToolUseRejectedMessage() {
    return <FallbackToolUseRejectedMessage />
  },

  renderToolResultMessage(content) {
    return <BashToolResultMessage content={content} verbose={false} />
  },
  /**
   * 📝 AI助手结果格式化方法 - 结构化的命令执行结果处理
   *
   * 将命令执行结果格式化为适合AI助手理解和处理的文本格式，
   * 合并标准输出、错误输出和中断状态信息。
   *
   * @param {Object} result - 命令执行结果对象
   * @param {boolean} result.interrupted - 命令是否被中断
   * @param {string} result.stdout - 标准输出内容
   * @param {string} result.stderr - 标准错误输出内容
   * @returns {string} 格式化的结果文本，供AI助手分析和响应
   *
   * 📋 格式化逻辑：
   * • 错误信息整合：合并stderr和中断状态信息
   * • 内容去重：避免输出和错误信息的重复显示
   * • 结构化排版：确保输出格式的一致性和可读性
   * • 状态标识：清晰标识命令的完成状态
   */
  renderResultForAssistant({ interrupted, stdout, stderr }) {
    let errorMessage = stderr.trim()
    if (interrupted) {
      if (stderr) errorMessage += EOL
      errorMessage += '<error>Command was aborted before completion</error>'
    }
    const hasBoth = stdout.trim() && errorMessage
    return `${stdout.trim()}${hasBoth ? '\n' : ''}${errorMessage.trim()}`
  },
  /**
   * 🚀 核心命令执行方法 - 安全可控的Shell命令执行引擎
   *
   * 这是BashTool的核心执行引擎，负责在严格的安全控制下执行shell命令，
   * 并提供完整的状态管理、错误处理和结果格式化功能。
   *
   * @param {Object} input - 命令执行参数
   * @param {string} input.command - 待执行的shell命令
   * @param {number} input.timeout - 命令超时时间（毫秒，默认120秒）
   * @param {Object} context - 执行上下文
   * @param {AbortController} context.abortController - 命令中断控制器
   * @param {Object} context.readFileTimestamps - 文件时间戳跟踪对象
   * @returns {AsyncGenerator} 异步生成器，产出命令执行结果
   *
   * 🔄 命令执行生命周期详解：
   * ┌─────────────────────────────────────────────────────────────┐
   * │                    命令执行完整流程                          │
   * ├─────────────────────────────────────────────────────────────┤
   * │ 1. 预执行检查    │ • 检查是否已被用户取消                    │
   * │                 │ • 准备输出缓冲区和状态变量                │
   * ├─────────────────────────────────────────────────────────────┤
   * │ 2. 命令执行      │ • 通过持久化Shell实例执行命令             │
   * │                 │ • 处理标准输出和错误输出                  │
   * │                 │ • 监控执行状态和退出码                    │
   * ├─────────────────────────────────────────────────────────────┤
   * │ 3. 安全检查      │ • 验证工作目录是否在允许范围内            │
   * │                 │ • 必要时重置Shell工作目录                 │
   * ├─────────────────────────────────────────────────────────────┤
   * │ 4. 文件跟踪      │ • 更新命令涉及文件的时间戳                │
   * │                 │ • 维护文件状态一致性                      │
   * ├─────────────────────────────────────────────────────────────┤
   * │ 5. 输出处理      │ • 格式化和截断超长输出                    │
   * │                 │ • 生成结构化的执行结果                    │
   * ├─────────────────────────────────────────────────────────────┤
   * │ 6. 结果返回      │ • 构建完整的执行结果对象                  │
   * │                 │ • 提供AI助手和用户两种格式                │
   * └─────────────────────────────────────────────────────────────┘
   *
   * 🛡️ 安全特性：
   * • 中断控制：支持用户随时中断长时间运行的命令
   * • 沙箱限制：自动检查和重置超出允许范围的工作目录
   * • 超时保护：防止命令无限期运行占用系统资源
   * • 错误隔离：完善的异常捕获，防止系统崩溃
   *
   * 🔧 技术特性：
   * • 持久化会话：跨命令维持Shell状态（环境变量、工作目录等）
   * • 智能输出处理：自动截断超长输出，保持界面整洁
   * • 文件时间戳同步：维护文件修改状态的准确跟踪
   * • 双格式输出：同时支持用户界面显示和AI助手处理
   *
   * 💡 异步生成器模式：
   * 使用async generator模式实现流式输出，支持：
   * - 实时命令执行状态反馈
   * - 可中断的长时间命令执行
   * - 内存友好的大量输出处理
   * - 统一的结果格式和错误处理
   */
  async *call(
    { command, timeout = 120000 },
    { abortController, readFileTimestamps },
  ) {
    let stdout = ''
    let stderr = ''

    // 🔧 Check if already cancelled before starting execution
    if (abortController.signal.aborted) {
      const data: Out = {
        stdout: '',
        stdoutLines: 0,
        stderr: 'Command cancelled before execution',
        stderrLines: 1,
        interrupted: true,
      }

      yield {
        type: 'result',
        resultForAssistant: this.renderResultForAssistant(data),
        data,
      }
      return
    }

    try {
      // Execute commands
      const result = await PersistentShell.getInstance().exec(
        command,
        abortController.signal,
        timeout,
      )
      stdout += (result.stdout || '').trim() + EOL
      stderr += (result.stderr || '').trim() + EOL
      if (result.code !== 0) {
        stderr += `Exit code ${result.code}`
      }

      if (!isInDirectory(getCwd(), getOriginalCwd())) {
        // Shell directory is outside original working directory, reset it
        await PersistentShell.getInstance().setCwd(getOriginalCwd())
        stderr = `${stderr.trim()}${EOL}Shell cwd was reset to ${getOriginalCwd()}`
        
      }

      // Update read timestamps for any files referenced by the command
      // Don't block the main thread!
      // Skip this in tests because it makes fixtures non-deterministic (they might not always get written),
      // so will be missing in CI.
      if (process.env.NODE_ENV !== 'test') {
        getCommandFilePaths(command, stdout).then(filePaths => {
          for (const filePath of filePaths) {
            const fullFilePath = isAbsolute(filePath)
              ? filePath
              : resolve(getCwd(), filePath)

            // Try/catch in case the file doesn't exist (because Haiku didn't properly extract it)
            try {
              readFileTimestamps[fullFilePath] = statSync(fullFilePath).mtimeMs
            } catch (e) {
              logError(e)
            }
          }
        })
      }

      const { totalLines: stdoutLines, truncatedContent: stdoutContent } =
        formatOutput(stdout.trim())
      const { totalLines: stderrLines, truncatedContent: stderrContent } =
        formatOutput(stderr.trim())

      const data: Out = {
        stdout: stdoutContent,
        stdoutLines,
        stderr: stderrContent,
        stderrLines,
        interrupted: result.interrupted,
      }

      yield {
        type: 'result',
        resultForAssistant: this.renderResultForAssistant(data),
        data,
      }
    } catch (error) {
      // 🔧 Handle cancellation or other errors properly
      const isAborted = abortController.signal.aborted
      const errorMessage = isAborted 
        ? 'Command was cancelled by user' 
        : `Command failed: ${error instanceof Error ? error.message : String(error)}`
      
      const data: Out = {
        stdout: stdout.trim(),
        stdoutLines: stdout.split('\n').length,
        stderr: errorMessage,
        stderrLines: 1,
        interrupted: isAborted,
      }

      yield {
        type: 'result',
        resultForAssistant: this.renderResultForAssistant(data),
        data,
      }
    }
  },
} satisfies Tool<In, Out>
