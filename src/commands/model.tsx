// 导入React库，用于JSX语法支持
import React from 'react'
// 导入Ink渲染器（虽然在此处未使用，但可能在其他地方需要）
import { render } from 'ink'
// 导入ModelConfig组件，用于显示模型配置界面
import { ModelConfig } from '../components/ModelConfig'
// 导入配置启用函数，用于启用配置系统
import { enableConfigs } from '../utils/config'
// 导入模型配置变更触发函数，用于通知UI更新
import { triggerModelConfigChange } from '../messages'

// 导出命令帮助文本
export const help = 'Change your AI provider and model settings'
// 导出命令描述
export const description = 'Change your AI provider and model settings'
// 导出命令是否启用标志
export const isEnabled = true
// 导出命令是否隐藏标志
export const isHidden = false
// 导出命令名称
export const name = 'model'
// 导出命令类型为本地JSX命令
export const type = 'local-jsx'

// 导出返回用户界面显示命令名称的函数
export function userFacingName(): string {
  return name  // 返回命令名称
}

// 导出异步调用函数，执行model命令的核心逻辑
export async function call(
  onDone: (result?: string) => void,  // 完成回调函数
  context: any,  // 上下文对象，包含各种配置和状态
): Promise<React.ReactNode> {
  const { abortController } = context  // 从上下文中获取中止控制器
  enableConfigs()  // 启用配置系统
  abortController?.abort?.()  // 如果存在中止控制器，则调用中止方法
  return (
    <ModelConfig
      onClose={() => {  // 关闭回调函数
        // 强制重新加载ModelManager以确保UI同步 - 等待完成后再关闭
        import('../utils/model').then(({ reloadModelManager }) => {
          reloadModelManager()  // 重新加载模型管理器
          // 🔧 关键修复：在模型配置更改后触发全局UI刷新
          // 这确保PromptInput组件检测到ModelManager单例状态变化
          triggerModelConfigChange()
          // 只有在重新加载完成后才关闭，以确保UI同步
          onDone()
        })
      }}
    />
  )
}
