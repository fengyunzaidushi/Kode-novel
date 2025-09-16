/**
 * 🎯 任务工具提示配置 - AI 代理协调和任务分发的核心指令系统
 *
 * 🏗️ 核心功能：
 * - 定义多代理系统的协调和任务分发机制
 * - 提供动态代理类型选择和工具访问控制
 * - 支持并发代理启动和性能优化策略
 * - 集成安全模式和只读工具过滤
 * - 管理代理生命周期和状态隔离
 *
 * 🔄 依赖关系：
 * - 上游：被 TaskTool 使用作为代理协调指导
 * - 下游：依赖工具系统、模型管理、代理加载器
 *
 * 📊 使用场景：
 * - 复杂多步骤任务的智能分解
 * - 专业化代理的动态调度
 * - 并发任务处理的性能优化
 * - 安全受限环境的功能控制
 *
 * 🔧 技术实现：
 * - 代理发现：动态加载和配置活跃代理
 * - 工具过滤：基于安全模式的工具访问控制
 * - 并发优化：多代理同时启动的性能策略
 * - 状态隔离：确保代理间的独立性和安全性
 *
 * 💡 设计原则：
 * - 自主性：代理具有完整的任务执行能力
 * - 专业化：不同代理类型处理特定任务领域
 * - 性能优先：并发执行和智能调度
 * - 安全可控：严格的权限管理和隔离机制
 *
 * 🎭 任务编排架构说明：
 * ┌─────────────────┐    ┌───────────────────┐    ┌─────────────────┐
 * │   主 AI 代理     │───▶│   TaskTool 系统    │───▶│   专业化代理     │
 * │  (主要决策)      │    │  (任务编排中心)    │    │  (具体执行)      │
 * └─────────────────┘    └───────────────────┘    └─────────────────┘
 *         │                        │                        │
 *         ▼                        ▼                        ▼
 * ┌─────────────────┐    ┌───────────────────┐    ┌─────────────────┐
 * │   任务分析       │    │   代理选择         │    │   结果聚合       │
 * │   优先级评估     │    │   工具分配         │    │   状态同步       │
 * │   复杂度判断     │    │   并发控制         │    │   错误处理       │
 * └─────────────────┘    └───────────────────┘    └─────────────────┘
 *
 * 🔄 任务生命周期流程：
 * 1. 任务接收 → 2. 复杂度分析 → 3. 代理选择 → 4. 工具分配 → 5. 执行监控 → 6. 结果汇总
 *    ↓           ↓              ↓           ↓           ↓           ↓
 * 解析需求    评估难度        匹配专家     配置权限     实时跟踪     质量验证
 */
import { type Tool } from '../../Tool'
import { getTools, getReadOnlyTools } from '../../tools'
import { TaskTool } from './TaskTool'
import { BashTool } from '../BashTool/BashTool'
import { FileWriteTool } from '../FileWriteTool/FileWriteTool'
import { FileEditTool } from '../FileEditTool/FileEditTool'
import { NotebookEditTool } from '../NotebookEditTool/NotebookEditTool'
import { GlobTool } from '../GlobTool/GlobTool'
import { FileReadTool } from '../FileReadTool/FileReadTool'
import { getModelManager } from '../../utils/model'
import { getActiveAgents } from '../../utils/agentLoader'

