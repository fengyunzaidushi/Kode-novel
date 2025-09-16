/**
 * 🎯 Glob 工具提示配置 - 高效文件模式匹配工具的 AI 指令
 *
 * 🏗️ 核心功能：
 * - 提供基于 Glob 模式的快速文件名匹配搜索
 * - 支持复杂通配符表达式的文件发现
 * - 集成智能结果排序和数量限制
 * - 优化大型代码库的文件查找性能
 *
 * 🔄 依赖关系：
 * - 上游：被 GlobTool 使用作为功能描述指导
 * - 下游：与其他搜索工具的协同工作策略
 *
 * 📊 使用场景：
 * - 特定类型文件的批量发现
 * - 项目结构的快速探索
 * - 文件名模式的精确匹配
 * - 代码库文件的组织分析
 *
 * 💡 设计理念：
 * - 模式灵活：支持标准 Glob 语法的完整实现
 * - 性能优先：适配任意规模代码库的文件匹配
 * - 结果精准：准确的文件名和路径模式匹配
 * - 工具协同：与 Grep 和 Agent 工具的分工合作
 */

/** 工具在提示中使用的标准名称 */
export const TOOL_NAME_FOR_PROMPT = 'GlobTool'

/**
 * Glob 工具的功能描述和使用指导
 *
 * 定义了基于 Glob 模式的文件匹配能力，包括语法支持、
 * 性能特性和与其他搜索工具的协作关系。
 *
 * 🎯 核心特性：
 * - 通配符语法：支持 *, ?, **, [] 等标准 Glob 模式
 * - 路径匹配：递归目录搜索和复杂路径表达式
 * - 智能排序：按文件修改时间排序搜索结果
 * - 性能优化：适配大型代码库的高效文件发现
 * - 工具集成：与 Agent 工具的开放式搜索协作
 *
 * 📋 使用建议：
 * • 单一模式匹配：直接使用 GlobTool 进行精确匹配
 * • 复杂搜索流程：使用 Agent 工具协调多轮 Glob 和 Grep 搜索
 * • 文件类型发现：利用扩展名模式快速定位特定类型文件
 * • 目录结构探索：使用递归模式了解项目组织结构
 */
export const DESCRIPTION = `- Fast file pattern matching tool that works with any codebase size
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
- When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the Agent tool instead
`
