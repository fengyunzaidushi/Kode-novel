/**
 * 🎯 配置管理组件 - Kode系统的交互式配置管理界面
 *
 * 配置管理架构：
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    配置管理系统架构                              │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ 配置加载 → 界面渲染 → 键盘交互 → 实时更新 → 配置保存           │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * 核心功能：
 * 1. 🔧 全局配置：主题、详细模式、流式响应等系统级设置
 * 2. 🤖 模型管理：显示已配置的AI模型和提供商信息
 * 3. ⌨️ 键盘导航：方向键导航，回车编辑，ESC退出
 * 4. 🎨 实时预览：配置更改立即生效并可视化反馈
 * 5. 💾 自动保存：退出时自动保存配置更改
 * 6. 🔤 类型安全：支持布尔、枚举、字符串、数字类型设置
 */

import { Box, Text, useInput } from 'ink'
import * as React from 'react'
import { useState } from 'react'
import figures from 'figures'
import { getTheme } from '../utils/theme'
import {
  GlobalConfig,
  saveGlobalConfig,
  getGlobalConfig,
} from '../utils/config.js'
import chalk from 'chalk'
import { useExitOnCtrlCD } from '../hooks/useExitOnCtrlCD'
import { getModelManager } from '../utils/model'

/**
 * 🎨 配置组件属性接口
 */
type Props = {
  /** ❌ 关闭回调 - 退出配置界面时调用 */
  onClose: () => void
}

/**
 * ⚙️ 设置项类型定义 - 支持多种配置数据类型的联合类型
 *
 * 支持的设置类型：
 * - boolean：开关类型（启用/禁用）
 * - enum：枚举类型（从预定义选项中选择）
 * - string：字符串类型（自由文本输入）
 * - number：数字类型（数值输入）
 */
type Setting =
  | {
      /** 🆔 设置唯一标识符 */
      id: string
      /** 📝 设置显示标签 */
      label: string
      /** ✅ 布尔值 - 当前开关状态 */
      value: boolean
      /** 🔄 变更回调 - 布尔值更改时调用 */
      onChange(value: boolean): void
      /** 🏷️ 类型标识 - 布尔类型 */
      type: 'boolean'
      /** 🚫 禁用状态 - 是否禁用编辑 */
      disabled?: boolean
    }
  | {
      /** 🆔 设置唯一标识符 */
      id: string
      /** 📝 设置显示标签 */
      label: string
      /** 📋 枚举值 - 当前选中的选项 */
      value: string
      /** 📋 可选项列表 - 所有可选择的枚举值 */
      options: string[]
      /** 🔄 变更回调 - 枚举值更改时调用 */
      onChange(value: string): void
      /** 🏷️ 类型标识 - 枚举类型 */
      type: 'enum'
      /** 🚫 禁用状态 - 是否禁用编辑 */
      disabled?: boolean
    }
  | {
      /** 🆔 设置唯一标识符 */
      id: string
      /** 📝 设置显示标签 */
      label: string
      /** 🔤 字符串值 - 当前文本内容 */
      value: string
      /** 🔄 变更回调 - 字符串更改时调用 */
      onChange(value: string): void
      /** 🏷️ 类型标识 - 字符串类型 */
      type: 'string'
      /** 🚫 禁用状态 - 是否禁用编辑 */
      disabled?: boolean
    }
  | {
      /** 🆔 设置唯一标识符 */
      id: string
      /** 📝 设置显示标签 */
      label: string
      /** 🔢 数字值 - 当前数值 */
      value: number
      /** 🔄 变更回调 - 数值更改时调用 */
      onChange(value: number): void
      /** 🏷️ 类型标识 - 数字类型 */
      type: 'number'
      /** 🚫 禁用状态 - 是否禁用编辑 */
      disabled?: boolean
    }

/**
 * 🎯 配置管理主组件 - 提供交互式的系统配置管理界面
 *
 * 组件状态管理：
 * 1. 📊 配置状态：globalConfig（当前配置）和initialConfig（初始配置）
 * 2. 🎯 导航状态：selectedIndex（当前选中的设置项索引）
 * 3. ✏️ 编辑状态：editingString（是否在编辑模式），currentInput（当前输入）
 * 4. ⚠️ 错误状态：inputError（输入验证错误信息）
 * 5. 🔄 退出状态：exitState（双击Ctrl+C退出逻辑）
 *
 * 键盘交互逻辑：
 * - ⬆️⬇️ 方向键：在设置项间导航
 * - ⏎ 回车键：编辑当前设置项
 * - 🔤 文本输入：实时更新输入内容
 * - ⌫ 退格键：删除输入字符
 * - ⎋ ESC键：取消编辑或退出配置界面
 *
 * 配置保存机制：
 * - 实时更新：布尔和枚举设置立即生效
 * - 延迟保存：字符串和数字设置在确认后保存
 * - 自动保存：退出时检查并保存所有更改
 *
 * @param props - 配置组件属性
 * @returns React节点 - 渲染的配置管理界面
 */
