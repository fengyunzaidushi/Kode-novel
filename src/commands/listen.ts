// 导入命令接口定义
import { Command } from '../commands'
// 导入日志错误函数，用于记录错误信息
import { logError } from '../utils/log'
// 导入无抛出执行文件函数，用于安全执行外部命令
import { execFileNoThrow } from '../utils/execFileNoThrow'

// 检查是否启用listen命令的条件：
// 1. 运行在macOS平台上
// 2. 终端程序是iTerm或Apple Terminal
const isEnabled =
  process.platform === 'darwin' &&  // 必须是macOS系统
  ['iTerm.app', 'Apple_Terminal'].includes(process.env.TERM_PROGRAM || '')  // 终端程序必须是支持的类型

// 定义listen命令对象，用于激活语音识别并转录语音为文本
const listen: Command = {
  type: 'local',  // 命令类型为本地命令，不需要网络请求
  name: 'listen',  // 命令名称
  description: 'Activates speech recognition and transcribes speech to text',  // 命令描述：激活语音识别并转录语音为文本
  isEnabled: isEnabled,  // 命令是否启用，取决于平台和终端支持
  isHidden: isEnabled,  // 命令是否隐藏，与启用状态相同
  userFacingName() {  // 返回用户界面显示的命令名称
    return 'listen'
  },
  async call(_, { abortController }) {  // 异步调用函数，执行listen命令的核心逻辑
    // 使用AppleScript启动听写功能
    // 脚本通过系统事件访问前台应用的编辑菜单并点击"开始听写"选项
    const script = `tell application "System Events" to tell ¬
(the first process whose frontmost is true) to tell ¬
menu bar 1 to tell ¬
menu bar item "Edit" to tell ¬
menu "Edit" to tell ¬
menu item "Start Dictation" to ¬
if exists then click it`

    // 执行AppleScript脚本
    const { stderr, code } = await execFileNoThrow(
      'osascript',  // 使用osascript命令执行AppleScript
      ['-e', script],  // 参数：-e表示执行脚本，script为要执行的脚本内容
      abortController.signal,  // 传入中止信号以支持取消操作
    )

    // 检查脚本执行结果
    if (code !== 0) {  // 如果返回码不为0，表示执行失败
      logError(`Failed to start dictation: ${stderr}`)  // 记录错误信息
      return 'Failed to start dictation'  // 返回失败消息
    }
    return 'Dictation started. Press esc to stop.'  // 返回成功消息，提示用户如何停止
  },
}

// 导出listen命令作为默认导出，供其他模块使用
export default listen
