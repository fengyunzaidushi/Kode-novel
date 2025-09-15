// 导入命令接口定义
import { Command } from '../commands'
// 导入上下文获取函数，用于管理代码库上下文缓存
import { getContext } from '../context'
// 导入消息管理函数，用于获取和设置对话消息历史
import { getMessagesGetter, getMessagesSetter } from '../messages'
// 导入Claude服务相关函数，用于调用AI模型和处理错误
import { API_ERROR_MESSAGE_PREFIX, queryLLM } from '../services/claude'
// 导入消息工具函数，用于创建用户消息和规范化API消息格式
import {
  createUserMessage,
  normalizeMessagesForAPI,
} from '../utils/messages.js'
// 导入代码样式获取函数，用于管理代码格式化缓存
import { getCodeStyle } from '../utils/style'
// 导入终端清屏工具函数
import { clearTerminal } from '../utils/terminal'
// 导入系统提醒会话重置函数，用于清理提醒状态
import { resetReminderSession } from '../services/systemReminder'
// 导入文件新鲜度会话重置函数，用于清理文件状态跟踪
import { resetFileFreshnessSession } from '../services/fileFreshness'

// 定义对话压缩的提示词模板，用于生成结构化的对话摘要
// 这个提示词指导AI如何将长对话压缩成8个关键部分，保留所有重要信息
const COMPRESSION_PROMPT = `Please provide a comprehensive summary of our conversation structured as follows:

## Technical Context
Development environment, tools, frameworks, and configurations in use. Programming languages, libraries, and technical constraints. File structure, directory organization, and project architecture.

## Project Overview
Main project goals, features, and scope. Key components, modules, and their relationships. Data models, APIs, and integration patterns.

## Code Changes
Files created, modified, or analyzed during our conversation. Specific code implementations, functions, and algorithms added. Configuration changes and structural modifications.

## Debugging & Issues
Problems encountered and their root causes. Solutions implemented and their effectiveness. Error messages, logs, and diagnostic information.

## Current Status
What we just completed successfully. Current state of the codebase and any ongoing work. Test results, validation steps, and verification performed.

## Pending Tasks
Immediate next steps and priorities. Planned features, improvements, and refactoring. Known issues, technical debt, and areas needing attention.

## User Preferences
Coding style, formatting, and organizational preferences. Communication patterns and feedback style. Tool choices and workflow preferences.

## Key Decisions
Important technical decisions made and their rationale. Alternative approaches considered and why they were rejected. Trade-offs accepted and their implications.

Focus on information essential for continuing the conversation effectively, including specific details about code, files, errors, and plans.`

// 定义compact命令对象，用于压缩对话历史但保留摘要信息
const compact = {
  type: 'local',  // 命令类型为本地命令，不需要网络请求
  name: 'compact',  // 命令名称
  description: 'Clear conversation history but keep a summary in context',  // 命令描述：清除对话历史但保留摘要
  isEnabled: true,  // 命令是否启用
  isHidden: false,  // 命令是否在帮助中隐藏
  async call(  // 异步调用函数，执行compact命令的核心逻辑
    _,  // 第一个参数未使用，用下划线表示忽略
    {
      options: { tools },  // 从选项中获取可用工具列表
      abortController,  // 用于取消操作的控制器
      setForkConvoWithMessagesOnTheNextRender,  // 用于设置新对话消息的函数
    },
  ) {
    // 获取当前对话的所有消息历史
    const messages = getMessagesGetter()()

    // 创建包含压缩提示词的用户消息
    const summaryRequest = createUserMessage(COMPRESSION_PROMPT)

    // 调用AI模型生成对话摘要
    const summaryResponse = await queryLLM(
      normalizeMessagesForAPI([...messages, summaryRequest]),  // 将消息规范化为API格式
      [
        'You are a helpful AI assistant tasked with creating comprehensive conversation summaries that preserve all essential context for continuing development work.',  // 系统提示词
      ],
      0,  // 温度参数，0表示确定性输出
      tools,  // 可用工具列表
      abortController.signal,  // 取消信号
      {
        safeMode: false,  // 不使用安全模式
        model: 'main',  // 使用模型指针，让queryLLM统一解析
        prependCLISysprompt: true,  // 添加CLI系统提示
      },
    )

    // 从AI响应中提取文本内容
    const content = summaryResponse.message.content
    const summary =
      typeof content === 'string'  // 如果内容是字符串类型
        ? content  // 直接使用
        : content.length > 0 && content[0]?.type === 'text'  // 如果是数组且第一项是文本类型
          ? content[0].text  // 提取文本内容
          : null  // 否则返回null

    // 检查摘要生成是否成功
    if (!summary) {
      throw new Error(
        `Failed to generate conversation summary - response did not contain valid text content - ${summaryResponse}`,
      )
    } else if (summary.startsWith(API_ERROR_MESSAGE_PREFIX)) {  // 检查是否包含API错误前缀
      throw new Error(summary)
    }

    // 重置使用情况统计，只保留输出token数
    summaryResponse.message.usage = {
      input_tokens: 0,  // 输入token清零
      output_tokens: summaryResponse.message.usage.output_tokens,  // 保留输出token数
      cache_creation_input_tokens: 0,  // 缓存创建token清零
      cache_read_input_tokens: 0,  // 缓存读取token清零
    }

    // 清理终端显示
    await clearTerminal()
    // 清空消息历史
    getMessagesSetter()([])
    // 设置新的对话，包含压缩说明和摘要
    setForkConvoWithMessagesOnTheNextRender([
      createUserMessage(
        `Context has been compressed using structured 8-section algorithm. All essential information has been preserved for seamless continuation.`,
      ),
      summaryResponse,  // AI生成的摘要响应
    ])
    // 清理各种缓存
    getContext.cache.clear?.()  // 清理上下文缓存
    getCodeStyle.cache.clear?.()  // 清理代码样式缓存
    resetFileFreshnessSession()  // 重置文件新鲜度会话

    // 重置提醒和文件新鲜度会话以清理状态
    resetReminderSession()

    return ''  // 返回空字符串，仅用于类型安全。TODO: 避免这个hack
  },
  userFacingName() {  // 返回用户界面显示的命令名称
    return 'compact'
  },
} satisfies Command  // 确保对象符合Command接口

// 导出compact命令作为默认导出，供其他模块使用
export default compact
