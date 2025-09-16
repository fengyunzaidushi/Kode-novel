/**
 * 🎯 Grep 搜索工具实现 - 高性能内容搜索的核心工具
 *
 * 🏗️ 核心功能：
 * - 提供基于正则表达式的快速文件内容搜索
 * - 支持大规模代码库的高效搜索操作
 * - 集成文件类型过滤和路径限制功能
 * - 实现智能结果排序和数量限制
 * - 生成详细的搜索统计和性能报告
 *
 * 🔄 依赖关系：
 * - 上游：被 AI 代理调用进行代码库内容搜索
 * - 下游：依赖 ripgrep 搜索引擎、文件系统权限
 *
 * 📊 使用场景：
 * - 代码库中特定模式的快速定位
 * - 函数定义和引用的批量查找
 * - 配置文件中特定设置的搜索
 * - 大型项目的内容分析和统计
 *
 * 🔧 技术实现：
 * - Ripgrep 集成：利用 Rust 高性能搜索引擎
 * - 模式过滤：支持正则表达式和文件模式匹配
 * - 智能排序：按文件修改时间排序结果
 * - 性能监控：记录搜索耗时和结果统计
 * - 权限控制：集成文件读取权限验证
 *
 * 💡 设计原则：
 * - 性能优先：适配任意规模的代码库搜索
 * - 结果精准：精确的正则表达式匹配
 * - 用户友好：清晰的搜索结果展示
 * - 扩展灵活：支持多种过滤和排序选项
 */
import { stat } from 'fs/promises'
import { Box, Text } from 'ink'
import React from 'react'
import { z } from 'zod'
import { Cost } from '../../components/Cost'
import { FallbackToolUseRejectedMessage } from '../../components/FallbackToolUseRejectedMessage'
import { Tool } from '../../Tool'
import { getCwd } from '../../utils/state'
import {
  getAbsolutePath,
  getAbsoluteAndRelativePaths,
} from '../../utils/file.js'
import { ripGrep } from '../../utils/ripgrep'
import { DESCRIPTION, TOOL_NAME_FOR_PROMPT } from './prompt'
import { hasReadPermission } from '../../utils/permissions/filesystem'

const inputSchema = z.strictObject({
  pattern: z
    .string()
    .describe('The regular expression pattern to search for in file contents'),
  path: z
    .string()
    .optional()
    .describe(
      'The directory to search in. Defaults to the current working directory.',
    ),
  include: z
    .string()
    .optional()
    .describe(
      'File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")',
    ),
})

const MAX_RESULTS = 100

type Input = typeof inputSchema
type Output = {
  durationMs: number
  numFiles: number
  filenames: string[]
}

export const GrepTool = {
  name: TOOL_NAME_FOR_PROMPT,
  async description() {
    return DESCRIPTION
  },
  userFacingName() {
    return 'Search'
  },
  inputSchema,
  isReadOnly() {
    return true
  },
  isConcurrencySafe() {
    return true // GrepTool is read-only, safe for concurrent execution
  },
  async isEnabled() {
    return true
  },
  needsPermissions({ path }) {
    return !hasReadPermission(path || getCwd())
  },
  async prompt() {
    return DESCRIPTION
  },
  renderToolUseMessage({ pattern, path, include }, { verbose }) {
    const { absolutePath, relativePath } = getAbsoluteAndRelativePaths(path)
    return `pattern: "${pattern}"${relativePath || verbose ? `, path: "${verbose ? absolutePath : relativePath}"` : ''}${include ? `, include: "${include}"` : ''}`
  },
  renderToolUseRejectedMessage() {
    return <FallbackToolUseRejectedMessage />
  },
  renderToolResultMessage(output) {
    // Handle string content for backward compatibility
    if (typeof output === 'string') {
      // Convert string to Output type using tmpDeserializeOldLogResult if needed
      output = output as unknown as Output
    }

    return (
      <Box justifyContent="space-between" width="100%">
        <Box flexDirection="row">
          <Text>&nbsp;&nbsp;⎿ &nbsp;Found </Text>
          <Text bold>{output.numFiles} </Text>
          <Text>
            {output.numFiles === 0 || output.numFiles > 1 ? 'files' : 'file'}
          </Text>
        </Box>
        <Cost costUSD={0} durationMs={output.durationMs} debug={false} />
      </Box>
    )
  },
  renderResultForAssistant({ numFiles, filenames }) {
    if (numFiles === 0) {
      return 'No files found'
    }
    let result = `Found ${numFiles} file${numFiles === 1 ? '' : 's'}\n${filenames.slice(0, MAX_RESULTS).join('\n')}`
    if (numFiles > MAX_RESULTS) {
      result +=
        '\n(Results are truncated. Consider using a more specific path or pattern.)'
    }
    return result
  },
  async *call({ pattern, path, include }, { abortController }) {
    const start = Date.now()
    const absolutePath = getAbsolutePath(path) || getCwd()

    const args = ['-li', pattern]
    if (include) {
      args.push('--glob', include)
    }

    const results = await ripGrep(args, absolutePath, abortController.signal)

    const stats = await Promise.all(results.map(_ => stat(_)))
    const matches = results
      // Sort by modification time
      .map((_, i) => [_, stats[i]!] as const)
      .sort((a, b) => {
        if (process.env.NODE_ENV === 'test') {
          // In tests, we always want to sort by filename, so that results are deterministic
          return a[0].localeCompare(b[0])
        }
        const timeComparison = (b[1].mtimeMs ?? 0) - (a[1].mtimeMs ?? 0)
        if (timeComparison === 0) {
          // Sort by filename as a tiebreaker
          return a[0].localeCompare(b[0])
        }
        return timeComparison
      })
      .map(_ => _[0])

    const output = {
      filenames: matches,
      durationMs: Date.now() - start,
      numFiles: matches.length,
    }

    yield {
      type: 'result',
      resultForAssistant: this.renderResultForAssistant(output),
      data: output,
    }
  },
} satisfies Tool<Input, Output>
