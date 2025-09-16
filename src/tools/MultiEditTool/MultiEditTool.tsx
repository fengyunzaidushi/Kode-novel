/**
 * 🎯 多重编辑工具实现 - 单文件批量修改的高效工具
 *
 * 🏗️ 核心功能：
 * - 提供单次操作中的多个编辑点修改能力
 * - 支持原子性操作确保所有编辑同时成功或失败
 * - 集成智能冲突检测和编辑顺序处理
 * - 实现批量替换和精确定位修改
 * - 生成详细的编辑操作结果和差异报告
 *
 * 🔄 依赖关系：
 * - 上游：被 AI 代理调用进行复杂的批量文件编辑
 * - 下游：依赖文件系统、编辑验证、差异生成
 *
 * 📊 使用场景：
 * - 代码重构中的多处同步修改
 * - 变量重命名和批量替换操作
 * - 多行代码片段的组合修改
 * - 配置文件的多项设置批量更新
 *
 * 🔧 技术实现：
 * - 原子操作：所有编辑要么全部成功要么全部回滚
 * - 顺序执行：按编辑列表顺序依次应用修改
 * - 冲突预检：编辑前验证所有目标字符串存在
 * - 状态追踪：记录每个编辑操作的执行结果
 * - 批量模式：支持全文匹配替换和单次替换
 *
 * 💡 设计原则：
 * - 事务性：确保编辑操作的完整性和一致性
 * - 可预测性：严格的编辑顺序和结果可控性
 * - 高效率：避免多次文件读写的性能开销
 * - 安全可靠：完整的验证和回滚机制
 */
