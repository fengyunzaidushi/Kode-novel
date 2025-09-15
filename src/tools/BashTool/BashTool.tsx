// Bash工具 - 系统命令执行工具的核心实现
// 这是Kode系统中最重要的工具之一，负责执行shell命令和系统操作
// 具有完整的权限控制、安全检查和持久化shell会话支持

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
  // 输入验证 - 检查命令是否安全和合法
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
  renderResultForAssistant({ interrupted, stdout, stderr }) {
    let errorMessage = stderr.trim()
    if (interrupted) {
      if (stderr) errorMessage += EOL
      errorMessage += '<error>Command was aborted before completion</error>'
    }
    const hasBoth = stdout.trim() && errorMessage
    return `${stdout.trim()}${hasBoth ? '\n' : ''}${errorMessage.trim()}`
  },
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
