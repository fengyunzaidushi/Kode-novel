// 导入React库，用于JSX语法支持
import React from 'react'
// 导入命令接口类型定义
import type { Command } from '../commands'
// 导入ModelStatusDisplay组件，用于显示模型状态信息
import { ModelStatusDisplay } from '../components/ModelStatusDisplay'

// 定义modelstatus命令对象，用于显示当前模型配置和状态
const modelstatus: Command = {
  name: 'modelstatus',  // 命令名称
  description: 'Display current model configuration and status',  // 命令描述：显示当前模型配置和状态
  aliases: ['ms', 'model-status'],  // 命令别名，用户可以使用这些简写形式
  isEnabled: true,  // 命令是否启用
  isHidden: false,  // 命令是否在帮助中隐藏
  userFacingName() {  // 返回用户界面显示的命令名称
    return 'modelstatus'
  },
  type: 'local-jsx',  // 命令类型为本地JSX命令，需要渲染React组件
  call(onDone) {  // 调用函数，执行modelstatus命令的核心逻辑
    // 返回Promise包装的ModelStatusDisplay React组件，传入关闭回调函数
    return Promise.resolve(<ModelStatusDisplay onClose={onDone} />)
  },
}

// 导出modelstatus命令作为默认导出，供其他模块使用
export default modelstatus
