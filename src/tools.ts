/**
 * 工具系统核心注册表 - Kode工具生态系统的中央管理文件
 *
 * 这个文件负责：
 * 1. 导入和注册所有可用的工具实现
 * 2. 根据用户权限和配置过滤工具
 * 3. 与MCP（Model Context Protocol）工具集成
 * 4. 提供工具的动态加载和缓存机制
 */
import { Tool } from './Tool'
// 任务协调工具 - 用于代理系统和多步骤任务编排
import { TaskTool } from './tools/TaskTool/TaskTool'
// 架构师工具 - 用于代码架构设计和重构建议（需要特殊权限）
import { ArchitectTool } from './tools/ArchitectTool/ArchitectTool'
// Bash工具 - 执行命令行操作
import { BashTool } from './tools/BashTool/BashTool'
// 专家模型咨询工具 - 调用专门的AI模型获取特定领域建议
import { AskExpertModelTool } from './tools/AskExpertModelTool/AskExpertModelTool'
// 文件操作工具组
import { FileEditTool } from './tools/FileEditTool/FileEditTool'      // 文件编辑
import { FileReadTool } from './tools/FileReadTool/FileReadTool'      // 文件读取
import { FileWriteTool } from './tools/FileWriteTool/FileWriteTool'   // 文件写入
import { MultiEditTool } from './tools/MultiEditTool/MultiEditTool'   // 批量文件编辑
// 代码搜索和导航工具组
import { GlobTool } from './tools/GlobTool/GlobTool'          // 文件路径模式匹配
import { GrepTool } from './tools/GrepTool/GrepTool'          // 文件内容搜索
import { LSTool } from './tools/lsTool/lsTool'               // 目录列表
// Jupyter Notebook工具组
import { NotebookEditTool } from './tools/NotebookEditTool/NotebookEditTool'  // 笔记本编辑
import { NotebookReadTool } from './tools/NotebookReadTool/NotebookReadTool'  // 笔记本读取
// 内存和状态管理工具组（仅限内部用户）
import { MemoryReadTool } from './tools/MemoryReadTool/MemoryReadTool'    // 内存读取
import { MemoryWriteTool } from './tools/MemoryWriteTool/MemoryWriteTool' // 内存写入
// 认知和任务管理工具
import { ThinkTool } from './tools/ThinkTool/ThinkTool'           // 思考工具
import { TodoWriteTool } from './tools/TodoWriteTool/TodoWriteTool' // 任务列表管理
// 网络和内容获取工具
import { WebSearchTool } from './tools/WebSearchTool/WebSearchTool'     // 网络搜索
import { URLFetcherTool } from './tools/URLFetcherTool/URLFetcherTool'  // URL内容获取
// MCP（Model Context Protocol）工具集成
import { getMCPTools } from './services/mcpClient'
// 缓存工具，避免重复初始化
import { memoize } from 'lodash-es'

/**
 * 内部用户专用工具列表
 * 这些工具仅对Anthropic内部员工可用，包含更强大的内存管理功能
 */
const ANT_ONLY_TOOLS = [MemoryReadTool as unknown as Tool, MemoryWriteTool as unknown as Tool]

/**
 * 获取所有可用工具的函数
 * 注意：使用函数而不是常量来避免循环依赖问题，这对Bun打包工具很重要
 *
 * @returns Tool[] - 所有工具的数组，按照功能分组排列
 */
export const getAllTools = (): Tool[] => {
  return [
    // 核心协调工具 - 最重要，排在最前面
    TaskTool as unknown as Tool,
    AskExpertModelTool as unknown as Tool,

    // 系统操作工具
    BashTool as unknown as Tool,

    // 文件系统工具组 - 按使用频率排序
    GlobTool as unknown as Tool,     // 文件查找
    GrepTool as unknown as Tool,     // 内容搜索
    LSTool as unknown as Tool,       // 目录浏览
    FileReadTool as unknown as Tool, // 文件读取
    FileEditTool as unknown as Tool, // 单文件编辑
    MultiEditTool as unknown as Tool,// 批量编辑
    FileWriteTool as unknown as Tool,// 文件写入

    // 特殊格式文件支持
    NotebookReadTool as unknown as Tool, // Jupyter笔记本读取
    NotebookEditTool as unknown as Tool, // Jupyter笔记本编辑

    // 认知和管理工具
    ThinkTool as unknown as Tool,        // AI思考过程
    TodoWriteTool as unknown as Tool,    // 任务管理

    // 网络功能工具
    WebSearchTool as unknown as Tool,    // 网络搜索
    URLFetcherTool as unknown as Tool,   // 网页抓取

    // 内部用户专用工具
    ...ANT_ONLY_TOOLS,
  ]
}

/**
 * 获取当前可用的工具列表（带缓存优化）
 * 这个函数会根据配置和权限动态决定哪些工具可用
 *
 * @param enableArchitect - 是否启用架构师工具（需要特殊配置）
 * @returns Promise<Tool[]> - 经过权限过滤的可用工具列表
 */
export const getTools = memoize(
  async (enableArchitect?: boolean): Promise<Tool[]> => {
    // 合并内置工具和MCP扩展工具
    const tools = [...getAllTools(), ...(await getMCPTools())]

    // 架构师工具需要显式启用（通过配置文件或CLI参数）
    if (enableArchitect) {
      tools.push(ArchitectTool as unknown as Tool)
    }

    // 异步检查每个工具的可用性（考虑系统依赖、权限等）
    const isEnabled = await Promise.all(tools.map(tool => tool.isEnabled()))
    // 只返回启用的工具
    return tools.filter((_, i) => isEnabled[i])
  },
)

/**
 * 获取只读工具列表（带缓存优化）
 * 只读工具是指不会修改系统状态的工具，在某些受限环境下使用
 *
 * @returns Promise<Tool[]> - 只读且可用的工具列表
 */
export const getReadOnlyTools = memoize(async (): Promise<Tool[]> => {
  // 首先过滤出只读工具
  const tools = getAllTools().filter(tool => tool.isReadOnly())
  // 然后检查可用性
  const isEnabled = await Promise.all(tools.map(tool => tool.isEnabled()))
  return tools.filter((_, index) => isEnabled[index])
})
