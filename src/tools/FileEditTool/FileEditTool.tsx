/**
 * 🎯 文件编辑工具实现 - 精确文本替换的核心文件修改工具
 *
 * 🏗️ 核心功能：
 * - 提供精确的字符串替换文件修改能力
 * - 支持全编码格式的文件读写操作
 * - 集成完整的权限控制和安全验证
 * - 实现智能的文件更改跟踪和冲突检测
 * - 生成结构化的修改差异展示
 *
 * 🔄 依赖关系：
 * - 上游：被 AI 代理调用进行文件编辑操作
 * - 下游：依赖文件系统工具、权限管理、差异处理
 *
 * 📊 使用场景：
 * - 代码文件的精确修改和重构
 * - 配置文件的更新和调整
 * - 文档内容的编辑和维护
 * - 批量文件内容的标准化处理
 *
 * 🔧 技术实现：
 * - 唯一性验证：确保替换字符串在文件中唯一存在
 * - 编码检测：自动识别并保持文件原始编码格式
 * - 时间戳检测：防止并发修改导致的内容冲突
 * - 差异生成：生成结构化的修改前后对比视图
 * - 权限控制：集成文件写入权限的安全检查
 *
 * 💡 设计原则：
 * - 精确性：只替换指定的唯一字符串匹配
 * - 安全性：严格的权限控制和文件状态验证
 * - 可视化：清晰的修改差异展示和确认
 * - 兼容性：支持各种编码格式和换行符风格
 */

import { Hunk } from 'diff'        // 差异处理库
import { existsSync, mkdirSync, readFileSync, statSync } from 'fs'
import { Box, Text } from 'ink'    // React终端UI组件
import { dirname, isAbsolute, relative, resolve, sep } from 'path'
import * as React from 'react'
import { z } from 'zod'             // 输入验证库
import { FileEditToolUpdatedMessage } from '../../components/FileEditToolUpdatedMessage'
import { StructuredDiff } from '../../components/StructuredDiff'
import { FallbackToolUseRejectedMessage } from '../../components/FallbackToolUseRejectedMessage'
import { Tool, ValidationResult } from '../../Tool'
import { intersperse } from '../../utils/array'
import {
  addLineNumbers,
  detectFileEncoding,
  detectLineEndings,
  findSimilarFile,
  writeTextContent,
} from '../../utils/file.js'
import { logError } from '../../utils/log'
import { getCwd } from '../../utils/state'
import { getTheme } from '../../utils/theme'
import { emitReminderEvent } from '../../services/systemReminder'
import { recordFileEdit } from '../../services/fileFreshness'
import { NotebookEditTool } from '../NotebookEditTool/NotebookEditTool'
import { DESCRIPTION } from './prompt'
import { applyEdit } from './utils'
import { hasWritePermission } from '../../utils/permissions/filesystem'
import { PROJECT_FILE } from '../../constants/product'

// 输入参数模式定义 - 使用严格的类型验证
const inputSchema = z.strictObject({
  file_path: z.string().describe('要修改的文件的绝对路径'),  // 目标文件路径
  old_string: z.string().describe('要替换的文本内容'),     // 原始字符串
  new_string: z.string().describe('替换后的文本内容'),     // 新的字符串
})

export type In = typeof inputSchema

// 在结果消息中包含的上下文行数 - 用于显示修改前后的代码片段
const N_LINES_SNIPPET = 4

/**
 * FileEditTool - 文件编辑工具
 * 使用精确的字符串替换来修改文件内容，支持各种文件类型和编码
 */
