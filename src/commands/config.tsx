// 导入命令接口定义
import { Command } from '../commands'
// 导入Config组件，用于显示配置面板界面
import { Config } from '../components/Config'
// 导入React库，用于JSX语法支持
import * as React from 'react'

// 定义config命令对象，用于打开配置面板
const config = {
  type: 'local-jsx',  // 命令类型为本地JSX命令，需要渲染React组件
  name: 'config',  // 命令名称
  description: 'Open config panel',  // 命令描述：打开配置面板
  isEnabled: true,  // 命令是否启用
  isHidden: false,  // 命令是否在帮助中隐藏
  async call(onDone) {  // 异步调用函数，执行config命令的核心逻辑
    return <Config onClose={onDone} />  // 返回Config React组件，传入关闭回调函数
  },
  userFacingName() {  // 返回用户界面显示的命令名称
    return 'config'
  },
} satisfies Command  // 确保对象符合Command接口

// 导出config命令作为默认导出，供其他模块使用
export default config
