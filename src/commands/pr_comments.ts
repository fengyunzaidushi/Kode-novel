// 导入命令接口定义
import { Command } from '../commands'

// 导出pr-comments命令的默认配置对象
export default {
  type: 'prompt',  // 命令类型为提示类型，会生成AI提示词而不是直接执行代码
  name: 'pr-comments',  // 命令名称
  description: 'Get comments from a GitHub pull request',  // 命令描述：从GitHub拉取请求获取评论
  progressMessage: 'fetching PR comments',  // 执行时显示的进度消息
  isEnabled: true,  // 命令是否启用
  isHidden: false,  // 命令是否在帮助中隐藏
  userFacingName() {  // 返回用户界面显示的命令名称
    return 'pr-comments'
  },
  async getPromptForCommand(args: string) {  // 异步函数，生成命令的提示词
    // 返回发送给AI的消息数组
    return [
      {
        role: 'user',  // 消息角色为用户
        content: [  // 消息内容数组
          {
            type: 'text',  // 内容类型为文本
            // 生成详细的GitHub PR评论获取指令文本
            text: `You are an AI assistant integrated into a git-based version control system. Your task is to fetch and display comments from a GitHub pull request.

Follow these steps:

1. Use \`gh pr view --json number,headRepository\` to get the PR number and repository info
2. Use \`gh api /repos/{owner}/{repo}/issues/{number}/comments\` to get PR-level comments
3. Use \`gh api /repos/{owner}/{repo}/pulls/{number}/comments\` to get review comments. Pay particular attention to the following fields: \`body\`, \`diff_hunk\`, \`path\`, \`line\`, etc. If the comment references some code, consider fetching it using eg \`gh api /repos/{owner}/{repo}/contents/{path}?ref={branch} | jq .content -r | base64 -d\`
4. Parse and format all comments in a readable way
5. Return ONLY the formatted comments, with no additional text

Format the comments as:

## Comments

[For each comment thread:]
- @author file.ts#line:
  \`\`\`diff
  [diff_hunk from the API response]
  \`\`\`
  > quoted comment text

  [any replies indented]

If there are no comments, return "No comments found."

Remember:
1. Only show the actual comments, no explanatory text
2. Include both PR-level and code review comments
3. Preserve the threading/nesting of comment replies
4. Show the file and line number context for code review comments
5. Use jq to parse the JSON responses from the GitHub API

${args ? 'Additional user input: ' + args : ''}
`,  // 如果有用户额外输入，则添加到指令末尾
          },
        ],
      },
    ]
  },
} satisfies Command  // 确保对象符合Command接口
