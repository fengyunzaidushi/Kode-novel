/**
 * 🎯 Glob 匹配工具实现 - 快速文件模式匹配的核心工具
 *
 * 🏗️ 核心功能：
 * - 提供高效的文件名模式匹配搜索
 * - 支持标准 Glob 语法的完整实现
 * - 集成智能文件发现和路径解析
 * - 实现按修改时间的结果排序
 * - 生成详细的搜索性能统计
 *
 * 🔄 依赖关系：
 * - 上游：被 AI 代理调用进行文件名匹配搜索
 * - 下游：依赖文件系统遍历、权限验证系统
 *
 * 📊 使用场景：
 * - 特定文件类型的批量发现
 * - 文件名模式的快速匹配查找
 * - 项目结构的探索和分析
 * - 代码库文件的组织和分类
 *
 * 🔧 技术实现：
 * - 模式匹配：支持通配符和复杂路径模式
 * - 性能优化：限制结果数量防止内存溢出
 * - 智能排序：按文件修改时间排序结果
 * - 路径处理：自动处理绝对路径和相对路径
 * - 权限集成：确保搜索路径的访问权限
 *
 * 💡 设计原则：
 * - 快速响应：适配大型代码库的文件发现
 * - 模式灵活：支持复杂的 Glob 匹配表达式
 * - 结果精准：准确的文件名和路径匹配
 * - 用户友好：清晰的匹配结果展示
 */
import { Box, Text } from 'ink'
import React from 'react'
import { z } from 'zod'
import { Cost } from '../../components/Cost'
import { FallbackToolUseRejectedMessage } from '../../components/FallbackToolUseRejectedMessage'
import { Tool } from '../../Tool'
import { getCwd } from '../../utils/state'
import { glob } from '../../utils/file'
import { DESCRIPTION, TOOL_NAME_FOR_PROMPT } from './prompt'
import { isAbsolute, relative, resolve } from 'path'
import { hasReadPermission } from '../../utils/permissions/filesystem'

const inputSchema = z.strictObject({
  pattern: z.string().describe('The glob pattern to match files against'),
  path: z
    .string()
    .optional()
    .describe(
      'The directory to search in. Defaults to the current working directory.',
    ),
})

type Output = {
  durationMs: number
  numFiles: number
  filenames: string[]
  truncated: boolean
}

export const GlobTool = {
  name: TOOL_NAME_FOR_PROMPT,
  async description() {
    return DESCRIPTION
  },
  userFacingName() {
    return 'Search'
  },
  inputSchema,
  async isEnabled() {
    return true
  },
  isReadOnly() {
    return true
  },
  isConcurrencySafe() {
    return true // GlobTool is read-only, safe for concurrent execution
  },
  needsPermissions({ path }) {
    return !hasReadPermission(path || getCwd())
  },
  async prompt() {
    return DESCRIPTION
  },
  renderToolUseMessage({ pattern, path }, { verbose }) {
    const absolutePath = path
      ? isAbsolute(path)
        ? path
        : resolve(getCwd(), path)
      : undefined
    const relativePath = absolutePath
      ? relative(getCwd(), absolutePath)
      : undefined
    return `pattern: "${pattern}"${relativePath || verbose ? `, path: "${verbose ? absolutePath : relativePath}"` : ''}`
  },
  renderToolUseRejectedMessage() {
    return <FallbackToolUseRejectedMessage />
  },
  renderToolResultMessage(output) {
    // Handle string content for backward compatibility
    if (typeof output === 'string') {
      output = JSON.parse(output) as Output
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
  async *call({ pattern, path }, { abortController }) {
    const start = Date.now()
    const { files, truncated } = await glob(
      pattern,
      path ?? getCwd(),
      { limit: 100, offset: 0 },
      abortController.signal,
    )
    const output: Output = {
      filenames: files,
      durationMs: Date.now() - start,
      numFiles: files.length,
      truncated,
    }
    yield {
      type: 'result',
      resultForAssistant: this.renderResultForAssistant(output),
      data: output,
    }
  },
  renderResultForAssistant(output) {
    let result = output.filenames.join('\n')
    if (output.filenames.length === 0) {
      result = 'No files found'
    }
    // Only add truncation message if results were actually truncated
    else if (output.truncated) {
      result +=
        '\n(Results are truncated. Consider using a more specific path or pattern.)'
    }
    return result
  },
} satisfies Tool<typeof inputSchema, Output>
