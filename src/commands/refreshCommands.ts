// 导入命令接口定义
import { Command } from '../commands'
// 导入自定义命令重新加载函数
import { reloadCustomCommands } from '../services/customCommands'
// 导入命令获取函数
import { getCommands } from '../commands'

/**
 * 刷新命令 - 从文件系统重新加载自定义命令
 *
 * 此命令提供了在运行时刷新自定义命令缓存的机制，无需重启应用程序。
 * 在开发过程中或用户正在创建/修改自定义命令时特别有用。
 *
 * 该命令遵循项目中使用的标准本地命令模式，并提供关于刷新操作的详细反馈。
 */
// 定义refresh-commands命令对象，用于从文件系统重新加载自定义命令
const refreshCommands = {
  type: 'local',  // 命令类型为本地命令，不需要网络请求
  name: 'refresh-commands',  // 命令名称
  description: 'Reload custom commands from filesystem',  // 命令描述：从文件系统重新加载自定义命令
  isEnabled: true,  // 命令是否启用
  isHidden: false,  // 命令是否在帮助中隐藏
  async call(_, context) {  // 异步调用函数，执行refresh-commands命令的核心逻辑
    try {
      // 清除自定义命令缓存以强制文件系统重新扫描
      reloadCustomCommands()

      // 清除主命令缓存以确保完全重新加载
      // 这确保了对自定义命令的更改反映在主命令列表中
      getCommands.cache.clear?.()

      // 重新加载命令以获取更新的数量并验证刷新是否成功
      const commands = await getCommands()
      // 过滤出自定义命令（以project:或user:开头的命令）
      const customCommands = commands.filter(
        cmd => cmd.name.startsWith('project:') || cmd.name.startsWith('user:'),
      )

      // 提供关于刷新操作的详细反馈
      return `✅ Commands refreshed successfully!

Custom commands reloaded: ${customCommands.length}
- Project commands: ${customCommands.filter(cmd => cmd.name.startsWith('project:')).length}
- User commands: ${customCommands.filter(cmd => cmd.name.startsWith('user:')).length}

Use /help to see updated command list.`
    } catch (error) {
      // 如果刷新失败，记录错误并返回失败消息
      console.error('Failed to refresh commands:', error)
      return '❌ Failed to refresh commands. Check console for details.'
    }
  },
  userFacingName() {  // 返回用户界面显示的命令名称
    return 'refresh-commands'
  },
} satisfies Command  // 确保对象符合Command接口

// 导出refresh-commands命令作为默认导出，供其他模块使用
export default refreshCommands
