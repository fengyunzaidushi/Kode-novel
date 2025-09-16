/**
 * 🎯 宏定义常量 - 动态版本和 URL 配置
 *
 * 🏗️ 核心功能：
 * - 从 package.json 动态获取版本信息
 * - 提供文档和包管理的 URL 链接
 * - 统一的错误报告和帮助信息
 * - 支持构建时的动态配置注入
 *
 * 🔄 依赖关系：
 * - 上游：被版本显示和帮助系统使用
 * - 下游：依赖 package.json 和 ES 模块系统
 *
 * 📊 使用场景：
 * - 版本信息显示和检查
 * - 帮助文档链接生成
 * - 错误报告引导
 * - 包管理器链接构建
 *
 * 🔧 技术实现：
 * - 使用 ES 模块的 createRequire 加载 JSON
 * - 动态读取 package.json 版本信息
 * - 提供统一的 URL 和消息模板
 * - 支持构建时的配置替换
 */

import { createRequire } from 'module'

/** 创建 require 函数以兼容 ES 模块环境 */
const require = createRequire(import.meta.url)
/** 加载项目 package.json 配置 */
const pkg = require('../../package.json')

/**
 * 宏常量对象 - 包含动态配置和静态 URL
 *
 * 提供版本信息、文档链接和错误报告模板，
 * 确保整个应用中的信息一致性。
 */
export const MACRO = {
  /** 项目版本号 - 从 package.json 动态获取 */
  VERSION: pkg.version,
  /** README 文档 URL - Claude Code 官方文档链接 */
  README_URL: 'https://docs.anthropic.com/s/claude-code',
  /** 包名称 - npm 包的标识符 */
  PACKAGE_URL: '@shareai-lab/kode',
  /** 问题报告说明 - 引导用户报告问题的标准消息 */
  ISSUES_EXPLAINER: 'report the issue at https://github.com/shareAI-lab/kode/issues',
}
