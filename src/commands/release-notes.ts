// 导入宏常量，包含版本信息
import { MACRO } from '../constants/macros.js'
// 导入命令接口类型定义
import type { Command } from '../commands'
// 导入发布说明常量，包含各版本的发布说明
import { RELEASE_NOTES } from '../constants/releaseNotes'

// 定义release-notes命令对象，用于显示当前或指定版本的发布说明
const releaseNotes: Command = {
  description: 'Show release notes for the current or specified version',  // 命令描述：显示当前或指定版本的发布说明
  isEnabled: false,  // 命令是否启用（当前已禁用）
  isHidden: false,  // 命令是否在帮助中隐藏
  name: 'release-notes',  // 命令名称
  userFacingName() {  // 返回用户界面显示的命令名称
    return 'release-notes'
  },
  type: 'local',  // 命令类型为本地命令，不需要网络请求
  async call(args) {  // 异步调用函数，执行release-notes命令的核心逻辑
    // 从宏常量中获取当前版本
    const currentVersion = MACRO.VERSION

    // 如果指定了特定版本，显示该版本的说明；否则显示当前版本的说明
    const requestedVersion = args ? args.trim() : currentVersion

    // 从发布说明常量中获取请求版本的说明
    const notes = RELEASE_NOTES[requestedVersion]

    // 如果没有找到发布说明或说明为空，返回未找到信息
    if (!notes || notes.length === 0) {
      return `No release notes available for version ${requestedVersion}.`
    }

    // 创建标题
    const header = `Release notes for version ${requestedVersion}:`
    // 格式化发布说明，每条说明前添加项目符号
    const formattedNotes = notes.map(note => `• ${note}`).join('\n')

    // 返回完整的发布说明，包含标题和格式化的说明列表
    return `${header}\n\n${formattedNotes}`
  },
}

// 导出release-notes命令作为默认导出，供其他模块使用
export default releaseNotes
