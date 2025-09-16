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

/**
 * 输入参数模式定义 - 搜索工具的严格类型验证
 *
 * 使用 Zod 库定义 GrepTool 的输入参数结构，确保类型安全和参数验证。
 * 所有参数都有详细的描述和约束条件。
 */
const inputSchema = z.strictObject({
  pattern: z
    .string()
    .describe('要在文件内容中搜索的正则表达式模式'),  // 必需的搜索模式
  path: z
    .string()
    .optional()
    .describe(
      '要搜索的目录路径。默认为当前工作目录。',  // 可选的搜索路径
    ),
  include: z
    .string()
    .optional()
    .describe(
      '要包含在搜索中的文件模式 (例如 "*.js", "*.{ts,tsx}")',  // 可选的文件过滤模式
    ),
})

/** 最大搜索结果数量限制 - 防止过多结果影响性能和显示 */
const MAX_RESULTS = 100

/** 输入类型定义 - 从输入模式推导的类型 */
type Input = typeof inputSchema

/**
 * 输出类型定义 - 搜索结果的完整信息结构
 *
 * @property durationMs - 搜索执行耗时（毫秒）
 * @property numFiles - 找到的文件总数
 * @property filenames - 匹配文件的路径列表
 */
type Output = {
  durationMs: number      // 搜索耗时统计
  numFiles: number        // 结果文件数量
  filenames: string[]     // 匹配的文件路径数组
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
  /**
   * 🔍 核心搜索执行方法 - 高性能文件内容搜索引擎
   *
   * 基于 ripgrep 实现的高性能文件内容搜索，支持正则表达式模式匹配、
   * 文件类型过滤和智能结果排序，适用于大规模代码库的快速搜索。
   *
   * @param {Object} input - 搜索参数
   * @param {string} input.pattern - 正则表达式搜索模式
   * @param {string} [input.path] - 搜索路径（默认为当前工作目录）
   * @param {string} [input.include] - 文件类型过滤模式
   * @param {Object} context - 执行上下文
   * @param {AbortController} context.abortController - 搜索中断控制器
   * @returns {AsyncGenerator} 异步生成器，产出搜索结果
   *
   * 🔄 搜索执行流程详解：
   * ┌─────────────────────────────────────────────────────────────┐
   * │                  高性能搜索执行流程                          │
   * ├─────────────────────────────────────────────────────────────┤
   * │ 1. 参数预处理    │ • 解析搜索路径和文件过滤规则              │
   * │                 │ • 构建 ripgrep 命令行参数                 │
   * ├─────────────────────────────────────────────────────────────┤
   * │ 2. Ripgrep搜索   │ • 调用高性能Rust搜索引擎                  │
   * │                 │ • 支持正则表达式和文件过滤                │
   * │                 │ • 可中断的异步搜索执行                    │
   * ├─────────────────────────────────────────────────────────────┤
   * │ 3. 结果收集      │ • 获取所有匹配文件的路径列表              │
   * │                 │ • 收集文件统计信息和时间戳                │
   * ├─────────────────────────────────────────────────────────────┤
   * │ 4. 智能排序      │ • 按文件修改时间降序排列                  │
   * │                 │ • 文件名作为次要排序条件                  │
   * │                 │ • 测试环境下确定性排序                    │
   * ├─────────────────────────────────────────────────────────────┤
   * │ 5. 结果格式化    │ • 构建标准化的输出结构                    │
   * │                 │ • 计算搜索耗时和性能统计                  │
   * │                 │ • 生成用户友好的结果展示                  │
   * └─────────────────────────────────────────────────────────────┘
   *
   * 🚀 性能特性：
   * • Ripgrep 引擎：利用 Rust 实现的极速搜索性能
   * • 并发处理：支持大量文件的并行搜索
   * • 内存优化：流式处理避免内存溢出
   * • 中断支持：长时间搜索的用户中断控制
   *
   * 🎯 排序策略：
   * • 修改时间优先：最近修改的文件排在前面
   * • 文件名备选：时间相同时按文件名字典序排列
   * • 测试确定性：测试环境下使用文件名排序确保结果一致性
   *
   * 💡 使用示例：
   * - 函数搜索：pattern = "function\\s+\\w+"
   * - 类定义搜索：pattern = "class\\s+\\w+"
   * - 配置搜索：pattern = "config" + include = "*.json"
   */
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
