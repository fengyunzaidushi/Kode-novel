// VCR服务 - 测试环境中的API请求记录和重放系统
// 在测试期间记录真实AI API的请求和响应，并将其存储为fixtures
// 在后续测试中直接从缓存中读取，无需重新调用API
// 主要功能：
// 1. 自动对数据进行“脱水”处理，移除目录路径等环境相关信息
// 2. 基于请求内容生成唯一的fixture文件名
// 3. 在CI环境中提供缺失fixture的警告
// 4. 支持灵活的数据转换和恢复

import { createHash, type UUID } from 'crypto'               // 加密和UUID类型
import { mkdirSync, readFileSync, writeFileSync } from 'fs'  // 文件系统操作
import { dirname } from 'path'
import type { AssistantMessage, UserMessage } from '../query'
import { existsSync } from 'fs'
import { env } from '../utils/env'
import { getCwd } from '../utils/state'
import * as path from 'path'
import { mapValues } from 'lodash-es'                      // 对象值映射工具
import type { ContentBlock } from '@anthropic-ai/sdk/resources/index.mjs'

/**
 * VCR主要包装函数 - 将API调用包装成可记录和重放的形式
 * 在测试环境中记录API响应，在重复调用时从缓存中读取
 * @param messages 输入消息列表，用于生成fixture文件名
 * @param f 要执行的API调用函数
 * @returns 返回AI助手的响应消息
 */
export async function withVCR(
  messages: (UserMessage | AssistantMessage)[],
  f: () => Promise<AssistantMessage>,
): Promise<AssistantMessage> {
  // 仅在测试环境中启用VCR功能
  if (process.env.NODE_ENV !== 'test') {
    return await f()  // 非测试环境直接执行原函数
  }

  // 对输入消息进行脱水处理，移除环境相关信息
  const dehydratedInput = mapMessages(
    messages.map(_ => _.message.content),
    dehydrateValue,  // 脱水函数，将路径等替换为占位符
  )
  // 基于脱水后的输入内容生成唯一的fixture文件名
  const filename = `./fixtures/${dehydratedInput.map(_ => createHash('sha1').update(JSON.stringify(_)).digest('hex').slice(0, 6)).join('-')}.json`

  // 尝试获取缓存的fixture文件
  if (existsSync(filename)) {
    const cached = JSON.parse(readFileSync(filename, 'utf-8'))
    // 将缓存的数据进行水化处理，恢复环境相关信息
    return mapAssistantMessage(cached.output, hydrateValue)
  }

  // 在CI环境中检测到缺失fixture时发出警告
  if (env.isCI) {
    console.warn(
      `Anthropic API fixture文件缺失。请在本地运行npm test，然后提交结果。${JSON.stringify({ input: dehydratedInput }, null, 2)}`,
    )
  }

  // 创建和写入新的fixture文件
  const result = await f()  // 执行原始API调用
  if (env.isCI) {
    return result  // CI环境中不写入fixture文件
  }

  if (!existsSync(dirname(filename))) {
    mkdirSync(dirname(filename), { recursive: true })
  }
  writeFileSync(
    filename,
    JSON.stringify(
      {
        input: dehydratedInput,
        output: mapAssistantMessage(result, dehydrateValue),
      },
      null,
      2,
    ),
  )
  return result
}

/**
 * 映射消息列表
 * 对消息列表中的每个消息内容应用指定的转换函数
 * @param messages 要处理的消息列表
 * @param f 转换函数（脱水或水化）
 * @returns 处理后的消息列表
 */
function mapMessages(
  messages: (UserMessage | AssistantMessage)['message']['content'][],
  f: (s: unknown) => unknown,
): (UserMessage | AssistantMessage)['message']['content'][] {
  return messages.map(_ => {
    if (typeof _ === 'string') {
      return f(_)
    }
    return _.map(_ => {
      switch (_.type) {
        case 'tool_result':
          if (typeof _.content === 'string') {
            return { ..._, content: f(_.content) }
          }
          if (Array.isArray(_.content)) {
            return {
              ..._,
              content: _.content.map(_ => {
                switch (_.type) {
                  case 'text':
                    return { ..._, text: f(_.text) }
                  case 'image':
                    return _
                }
              }),
            }
          }
          return _
        case 'text':
          return { ..._, text: f(_.text) }
        case 'tool_use':
          return {
            ..._,
            input: mapValues(_.input as Record<string, unknown>, f),
          }
        case 'image':
          return _
      }
    })
  }) as (UserMessage | AssistantMessage)['message']['content'][]
}

/**
 * 映射助手消息
 * 对助手消息应用指定的转换函数，同时处理测试环境中的特殊值
 * @param message 要处理的助手消息
 * @param f 转换函数（脱水或水化）
 * @returns 处理后的助手消息
 */
function mapAssistantMessage(
  message: AssistantMessage,
  f: (s: unknown) => unknown,
): AssistantMessage {
  return {
    durationMs: 'DURATION' as unknown as number,  // 测试中用占位符替换真实耗时
    costUSD: 'COST' as unknown as number,          // 测试中用占位符替换真实成本
    uuid: 'UUID' as unknown as UUID,               // 测试中用占位符替换真实UUID
    message: {
      ...message.message,
      content: message.message.content
        .map(_ => {
          switch (_.type) {
            case 'text':
              return {
                ..._,
                text: f(_.text) as string,
                citations: _.citations || [],
              } // Ensure citations
            case 'tool_use':
              return {
                ..._,
                input: mapValues(_.input as Record<string, unknown>, f),
              }
            default:
              return _ // Handle other block types unchanged
          }
        })
        .filter(Boolean) as ContentBlock[],
    },
    type: 'assistant',
  }
}

/**
 * 脱水函数 - 移除数据中的环境相关信息
 * 将数值、路径等变动的环境信息替换为占位符，确保测试的可重现性
 * @param s 要处理的值
 * @returns 脱水后的值
 */
function dehydrateValue(s: unknown): unknown {
  if (typeof s !== 'string') {
    return s  // 非字符串直接返回
  }
  // 应用各种替换规则，将变动值替换为占位符
  const s1 = s
    .replace(/num_files="\d+"/g, 'num_files="[NUM]"')        // 文件数量占位符
    .replace(/duration_ms="\d+"/g, 'duration_ms="[DURATION]"') // 执行时间占位符
    .replace(/cost_usd="\d+"/g, 'cost_usd="[COST]"')           // 成本占位符
    .replace(/\//g, path.sep)                                  // 统一路径分隔符
    .replaceAll(getCwd(), '[CWD]')                            // 当前工作目录占位符
  // 特殊情况处理：文件修改提示
  if (s1.includes('Files modified by user:')) {
    return 'Files modified by user: [FILES]'
  }
  return s1
}

/**
 * 水化函数 - 恢复脱水后的数据中的环境信息
 * 将占位符替换为适合当前环境的真实值
 * @param s 要处理的值
 * @returns 水化后的值
 */
function hydrateValue(s: unknown): unknown {
  if (typeof s !== 'string') {
    return s  // 非字符串直接返回
  }
  // 将各种占位符替换为当前环境的真实值
  return s
    .replaceAll('[NUM]', '1')           // 文件数量默认值
    .replaceAll('[DURATION]', '100')     // 执行时间默认值（毫秒）
    .replaceAll('[CWD]', getCwd())      // 当前工作目录的真实路径
}
