/**
 * 🎯 Grep 工具提示配置 - 高性能内容搜索工具的 AI 指令
 *
 * 🏗️ 核心功能：
 * - 提供基于正则表达式的快速文件内容搜索
 * - 支持大型代码库的高效搜索操作
 * - 集成文件过滤和结果排序机制
 * - 优化搜索性能和结果呈现
 *
 * 💡 设计特点：
 * - 性能优先：适配任意规模代码库
 * - 灵活过滤：支持文件模式匹配
 * - 智能排序：按修改时间排序结果
 * - 工具协同：与 Agent 工具的分工协作
 */

/** 工具在提示中使用的标准名称 */
export const TOOL_NAME_FOR_PROMPT = 'GrepTool'

/**
 * Grep 工具的功能描述和使用指导
 *
 * 定义了基于正则表达式的文件内容搜索能力，
 * 包括性能特性、语法支持和最佳使用场景。
 *
 * 🔍 核心能力：
 * - 正则表达式：完整的 regex 语法支持
 * - 文件过滤：基于模式的文件类型过滤
 * - 性能优化：适配大型代码库的搜索
 * - 结果排序：按修改时间智能排序
 */
export const DESCRIPTION = `
- Fast content search tool that works with any codebase size
- Searches file contents using regular expressions
- Supports full regex syntax (eg. "log.*Error", "function\\s+\\w+", etc.)
- Filter files by pattern with the include parameter (eg. "*.js", "*.{ts,tsx}")
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files containing specific patterns
- When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the Agent tool instead
`
