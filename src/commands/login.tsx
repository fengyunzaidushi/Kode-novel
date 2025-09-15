// 导入React库，用于JSX语法支持
import * as React from 'react'
// 导入命令接口类型定义
import type { Command } from '../commands'
// 导入控制台OAuth流程组件，用于处理OAuth登录
import { ConsoleOAuthFlow } from '../components/ConsoleOAuthFlow'
// 导入终端清屏工具函数
import { clearTerminal } from '../utils/terminal'
// 导入Anthropic登录状态检查函数
import { isLoggedInToAnthropic } from '../utils/auth'
// 导入Ctrl+C/D退出钩子，用于处理用户中断操作
import { useExitOnCtrlCD } from '../hooks/useExitOnCtrlCD'
// 导入Ink的布局和文本组件
import { Box, Text } from 'ink'
// 导入清除对话函数，用于登录后重置对话状态
import { clearConversation } from './clear'

// 导出login命令的默认配置，使用函数形式以支持动态描述
export default () =>
  ({
    type: 'local-jsx',  // 命令类型为本地JSX命令，需要渲染React组件
    name: 'login',  // 命令名称
    // 根据当前登录状态动态生成命令描述
    description: isLoggedInToAnthropic()
      ? 'Switch Anthropic accounts'  // 如果已登录，显示切换账户
      : 'Sign in with your Anthropic account',  // 如果未登录，显示登录提示
    isEnabled: true,  // 命令是否启用
    isHidden: false,  // 命令是否在帮助中隐藏
    async call(onDone, context) {  // 异步调用函数，执行login命令的核心逻辑
      await clearTerminal()  // 清空终端显示
      return (
        <Login
          onDone={async () => {  // 登录完成后的回调函数
            clearConversation(context)  // 清除当前对话历史
            onDone()  // 调用完成回调
          }}
        />
      )
    },
    userFacingName() {  // 返回用户界面显示的命令名称
      return 'login'
    },
  }) satisfies Command  // 确保对象符合Command接口

// Login组件，用于显示登录界面
function Login(props: { onDone: () => void }) {  // 接收完成回调函数作为属性
  // 使用Ctrl+C/D退出钩子，允许用户中断登录流程
  const exitState = useExitOnCtrlCD(props.onDone)
  return (
    <Box flexDirection="column">  {/* 垂直布局容器 */}
      <ConsoleOAuthFlow onDone={props.onDone} />  {/* OAuth登录流程组件 */}
      <Box marginLeft={3}>  {/* 左边距为3的容器 */}
        <Text dimColor>  {/* 暗色文本 */}
          {exitState.pending ? (  // 如果退出状态为待定
            <>Press {exitState.keyName} again to exit</>  // 显示再次按键退出的提示
          ) : (
            ''  // 否则不显示任何内容
          )}
        </Text>
      </Box>
    </Box>
  )
}
