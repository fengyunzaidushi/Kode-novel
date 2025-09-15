// 导入React库，用于JSX语法支持
import * as React from 'react'
// 导入命令接口类型定义
import type { Command } from '../commands'
// 导入Onboarding组件，用于显示新用户引导界面
import { Onboarding } from '../components/Onboarding'
// 导入终端清屏工具函数
import { clearTerminal } from '../utils/terminal'
// 导入全局配置获取和保存函数
import { getGlobalConfig, saveGlobalConfig } from '../utils/config'
// 导入清除对话函数，用于引导完成后重置对话状态
import { clearConversation } from './clear'

// 导出onboarding命令的默认配置对象
export default {
  type: 'local-jsx',  // 命令类型为本地JSX命令，需要渲染React组件
  name: 'onboarding',  // 命令名称
  description: 'Run through the onboarding flow',  // 命令描述：运行新用户引导流程
  isEnabled: true,  // 命令是否启用
  isHidden: false,  // 命令是否在帮助中隐藏
  async call(onDone, context) {  // 异步调用函数，执行onboarding命令的核心逻辑
    await clearTerminal()  // 清空终端显示

    // 获取当前全局配置
    const config = getGlobalConfig()
    // 保存更新后的配置，设置主题为深色
    saveGlobalConfig({
      ...config,  // 保留现有配置
      theme: 'dark',  // 设置主题为深色
    })

    // 返回Onboarding React组件
    return (
      <Onboarding
        onDone={async () => {  // 引导完成后的回调函数
          clearConversation(context)  // 清除当前对话历史
          onDone()  // 调用完成回调
        }}
      />
    )
  },
  userFacingName() {  // 返回用户界面显示的命令名称
    return 'onboarding'
  },
} satisfies Command  // 确保对象符合Command接口
