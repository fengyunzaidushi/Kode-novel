// 通知服务 - 多平台的用户通知系统
// 支持不同类型的终端通知方式，包括：
// 1. iTerm2的内置通知系统
// 2. 终端响铃提醒
// 3. 组合通知方式
// 4. 禁用通知选项
// 根据用户配置自动选择适合的通知渠道

import { getGlobalConfig } from '../utils/config'

// 通知选项接口 - 定义通知消息的结构
export type NotificationOptions = {
  message: string    // 通知消息内容（必需）
  title?: string     // 可选的通知标题
}

/**
 * 发送iTerm2的内置通知
 * 使用iTerm2的专用转义序列显示通知消息
 * @param options 通知选项，包含消息和可选标题
 */
function sendITerm2Notification({ message, title }: NotificationOptions): void {
  // 构建显示字符串，如果有标题则包含标题
  const displayString = title ? `${title}:\n${message}` : message
  try {
    // 使用iTerm2的OSC 9转义序列发送通知
    process.stdout.write(`\x1b]9;\n\n${displayString}\x07`)
  } catch {
    // 忽略错误，确保通知失败不会影响主程序运行
  }
}

/**
 * 发送终端响铃
 * 使用ASCII控制字符BEL(0x07)发出系统响铃
 */
function sendTerminalBell(): void {
  process.stdout.write('\x07')  // ASCII BEL字符，触发系统响铃
}

/**
 * 主要的通知发送函数
 * 根据用户的全局配置选择适合的通知渠道发送通知
 * @param notif 通知选项，包含消息和可选标题
 * @returns Promise<void> 异步操作完成的Promise
 */
export async function sendNotification(
  notif: NotificationOptions,
): Promise<void> {
  // 从全局配置中获取用户偏好的通知渠道
  const channel = getGlobalConfig().preferredNotifChannel
  switch (channel) {
    case 'iterm2':
      // 仅使用iTerm2通知
      sendITerm2Notification(notif)
      break
    case 'terminal_bell':
      // 仅使用终端响铃
      sendTerminalBell()
      break
    case 'iterm2_with_bell':
      // iTerm2通知 + 终端响铃的组合模式
      sendITerm2Notification(notif)
      sendTerminalBell()
      break
    case 'notifications_disabled':
      // 用户禁用了通知，不执行任何操作
      break
  }
}
