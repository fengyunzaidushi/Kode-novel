/**
 * 🎯 工具系统核心注册表 - Kode 工具生态系统的中央管理层
 *
 * 🏗️ 核心功能：
 * - 实现所有工具的统一注册和管理机制
 * - 提供基于权限和配置的工具过滤系统
 * - 集成 MCP (Model Context Protocol) 外部工具
 * - 支持工具的动态加载、缓存和可用性检查
 * - 管理内部专用工具的访问控制
 *
 * 🔄 依赖关系：
 * - 上游：被 AI 服务和命令系统使用
 * - 下游：依赖各个工具实现和 MCP 客户端
 *
 * 📊 使用场景：
 * - AI 代理的工具能力获取
 * - 权限受限环境的只读工具提供
 * - 外部 MCP 工具的动态集成
 * - 工具生态的统一管理和扩展
 *
 * 🔧 技术实现：
 * - 注册模式：集中式工具注册和导出
 * - 权限控制：基于用户类型的工具过滤
 * - 缓存优化：memoize 避免重复初始化
 * - 动态加载：支持异步工具能力检查
 * - 扩展支持：MCP 协议的无缝集成
 *
 * 🎯 工具分类：
 * - 核心协调：任务编排和专家咨询
 * - 系统操作：命令行和文件系统访问
 * - 文件管理：读取、编辑、搜索和导航
 * - 认知工具：思考过程和任务管理
 * - 网络功能：搜索和内容获取
 * - 内部专用：内存管理等高级功能
 *
 * 💡 设计原则：
 * - 模块化：每个工具独立实现和注册
 * - 安全性：严格的权限控制和验证
 * - 扩展性：支持 MCP 和插件机制
 * - 性能优化：智能缓存和懒加载
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
 * 内部用户专用工具列表 - Anthropic 内部员工专属的高级工具
 *
 * 这些工具提供更强大的系统功能和内存管理能力，
 * 仅对 Anthropic 内部员工开放使用。
 *
 * 🔒 权限控制：
 * - 基于用户类型的访问限制
 * - 高级内存操作能力
 * - 系统级功能访问
 *
 * 🛠️ 包含工具：
 * - MemoryReadTool: 跨会话内存读取
 * - MemoryWriteTool: 跨会话内存写入
 */
const ANT_ONLY_TOOLS = [MemoryReadTool as unknown as Tool, MemoryWriteTool as unknown as Tool]

/**
 * 获取所有注册工具列表 - 工具注册表的完整导出
 *
 * 返回系统中注册的所有工具实现，按功能重要性和使用频率排序。
 * 使用函数形式而非常量以避免 Bun 打包时的循环依赖问题。
 *
 * @returns Tool[] - 所有工具的数组，按照功能分组排列
 *
 * 🔄 工具排序逻辑：
 * 1. 核心协调工具（TaskTool、AskExpertModelTool）
 * 2. 系统操作工具（BashTool）
 * 3. 文件系统工具组（按使用频率）
 * 4. 特殊格式支持（Jupyter Notebook）
 * 5. 认知和管理工具
 * 6. 网络功能工具
 * 7. 内部专用工具
 *
 * 💡 设计考虑：
 * - 函数形式：避免循环依赖和初始化问题
 * - 类型转换：统一转换为 Tool 接口类型
 * - 分组排列：便于理解和维护
 * - 权限分离：内部工具单独管理
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
 * 获取当前环境可用工具列表 - 动态工具过滤和可用性检查
 *
 * 根据当前环境的配置、权限和系统状态，动态确定哪些工具
 * 可以使用，包括内置工具和外部 MCP 工具的集成。
 *
 * @param enableArchitect - 是否启用架构师工具（需要特殊配置）
 * @returns Promise<Tool[]> - 经过权限过滤和可用性检查的工具列表
 *
 * 🔄 处理流程：
 * 1. 获取所有注册的内置工具
 * 2. 异步加载外部 MCP 工具
 * 3. 根据配置添加特殊工具（如架构师工具）
 * 4. 并行检查所有工具的可用性状态
 * 5. 过滤掉不可用的工具
 *
 * 🎯 工具来源：
 * - 内置工具：getAllTools() 返回的标准工具
 * - MCP 工具：通过 getMCPTools() 动态加载
 * - 特殊工具：需要显式启用的高级工具
 *
 * ⚡ 性能优化：
 * - memoize 缓存：避免重复的工具初始化
 * - 并行检查：同时验证所有工具的可用性
 * - 懒加载：按需加载外部工具
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
 * 获取只读工具列表 - 受限环境的安全工具集
 *
 * 提供不会修改系统状态的只读工具，适用于安全要求较高
 * 或权限受限的环境，如演示模式或只读访问场景。
 *
 * @returns Promise<Tool[]> - 只读且可用的工具列表
 *
 * 🔒 只读工具特性：
 * - 不修改文件系统
 * - 不执行系统命令
 * - 不改变应用状态
 * - 只提供信息查询功能
 *
 * 🎯 典型只读工具：
 * - FileReadTool: 文件内容读取
 * - GlobTool: 文件路径搜索
 * - GrepTool: 文件内容搜索
 * - LSTool: 目录结构浏览
 * - NotebookReadTool: Notebook 内容读取
 *
 * ⚡ 性能优化：
 * - memoize 缓存：避免重复的可用性检查
 * - 预过滤：先按只读属性过滤，再检查可用性
 * - 并行验证：同时检查所有只读工具状态
 *
 * 💡 使用场景：
 * - 演示和教学环境
 * - 代码审查模式
 * - 安全受限的生产环境
 * - 只读权限的用户访问
 */
export const getReadOnlyTools = memoize(async (): Promise<Tool[]> => {
  // 首先过滤出只读工具
  const tools = getAllTools().filter(tool => tool.isReadOnly())
  // 然后检查可用性
  const isEnabled = await Promise.all(tools.map(tool => tool.isEnabled()))
  return tools.filter((_, index) => isEnabled[index])
})
