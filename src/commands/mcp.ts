// 导入命令接口类型定义
import type { Command } from '../commands'
// 导入MCP服务器列表和客户端获取函数
import { listMCPServers, getClients } from '../services/mcpClient'
// 导入产品命令常量
import { PRODUCT_COMMAND } from '../constants/product'
// 导入chalk库，用于终端文本着色
import chalk from 'chalk'
// 导入主题获取函数，用于获取当前主题颜色
import { getTheme } from '../utils/theme'

// 定义mcp命令对象，用于显示MCP服务器连接状态
const mcp = {
  type: 'local',  // 命令类型为本地命令，不需要网络请求
  name: 'mcp',  // 命令名称
  description: 'Show MCP server connection status',  // 命令描述：显示MCP服务器连接状态
  isEnabled: true,  // 命令是否启用
  isHidden: false,  // 命令是否在帮助中隐藏
  async call() {  // 异步调用函数，执行mcp命令的核心逻辑
    // 获取配置的MCP服务器列表
    const servers = listMCPServers()
    // 获取MCP客户端连接状态
    const clients = await getClients()
    // 获取当前主题
    const theme = getTheme()

    // 如果没有配置任何MCP服务器，返回提示信息
    if (Object.keys(servers).length === 0) {
      return `⎿  No MCP servers configured. Run \`${PRODUCT_COMMAND} mcp\` to learn about how to configure MCP servers.`
    }

    // 按名称排序服务器并格式化状态，添加颜色显示
    const serverStatusLines = clients
      .sort((a, b) => a.name.localeCompare(b.name))  // 按名称字母顺序排序
      .map(client => {  // 映射每个客户端为状态行
        const isConnected = client.type === 'connected'  // 检查是否已连接
        const status = isConnected ? 'connected' : 'disconnected'  // 确定状态文本
        // 根据连接状态应用不同颜色：成功色或错误色
        const coloredStatus = isConnected
          ? chalk.hex(theme.success)(status)  // 已连接使用成功色
          : chalk.hex(theme.error)(status)    // 未连接使用错误色
        return `⎿  • ${client.name}: ${coloredStatus}`  // 返回格式化的状态行
      })

    // 返回包含标题和所有服务器状态的字符串
    return ['⎿  MCP Server Status', ...serverStatusLines].join('\n')
  },
  userFacingName() {  // 返回用户界面显示的命令名称
    return 'mcp'
  },
} satisfies Command  // 确保对象符合Command接口

// 导出mcp命令作为默认导出，供其他模块使用
export default mcp
