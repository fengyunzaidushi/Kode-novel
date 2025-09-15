// 导入React库，用于创建React元素
import React from 'react'
// 导入命令接口类型定义
import type { Command } from '../commands'
// 导入Doctor屏幕组件，用于显示健康检查界面
import { Doctor } from '../screens/Doctor'
// 导入产品名称常量
import { PRODUCT_NAME } from '../constants/product'

// 定义doctor命令对象，用于检查产品安装的健康状态
const doctor: Command = {
  name: 'doctor',  // 命令名称
  description: `Checks the health of your ${PRODUCT_NAME} installation`,  // 命令描述：检查产品安装的健康状态，使用动态产品名称
  isEnabled: true,  // 命令是否启用
  isHidden: false,  // 命令是否在帮助中隐藏
  userFacingName() {  // 返回用户界面显示的命令名称
    return 'doctor'
  },
  type: 'local-jsx',  // 命令类型为本地JSX命令，需要渲染React组件
  call(onDone) {  // 调用函数，执行doctor命令的核心逻辑
    // 使用React.createElement创建Doctor组件实例，而不是JSX语法
    const element = React.createElement(Doctor, {
      onDone,  // 传入完成回调函数
      doctorMode: true,  // 设置doctor模式为true，启用健康检查功能
    })
    // 返回Promise包装的React元素
    return Promise.resolve(element)
  },
}

// 导出doctor命令作为默认导出，供其他模块使用
export default doctor
