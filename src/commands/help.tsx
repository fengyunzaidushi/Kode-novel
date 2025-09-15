// 导入命令接口定义
import { Command } from '../commands'
// 导入Help组件，用于显示帮助和可用命令列表
import { Help } from '../components/Help'
// 导入React库，用于JSX语法支持
import * as React from 'react'

// 定义help命令对象，用于显示帮助信息和可用命令
const help = {
  type: 'local-jsx',  // 命令类型为本地JSX命令，需要渲染React组件
  name: 'help',  // 命令名称
  description: 'Show help and available commands',  // 命令描述：显示帮助信息和可用命令
  isEnabled: true,  // 命令是否启用
  isHidden: false,  // 命令是否在帮助中隐藏
  async call(onDone, context) {  // 异步调用函数，执行help命令的核心逻辑
    // 返回Help React组件，传入命令列表和关闭回调函数
    // 从上下文选项中获取命令列表，如果不存在则使用空数组
    return <Help commands={context.options?.commands || []} onClose={onDone} />
  },
  userFacingName() {  // 返回用户界面显示的命令名称
    return 'help'
  },
} satisfies Command  // 确保对象符合Command接口

// 导出help命令作为默认导出，供其他模块使用
export default help