import { existsSync, mkdirSync, readFileSync, statSync } from 'fs'
import { Box, Text } from 'ink'
import { dirname, isAbsolute, relative, resolve, sep } from 'path'
import * as React from 'react'
import { z } from 'zod'
import { FileEditToolUpdatedMessage } from '../../components/FileEditToolUpdatedMessage'
import { StructuredDiff } from '../../components/StructuredDiff'
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
import { NotebookEditTool } from '../NotebookEditTool/NotebookEditTool'
// Local content-based edit function for MultiEditTool
function applyContentEdit(
  content: string,
  oldString: string,
  newString: string,
  replaceAll: boolean = false
): { newContent: string; occurrences: number } {
  if (replaceAll) {
    const regex = new RegExp(oldString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
    const matches = content.match(regex)
    const occurrences = matches ? matches.length : 0
    const newContent = content.replace(regex, newString)
    return { newContent, occurrences }
  } else {
    if (content.includes(oldString)) {
      const newContent = content.replace(oldString, newString)
      return { newContent, occurrences: 1 }
    } else {
      throw new Error(`String not found: ${oldString.substring(0, 50)}...`)
    }
  }
}
import { hasWritePermission } from '../../utils/permissions/filesystem'
import { PROJECT_FILE } from '../../constants/product'
import { DESCRIPTION, PROMPT } from './prompt'
import { emitReminderEvent } from '../../services/systemReminder'
import { recordFileEdit } from '../../services/fileFreshness'
import { getPatch } from '../../utils/diff'

const EditSchema = z.object({
  old_string: z.string().describe('The text to replace'),
  new_string: z.string().describe('The text to replace it with'),
  replace_all: z
    .boolean()
    .optional()
    .default(false)
    .describe('Replace all occurences of old_string (default false)'),
})

const inputSchema = z.strictObject({
  file_path: z.string().describe('The absolute path to the file to modify'),
  edits: z
    .array(EditSchema)
    .min(1)
    .describe('Array of edit operations to perform sequentially on the file'),
})

export type In = typeof inputSchema

// Number of lines of context to include before/after the change in our result message
const N_LINES_SNIPPET = 4

export const MultiEditTool = {
  name: 'MultiEdit',
  async description() {
    return 'A tool for making multiple edits to a single file atomically'
  },
  async prompt() {
    return PROMPT
  },
  inputSchema,
  userFacingName() {
    return 'Multi-Edit'
  },
  async isEnabled() {
    return true
  },
  isReadOnly() {
    return false
  },
  isConcurrencySafe() {
    return false // MultiEdit modifies files, not safe for concurrent execution
  },
  needsPermissions(input?: z.infer<typeof inputSchema>) {
    if (!input) return true
    return !hasWritePermission(input.file_path)
  },
  renderResultForAssistant(content) {
    return content
  },
  renderToolUseMessage(input, { verbose }) {
    const { file_path, edits } = input
    const workingDir = getCwd()
    const relativePath = isAbsolute(file_path)
      ? relative(workingDir, file_path)
      : file_path

    if (verbose) {
      const editSummary = edits
        .map(
          (edit, index) =>
            `${index + 1}. Replace "${edit.old_string.substring(0, 50)}${edit.old_string.length > 50 ? '...' : ''}" with "${edit.new_string.substring(0, 50)}${edit.new_string.length > 50 ? '...' : ''}"`,
        )
        .join('\n')
      return `Multiple edits to ${relativePath}:\n${editSummary}`
    }

    return `Making ${edits.length} edits to ${relativePath}`
  },
  renderToolUseRejectedMessage() {
    return (
      <Box>
        <Text color={getTheme().error}>⚠ Edit request rejected</Text>
      </Box>
    )
  },
  renderToolResultMessage(output) {
    if (typeof output === 'string') {
      const isError = output.includes('Error:')
      return (
        <Box flexDirection="column">
          <Text color={isError ? getTheme().error : getTheme().success}>
            {output}
          </Text>
        </Box>
      )
    }

    return (
      <FileEditToolUpdatedMessage
        filePath={output.filePath}
        structuredPatch={output.structuredPatch}
        verbose={false}
      />
    )
  },
  async validateInput(
    { file_path, edits }: z.infer<typeof inputSchema>,
    context?: { readFileTimestamps?: Record<string, number> },
  ): Promise<ValidationResult> {
    const workingDir = getCwd()
    const normalizedPath = isAbsolute(file_path)
      ? resolve(file_path)
      : resolve(workingDir, file_path)

    // Check if it's a notebook file
    if (normalizedPath.endsWith('.ipynb')) {
      return {
        result: false,
        errorCode: 1,
        message: `For Jupyter notebooks (.ipynb files), use the ${NotebookEditTool.name} tool instead.`,
      }
    }

    // For new files, check parent directory exists
    if (!existsSync(normalizedPath)) {
      const parentDir = dirname(normalizedPath)
      if (!existsSync(parentDir)) {
        return {
          result: false,
          errorCode: 2,
          message: `Parent directory does not exist: ${parentDir}`,
        }
      }

      // For new files, ensure first edit creates the file (empty old_string)
      if (edits.length === 0 || edits[0].old_string !== '') {
        return {
          result: false,
          errorCode: 6,
          message:
            'For new files, the first edit must have an empty old_string to create the file content.',
        }
      }
    } else {
      // For existing files, apply file protection mechanisms
      const readFileTimestamps = context?.readFileTimestamps || {}
      const readTimestamp = readFileTimestamps[normalizedPath]

      if (!readTimestamp) {
        return {
          result: false,
          errorCode: 7,
          message:
            'File has not been read yet. Read it first before editing it.',
          meta: {
            filePath: normalizedPath,
            isFilePathAbsolute: String(isAbsolute(file_path)),
          },
        }
      }

      // Check if file has been modified since last read
      const stats = statSync(normalizedPath)
      const lastWriteTime = stats.mtimeMs
      if (lastWriteTime > readTimestamp) {
        return {
          result: false,
          errorCode: 8,
          message:
            'File has been modified since read, either by the user or by a linter. Read it again before attempting to edit it.',
          meta: {
            filePath: normalizedPath,
            lastWriteTime,
            readTimestamp,
          },
        }
      }

      // Pre-validate that all old_strings exist in the file
      const encoding = detectFileEncoding(normalizedPath)
      if (encoding === 'binary') {
        return {
          result: false,
          errorCode: 9,
          message: 'Cannot edit binary files.',
        }
      }

      const currentContent = readFileSync(normalizedPath, 'utf-8')
      for (let i = 0; i < edits.length; i++) {
        const edit = edits[i]
        if (
          edit.old_string !== '' &&
          !currentContent.includes(edit.old_string)
        ) {
          return {
            result: false,
            errorCode: 10,
            message: `Edit ${i + 1}: String to replace not found in file: "${edit.old_string.substring(0, 100)}${edit.old_string.length > 100 ? '...' : ''}"`,
            meta: {
              editIndex: i + 1,
              oldString: edit.old_string.substring(0, 200),
            },
          }
        }
      }
    }

    // Validate each edit
    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i]
      if (edit.old_string === edit.new_string) {
        return {
          result: false,
          errorCode: 3,
          message: `Edit ${i + 1}: old_string and new_string cannot be the same`,
        }
      }
    }

    return { result: true }
  },
  async *call({ file_path, edits }, { readFileTimestamps }) {
    const startTime = Date.now()
    const workingDir = getCwd()
    const filePath = isAbsolute(file_path)
      ? resolve(file_path)
      : resolve(workingDir, file_path)

    try {
      // Read current file content (or empty for new files)
      let currentContent = ''
      let fileExists = existsSync(filePath)

      if (fileExists) {
        const encoding = detectFileEncoding(filePath)
        if (encoding === 'binary') {
          yield {
            type: 'result',
            data: 'Error: Cannot edit binary files',
            resultForAssistant: 'Error: Cannot edit binary files',
          }
          return
        }
        currentContent = readFileSync(filePath, 'utf-8')
      } else {
        // For new files, ensure parent directory exists
        const parentDir = dirname(filePath)
        if (!existsSync(parentDir)) {
          mkdirSync(parentDir, { recursive: true })
        }
      }

      // Apply all edits sequentially
      let modifiedContent = currentContent
      const appliedEdits = []

      for (let i = 0; i < edits.length; i++) {
        const edit = edits[i]
        const { old_string, new_string, replace_all } = edit

        try {
          const result = applyContentEdit(
            modifiedContent,
            old_string,
            new_string,
            replace_all,
          )
          modifiedContent = result.newContent
          appliedEdits.push({
            editIndex: i + 1,
            success: true,
            old_string: old_string.substring(0, 100),
            new_string: new_string.substring(0, 100),
            occurrences: result.occurrences,
          })
        } catch (error) {
          // If any edit fails, abort the entire operation
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error'
          yield {
            type: 'result',
            data: `Error in edit ${i + 1}: ${errorMessage}`,
            resultForAssistant: `Error in edit ${i + 1}: ${errorMessage}`,
          }
          return
        }
      }

      // Write the modified content
      const lineEndings = fileExists ? detectLineEndings(currentContent) : 'LF'
      const encoding = fileExists ? detectFileEncoding(filePath) : 'utf8'
      writeTextContent(filePath, modifiedContent, encoding, lineEndings)

      // Record Agent edit operation for file freshness tracking
      recordFileEdit(filePath, modifiedContent)

      // Update readFileTimestamps to prevent stale file warnings
      readFileTimestamps[filePath] = Date.now()

      // Emit file edited event for system reminders
      emitReminderEvent('file:edited', {
        filePath,
        edits: edits.map(e => ({
          oldString: e.old_string,
          newString: e.new_string,
        })),
        originalContent: currentContent,
        newContent: modifiedContent,
        timestamp: Date.now(),
        operation: fileExists ? 'update' : 'create',
      })

      // Generate result data
      const relativePath = relative(workingDir, filePath)
      const summary = `Successfully applied ${edits.length} edits to ${relativePath}`

      const structuredPatch = getPatch({
        filePath: file_path,
        fileContents: currentContent,
        oldStr: currentContent,
        newStr: modifiedContent,
      })

      const resultData = {
        filePath: file_path,
        wasNewFile: !fileExists,
        editsApplied: appliedEdits,
        totalEdits: edits.length,
        summary,
        structuredPatch,
      }

      // Log the operation
      

      yield {
        type: 'result',
        data: resultData,
        resultForAssistant: summary,
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred'
      const errorResult = `Error applying multi-edit: ${errorMessage}`

      logError(error)

      yield {
        type: 'result',
        data: errorResult,
        resultForAssistant: errorResult,
      }
    }
  },
} satisfies Tool<typeof inputSchema, any>
