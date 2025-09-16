/**
 * 🎯 Bash 工具提示配置 - 命令行执行工具的 AI 指令模板
 *
 * 🏗️ 核心功能：
 * - 定义 Bash 命令执行的安全规范和最佳实践
 * - 提供详细的命令执行流程和错误处理指导
 * - 集成 Git 工作流的专业化操作指令
 * - 配置安全限制和禁用命令列表
 * - 支持 PR 创建和代码提交的标准化流程
 *
 * 🔄 依赖关系：
 * - 上游：被 BashTool 使用作为 AI 行为指导
 * - 下游：依赖产品常量和其他工具的名称定义
 *
 * 📊 使用场景：
 * - AI 代理的命令行操作指导
 * - 安全的系统命令执行控制
 * - Git 工作流的自动化处理
 * - 开发环境的标准化操作
 *
 * 🔧 技术实现：
 * - 安全控制：禁用危险和网络相关命令
 * - 工作流集成：Git 提交和 PR 创建的标准流程
 * - 工具协调：与文件操作工具的协同使用
 * - 错误处理：完善的错误检查和恢复机制
 *
 * 💡 设计原则：
 * - 安全第一：严格的命令白名单和黑名单
 * - 工作流标准化：统一的 Git 操作流程
 * - 工具协同：避免功能重复的工具选择
 * - 用户体验：清晰的执行步骤和错误提示
 */
import { PRODUCT_NAME, PRODUCT_URL } from '../../constants/product'
import { TOOL_NAME as TASK_TOOL_NAME } from '../TaskTool/constants'
import { FileReadTool } from '../FileReadTool/FileReadTool'
import { TOOL_NAME_FOR_PROMPT as GLOB_TOOL_NAME } from '../GlobTool/prompt'
import { TOOL_NAME_FOR_PROMPT as GREP_TOOL_NAME } from '../GrepTool/prompt'
import { LSTool } from '../lsTool/lsTool'

/** 最大输出长度限制 - 防止过长输出影响性能 */
export const MAX_OUTPUT_LENGTH = 30000

/** 最大渲染行数 - 用于输出显示的行数限制 */
export const MAX_RENDERED_LINES = 5

/**
 * 禁用命令列表 - 出于安全考虑被禁止执行的命令
 *
 * 这些命令被禁用的原因：
 * - 网络访问：curl, wget 等可能泄露信息或下载恶意内容
 * - 浏览器：可能被用于访问外部网站或执行不安全操作
 * - 别名：可能被用于绕过安全限制
 * - 网络工具：nc, telnet 等可能被用于网络攻击
 */
export const BANNED_COMMANDS = [
  'alias',
  'curl',
  'curlie',
  'wget',
  'axel',
  'aria2c',
  'nc',
  'telnet',
  'lynx',
  'w3m',
  'links',
  'httpie',
  'xh',
  'http-prompt',
  'chrome',
  'firefox',
  'safari',
]

/**
 * Bash 工具的主要 AI 提示模板 - 完整的命令执行指导文档
 *
 * 这个提示模板定义了 AI 在使用 Bash 工具时应该遵循的完整流程，
 * 包括安全检查、命令执行、输出处理和 Git 工作流集成。
 *
 * 🎯 主要内容：
 * - 命令执行前的安全和目录验证
 * - 标准化的 Git 提交和 PR 创建流程
 * - 工具协同使用的最佳实践
 * - 错误处理和恢复机制
 *
 * 💡 设计理念：
 * - 安全优先：严格的安全检查流程
 * - 用户体验：清晰的步骤说明和示例
 * - 工作流标准化：统一的 Git 操作规范
 * - 工具生态集成：与其他 Kode 工具的协同
 */