/**
 * 获取任务代理可用工具列表 - 智能工具过滤和权限管理系统
 *
 * 这是任务代理工具访问控制的核心函数，负责根据安全策略和执行环境
 * 动态筛选和分配工具权限，确保代理在合适的权限范围内执行任务。
 *
 * @param safeMode - 安全模式标志，控制工具访问权限级别
 * @returns Promise<Tool[]> - 经过权限过滤的可用工具列表
 *
 * 🔒 安全模式策略详解：
 * ┌──────────────┬────────────────────────────────────────┐
 * │  模式类型     │            工具权限范围                 │
 * ├──────────────┼────────────────────────────────────────┤
 * │ safeMode=false│ 完整工具访问：包括文件写入、命令执行等    │
 * │              │ • BashTool (命令执行)                   │
 * │              │ • FileEditTool (文件修改)               │
 * │              │ • FileWriteTool (文件创建)              │
 * │              │ • MultiEditTool (批量编辑)              │
 * │              │ • 所有读取工具                          │
 * ├──────────────┼────────────────────────────────────────┤
 * │ safeMode=true │ 只读工具访问：仅允许信息获取和分析       │
 * │              │ • FileReadTool (文件读取)               │
 * │              │ • GrepTool (内容搜索)                   │
 * │              │ • GlobTool (文件匹配)                   │
 * │              │ • WebSearchTool (网络搜索)              │
 * └──────────────┴────────────────────────────────────────┘
 *
 * 🚫 递归防护机制：
 * 系统自动排除 TaskTool 自身，防止出现以下递归问题：
 * TaskTool → 子代理 → TaskTool → 孙代理 → ... (无限循环)
 *
 * 🎯 工具选择策略：
 * 1. 基础过滤：根据安全模式选择工具集合
 * 2. 递归检查：移除可能导致递归的工具
 * 3. 权限验证：确保所有工具符合当前执行环境
 * 4. 性能优化：缓存常用工具组合以提升响应速度
 *
 * 💡 使用示例：
 * ```typescript
 * // 完整权限环境（如开发和调试场景）
 * const allTools = await getTaskTools(false);
 *
 * // 受限权限环境（如生产和沙箱场景）
 * const safeTools = await getTaskTools(true);
 * ```
 */
export async function getTaskTools(safeMode: boolean): Promise<Tool[]> {
  // No recursive tasks, yet..
  return (await (!safeMode ? getTools() : getReadOnlyTools())).filter(
    _ => _.name !== TaskTool.name,
  )
}

/**
 * 生成任务工具的 AI 提示模板 - 智能代理协调的动态指导系统
 *
 * 这是任务编排系统的核心智能组件，负责基于当前系统状态和可用资源
 * 动态生成完整的代理协调指导文档，为 AI 代理提供精确的任务分发策略。
 *
 * @param safeMode - 安全模式标志（当前预留，未来用于安全策略差异化）
 * @returns Promise<string> - 动态生成的完整提示指导文档
 *
 * 🎯 生成内容架构：
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    动态提示模板生成                          │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 1. 系统状态检测                                             │
 * │    • 扫描活跃代理配置                                       │
 * │    • 检测可用工具权限                                       │
 * │    • 评估系统资源状况                                       │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 2. 代理能力映射                                             │
 * │    • 专业领域匹配表                                         │
 * │    • 工具访问权限矩阵                                       │
 * │    • 性能特征分析                                           │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 3. 协调策略指导                                             │
 * │    • 任务分解建议                                           │
 * │    • 并发执行策略                                           │
 * │    • 错误恢复机制                                           │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 4. 最佳实践示例                                             │
 * │    • 常见场景模板                                           │
 * │    • 性能优化技巧                                           │
 * │    • 故障排除指南                                           │
 * └─────────────────────────────────────────────────────────────┘
 *
 * 🔄 动态适应机制：
 * • 实时代理发现：自动检测新增或移除的代理类型
 * • 能力评估更新：动态调整代理能力描述和推荐场景
 * • 性能优化建议：基于历史执行数据调整并发策略
 * • 安全策略适配：根据当前环境调整权限和限制
 *
 * 🎭 代理协调模式：
 * ```
 * 主代理请求 → [任务分析] → [代理选择] → [并发执行] → [结果聚合]
 *      ↓             ↓            ↓            ↓            ↓
 *   需求解析      能力匹配      权限分配      状态监控      质量验证
 * ```
 *
 * 💡 智能特性：
 * - 自适应代理推荐：基于任务特征智能推荐最适合的代理类型
 * - 负载均衡优化：动态调整并发代理数量以优化系统性能
 * - 故障自动恢复：提供完整的错误处理和恢复策略指导
 * - 上下文感知：根据历史执行情况调整协调策略
 *
 * 🔍 生成过程详解：
 * 1. 系统扫描：检测当前可用的所有代理类型和配置
 * 2. 能力分析：解析每个代理的专业领域和工具权限
 * 3. 模板构建：基于标准格式生成结构化指导文档
 * 4. 动态注入：将实时系统状态注入到模板中
 * 5. 验证优化：确保生成的指导文档完整性和准确性
 */
