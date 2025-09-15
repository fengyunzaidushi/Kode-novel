// 导入命令接口类型定义
import type { Command } from '../commands'
// 导入成本追踪器的格式化函数，用于显示总成本信息
import { formatTotalCost } from '../cost-tracker'

// 定义cost命令对象，用于显示当前会话的总成本和持续时间
const cost = {
  type: 'local',  // 命令类型为本地命令，不需要网络请求
  name: 'cost',  // 命令名称
  description: 'Show the total cost and duration of the current session',  // 命令描述：显示当前会话的总成本和持续时间
  isEnabled: true,  // 命令是否启用
  isHidden: false,  // 命令是否在帮助中隐藏
  async call() {  // 异步调用函数，执行cost命令的核心逻辑
    return formatTotalCost()  // 调用成本格式化函数并返回结果
  },
  userFacingName() {  // 返回用户界面显示的命令名称
    return 'cost'
  },
} satisfies Command  // 确保对象符合Command接口

// 导出cost命令作为默认导出，供其他模块使用
export default cost
