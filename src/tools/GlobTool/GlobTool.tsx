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

/**
 * 输入参数模式定义 - Glob 匹配工具的严格类型验证
 *
 * 使用 Zod 库定义 GlobTool 的输入参数结构，确保 Glob 模式匹配
 * 参数的类型安全和有效性验证。
 */
const inputSchema = z.strictObject({
  pattern: z.string().describe('用于匹配文件的 Glob 模式表达式'),  // 必需的 Glob 模式
  path: z
    .string()
    .optional()
    .describe(
      '要搜索的目录路径。默认为当前工作目录。',  // 可选的搜索路径
    ),
})

/**
 * 输出类型定义 - Glob 匹配结果的完整信息结构
 *
 * @property durationMs - 模式匹配执行耗时（毫秒）
 * @property numFiles - 匹配到的文件总数
 * @property filenames - 匹配文件的路径列表
 * @property truncated - 结果是否因数量限制被截断
 */
type Output = {
  durationMs: number      // 匹配耗时统计
  numFiles: number        // 结果文件数量
  filenames: string[]     // 匹配的文件路径数组
  truncated: boolean      // 结果截断状态标志
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
  /**
   * 🎯 核心 Glob 匹配执行方法 - 高效的文件模式匹配引擎
   *
   * 基于标准 Glob 语法实现的文件名匹配搜索，支持通配符模式、
   * 路径匹配和结果限制，适用于快速的文件发现和批量操作。
   *
   * @param {Object} input - 匹配参数
   * @param {string} input.pattern - Glob 匹配模式表达式
   * @param {string} [input.path] - 搜索路径（默认为当前工作目录）
   * @param {Object} context - 执行上下文
   * @param {AbortController} context.abortController - 匹配中断控制器
   * @returns {AsyncGenerator} 异步生成器，产出匹配结果
   *
   * 🔄 Glob 匹配执行流程详解：
   * ┌─────────────────────────────────────────────────────────────┐
   * │                  文件模式匹配执行流程                        │
   * ├─────────────────────────────────────────────────────────────┤
   * │ 1. 参数预处理    │ • 解析 Glob 模式和搜索路径               │
   * │                 │ • 设置匹配限制和偏移参数                  │
   * ├─────────────────────────────────────────────────────────────┤
   * │ 2. 模式匹配      │ • 执行文件系统遍历和模式匹配              │
   * │                 │ • 支持通配符和复杂路径表达式              │
   * │                 │ • 可中断的异步匹配执行                    │
   * ├─────────────────────────────────────────────────────────────┤
   * │ 3. 结果收集      │ • 收集所有匹配的文件路径                  │
   * │                 │ • 检测结果是否超出限制被截断              │
   * ├─────────────────────────────────────────────────────────────┤
   * │ 4. 性能统计      │ • 计算匹配操作的执行耗时                  │
   * │                 │ • 记录匹配文件数量和状态                  │
   * ├─────────────────────────────────────────────────────────────┤
   * │ 5. 结果格式化    │ • 构建标准化的输出结构                    │
   * │                 │ • 生成用户友好的匹配结果                  │
   * │                 │ • 提供截断状态的透明反馈                  │
   * └─────────────────────────────────────────────────────────────┘
   *
   * 🎯 Glob 模式语法支持：
   * • 基础通配符：* 匹配任意字符，? 匹配单个字符
   * • 路径匹配：** 匹配任意深度的目录结构
   * • 字符集：[abc] 匹配指定字符集合
   * • 否定模式：![abc] 排除指定字符集合
   * • 复合模式：{js,ts,tsx} 匹配多种文件扩展名
   *
   * 🚀 性能特性：
   * • 限制结果：默认最多返回100个匹配文件
   * • 中断支持：长时间匹配的用户中断控制
   * • 内存优化：避免大量结果导致内存溢出
   * • 截断提示：超出限制时提供明确的用户反馈
   *
   * 💡 使用示例：
   * - TypeScript文件：pattern = "**/*.{ts,tsx}"
   * - 配置文件：pattern = "**/*config*.json"
   * - 特定目录：pattern = "src/**/*.js"
   * - 排除模式：pattern = "**/*.js" (需结合其他工具)
   */
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
