// 导入命令接口定义
import { Command } from '../commands'
// 导入消息设置器，用于清空消息历史
import { getMessagesSetter } from '../messages'
// 导入上下文获取函数，用于管理代码库上下文缓存
import { getContext } from '../context'
// 导入代码样式获取函数，用于管理代码格式化缓存
import { getCodeStyle } from '../utils/style'
// 导入终端清屏工具函数
import { clearTerminal } from '../utils/terminal'
// 导入状态管理函数，用于获取和设置当前工作目录
import { getOriginalCwd, setCwd } from '../utils/state'
// 导入消息类型定义
import { Message } from '../query'
// 导入系统提醒会话重置函数，用于清理提醒状态
import { resetReminderSession } from '../services/systemReminder'
// 导入文件新鲜度会话重置函数，用于清理文件状态跟踪
import { resetFileFreshnessSession } from '../services/fileFreshness'

// 导出清除对话的异步函数，用于完全重置对话状态
export async function clearConversation(context: {
  setForkConvoWithMessagesOnTheNextRender: (  // 用于设置新对话消息的函数类型定义
    forkConvoWithMessages: Message[],  // 消息数组参数
  ) => void
}) {
  await clearTerminal()  // 清空终端显示
  getMessagesSetter()([])  // 清空消息历史数组
  context.setForkConvoWithMessagesOnTheNextRender([])  // 设置下次渲染时使用空的消息数组
  getContext.cache.clear?.()  // 清理上下文缓存（如果存在清理方法）
  getCodeStyle.cache.clear?.()  // 清理代码样式缓存（如果存在清理方法）
  await setCwd(getOriginalCwd())  // 重置工作目录到原始目录

  // 重置提醒和文件新鲜度会话以清理状态
  resetReminderSession()  // 重置系统提醒会话
  resetFileFreshnessSession()  // 重置文件新鲜度跟踪会话
}

// 定义clear命令对象，用于清除对话历史和释放上下文
const clear = {
  type: 'local',  // 命令类型为本地命令，不需要网络请求
  name: 'clear',  // 命令名称
  description: 'Clear conversation history and free up context',  // 命令描述：清除对话历史并释放上下文
  isEnabled: true,  // 命令是否启用
  isHidden: false,  // 命令是否在帮助中隐藏
  async call(_, context) {  // 异步调用函数，执行clear命令的核心逻辑
    clearConversation(context)  // 调用清除对话函数
    return ''  // 返回空字符串
  },
  userFacingName() {  // 返回用户界面显示的命令名称
    return 'clear'
  },
} satisfies Command  // 确保对象符合Command接口

// 导出clear命令作为默认导出，供其他模块使用
export default clear
