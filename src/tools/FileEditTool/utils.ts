/**
 * 🎯 FileEditTool 工具函数集 - 文件编辑的核心实用工具
 *
 * 🏗️ 核心功能：
 * - 提供文件编辑操作的底层实现逻辑
 * - 实现精确的字符串替换和差异计算
 * - 支持新文件创建和现有文件修改
 * - 集成智能的换行符处理机制
 * - 生成详细的编辑操作差异报告
 *
 * 🔄 依赖关系：
 * - 上游：被 FileEditTool 主工具调用
 * - 下游：依赖文件系统、编码检测、差异计算
 *
 * 📊 使用场景：
 * - 代码文件的精确行级编辑
 * - 配置文件的键值对修改
 * - 文档内容的局部更新
 * - 批量文本替换操作
 *
 * 🔧 技术实现：
 * - 路径解析：支持相对路径和绝对路径
 * - 编码保持：自动检测和保持原文件编码
 * - 智能替换：处理边界情况和换行符
 * - 差异生成：创建可视化的修改对比
 *
 * 💡 设计原则：
 * - 非破坏性：不直接修改磁盘文件
 * - 精确性：确保替换操作的准确性
 * - 可预览：生成完整的修改差异
 * - 容错性：优雅处理各种边界情况
 */
import { isAbsolute, resolve } from 'path'
import { getCwd } from '../../utils/state'
import { readFileSync } from 'fs'
import { detectFileEncoding } from '../../utils/file'
import { type Hunk } from 'diff'
import { getPatch } from '../../utils/diff'

/**
 * 应用文件编辑操作并返回差异和更新后的文件内容
 *
 * 这是文件编辑系统的核心函数，负责安全地执行文本替换操作，
 * 生成详细的修改差异，但不直接写入磁盘文件。
 *
 * @param file_path - 目标文件路径（支持相对路径和绝对路径）
 * @param old_string - 要被替换的原始文本内容
 * @param new_string - 替换后的新文本内容
 * @returns 包含差异信息和更新文件内容的对象
 *
 * 🔄 编辑流程详解：
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    文件编辑处理流程                          │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 1. 路径规范化  │ • 转换为绝对路径                          │
 * │               │ • 确保路径的一致性和安全性                │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 2. 操作类型识别│ • 新文件创建 (old_string == '')           │
 * │               │ • 现有文件编辑 (old_string != '')         │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 3. 文件内容处理│ • 自动编码检测                            │
 * │               │ • 智能换行符处理                           │
 * │               │ • 精确文本替换                             │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 4. 结果验证    │ • 检查替换操作是否生效                    │
 * │               │ • 防止无效编辑操作                         │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 5. 差异生成    │ • 创建可视化差异对比                      │
 * │               │ • 生成结构化补丁信息                       │
 * └─────────────────────────────────────────────────────────────┘
 *
 * 💡 特殊处理逻辑：
 * - 新文件创建：old_string 为空时，直接使用 new_string 作为文件内容
 * - 删除操作：new_string 为空时，智能处理换行符以避免空行问题
 * - 换行符优化：自动检测并处理行尾换行符的边界情况
 * - 失败检测：验证替换是否成功，防止静默失败
 *
 * 🚫 安全特性：
 * - 非破坏性：不直接修改磁盘文件
 * - 原子性：要么完全成功，要么完全失败
 * - 可预览：返回完整差异供用户确认
 * - 错误处理：明确的失败原因反馈
 */
export function applyEdit(
  file_path: string,
  old_string: string,
  new_string: string,
): { patch: Hunk[]; updatedFile: string } {
  /**
   * 🛣️ 步骤 1：路径规范化处理
   * 将输入的文件路径转换为绝对路径，确保路径解析的一致性。
   * 支持相对路径（基于当前工作目录）和绝对路径。
   */
  const fullFilePath = isAbsolute(file_path)
    ? file_path
    : resolve(getCwd(), file_path)

  /**
   * 📝 步骤 2：文件内容变量初始化
   * 准备存储原始文件内容和编辑后的文件内容
   */
  let originalFile
  let updatedFile

  /**
   * 🆕 步骤 3：编辑操作类型判断和处理
   * 根据 old_string 是否为空来区分新文件创建和现有文件编辑
   */
  if (old_string === '') {
    /**
     * 📄 新文件创建模式
     * 当 old_string 为空时，表示这是一个新文件创建操作
     * 直接使用 new_string 作为完整的文件内容
     */
    originalFile = ''
    updatedFile = new_string
  } else {
    /**
     * ✏️ 现有文件编辑模式
     * 处理对已存在文件的编辑操作
     */

    /**
     * 🔍 自动编码检测
     * 检测目标文件的字符编码，确保正确读取文件内容
     * 这对于处理不同编码的文件（UTF-8, GBK, Latin-1等）至关重要
     */
    const enc = detectFileEncoding(fullFilePath)
    originalFile = readFileSync(fullFilePath, enc)

    /**
     * 🗑️ 智能删除操作处理
     * 当 new_string 为空时，表示删除操作
     * 需要特别处理换行符，避免产生不必要的空行
     */
    if (new_string === '') {
      if (
        !old_string.endsWith('\n') &&
        originalFile.includes(old_string + '\n')
      ) {
        /**
         * 🔧 智能换行符处理
         * 如果要删除的文本后面有换行符，且原文本不以换行符结尾，
         * 则连同换行符一起删除，避免留下空行
         */
        updatedFile = originalFile.replace(old_string + '\n', () => new_string)
      } else {
        /**
         * 📝 标准删除操作
         * 直接删除指定文本，保持原有的换行符结构
         */
        updatedFile = originalFile.replace(old_string, () => new_string)
      }
    } else {
      /**
       * 🔄 标准替换操作
       * 将指定的 old_string 替换为 new_string
       * 使用函数形式的 replace 确保特殊字符的正确处理
       */
      updatedFile = originalFile.replace(old_string, () => new_string)
    }

    /**
     * ✅ 编辑结果验证
     * 检查替换操作是否实际生效，防止静默失败
     * 如果文件内容完全相同，说明替换操作没有找到目标字符串
     */
    if (updatedFile === originalFile) {
      throw new Error(
        'Original and edited file match exactly. Failed to apply edit.',
      )
    }
  }

  /**
   * 📊 步骤 4：差异计算和补丁生成
   * 生成详细的文件修改差异信息，用于：
   * - 用户预览修改内容
   * - 界面显示修改摘要
   * - 版本控制集成
   * - 撤销操作支持
   */
  const patch = getPatch({
    filePath: file_path,
    fileContents: originalFile,
    oldStr: originalFile,
    newStr: updatedFile,
  })

  /**
   * 📦 返回编辑结果
   * 返回包含差异信息和更新后文件内容的完整结果对象
   */
  return { patch, updatedFile }
}
