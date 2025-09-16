/**
 * 🎯 内存写入工具实现 - AI 代理持久化记忆的核心工具
 *
 * 🏗️ 核心功能：
 * - 提供 AI 代理的持久化记忆存储能力
 * - 支持跨会话的知识和经验保存
 * - 集成代理级别的内存空间隔离
 * - 实现安全的文件路径验证和保护
 * - 生成简洁的内存操作结果反馈
 *
 * 🔄 依赖关系：
 * - 上游：被 AI 代理调用进行记忆存储操作
 * - 下游：依赖文件系统、代理存储、文件监控
 *
 * 📊 使用场景：
 * - 长期项目的知识积累和经验保存
 * - 代理学习结果的持久化存储
 * - 跨会话的上下文和状态维护
 * - 个性化配置和偏好设置保存
 *
 * 🔧 技术实现：
 * - 代理隔离：每个代理独立的内存存储空间
 * - 路径验证：严格的文件路径安全检查
 * - 目录管理：自动创建和管理内存目录结构
 * - 编码统一：统一使用 UTF-8 编码格式
 * - 监控集成：集成文件变更跟踪和监控
 *
 * 💡 设计原则：
 * - 安全隔离：确保代理间的内存空间独立
 * - 持久可靠：保证记忆数据的长期存储
 * - 简洁高效：轻量级的内存操作接口
 * - 扩展灵活：支持各种类型的记忆内容
 */
import { mkdirSync, writeFileSync } from 'fs'
import { Box, Text } from 'ink'
import { dirname, join } from 'path'
import * as React from 'react'
import { z } from 'zod'
import { FallbackToolUseRejectedMessage } from '../../components/FallbackToolUseRejectedMessage'
import { Tool } from '../../Tool'
import { MEMORY_DIR } from '../../utils/env'
import { resolveAgentId } from '../../utils/agentStorage'
import { recordFileEdit } from '../../services/fileFreshness'
import { DESCRIPTION, PROMPT } from './prompt'

const inputSchema = z.strictObject({
  file_path: z.string().describe('Path to the memory file to write'),
  content: z.string().describe('Content to write to the file'),
})

export const MemoryWriteTool = {
  name: 'MemoryWrite',
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  inputSchema,
  userFacingName() {
    return 'Write Memory'
  },
  async isEnabled() {
    // TODO: Use a statsig gate
    // TODO: Figure out how to do that without regressing app startup perf
    return false
  },
  isReadOnly() {
    return false
  },
  isConcurrencySafe() {
    return false // MemoryWrite modifies state, not safe for concurrent execution
  },
  needsPermissions() {
    return false
  },
  renderResultForAssistant(content) {
    return content
  },
  renderToolUseMessage(input) {
    return Object.entries(input)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join(', ')
  },
  renderToolUseRejectedMessage() {
    return <FallbackToolUseRejectedMessage />
  },
  renderToolResultMessage() {
    return (
      <Box justifyContent="space-between" overflowX="hidden" width="100%">
        <Box flexDirection="row">
          <Text>{'  '}⎿ Updated memory</Text>
        </Box>
      </Box>
    )
  },
  async validateInput({ file_path }, context) {
    const agentId = resolveAgentId(context?.agentId)
    const agentMemoryDir = join(MEMORY_DIR, 'agents', agentId)
    const fullPath = join(agentMemoryDir, file_path)
    if (!fullPath.startsWith(agentMemoryDir)) {
      return { result: false, message: 'Invalid memory file path' }
    }
    return { result: true }
  },
  async *call({ file_path, content }, context) {
    const agentId = resolveAgentId(context?.agentId)
    const agentMemoryDir = join(MEMORY_DIR, 'agents', agentId)
    const fullPath = join(agentMemoryDir, file_path)
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, content, 'utf-8')

    // Record Agent edit operation for file freshness tracking
    recordFileEdit(fullPath, content)

    yield {
      type: 'result',
      data: 'Saved',
      resultForAssistant: 'Saved',
    }
  },
} satisfies Tool<typeof inputSchema, string>
