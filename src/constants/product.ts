/**
 * 🎯 产品信息常量定义 - Kode 项目核心配置
 *
 * 🏗️ 核心功能：
 * - 定义产品的基本信息和标识
 * - 配置项目的 URL 和文件路径
 * - 提供统一的产品命名和配置
 * - 包含品牌标识和 ASCII 艺术字
 *
 * 🔄 依赖关系：
 * - 上游：被整个应用的配置系统使用
 * - 下游：无外部依赖，提供基础配置
 *
 * 📊 使用场景：
 * - 应用启动时的品牌显示
 * - 配置文件的路径定义
 * - 帮助信息和错误报告
 * - GitHub 集成和问题跟踪
 *
 * 🔧 技术实现：
 * - 提供不可变的产品常量
 * - 集中管理所有产品相关信息
 * - 支持命令行工具的品牌识别
 * - ASCII 艺术字增强终端体验
 */

/** 产品名称 - 应用的官方名称 */
export const PRODUCT_NAME = 'Kode'

/** 产品 URL - GitHub 仓库地址 */
export const PRODUCT_URL = 'https://github.com/shareAI-lab/Anykode'

/** 项目文件 - 代理配置文件名 */
export const PROJECT_FILE = 'AGENTS.md'

/** 产品命令 - CLI 工具的命令名称 */
export const PRODUCT_COMMAND = 'kode'

/** 配置基础目录 - 用户配置文件夹名 */
export const CONFIG_BASE_DIR = '.kode'

/** 配置文件名 - 主配置文件名称 */
export const CONFIG_FILE = '.kode.json'

/** GitHub 问题仓库 URL - 用于问题报告和反馈 */
export const GITHUB_ISSUES_REPO_URL =
  'https://github.com/shareAI-lab/Anykode/issues'

/**
 * ASCII 艺术字 Logo - 终端界面的品牌标识
 *
 * 用于应用启动时的欢迎界面和帮助信息显示，
 * 提供专业的命令行工具视觉体验。
 */
export const ASCII_LOGO = `
  _                     _       _  __              _
 | |       __ _   ___  | |_    | |/ /   ___     __| |   ___
 | |      / _\` | / __| | __|   | ' /   / _ \\   / _\` |  / _ \\
 | |___  | (_| | \\__ \\ | |_    | . \\  | (_) | | (_| | |  __/
 |_____|  \\__,_| |___/  \\__|   |_|\\_\\  \\___/   \\__,_|  \\___|

`
