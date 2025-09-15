// 导入React库，用于JSX语法支持
import * as React from 'react'
// 导入命令接口类型定义
import type { Command } from '../commands'
// 导入ResumeConversation屏幕组件，用于显示恢复对话界面
import { ResumeConversation } from '../screens/ResumeConversation'
// 导入Ink渲染器，用于渲染React组件到终端
import { render } from 'ink'
// 导入缓存路径常量和日志列表加载函数
import { CACHE_PATHS, loadLogList } from '../utils/log'

// 导出resume命令的默认配置对象
export default {
  type: 'local-jsx',  // 命令类型为本地JSX命令，需要渲染React组件
  name: 'resume',  // 命令名称
  description: 'Resume a previous conversation',  // 命令描述：恢复之前的对话
  isEnabled: true,  // 命令是否启用
  isHidden: false,  // 命令是否在帮助中隐藏
  userFacingName() {  // 返回用户界面显示的命令名称
    return 'resume'
  },
  async call(onDone, context) {  // 异步调用函数，执行resume命令的核心逻辑
    // 从上下文选项中解构获取命令、工具和详细模式配置，设置默认值
    const { commands = [], tools = [], verbose = false } = context.options || {}
    // 加载消息日志列表，从缓存路径获取所有保存的对话历史
    const logs = await loadLogList(CACHE_PATHS.messages())
    // 使用Ink渲染ResumeConversation组件到终端
    render(
      <ResumeConversation
        commands={commands}  // 传入可用命令列表
        context={{ unmount: onDone }}  // 传入上下文，包含卸载回调
        logs={logs}  // 传入加载的日志列表
        tools={tools}  // 传入可用工具列表
        verbose={verbose}  // 传入详细模式标志
      />,
    )
    // 此返回值仅用于类型检查，实际组件由render函数处理
    return null
  },
} satisfies Command  // 确保对象符合Command接口
