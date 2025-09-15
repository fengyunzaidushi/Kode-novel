// 导入命令接口定义
import { Command } from '../commands'
// 导入BashTool工具，用于在代码审查中执行git命令
import { BashTool } from '../tools/BashTool/BashTool'

// 导出review命令的默认配置对象
export default {
  type: 'prompt',  // 命令类型为提示类型，会生成AI提示词而不是直接执行代码
  name: 'review',  // 命令名称
  description: 'Review a pull request',  // 命令描述：审查拉取请求
  isEnabled: true,  // 命令是否启用
  isHidden: false,  // 命令是否在帮助中隐藏
  progressMessage: 'reviewing pull request',  // 执行时显示的进度消息
  userFacingName() {  // 返回用户界面显示的命令名称
    return 'review'
  },
  async getPromptForCommand(args) {  // 异步函数，生成命令的提示词
    // 返回发送给AI的消息数组
    return [
      {
        role: 'user',  // 消息角色为用户
        content: [  // 消息内容数组
          {
            type: 'text',  // 内容类型为文本
            // 生成详细的代码审查指令文本
            text: `
      You are an expert code reviewer. Follow these steps:

      1. If no PR number is provided in the args, use ${BashTool.name}("gh pr list") to show open PRs
      2. If a PR number is provided, use ${BashTool.name}("gh pr view <number>") to get PR details
      3. Use ${BashTool.name}("gh pr diff <number>") to get the diff
      4. Analyze the changes and provide a thorough code review that includes:
         - Overview of what the PR does
         - Analysis of code quality and style
         - Specific suggestions for improvements
         - Any potential issues or risks

      Keep your review concise but thorough. Focus on:
      - Code correctness
      - Following project conventions
      - Performance implications
      - Test coverage
      - Security considerations

      Format your review with clear sections and bullet points.

      PR number: ${args}  // 用户提供的PR编号参数
    `,
          },
        ],
      },
    ]
  },
} satisfies Command  // 确保对象符合Command接口