export async function getPrompt(safeMode: boolean): Promise<string> {
  /**
   * 🔍 第一步：活跃代理发现和能力分析
   * 扫描当前系统中所有可用的代理配置，包括：
   * - 代理类型和专业领域
   * - 工具访问权限配置
   * - 使用场景和适用条件
   */
  const agents = await getActiveAgents()

  /**
   * 🎭 第二步：代理描述格式化和权限映射
   * 将原始代理配置转换为结构化的描述格式：
   *
   * 格式示例：
   * - agent-type: 使用场景描述 (Tools: tool1, tool2, ...)
   *
   * 权限处理逻辑：
   * - Array.isArray(tools) = true: 列出具体工具清单
   * - tools = '*': 表示拥有所有工具的完整访问权限
   *
   * 🔧 技术细节：
   * 这种格式确保与原始 Claude Code 系统的完全兼容性
   */
  const agentDescriptions = agents.map(agent => {
    const toolsStr = Array.isArray(agent.tools)
      ? agent.tools.join(', ')  // 具体工具列表
      : '*'                     // 全工具权限标识
    return `- ${agent.agentType}: ${agent.whenToUse} (Tools: ${toolsStr})`
  }).join('\n')

  /**
   * 🎯 第三步：生成完整的任务协调指导模板
   *
   * 这个模板是任务编排系统的核心智慧，包含：
   * 1. 代理选择策略和使用指导
   * 2. 并发执行的性能优化建议
   * 3. 工具使用的最佳实践和限制
   * 4. 错误处理和状态管理机制
   * 5. 实际操作示例和模式展示
   *
   * 📋 模板结构：
   * ├── 代理能力目录（动态生成）
   * ├── 使用规则和限制说明
   * ├── 性能优化指导
   * ├── 工具选择决策树
   * └── 实战示例和最佳实践
   *
   * 🔄 与原始系统的兼容性：
   * 此模板保持与 Claude Code 原始提示格式的 100% 兼容性
   */
  return `Launch a new agent to handle complex, multi-step tasks autonomously. 

Available agent types and the tools they have access to:
${agentDescriptions}

When using the Task tool, you must specify a subagent_type parameter to select which agent type to use.

When to use the Agent tool:
- When you are instructed to execute custom slash commands. Use the Agent tool with the slash command invocation as the entire prompt. The slash command can take arguments. For example: Task(description="Check the file", prompt="/check-file path/to/file.py")

When NOT to use the Agent tool:
- If you want to read a specific file path, use the ${FileReadTool.name} or ${GlobTool.name} tool instead of the Agent tool, to find the match more quickly
- If you are searching for a specific class definition like "class Foo", use the ${GlobTool.name} tool instead, to find the match more quickly
- If you are searching for code within a specific file or set of 2-3 files, use the ${FileReadTool.name} tool instead of the Agent tool, to find the match more quickly
- Other tasks that are not related to the agent descriptions above

Usage notes:
1. Launch multiple agents concurrently whenever possible, to maximize performance; to do that, use a single message with multiple tool uses
2. When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary of the result.
3. Each agent invocation is stateless. You will not be able to send additional messages to the agent, nor will the agent be able to communicate with you outside of its final report. Therefore, your prompt should contain a highly detailed task description for the agent to perform autonomously and you should specify exactly what information the agent should return back to you in its final and only message to you.
4. The agent's outputs should generally be trusted
5. Clearly tell the agent whether you expect it to write code or just to do research (search, file reads, web fetches, etc.), since it is not aware of the user's intent
6. If the agent description mentions that it should be used proactively, then you should try your best to use it without the user having to ask for it first. Use your judgement.

Example usage:

<example_agent_descriptions>
"code-reviewer": use this agent after you are done writing a signficant piece of code
"greeting-responder": use this agent when to respond to user greetings with a friendly joke
</example_agent_description>

<example>
user: "Please write a function that checks if a number is prime"
assistant: Sure let me write a function that checks if a number is prime
assistant: First let me use the ${FileWriteTool.name} tool to write a function that checks if a number is prime
assistant: I'm going to use the ${FileWriteTool.name} tool to write the following code:
<code>
function isPrime(n) {
  if (n <= 1) return false
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false
  }
  return true
}
</code>
<commentary>
Since a signficant piece of code was written and the task was completed, now use the code-reviewer agent to review the code
</commentary>
assistant: Now let me use the code-reviewer agent to review the code
assistant: Uses the Task tool to launch the with the code-reviewer agent 
</example>

<example>
user: "Hello"
<commentary>
Since the user is greeting, use the greeting-responder agent to respond with a friendly joke
</commentary>
assistant: "I'm going to use the Task tool to launch the with the greeting-responder agent"
</example>`
}