export const FileEditTool = {
  name: 'Edit',
  // 工具描述 - 返回功能说明
  async description() {
    return '用于编辑文件的工具'
  },
  // 获取系统提示词 - 包含使用指导和注意事项
  async prompt() {
    return DESCRIPTION
  },
  inputSchema,
  userFacingName() {
    return 'Edit'
  },
  async isEnabled() {
    return true
  },
  isReadOnly() {
    return false
  },
  isConcurrencySafe() {
    return false // FileEdit modifies files, not safe for concurrent execution
  },
  needsPermissions({ file_path }) {
    return !hasWritePermission(file_path)
  },
  renderToolUseMessage(input, { verbose }) {
    return `file_path: ${verbose ? input.file_path : relative(getCwd(), input.file_path)}`
  },
  renderToolResultMessage({ filePath, structuredPatch }) {
    const verbose = false // Set default value for verbose
    return (
      <FileEditToolUpdatedMessage
        filePath={filePath}
        structuredPatch={structuredPatch}
        verbose={verbose}
      />
    )
  },
  renderToolUseRejectedMessage(
    { file_path, old_string, new_string }: any = {},
    { columns, verbose }: any = {},
  ) {
    try {
      if (!file_path) {
        return <FallbackToolUseRejectedMessage />
      }
      const { patch } = applyEdit(file_path, old_string, new_string)
      return (
        <Box flexDirection="column">
          <Text>
            {'  '}⎿{' '}
            <Text color={getTheme().error}>
              User rejected {old_string === '' ? 'write' : 'update'} to{' '}
            </Text>
            <Text bold>
              {verbose ? file_path : relative(getCwd(), file_path)}
            </Text>
          </Text>
          {intersperse(
            patch.map(patch => (
              <Box flexDirection="column" paddingLeft={5} key={patch.newStart}>
                <StructuredDiff patch={patch} dim={true} width={columns - 12} />
              </Box>
            )),
            i => (
              <Box paddingLeft={5} key={`ellipsis-${i}`}>
                <Text color={getTheme().secondaryText}>...</Text>
              </Box>
            ),
          )}
        </Box>
      )
    } catch (e) {
      // Handle the case where while we were showing the diff, the user manually made the change.
      // TODO: Find a way to show the diff in this case
      logError(e)
      return (
        <Box flexDirection="column">
          <Text>{'  '}⎿ (No changes)</Text>
        </Box>
      )
    }
  },
  async validateInput(
    { file_path, old_string, new_string },
    { readFileTimestamps },
  ) {
    if (old_string === new_string) {
      return {
        result: false,
        message:
          'No changes to make: old_string and new_string are exactly the same.',
        meta: {
          old_string,
        },
      } as ValidationResult
    }

    const fullFilePath = isAbsolute(file_path)
      ? file_path
      : resolve(getCwd(), file_path)

    if (existsSync(fullFilePath) && old_string === '') {
      return {
        result: false,
        message: 'Cannot create new file - file already exists.',
      }
    }

    if (!existsSync(fullFilePath) && old_string === '') {
      return {
        result: true,
      }
    }

    if (!existsSync(fullFilePath)) {
      // Try to find a similar file with a different extension
      const similarFilename = findSimilarFile(fullFilePath)
      let message = 'File does not exist.'

      // If we found a similar file, suggest it to the assistant
      if (similarFilename) {
        message += ` Did you mean ${similarFilename}?`
      }

      return {
        result: false,
        message,
      }
    }

    if (fullFilePath.endsWith('.ipynb')) {
      return {
        result: false,
        message: `File is a Jupyter Notebook. Use the ${NotebookEditTool.name} to edit this file.`,
      }
    }

    const readTimestamp = readFileTimestamps[fullFilePath]
    if (!readTimestamp) {
      return {
        result: false,
        message:
          'File has not been read yet. Read it first before writing to it.',
        meta: {
          isFilePathAbsolute: String(isAbsolute(file_path)),
        },
      }
    }

    // Check if file exists and get its last modified time
    const stats = statSync(fullFilePath)
    const lastWriteTime = stats.mtimeMs
    if (lastWriteTime > readTimestamp) {
      return {
        result: false,
        message:
          'File has been modified since read, either by the user or by a linter. Read it again before attempting to write it.',
      }
    }

    const enc = detectFileEncoding(fullFilePath)
    const file = readFileSync(fullFilePath, enc)
    if (!file.includes(old_string)) {
      return {
        result: false,
        message: `String to replace not found in file.`,
        meta: {
          isFilePathAbsolute: String(isAbsolute(file_path)),
        },
      }
    }

    const matches = file.split(old_string).length - 1
    if (matches > 1) {
      return {
        result: false,
        message: `Found ${matches} matches of the string to replace. For safety, this tool only supports replacing exactly one occurrence at a time. Add more lines of context to your edit and try again.`,
        meta: {
          isFilePathAbsolute: String(isAbsolute(file_path)),
        },
      }
    }

    return { result: true }
  },
  async *call({ file_path, old_string, new_string }, { readFileTimestamps }) {
    const { patch, updatedFile } = applyEdit(file_path, old_string, new_string)

    const fullFilePath = isAbsolute(file_path)
      ? file_path
      : resolve(getCwd(), file_path)
    const dir = dirname(fullFilePath)
    mkdirSync(dir, { recursive: true })
    const enc = existsSync(fullFilePath)
      ? detectFileEncoding(fullFilePath)
      : 'utf8'
    const endings = existsSync(fullFilePath)
      ? detectLineEndings(fullFilePath)
      : 'LF'
    const originalFile = existsSync(fullFilePath)
      ? readFileSync(fullFilePath, enc)
      : ''
    writeTextContent(fullFilePath, updatedFile, enc, endings)

    // Record Agent edit operation for file freshness tracking
    recordFileEdit(fullFilePath, updatedFile)

    // Update read timestamp, to invalidate stale writes
    readFileTimestamps[fullFilePath] = statSync(fullFilePath).mtimeMs

    // Log when editing CLAUDE.md
    if (fullFilePath.endsWith(`${sep}${PROJECT_FILE}`)) {
    }

    // Emit file edited event for system reminders
    emitReminderEvent('file:edited', {
      filePath: fullFilePath,
      oldString: old_string,
      newString: new_string,
      timestamp: Date.now(),
      operation:
        old_string === '' ? 'create' : new_string === '' ? 'delete' : 'update',
    })

    const data = {
      filePath: file_path,
      oldString: old_string,
      newString: new_string,
      originalFile,
      structuredPatch: patch,
    }
    yield {
      type: 'result',
      data,
      resultForAssistant: this.renderResultForAssistant(data),
    }
  },
  renderResultForAssistant({ filePath, originalFile, oldString, newString }) {
    const { snippet, startLine } = getSnippet(
      originalFile || '',
      oldString,
      newString,
    )
    return `The file ${filePath} has been updated. Here's the result of running \`cat -n\` on a snippet of the edited file:
${addLineNumbers({
  content: snippet,
  startLine,
})}`
  },
} satisfies Tool<
  typeof inputSchema,
  {
    filePath: string
    oldString: string
    newString: string
    originalFile: string
    structuredPatch: Hunk[]
  }
>

export function getSnippet(
  initialText: string,
  oldStr: string,
  newStr: string,
): { snippet: string; startLine: number } {
  const before = initialText.split(oldStr)[0] ?? ''
  const replacementLine = before.split(/\r?\n/).length - 1
  const newFileLines = initialText.replace(oldStr, newStr).split(/\r?\n/)
  // Calculate the start and end line numbers for the snippet
  const startLine = Math.max(0, replacementLine - N_LINES_SNIPPET)
  const endLine =
    replacementLine + N_LINES_SNIPPET + newStr.split(/\r?\n/).length
  // Get snippet
  const snippetLines = newFileLines.slice(startLine, endLine + 1)
  const snippet = snippetLines.join('\n')
  return { snippet, startLine: startLine + 1 }
}
