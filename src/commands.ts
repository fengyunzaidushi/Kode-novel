// 导入React库，用于JSX命令组件
import React from 'react'
// 导入各个具体的命令模块
import bug from './commands/bug'              // Bug反馈命令
import clear from './commands/clear'          // 清除对话命令
import compact from './commands/compact'      // 压缩对话命令
import config from './commands/config'        // 配置面板命令
import cost from './commands/cost'            // 成本显示命令
import ctx_viz from './commands/ctx_viz'      // 上下文可视化命令
import doctor from './commands/doctor'        // 健康检查命令
import help from './commands/help'            // 帮助命令
import init from './commands/init'            // 项目初始化命令
import listen from './commands/listen'        // 语音监听命令
import login from './commands/login'          // 登录命令
import logout from './commands/logout'        // 登出命令
import mcp from './commands/mcp'              // MCP服务器状态命令
import * as model from './commands/model'     // 模型配置命令（命名空间导入）
import modelstatus from './commands/modelstatus' // 模型状态命令
import onboarding from './commands/onboarding'   // 用户引导命令
import pr_comments from './commands/pr_comments' // PR评论命令
import refreshCommands from './commands/refreshCommands' // 刷新命令
import releaseNotes from './commands/release-notes'     // 发布说明命令
import review from './commands/review'        // 代码审查命令
import terminalSetup from './commands/terminalSetup'    // 终端设置命令
// 导入工具类型定义和上下文
import { Tool, ToolUseContext } from './Tool'
import resume from './commands/resume'        // 恢复对话命令
import agents from './commands/agents'        // 代理管理命令
// 导入MCP和自定义命令服务
import { getMCPCommands } from './services/mcpClient'
import { loadCustomCommands } from './services/customCommands'
// 导入Anthropic SDK的消息参数类型
import type { MessageParam } from '@anthropic-ai/sdk/resources/index.mjs'
// 导入lodash的记忆化函数，用于缓存计算结果
import { memoize } from 'lodash-es'
// 导入查询消息类型
import type { Message } from './query'
// 导入Anthropic认证状态检查函数
import { isAnthropicAuthEnabled } from './utils/auth'

// 定义提示类型命令的接口 - 这类命令生成AI提示词而不直接执行
type PromptCommand = {
  type: 'prompt'                              // 命令类型标识为提示类型
  progressMessage: string                     // 执行时显示的进度消息
  argNames?: string[]                         // 可选的参数名称数组
  getPromptForCommand(args: string): Promise<MessageParam[]>  // 根据参数生成AI提示词的异步方法
}

// 定义本地命令的接口 - 这类命令在本地直接执行并返回文本结果
type LocalCommand = {
  type: 'local'                              // 命令类型标识为本地类型
  call(                                      // 命令执行方法
    args: string,                            // 命令参数字符串
    context: {                               // 执行上下文对象
      options: {                             // 选项配置
        commands: Command[]                  // 可用命令列表
        tools: Tool[]                        // 可用工具列表
        slowAndCapableModel: string          // 慢速但功能强大的模型名称
      }
      abortController: AbortController       // 用于取消操作的控制器
      setForkConvoWithMessagesOnTheNextRender: (  // 设置下次渲染时分叉对话的函数
        forkConvoWithMessages: Message[],    // 分叉对话的消息列表
      ) => void
    },
  ): Promise<string>                         // 返回Promise包装的字符串结果
}

// 定义本地JSX命令的接口 - 这类命令返回React组件用于UI显示
type LocalJSXCommand = {
  type: 'local-jsx'                          // 命令类型标识为本地JSX类型
  call(                                      // 命令执行方法
    onDone: (result?: string) => void,       // 完成时的回调函数，可选返回结果字符串
    context: ToolUseContext & {              // 执行上下文，继承工具使用上下文并添加额外属性
      setForkConvoWithMessagesOnTheNextRender: (  // 设置下次渲染时分叉对话的函数
        forkConvoWithMessages: Message[],    // 分叉对话的消息列表
      ) => void
    },
  ): Promise<React.ReactNode>                // 返回Promise包装的React组件节点
}