export function Config({ onClose }: Props): React.ReactNode {
  // 📊 配置状态管理：当前配置和初始配置对比
  const [globalConfig, setGlobalConfig] = useState(getGlobalConfig())
  const initialConfig = React.useRef(getGlobalConfig())

  // 🎯 界面导航状态：当前选中的设置项索引
  const [selectedIndex, setSelectedIndex] = useState(0)

  // 🔄 退出状态管理：防止意外退出的双击保护
  const exitState = useExitOnCtrlCD(() => process.exit(0))

  // ✏️ 文本编辑状态：输入模式和当前输入内容
  const [editingString, setEditingString] = useState(false)
  const [currentInput, setCurrentInput] = useState('')

  // ⚠️ 错误状态管理：输入验证错误提示
  const [inputError, setInputError] = useState<string | null>(null)

  // 🤖 模型管理器：获取已配置的AI模型信息
  const modelManager = getModelManager()
  const activeProfiles = modelManager.getAvailableModels()

  // ⚙️ 设置项配置数组：定义所有可配置的系统设置
  const settings: Setting[] = [
    // 🎨 主题设置：界面颜色主题（深色/浅色）
    {
      id: 'theme',
      label: 'Theme',
      value: globalConfig.theme ?? 'dark',
      options: ['dark', 'light'],
      onChange(theme: string) {
        const config = { ...getGlobalConfig(), theme: theme as any }
        saveGlobalConfig(config)
        setGlobalConfig(config)
      },
      type: 'enum',
    },
    // 📝 详细模式：是否显示详细的调试和状态信息
    {
      id: 'verbose',
      label: 'Verbose mode',
      value: globalConfig.verbose ?? false,
      onChange(verbose: boolean) {
        const config = { ...getGlobalConfig(), verbose }
        saveGlobalConfig(config)
        setGlobalConfig(config)
      },
      type: 'boolean',
    },
    // 🌊 流式响应：AI响应是否采用流式传输（实时显示）
    {
      id: 'stream',
      label: 'Stream responses',
      value: globalConfig.stream ?? true,
      onChange(stream: boolean) {
        const config = { ...getGlobalConfig(), stream }
        saveGlobalConfig(config)
        setGlobalConfig(config)
      },
      type: 'boolean',
    },
  ]

  // 🎨 主题管理器：获取当前界面主题配置
  const theme = getTheme()

  // ⌨️ 键盘输入处理器：处理所有用户交互和导航逻辑
  useInput((input, key) => {
    // ✏️ 文本编辑模式：处理字符串和数字类型设置的输入
    if (editingString) {
      // ⏎ 回车键：确认输入并保存设置
      if (key.return) {
        const currentSetting = settings[selectedIndex]

        // 🔤 字符串类型处理：直接保存输入内容
        if (currentSetting?.type === 'string') {
          try {
            currentSetting.onChange(currentInput)
            setEditingString(false)
            setCurrentInput('')
            setInputError(null)
          } catch (error) {
            setInputError(
              error instanceof Error ? error.message : 'Invalid input',
            )
          }
        }
        // 🔢 数字类型处理：验证数值格式并保存
        else if (currentSetting?.type === 'number') {
          const numValue = parseFloat(currentInput)
          if (isNaN(numValue)) {
            setInputError('Please enter a valid number')
          } else {
            try {
              ;(currentSetting as any).onChange(numValue)
              setEditingString(false)
              setCurrentInput('')
              setInputError(null)
            } catch (error) {
              setInputError(
                error instanceof Error ? error.message : 'Invalid input',
              )
            }
          }
        }
      }
      // ⎋ ESC键：取消编辑，恢复原始状态
      else if (key.escape) {
        setEditingString(false)
        setCurrentInput('')
        setInputError(null)
      }
      // ⌫ 退格/删除键：删除最后一个字符
      else if (key.delete || key.backspace) {
        setCurrentInput(prev => prev.slice(0, -1))
      }
      // 🔤 普通字符输入：追加到当前输入内容
      else if (input) {
        setCurrentInput(prev => prev + input)
      }
      return
    }

    // 🎯 导航模式：非编辑状态下的菜单导航和设置修改

    // ⬆️ 上箭头：向上导航到前一个设置项
    if (key.upArrow && !exitState.pending) {
      setSelectedIndex(prev => Math.max(0, prev - 1))
    }
    // ⬇️ 下箭头：向下导航到后一个设置项
    else if (key.downArrow && !exitState.pending) {
      setSelectedIndex(prev => Math.min(settings.length - 1, prev + 1))
    }
    // ⏎ 回车键：编辑当前选中的设置项
    else if (key.return && !exitState.pending) {
      const currentSetting = settings[selectedIndex]
      if (currentSetting?.disabled) return

      // ✅ 布尔类型：直接切换开关状态
      if (currentSetting?.type === 'boolean') {
        currentSetting.onChange(!currentSetting.value)
      }
      // 📋 枚举类型：循环切换到下一个选项
      else if (currentSetting?.type === 'enum') {
        const currentIndex = currentSetting.options.indexOf(
          currentSetting.value,
        )
        const nextIndex = (currentIndex + 1) % currentSetting.options.length
        currentSetting.onChange(currentSetting.options[nextIndex])
      }
      // 🔤🔢 字符串/数字类型：进入编辑模式
      else if (
        currentSetting?.type === 'string' ||
        currentSetting?.type === 'number'
      ) {
        setCurrentInput(String(currentSetting.value))
        setEditingString(true)
        setInputError(null)
      }
    }
    // ⎋ ESC键：退出配置界面（自动保存更改）
    else if (key.escape && !exitState.pending) {
      // 🔍 检查配置是否有变更：比较当前配置与初始配置
      const currentConfigString = JSON.stringify(getGlobalConfig())
      const initialConfigString = JSON.stringify(initialConfig.current)

      // 💾 自动保存：如果配置有变更，退出前自动保存
      if (currentConfigString !== initialConfigString) {
        saveGlobalConfig(getGlobalConfig())
      }

      // ❌ 关闭配置界面
      onClose()
    }
  })

  return (
    <Box flexDirection="column" gap={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.secondaryBorder}
        paddingX={2}
        paddingY={1}
        gap={1}
      >
        <Text bold>
          Configuration{' '}
          {exitState.pending
            ? `(press ${exitState.keyName} again to exit)`
            : ''}
        </Text>

        {/* Model Configuration Summary */}
        <Box flexDirection="column" marginY={1}>
          <Text bold color={theme.success}>
            Model Configuration:
          </Text>
          {activeProfiles.length === 0 ? (
            <Text color={theme.secondaryText}>
              No models configured. Use /model to add models.
            </Text>
          ) : (
            <Box flexDirection="column" marginLeft={2}>
              {activeProfiles.map(profile => (
                <React.Fragment key={profile.modelName}>
                  <Text color={theme.secondaryText}>
                    • {profile.name} ({profile.provider})
                  </Text>
                </React.Fragment>
              ))}
              <Box marginTop={1}>
                <Text color={theme.suggestion}>
                  Use /model to manage model configurations
                </Text>
              </Box>
            </Box>
          )}
        </Box>

        {/* Settings List */}
        <Box flexDirection="column">
          {settings.map((setting, index) => (
            <Box key={setting.id} flexDirection="column">
              <Box flexDirection="row" gap={1}>
                <Text
                  color={
                    index === selectedIndex
                      ? theme.success
                      : setting.disabled
                        ? theme.secondaryText
                        : theme.text
                  }
                >
                  {index === selectedIndex ? figures.pointer : ' '}{' '}
                  {setting.label}
                </Text>
                <Text
                  color={
                    setting.disabled ? theme.secondaryText : theme.suggestion
                  }
                >
                  {setting.type === 'boolean'
                    ? setting.value
                      ? 'enabled'
                      : 'disabled'
                    : setting.type === 'enum'
                      ? setting.value
                      : String(setting.value)}
                </Text>
              </Box>
              {index === selectedIndex && editingString && (
                <Box flexDirection="column" marginLeft={2}>
                  <Text color={theme.suggestion}>
                    Enter new value: {currentInput}
                  </Text>
                  {inputError && <Text color="red">{inputError}</Text>}
                </Box>
              )}
            </Box>
          ))}
        </Box>

        <Box marginTop={1}>
          <Text dimColor>
            {editingString ? (
              'Enter to save · Esc to cancel'
            ) : (
              <>
                ↑/↓ to navigate · Enter to change · Esc to close
                <Text color={theme.suggestion}>
                  {' '}
                  · Use /model for model config
                </Text>
              </>
            )}
          </Text>
        </Box>
      </Box>
    </Box>
  )
}
