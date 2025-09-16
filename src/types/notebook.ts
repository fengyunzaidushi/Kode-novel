/**
 * 🎯 Jupyter 笔记本功能类型定义 - 完整的笔记本处理框架
 *
 * 🏗️ 核心功能：
 * - 支持完整的 Jupyter 笔记本结构解析
 * - 处理代码和 Markdown 单元格类型
 * - 管理单元格输出和执行结果
 * - 提供图像输出的完整支持
 *
 * 🔄 依赖关系：
 * - 上游：被 NotebookReadTool 和 NotebookEditTool 使用
 * - 下游：兼容标准 .ipynb 文件格式
 *
 * 📊 使用场景：
 * - 读取和编辑 Jupyter 笔记本文件
 * - 执行代码单元格并收集输出
 * - 显示图像和富文本输出
 * - 笔记本内容的结构化处理
 *
 * 🔧 技术实现：
 * - 完全兼容 Jupyter 笔记本 v4 格式
 * - 支持多种输出类型和媒体格式
 * - 区分原始数据和处理后的显示格式
 * - 类型安全的单元格操作接口
 */

/**
 * 有效的笔记本单元格类型
 *
 * - `code`: 代码单元格，可执行并产生输出
 * - `markdown`: Markdown 文档单元格，用于文档和说明
 */
export type NotebookCellType = 'code' | 'markdown'

/**
 * 笔记本输出图像结构 - 支持的图像格式和数据
 */
export interface NotebookOutputImage {
  /** Base64 编码的图像数据 */
  image_data: string
  /** 图像的 MIME 类型 */
  media_type: 'image/png' | 'image/jpeg'
}

/**
 * 处理后的笔记本单元格输出 - 用于显示的标准化输出格式
 */
export interface NotebookCellSourceOutput {
  /** 输出类型：流输出、执行结果、显示数据或错误 */
  output_type: 'stream' | 'execute_result' | 'display_data' | 'error'
  /** 文本输出内容 */
  text?: string
  /** 图像输出内容 */
  image?: NotebookOutputImage
}

/**
 * 处理后的笔记本单元格结构 - 工具使用的标准化单元格格式
 */
export interface NotebookCellSource {
  /** 单元格索引位置 */
  cell: number
  /** 单元格类型 */
  cellType: NotebookCellType
  /** 单元格源代码或 Markdown 内容 */
  source: string
  /** 编程语言（对代码单元格） */
  language: string
  /** 执行计数器（代码单元格） */
  execution_count?: number | null
  /** 单元格输出列表 */
  outputs?: NotebookCellSourceOutput[]
}

/**
 * 原始笔记本单元格输出 - 直接来自 .ipynb 文件的输出格式
 */
export interface NotebookCellOutput {
  /** 输出类型：流输出、执行结果、显示数据或错误 */
  output_type: 'stream' | 'execute_result' | 'display_data' | 'error'
  /** 流输出的名称（如 stdout、stderr） */
  name?: string
  /** 文本输出内容，可能为字符串或字符串数组 */
  text?: string | string[]
  /** 输出数据字典，包含各种 MIME 类型的内容 */
  data?: Record<string, unknown>
  /** 执行计数器（执行结果输出） */
  execution_count?: number | null
  /** 输出的元数据信息 */
  metadata?: Record<string, unknown>
  /** 错误名称（错误输出） */
  ename?: string
  /** 错误值（错误输出） */
  evalue?: string
  /** 错误堆栈跟踪（错误输出） */
  traceback?: string[]
}

/**
 * 原始笔记本单元格结构 - 直接来自 .ipynb 文件的单元格格式
 */
export interface NotebookCell {
  /** 单元格类型 */
  cell_type: NotebookCellType
  /** 单元格源内容，可能为字符串或字符串数组 */
  source: string | string[]
  /** 单元格元数据 */
  metadata: Record<string, unknown>
  /** 执行计数器（代码单元格） */
  execution_count?: number | null
  /** 单元格输出列表（代码单元格） */
  outputs?: NotebookCellOutput[]
  /** 单元格的唯一标识符 */
  id?: string
}

/**
 * 完整的笔记本结构 - 直接来自 .ipynb 文件的完整格式
 *
 * 这是标准 Jupyter 笔记本文件的根级结构，包含所有单元格、
 * 元数据和格式版本信息。
 */
export interface NotebookContent {
  /** 笔记本中的所有单元格 */
  cells: NotebookCell[]
  /** 笔记本级别的元数据 */
  metadata: {
    /** 内核规格信息 */
    kernelspec?: {
      /** 内核显示名称 */
      display_name?: string
      /** 内核编程语言 */
      language?: string
      /** 内核名称 */
      name?: string
    }
    /** 编程语言信息 */
    language_info?: {
      /** 语言名称 */
      name?: string
      /** 语言版本 */
      version?: string
      /** MIME 类型 */
      mimetype?: string
      /** 文件扩展名 */
      file_extension?: string
    }
    /** 其他元数据字段 */
    [key: string]: unknown
  }
  /** 笔记本格式版本号 */
  nbformat: number
  /** 笔记本格式次版本号 */
  nbformat_minor: number
}