/**
 * 🎯 Todo 写入工具提示配置 - 任务跟踪和进度管理的 AI 指令
 *
 * 🏗️ 核心功能：
 * - 定义智能任务跟踪和进度管理规范
 * - 提供任务状态管理和工作流控制
 * - 支持复杂任务的分解和组织
 * - 集成主动任务创建和完成验证
 *
 * 💡 设计理念：
 * - 主动管理：智能识别需要跟踪的任务
 * - 状态控制：严格的任务状态转换规则
 * - 进度透明：实时的任务状态更新
 * - 质量保证：完整的任务完成验证
 */

/** 工具的基础功能描述 */
export const DESCRIPTION =
  'Creates and manages todo items for task tracking and progress management in the current session.'

/**
 * Todo 工具的完整使用指导和最佳实践
 *
 * 定义了任务跟踪的完整工作流程，包括任务识别、
 * 状态管理、完成验证和质量控制的详细规范。
 *
 * 🎯 核心内容：
 * - 任务识别：何时使用和何时不使用
 * - 状态管理：任务状态的转换规则
 * - 进度跟踪：实时更新和完成验证
 * - 质量控制：严格的完成标准
 */
export const PROMPT = `Use this tool to create and manage todo items for tracking tasks and progress. This tool provides comprehensive todo management:

## When to Use This Tool

Use this tool proactively in these scenarios:

1. **Complex multi-step tasks** - When a task requires 3 or more distinct steps or actions
2. **Non-trivial and complex tasks** - Tasks that require careful planning or multiple operations
3. **User explicitly requests todo list** - When the user directly asks you to use the todo list
4. **User provides multiple tasks** - When users provide a list of things to be done (numbered or comma-separated)
5. **After receiving new instructions** - Immediately capture user requirements as todos
6. **When you start working on a task** - Mark it as in_progress BEFORE beginning work. Ideally you should only have one todo as in_progress at a time
7. **After completing a task** - Mark it as completed and add any new follow-up tasks discovered during implementation

## When NOT to Use This Tool

Skip using this tool when:
1. There is only a single, straightforward task
2. The task is trivial and tracking it provides no organizational benefit
3. The task can be completed in less than 3 trivial steps
4. The task is purely conversational or informational

## Task States and Management

1. **Task States**: Use these states to track progress:
   - pending: Task not yet started
   - in_progress: Currently working on (limit to ONE task at a time)
   - completed: Task finished successfully

2. **Task Management**:
   - Update task status in real-time as you work
   - Mark tasks complete IMMEDIATELY after finishing (don't batch completions)
   - Only have ONE task in_progress at any time
   - Complete current tasks before starting new ones
   - Remove tasks that are no longer relevant from the list entirely

3. **Task Completion Requirements**:
   - ONLY mark a task as completed when you have FULLY accomplished it
   - If you encounter errors, blockers, or cannot finish, keep the task as in_progress
   - When blocked, create a new task describing what needs to be resolved
   - Never mark a task as completed if:
     - Tests are failing
     - Implementation is partial
     - You encountered unresolved errors
     - You couldn't find necessary files or dependencies

4. **Task Breakdown**:
   - Create specific, actionable items
   - Break complex tasks into smaller, manageable steps
   - Use clear, descriptive task names

## Tool Capabilities

- **Create new todos**: Add tasks with content, priority, and status
- **Update existing todos**: Modify any aspect of a todo (status, priority, content)
- **Delete todos**: Remove completed or irrelevant tasks
- **Batch operations**: Update multiple todos in a single operation
- **Clear all todos**: Reset the entire todo list

When in doubt, use this tool. Being proactive with task management demonstrates attentiveness and ensures you complete all requirements successfully.`
