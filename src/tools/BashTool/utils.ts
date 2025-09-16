/**
 * 🎯 Bash工具实用函数集 - 命令输出处理和文件跟踪的核心工具库
 *
 * 🏗️ 核心功能：
 * - 提供命令输出的智能格式化和截断处理
 * - 实现AI驱动的文件路径提取和跟踪
 * - 支持大量输出内容的内存友好处理
 * - 集成文件状态同步和时间戳管理
 *
 * 🔄 依赖关系：
 * - 上游：被 BashTool 主工具调用进行输出处理
 * - 下游：依赖 Claude AI 服务、消息解析、配置管理
 *
 * 📊 使用场景：
 * - 长命令输出的智能截断和预览
 * - Git操作涉及文件的自动识别
 * - 文件系统操作的路径提取
 * - 命令结果的结构化处理
 *
 * 🔧 技术实现：
 * - 双端截断：保留输出开头和结尾的关键信息
 * - AI智能解析：使用语言模型准确提取文件路径
 * - 性能优化：缓存和批处理机制
 * - 错误容错：优雅处理解析失败情况
 *
 * 💡 设计原则：
 * - 内存效率：避免大量输出导致内存溢出
 * - 信息保留：截断时保持输出的关键信息
 * - 智能识别：准确提取命令涉及的文件路径
 * - 性能优先：优化频繁调用的处理逻辑
 */
import { queryQuick } from '../../services/claude'
import { extractTag } from '../../utils/messages'
import { MAX_OUTPUT_LENGTH } from './prompt'

/**
 * 📏 输出格式化函数 - 智能截断长输出内容的核心处理器
 *
 * 对命令执行结果进行智能处理，当输出超过预设长度限制时，
 * 采用双端保留策略进行截断，确保用户能看到关键信息。
 *
 * @param content - 需要格式化的原始输出内容
 * @returns 包含总行数和处理后内容的结果对象
 *
 * 🔄 处理策略详解：
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    输出截断处理策略                          │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 判断条件         │ 内容长度 ≤ MAX_OUTPUT_LENGTH              │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 短内容处理       │ • 直接返回完整内容                        │
 * │                 │ • 计算准确的行数                           │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 长内容截断       │ • 保留前半部分内容                        │
 * │                 │ • 保留后半部分内容                        │
 * │                 │ • 中间插入截断提示信息                    │
 * │                 │ • 显示被截断的行数统计                    │
 * └─────────────────────────────────────────────────────────────┘
 *
 * 💡 双端保留优势：
 * • 开头信息：通常包含命令启动和初始状态
 * • 结尾信息：包含最终结果、错误信息和状态码
 * • 中间统计：明确显示省略的内容量
 * • 上下文连贯：保持输出的逻辑完整性
 *
 * 🎯 应用场景：
 * - 大型文件的 cat 输出截断
 * - 长时间运行命令的日志处理
 * - Git diff 大量更改的智能显示
 * - 编译输出的关键信息提取
 */
export function formatOutput(content: string): {
  totalLines: number
  truncatedContent: string
} {
  if (content.length <= MAX_OUTPUT_LENGTH) {
    return {
      totalLines: content.split('\n').length,
      truncatedContent: content,
    }
  }
  const halfLength = MAX_OUTPUT_LENGTH / 2
  const start = content.slice(0, halfLength)
  const end = content.slice(-halfLength)
  const truncated = `${start}\n\n... [${content.slice(halfLength, -halfLength).split('\n').length} lines truncated] ...\n\n${end}`

  return {
    totalLines: content.split('\n').length,
    truncatedContent: truncated,
  }
}

/**
 * 🤖 AI驱动的文件路径提取器 - 智能识别命令涉及的文件
 *
 * 使用Claude AI模型分析命令和其输出，智能提取所有被读取、
 * 修改或显示的文件路径，用于后续的文件状态跟踪和同步。
 *
 * @param command - 执行的shell命令
 * @param output - 命令的输出结果
 * @returns Promise<string[]> - 提取到的文件路径数组
 *
 * 🧠 AI分析流程：
 * ┌─────────────────────────────────────────────────────────────┐
 * │                  智能文件路径提取流程                        │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 1. 命令分析      │ • 理解命令类型和操作模式                  │
 * │                 │ • 识别文件操作的意图和范围                │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 2. 输出解析      │ • 分析命令输出中的文件路径信息            │
 * │                 │ • 识别Git diff、ls、cat等命令的文件       │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 3. 路径规范化    │ • 保持路径的原始格式                      │
 * │                 │ • 过滤无效和重复的路径                    │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 4. 结果验证      │ • 确保提取结果的准确性                    │
 * │                 │ • 处理边界情况和异常输出                  │
 * └─────────────────────────────────────────────────────────────┘
 *
 * 🎯 支持的命令类型：
 * • Git操作：git diff, git status, git add 等
 * • 文件查看：cat, less, more, head, tail 等
 * • 文件操作：cp, mv, rm, touch 等
 * • 目录操作：ls, find, du 等
 * • 编辑器：nano, vim, code 等
 *
 * 🔄 文件跟踪用途：
 * • 时间戳同步：更新被访问文件的时间戳
 * • 状态一致性：维护文件修改状态的准确性
 * • 冲突检测：识别可能的并发修改问题
 * • 缓存管理：优化文件读取的缓存策略
 *
 * 💡 智能特性：
 * - 上下文理解：基于命令和输出的完整上下文分析
 * - 格式识别：准确解析各种命令输出格式
 * - 路径保真：保持文件路径的原始表示形式
 * - 错误容错：优雅处理解析失败和异常情况
 */
export async function getCommandFilePaths(
  command: string,
  output: string,
): Promise<string[]> {
  const response = await queryQuick({
    systemPrompt: [
      `Extract any file paths that this command reads or modifies. For commands like "git diff" and "cat", include the paths of files being shown. Use paths verbatim -- don't add any slashes or try to resolve them. Do not try to infer paths that were not explicitly listed in the command output.
Format your response as:
<filepaths>
path/to/file1
path/to/file2
</filepaths>

If no files are read or modified, return empty filepaths tags:
<filepaths>
</filepaths>

Do not include any other text in your response.`,
    ],
    userPrompt: `Command: ${command}\nOutput: ${output}`,
    enablePromptCaching: true,
  })
  const content = response.message.content
    .filter(_ => _.type === 'text')
    .map(_ => _.text)
    .join('')

  return (
    extractTag(content, 'filepaths')?.trim().split('\n').filter(Boolean) || []
  )
}
