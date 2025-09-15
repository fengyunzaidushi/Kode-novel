// 导入命令接口定义
import { Command } from '../commands'
// 导入Bug组件，用于显示反馈提交界面
import { Bug } from '../components/Bug'
// 导入React库，用于JSX语法支持
import * as React from 'react'
// 导入产品名称常量
import { PRODUCT_NAME } from '../constants/product'

// 定义bug命令对象，用于提交产品反馈
const bug = {
  type: 'local-jsx',  // 命令类型为本地JSX命令，需要渲染React组件
  name: 'bug',  // 命令名称
  description: `Submit feedback about ${PRODUCT_NAME}`,  // 命令描述：提交关于产品的反馈，使用动态产品名称
  isEnabled: true,  // 命令是否启用
  isHidden: false,  // 命令是否在帮助中隐藏
  async call(onDone) {  // 异步调用函数，执行bug命令的核心逻辑
    return <Bug onDone={onDone} />  // 返回Bug React组件，传入完成回调函数
  },
  userFacingName() {  // 返回用户界面显示的命令名称
    return 'bug'
  },
} satisfies Command  // 确保对象符合Command接口

// 导出bug命令作为默认导出，供其他模块使用
export default bug