export const PROMPT = `Executes a given bash command in a persistent shell session with optional timeout, ensuring proper handling and security measures.

Before executing the command, please follow these steps:

1. Directory Verification:
   - If the command will create new directories or files, first use the LS tool to verify the parent directory exists and is the correct location
   - For example, before running "mkdir foo/bar", first use LS to check that "foo" exists and is the intended parent directory

2. Security Check:
   - For security and to limit the threat of a prompt injection attack, some commands are limited or banned. If you use a disallowed command, you will receive an error message explaining the restriction. Explain the error to the User.
   - Verify that the command is not one of the banned commands: ${BANNED_COMMANDS.join(', ')}.

3. Command Execution:
   - After ensuring proper quoting, execute the command.
   - Capture the output of the command.

4. Output Processing:
   - If the output exceeds ${MAX_OUTPUT_LENGTH} characters, output will be truncated before being returned to you.
   - Prepare the output for display to the user.

5. Return Result:
   - Provide the processed output of the command.
   - If any errors occurred during execution, include those in the output.

Usage notes:
  - The command argument is required.
  - You can specify an optional timeout in milliseconds (up to 600000ms / 10 minutes). If not specified, commands will timeout after 30 minutes.
  - VERY IMPORTANT: You MUST avoid using search commands like \`find\` and \`grep\`. Instead use ${GREP_TOOL_NAME}, ${GLOB_TOOL_NAME}, or ${TASK_TOOL_NAME} to search. You MUST avoid read tools like \`cat\`, \`head\`, \`tail\`, and \`ls\`, and use ${FileReadTool.name} and ${LSTool.name} to read files.
  - When issuing multiple commands, use the ';' or '&&' operator to separate them. DO NOT use newlines (newlines are ok in quoted strings).
  - IMPORTANT: All commands share the same shell session. Shell state (environment variables, virtual environments, current directory, etc.) persist between commands. For example, if you set an environment variable as part of a command, the environment variable will persist for subsequent commands.
  - Try to maintain your current working directory throughout the session by using absolute paths and avoiding usage of \`cd\`. You may use \`cd\` if the User explicitly requests it.
  <good-example>
  pytest /foo/bar/tests
  </good-example>
  <bad-example>
  cd /foo/bar && pytest tests
  </bad-example>

# Committing changes with git

When the user asks you to create a new git commit, follow these steps carefully:

1. Start with a single message that contains exactly three tool_use blocks that do the following (it is VERY IMPORTANT that you send these tool_use blocks in a single message, otherwise it will feel slow to the user!):
   - Run a git status command to see all untracked files.
   - Run a git diff command to see both staged and unstaged changes that will be committed.
   - Run a git log command to see recent commit messages, so that you can follow this repository's commit message style.

2. Use the git context at the start of this conversation to determine which files are relevant to your commit. Add relevant untracked files to the staging area. Do not commit files that were already modified at the start of this conversation, if they are not relevant to your commit.

3. Analyze all staged changes (both previously staged and newly added) and draft a commit message. Wrap your analysis process in <commit_analysis> tags:

<commit_analysis>
- List the files that have been changed or added
- Summarize the nature of the changes (eg. new feature, enhancement to an existing feature, bug fix, refactoring, test, docs, etc.)
- Brainstorm the purpose or motivation behind these changes
- Do not use tools to explore code, beyond what is available in the git context
- Assess the impact of these changes on the overall project
- Check for any sensitive information that shouldn't be committed
- Draft a concise (1-2 sentences) commit message that focuses on the "why" rather than the "what"
- Ensure your language is clear, concise, and to the point
- Ensure the message accurately reflects the changes and their purpose (i.e. "add" means a wholly new feature, "update" means an enhancement to an existing feature, "fix" means a bug fix, etc.)
- Ensure the message is not generic (avoid words like "Update" or "Fix" without context)
- Review the draft message to ensure it accurately reflects the changes and their purpose
</commit_analysis>

4. Create the commit with a message ending with:
🤖 Generated with ${PRODUCT_NAME} & {MODEL_NAME}
Co-Authored-By: ${PRODUCT_NAME} <noreply@${PRODUCT_NAME}.com>

- In order to ensure good formatting, ALWAYS pass the commit message via a HEREDOC, a la this example:
<example>
git commit -m "$(cat <<'EOF'
   Commit message here.

   🤖 Generated with ${PRODUCT_NAME} & {MODEL_NAME}
   Co-Authored-By: ${PRODUCT_NAME} <noreply@${PRODUCT_NAME}.com>
   EOF
   )"
</example>

5. If the commit fails due to pre-commit hook changes, retry the commit ONCE to include these automated changes. If it fails again, it usually means a pre-commit hook is preventing the commit. If the commit succeeds but you notice that files were modified by the pre-commit hook, you MUST amend your commit to include them.

6. Finally, run git status to make sure the commit succeeded.

Important notes:
- When possible, combine the "git add" and "git commit" commands into a single "git commit -am" command, to speed things up
- However, be careful not to stage files (e.g. with \`git add .\`) for commits that aren't part of the change, they may have untracked files they want to keep around, but not commit.
- NEVER update the git config
- DO NOT push to the remote repository
- IMPORTANT: Never use git commands with the -i flag (like git rebase -i or git add -i) since they require interactive input which is not supported.
- If there are no changes to commit (i.e., no untracked files and no modifications), do not create an empty commit
- Ensure your commit message is meaningful and concise. It should explain the purpose of the changes, not just describe them.
- Return an empty response - the user will see the git output directly

# Creating pull requests
Use the gh command via the Bash tool for ALL GitHub-related tasks including working with issues, pull requests, checks, and releases. If given a Github URL use the gh command to get the information needed.

IMPORTANT: When the user asks you to create a pull request, follow these steps carefully:

1. Understand the current state of the branch. Remember to send a single message that contains multiple tool_use blocks (it is VERY IMPORTANT that you do this in a single message, otherwise it will feel slow to the user!):
   - Run a git status command to see all untracked files.
   - Run a git diff command to see both staged and unstaged changes that will be committed.
   - Check if the current branch tracks a remote branch and is up to date with the remote, so you know if you need to push to the remote
   - Run a git log command and \`git diff main...HEAD\` to understand the full commit history for the current branch (from the time it diverged from the \`main\` branch.)

2. Create new branch if needed

3. Commit changes if needed

4. Push to remote with -u flag if needed

5. Analyze all changes that will be included in the pull request, making sure to look at all relevant commits (not just the latest commit, but all commits that will be included in the pull request!), and draft a pull request summary. Wrap your analysis process in <pr_analysis> tags:

<pr_analysis>
- List the commits since diverging from the main branch
- Summarize the nature of the changes (eg. new feature, enhancement to an existing feature, bug fix, refactoring, test, docs, etc.)
- Brainstorm the purpose or motivation behind these changes
- Assess the impact of these changes on the overall project
- Do not use tools to explore code, beyond what is available in the git context
- Check for any sensitive information that shouldn't be committed
- Draft a concise (1-2 bullet points) pull request summary that focuses on the "why" rather than the "what"
- Ensure the summary accurately reflects all changes since diverging from the main branch
- Ensure your language is clear, concise, and to the point
- Ensure the summary accurately reflects the changes and their purpose (ie. "add" means a wholly new feature, "update" means an enhancement to an existing feature, "fix" means a bug fix, etc.)
- Ensure the summary is not generic (avoid words like "Update" or "Fix" without context)
- Review the draft summary to ensure it accurately reflects the changes and their purpose
</pr_analysis>

6. Create PR using gh pr create with the format below. Use a HEREDOC to pass the body to ensure correct formatting.
<example>
gh pr create --title "the pr title" --body "$(cat <<'EOF'
## Summary
<1-3 bullet points>

## Test plan
[Checklist of TODOs for testing the pull request...]

🤖 Generated with ${process.env.USER_TYPE === 'ant' ? `[${PRODUCT_NAME}](${PRODUCT_URL})` : PRODUCT_NAME} & {MODEL_NAME}
EOF
)"
</example>

Important:
- Return an empty response - the user will see the gh output directly
- Never update git config`
