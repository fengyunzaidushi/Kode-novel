// 导入项目配置相关类型和函数
import {
  ProjectConfig,  // 项目配置类型定义
  getCurrentProjectConfig as getCurrentProjectConfigDefault,  // 获取当前项目配置的默认实现
  saveCurrentProjectConfig as saveCurrentProjectConfigDefault,  // 保存当前项目配置的默认实现
} from '../utils/config.js'

// 定义项目配置处理器的接口类型，用于依赖注入和测试
export type ProjectConfigHandler = {
  getCurrentProjectConfig: () => ProjectConfig  // 获取当前项目配置的方法
  saveCurrentProjectConfig: (config: ProjectConfig) => void  // 保存项目配置的方法
}

// 默认的配置处理器，使用真实的配置系统实现
const defaultConfigHandler: ProjectConfigHandler = {
  getCurrentProjectConfig: getCurrentProjectConfigDefault,  // 使用默认的获取配置函数
  saveCurrentProjectConfig: saveCurrentProjectConfigDefault,  // 使用默认的保存配置函数
}

/**
 * 处理 'approved-tools list' 命令的函数
 * 用于显示当前项目允许使用的工具列表
 */
export function handleListApprovedTools(
  cwd: string,  // 当前工作目录路径
  projectConfigHandler: ProjectConfigHandler = defaultConfigHandler,  // 项目配置处理器，可注入用于测试
): string {
  // 获取当前项目的配置
  const projectConfig = projectConfigHandler.getCurrentProjectConfig()
  // 返回格式化的允许工具列表，每个工具占一行
  return `Allowed tools for ${cwd}:\n${projectConfig.allowedTools.join('\n')}`
}

/**
 * 处理 'approved-tools remove' 命令的函数
 * 用于从项目的允许工具列表中移除指定工具
 */
export function handleRemoveApprovedTool(
  tool: string,  // 要移除的工具名称
  projectConfigHandler: ProjectConfigHandler = defaultConfigHandler,  // 项目配置处理器，可注入用于测试
): { success: boolean; message: string } {  // 返回操作结果和消息
  // 获取当前项目配置
  const projectConfig = projectConfigHandler.getCurrentProjectConfig()
  // 记录原始工具数量，用于检查是否真的移除了工具
  const originalToolCount = projectConfig.allowedTools.length
  // 创建新的工具列表，过滤掉要移除的工具
  const updatedAllowedTools = projectConfig.allowedTools.filter(t => t !== tool)

  // 检查工具数量是否发生了变化，即是否成功移除了工具
  if (originalToolCount !== updatedAllowedTools.length) {
    // 更新项目配置中的允许工具列表
    projectConfig.allowedTools = updatedAllowedTools
    // 保存更新后的项目配置
    projectConfigHandler.saveCurrentProjectConfig(projectConfig)
    // 返回成功结果
    return {
      success: true,
      message: `Removed ${tool} from the list of approved tools`,
    }
  } else {
    // 如果工具数量没有变化，说明要移除的工具不在列表中
    return {
      success: false,
      message: `${tool} was not in the list of approved tools`,
    }
  }
}
