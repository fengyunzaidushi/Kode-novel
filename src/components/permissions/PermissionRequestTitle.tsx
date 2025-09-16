/**
 * 🎯 权限请求标题组件 - 权限界面的标题和风险评估可视化系统
 *
 * 风险评估体系：
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                     风险等级评估体系                              │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ 🟢 低风险 (0-29)    │ 🟡 中等风险 (30-69) │ 🔴 高风险 (70-100) │
 * │ 绿色主题色彩        │ 黄色警告色彩         │ 红色错误色彩       │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * 核心功能：
 * 1. 🎨 风险可视化：根据风险分数显示对应的颜色主题
 * 2. 📊 等级分类：将数值风险转换为人类可读的风险等级
 * 3. 🎭 视觉一致性：提供统一的标题样式和风险指示器
 * 4. 🔍 智能显示：只在有风险评分时显示风险信息
 */

import * as React from 'react'
import { Box, Text } from 'ink'
import { getTheme } from '../../utils/theme'

/** 🏷️ 风险等级分类 - 将数值风险转换为语义化的等级标识 */
export type RiskScoreCategory = 'low' | 'moderate' | 'high'

/**
 * 📊 风险分数分类器 - 将数值风险评分转换为语义化的等级
 *
 * 分级标准：
 * - 🟢 低风险：0-29分 - 安全操作，如文件读取
 * - 🟡 中等风险：30-69分 - 需谨慎，如文件修改
 * - 🔴 高风险：70-100分 - 危险操作，如系统命令
 *
 * @param riskScore - 风险评分 (0-100)
 * @returns 风险等级类别
 */
export function categoryForRiskScore(riskScore: number): RiskScoreCategory {
  return riskScore >= 70 ? 'high' : riskScore >= 30 ? 'moderate' : 'low'
}

/**
 * 🎨 风险等级配色方案 - 为不同风险等级提供视觉主题配色
 *
 * @param category - 风险等级类别
 * @returns 包含高亮色和文本色的配色对象
 */
function colorSchemeForRiskScoreCategory(category: RiskScoreCategory): {
  highlightColor: string
  textColor: string
} {
  const theme = getTheme()
  switch (category) {
    case 'low':
      return {
        highlightColor: theme.success,
        textColor: theme.permission,
      }
    case 'moderate':
      return {
        highlightColor: theme.warning,
        textColor: theme.warning,
      }
    case 'high':
      return {
        highlightColor: theme.error,
        textColor: theme.error,
      }
  }
}

/**
 * 🌈 风险分数文本颜色提取器 - 根据风险评分获取对应的文本颜色
 *
 * @param riskScore - 风险评分，可为null表示无风险评估
 * @returns 对应风险等级的颜色代码
 */
export function textColorForRiskScore(riskScore: number | null): string {
  if (riskScore === null) {
    return getTheme().permission
  }
  const category = categoryForRiskScore(riskScore)
  return colorSchemeForRiskScoreCategory(category).textColor
}

/**
 * ⚠️ 权限风险评分显示组件 - 可视化显示操作的风险等级
 *
 * @param props - 包含风险评分的属性对象
 * @returns React节点 - 带颜色标识的风险等级文本
 */
export function PermissionRiskScore({
  riskScore,
}: {
  riskScore: number
}): React.ReactNode {
  const category = categoryForRiskScore(riskScore)
  return <Text color={textColorForRiskScore(riskScore)}>Risk: {category}</Text>
}

/**
 * 🎨 权限请求标题组件属性接口
 */
type Props = {
  /** 📝 标题文本 */
  title: string
  /** ⚠️ 风险评分（可选） */
  riskScore: number | null
}

/**
 * 🎯 权限请求标题组件 - 权限界面的标准化标题区域
 *
 * 显示逻辑：
 * 1. 📝 显示粗体标题，使用权限主题色
 * 2. ⚠️ 如果有风险评分，显示对应的风险等级指示器
 * 3. 🎨 根据风险等级调整视觉样式和颜色
 *
 * @param props - 标题组件属性
 * @returns React节点 - 渲染的标题区域
 */
export function PermissionRequestTitle({
  title,
  riskScore,
}: Props): React.ReactNode {
  return (
    <Box flexDirection="column">
      <Text bold color={getTheme().permission}>
        {title}
      </Text>
      {riskScore !== null && <PermissionRiskScore riskScore={riskScore} />}
    </Box>
  )
}
