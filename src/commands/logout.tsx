// 导入React库，用于JSX语法支持
import * as React from 'react'
// 导入命令接口类型定义
import type { Command } from '../commands'
// 导入全局配置获取和保存函数
import { getGlobalConfig, saveGlobalConfig } from '../utils/config'
// 导入终端清屏工具函数
import { clearTerminal } from '../utils/terminal'
// 导入Ink的Text组件，用于显示文本
import { Text } from 'ink'

// 导出logout命令的默认配置对象
export default {
  type: 'local-jsx',  // 命令类型为本地JSX命令，需要渲染React组件
  name: 'logout',  // 命令名称
  description: 'Sign out from your Anthropic account',  // 命令描述：从Anthropic账户登出
  isEnabled: true,  // 命令是否启用
  isHidden: false,  // 命令是否在帮助中隐藏
  async call() {  // 异步调用函数，执行logout命令的核心逻辑
    await clearTerminal()  // 清空终端显示

    // 获取当前全局配置
    const config = getGlobalConfig()

    // 清除OAuth账户信息
    config.oauthAccount = undefined
    // 重置引导完成状态
    config.hasCompletedOnboarding = false

    // 如果存在自定义API密钥响应的已批准列表，清空它
    if (config.customApiKeyResponses?.approved) {
      config.customApiKeyResponses.approved = []
    }

    // 保存更新后的全局配置
    saveGlobalConfig(config)

    // 创建成功登出的消息组件
    const message = (
      <Text>Successfully logged out from your Anthropic account.</Text>
    )

    // 200毫秒后退出进程，给用户时间看到消息
    setTimeout(() => {
      process.exit(0)
    }, 200)

    return message  // 返回消息组件
  },
  userFacingName() {  // 返回用户界面显示的命令名称
    return 'logout'
  },
} satisfies Command  // 确保对象符合Command接口
