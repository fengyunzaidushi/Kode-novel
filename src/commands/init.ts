// 导入命令接口类型定义
import type { Command } from '../commands'
// 导入项目引导完成标记函数，用于标记用户已完成初始化
import { markProjectOnboardingComplete } from '../ProjectOnboarding'
// 导入项目文件常量
import { PROJECT_FILE } from '../constants/product'

// 定义init命令对象，用于初始化新的项目配置文件并生成代码库文档
const command = {
  type: 'prompt',  // 命令类型为提示类型，会生成AI提示词而不是直接执行代码
  name: 'init',  // 命令名称
  description: `Initialize a new ${PROJECT_FILE} file with codebase documentation`,  // 命令描述：初始化新的项目文件并生成代码库文档
  isEnabled: true,  // 命令是否启用
  isHidden: false,  // 命令是否在帮助中隐藏
  progressMessage: 'analyzing your codebase',  // 执行时显示的进度消息
  userFacingName() {  // 返回用户界面显示的命令名称
    return 'init'
  },
  async getPromptForCommand(_args: string) {  // 异步函数，生成命令的提示词
    // 当运行init命令时，标记项目引导为完成状态
    markProjectOnboardingComplete()

    // 返回发送给AI的消息数组
    return [
      {
        role: 'user',  // 消息角色为用户
        content: [  // 消息内容数组
          {
            type: 'text',  // 内容类型为文本
            // 生成详细的分析和创建文件的指令文本
            text: `Please analyze this codebase and create a ${PROJECT_FILE} file containing:
1. Build/lint/test commands - especially for running a single test
2. Code style guidelines including imports, formatting, types, naming conventions, error handling, etc.

The file you create will be given to agentic coding agents (such as yourself) that operate in this repository. Make it about 20 lines long.
If there's already a ${PROJECT_FILE}, improve it.
If there are Cursor rules (in .cursor/rules/ or .cursorrules) or Copilot rules (in .github/copilot-instructions.md), make sure to include them.`,
          },
        ],
      },
    ]
  },
} satisfies Command  // 确保对象符合Command接口

// 导出init命令作为默认导出，供其他模块使用
export default command