// 导出统一的命令接口类型 - 结合了基础属性和三种命令类型之一
export type Command = {
  description: string                        // 命令描述文本
  isEnabled: boolean                         // 命令是否启用
  isHidden: boolean                          // 命令是否在帮助中隐藏
  name: string                               // 命令内部名称
  aliases?: string[]                         // 可选的命令别名数组
  userFacingName(): string                   // 返回用户界面显示名称的方法
} & (PromptCommand | LocalCommand | LocalJSXCommand)  // 与三种命令类型之一进行联合

// 仅供内部使用的命令列表 - 这些命令不会在常规命令列表中显示
const INTERNAL_ONLY_COMMANDS = [ctx_viz, resume, listen]

// 声明为函数以便在getCommands被调用时才执行，
// 因为底层函数需要读取配置，而配置不能在模块初始化时读取
const COMMANDS = memoize((): Command[] => [  // 使用记忆化缓存命令列表，避免重复创建
  agents,           // 代理管理命令
  clear,            // 清除对话命令
  compact,          // 压缩对话命令
  config,           // 配置面板命令
  cost,             // 成本显示命令
  doctor,           // 健康检查命令
  help,             // 帮助命令
  init,             // 项目初始化命令
  mcp,              // MCP服务器状态命令
  model,            // 模型配置命令
  modelstatus,      // 模型状态命令
  onboarding,       // 用户引导命令
  pr_comments,      // PR评论命令
  refreshCommands,  // 刷新命令命令
  releaseNotes,     // 发布说明命令
  bug,              // Bug反馈命令
  review,           // 代码审查命令
  terminalSetup,    // 终端设置命令
  // 条件性添加认证相关命令 - 只有当Anthropic认证启用时才包含
  ...(isAnthropicAuthEnabled() ? [logout, login()] : []),
  // 添加所有内部专用命令
  ...INTERNAL_ONLY_COMMANDS,
])

// 导出获取所有可用命令的异步函数 - 使用记忆化缓存结果
export const getCommands = memoize(async (): Promise<Command[]> => {
  // 并行加载MCP命令和自定义命令，提高性能
  const [mcpCommands, customCommands] = await Promise.all([
    getMCPCommands(),        // 从MCP客户端获取命令
    loadCustomCommands(),    // 从文件系统加载自定义命令
  ])

  // 合并所有命令类型并过滤出已启用的命令
  return [...mcpCommands, ...customCommands, ...COMMANDS()].filter(
    _ => _.isEnabled,        // 只返回启用状态的命令
  )
})

// 检查是否存在指定名称的命令 - 支持命令名称和别名查找
export function hasCommand(commandName: string, commands: Command[]): boolean {
  return commands.some(    // 使用some方法检查是否有任何命令匹配
    _ => _.userFacingName() === commandName || _.aliases?.includes(commandName),
    // 匹配用户界面名称或别名列表中的任何一个
  )
}

// 根据命令名称获取具体的命令对象 - 如果找不到则抛出错误
export function getCommand(commandName: string, commands: Command[]): Command {
  // 在命令列表中查找匹配的命令
  const command = commands.find(
    _ => _.userFacingName() === commandName || _.aliases?.includes(commandName),
    // 匹配用户界面名称或别名列表中的任何一个
  ) as Command | undefined

  // 如果未找到命令，抛出详细的错误信息
  if (!command) {
    throw ReferenceError(
      `Command ${commandName} not found. Available commands: ${commands
        .map(_ => {           // 构建可用命令列表用于错误消息
          const name = _.userFacingName()
          // 如果有别名，则在名称后显示别名列表
          return _.aliases ? `${name} (aliases: ${_.aliases.join(', ')})` : name
        })
        .join(', ')}`,        // 用逗号分隔所有可用命令
    )
  }

  return command            // 返回找到的命令对象
}
