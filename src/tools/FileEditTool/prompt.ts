/**
 * 🎯 文件编辑工具提示配置 - 精确文件修改的 AI 指令模板
 *
 * 🏗️ 核心功能：
 * - 定义单文件精确编辑的操作规范
 * - 提供严格的上下文匹配和唯一性要求
 * - 集成文件验证和安全检查流程
 * - 支持新文件创建和现有文件修改
 * - 确保编辑操作的原子性和准确性
 *
 * 🔄 依赖关系：
 * - 上游：被 FileEditTool 使用作为操作指导
 * - 下游：依赖其他工具（Notebook、LS、View 等）
 *
 * 📊 使用场景：
 * - 代码文件的精确修改和重构
 * - 配置文件的局部更新
 * - 文档内容的定点编辑
 * - 小规模的文件内容调整
 *
 * 🔧 技术实现：
 * - 唯一性匹配：确保编辑目标的精确定位
 * - 上下文要求：严格的前后文本匹配
 * - 原子操作：单次调用单次修改原则
 * - 安全验证：文件路径和内容完整性检查
 *
 * 💡 设计原则：
 * - 精确性优先：严格的文本匹配要求
 * - 安全可控：完善的验证和错误处理
 * - 工具协同：与其他文件工具的职责分工
 * - 用户友好：清晰的使用指导和错误提示
 */
import { NotebookEditTool } from '../NotebookEditTool/NotebookEditTool'

/**
 * 文件编辑工具的主要描述和使用指导
 *
 * 定义了精确文件编辑的完整流程，包括预检查、匹配要求、
 * 编辑执行和后续验证的详细说明。
 *
 * 🎯 核心要求：
 * - 唯一性：old_string 必须在文件中唯一匹配
 * - 精确性：包含足够的上下文确保准确定位
 * - 原子性：单次调用只处理一个编辑实例
 * - 安全性：完整的路径和内容验证
 */
export const DESCRIPTION = `This is a tool for editing files. For moving or renaming files, you should generally use the Bash tool with the 'mv' command instead. For larger edits, use the Write tool to overwrite files. For Jupyter notebooks (.ipynb files), use the ${NotebookEditTool.name} instead.

Before using this tool:

1. Use the View tool to understand the file's contents and context

2. Verify the directory path is correct (only applicable when creating new files):
   - Use the LS tool to verify the parent directory exists and is the correct location

To make a file edit, provide the following:
1. file_path: The absolute path to the file to modify (must be absolute, not relative)
2. old_string: The text to replace (must be unique within the file, and must match the file contents exactly, including all whitespace and indentation)
3. new_string: The edited text to replace the old_string

The tool will replace ONE occurrence of old_string with new_string in the specified file.

CRITICAL REQUIREMENTS FOR USING THIS TOOL:

1. UNIQUENESS: The old_string MUST uniquely identify the specific instance you want to change. This means:
   - Include AT LEAST 3-5 lines of context BEFORE the change point
   - Include AT LEAST 3-5 lines of context AFTER the change point
   - Include all whitespace, indentation, and surrounding code exactly as it appears in the file

2. SINGLE INSTANCE: This tool can only change ONE instance at a time. If you need to change multiple instances:
   - Make separate calls to this tool for each instance
   - Each call must uniquely identify its specific instance using extensive context

3. VERIFICATION: Before using this tool:
   - Check how many instances of the target text exist in the file
   - If multiple instances exist, gather enough context to uniquely identify each one
   - Plan separate tool calls for each instance

WARNING: If you do not follow these requirements:
   - The tool will fail if old_string matches multiple locations
   - The tool will fail if old_string doesn't match exactly (including whitespace)
   - You may change the wrong instance if you don't include enough context

When making edits:
   - Ensure the edit results in idiomatic, correct code
   - Do not leave the code in a broken state
   - Always use absolute file paths (starting with /)

If you want to create a new file, use:
   - A new file path, including dir name if needed
   - An empty old_string
   - The new file's contents as new_string

Remember: when making multiple file edits in a row to the same file, you should prefer to send all edits in a single message with multiple calls to this tool, rather than multiple messages with a single call each.
`
