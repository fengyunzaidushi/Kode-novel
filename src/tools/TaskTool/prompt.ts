/**
 * 🎯 任务工具提示配置 - AI 代理协调和任务分发的核心指令
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
 * 获取任务代理可用工具列表 - 基于安全模式的动态工具过滤
 *
 * 根据安全模式设置，为任务代理提供相应的工具访问权限。
 * 同时排除 TaskTool 自身以避免递归调用。
 *
 * @param safeMode - 是否启用安全模式
 * @returns Promise<Tool[]> - 过滤后的可用工具列表
 *
 * 🔒 安全模式逻辑：
 * - false: 提供所有可用工具（完整功能）
 * - true: 仅提供只读工具（受限环境）
 *
 * 🚫 递归防护：
 * 自动排除 TaskTool 自身，防止代理创建子代理
 * 的无限递归情况。
 */
export async function getTaskTools(safeMode: boolean): Promise<Tool[]> {
  // No recursive tasks, yet..
  return (await (!safeMode ? getTools() : getReadOnlyTools())).filter(
    _ => _.name !== TaskTool.name,
  )
}

/**
 * 生成任务工具的 AI 提示模板 - 动态代理协调的完整指导文档
 *
 * 基于当前活跃代理配置生成完整的任务分发和代理协调指导，
 * 包括代理类型选择、工具访问权限和最佳实践说明。
 *
 * @param safeMode - 安全模式（当前未使用，预留扩展）
 * @returns Promise<string> - 完整的提示模板字符串
 *
 * 🎯 生成内容：
 * - 活跃代理类型和能力描述
 * - 代理选择和使用的决策指导
 * - 并发执行的性能优化建议
 * - 状态隔离和通信机制说明
 *
 * 🔄 动态特性：
 * - 基于实际加载的代理配置
 * - 工具访问权限的动态描述
 * - 实时的代理能力映射
 */
export async function getPrompt(safeMode: boolean): Promise<string> {
  // Extracted directly from original Claude Code obfuscated source
  const agents = await getActiveAgents()

  // Format exactly as in original: (Tools: tool1, tool2)
  const agentDescriptions = agents.map(agent => {
    const toolsStr = Array.isArray(agent.tools)
      ? agent.tools.join(', ')
      : '*'
    return `- ${agent.agentType}: ${agent.whenToUse} (Tools: ${toolsStr})`
  }).join('\n')

  // 100% exact copy from original Claude Code source
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
