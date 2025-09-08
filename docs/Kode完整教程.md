# Kode 完整教程：终端 AI 开发助手

## 📖 项目概述

Kode 是一个革命性的终端 AI 助手，专为开发者设计。它不仅仅是一个代码补全工具，而是一个完整的 AI 开发工作台，能够理解你的代码库、编辑文件、执行命令，并通过多模型协作处理复杂的开发任务。

### 🎯 核心价值

- **多模型智能协作**：支持无限个 AI 模型，根据任务特点智能选择最适合的模型
- **终端原生体验**：直接在命令行中工作，无需切换界面
- **智能代码理解**：深度理解项目结构和代码关系
- **工作流自动化**：用自然语言描述需求，自动完成复杂开发任务
- **安全可控**：完善的权限系统，保护重要文件和操作

## 🛠️ 项目技术特点

### 1. 三层并行架构

Kode 采用了受 Claude Code 启发的三层并行架构：

```
┌─────────────────────────────────────┐
│       用户交互层 (REPL.tsx)          │
│  • 终端界面 (基于 Ink/React)        │
│  • 命令解析和用户输入处理            │
│  • 实时 UI 更新和语法高亮           │
└─────────────────────────────────────┘
                   ↕
┌─────────────────────────────────────┐
│       编排层 (TaskTool/)            │
│  • 动态代理系统                     │
│  • 多模型协作和切换                 │
│  • 上下文管理和对话连续性           │
└─────────────────────────────────────┘
                   ↕
┌─────────────────────────────────────┐
│       工具执行层 (tools/)           │
│  • 专门化工具 (文件I/O、Bash等)     │
│  • 权限系统和安全访问               │
│  • MCP 协议集成                    │
└─────────────────────────────────────┘
```

### 2. 多模型管理系统

#### ModelManager 核心特性
```typescript
// 模型配置示例
{
  "modelProfiles": [
    {
      "name": "Claude Sonnet 4",
      "provider": "anthropic", 
      "modelName": "claude-sonnet-4-20250514",
      "baseURL": "https://api.anthropic.com",
      "apiKey": "sk-xxx",
      "maxTokens": 8192,
      "contextLength": 200000,
      "isActive": true
    }
  ],
  "modelPointers": {
    "main": "claude-sonnet-4",      // 主对话模型
    "task": "claude-sonnet-4",      // 任务执行模型  
    "reasoning": "claude-opus-4",   // 推理模型
    "quick": "claude-haiku"         // 快速响应模型
  }
}
```

#### 智能模型切换
- **Tab 键快速切换**：在输入时按 Tab 键快速切换当前对话模型
- **动态模型选择**：根据任务复杂度和上下文长度自动选择合适模型
- **并行任务处理**：多个子代理可以同时使用不同模型处理不同子任务

### 3. 动态代理系统

#### 代理配置格式
```markdown
---
name: code-reviewer
description: "代码审查专家，用于检查代码质量和安全性"
tools: ["FileRead", "Grep", "Bash"]
model: claude-sonnet-4
---

你是一个代码审查专家。请仔细检查提供的代码，重点关注：
1. 代码质量和最佳实践
2. 潜在的安全漏洞
3. 性能优化机会
4. 可读性和维护性

请提供具体的改进建议和代码示例。
```

#### 五级优先级加载系统
1. **内置代理** (代码嵌入)
2. **Claude 用户目录** (`~/.claude/agents/`)
3. **Kode 用户目录** (`~/.kode/agents/`) 
4. **Claude 项目目录** (`./.claude/agents/`)
5. **Kode 项目目录** (`./.kode/agents/`)

### 4. 工具系统架构

每个工具都遵循统一的接口规范：

```typescript
interface Tool {
  name: string                    // 工具名称
  description: () => Promise<string>  // 工具描述
  inputSchema: ZodSchema         // 输入验证架构
  prompt: () => Promise<string>  // 系统提示词
  isEnabled: () => Promise<boolean>   // 是否启用
  isReadOnly: () => boolean      // 是否只读
  needsPermissions: () => boolean     // 是否需要权限
  call: (input, context) => AsyncGenerator  // 核心执行逻辑
  renderToolUseMessage: () => string       // 使用消息渲染
  renderResultForAssistant: () => string  // 结果消息渲染
}
```

#### 核心工具类别
- **文件操作**：FileRead, FileWrite, FileEdit, Glob
- **代码搜索**：Grep, codebaseSearch
- **系统操作**：Bash, Terminal
- **专门任务**：TaskTool (子代理), AskExpertModel (专家咨询)
- **项目管理**：TodoWrite, MemoryRead/Write
- **扩展集成**：MCP (Model Context Protocol)

## 🚀 快速开始

### 安装和配置

#### 1. 安装 Kode
```bash
# 推荐使用 Bun (最快)
curl -fsSL https://bun.sh/install | bash
bun add -g @shareai-lab/kode

# 或使用 npm
npm install -g @shareai-lab/kode
```

#### 2. 初始配置
```bash
# 启动 Kode
kode

# 首次运行会进入引导流程
# 配置你的 AI 模型 API Key
# 选择默认模型和偏好设置
```

#### 3. 配置多模型 (可选)
```bash
# 打开模型配置面板
/model

# 添加多个模型配置
# 设置不同用途的默认模型
```

### 基本使用

#### 交互式对话
```bash
# 启动交互式会话
kode

# 直接对话
> 帮我分析这个项目的架构

# 使用专家模型咨询
> @ask-gpt-4o 这个算法的时间复杂度是多少？

# 委托给专门代理
> @run-agent-code-reviewer 检查 src/main.js 的代码质量
```

#### 非交互式使用
```bash
# 快速分析文件
kode -p "解释这个函数的作用" src/utils/helper.js

# 批量处理
kode -p "优化所有 React 组件的性能" src/components/
```

### 高级功能

#### 1. @ 提及系统
```bash
# 专家模型咨询
@ask-claude-opus-4 如何优化这个数据库查询？
@ask-o3 分析这个架构设计的优缺点

# 专门代理委托  
@run-agent-test-writer 为这个模块创建测试用例
@run-agent-architect 设计微服务拆分方案

# 智能文件引用
@src/components/Button.tsx
@docs/api-reference.md
```

#### 2. 文档生成模式
```bash
# 使用 # 前缀自动生成和维护 AGENTS.md 文档
# 如何设置开发环境？
# 项目的测试流程是什么？
# 部署管道和要求说明
```

#### 3. 多模型协作策略
```bash
# 架构设计阶段
"用 o3 模型设计高并发消息队列系统架构"

# 方案细化阶段  
"用 gemini 模型分析生产环境部署细节"

# 代码实现阶段
"用 Claude Sonnet 4 模型重构这三个模块"

# 问题解决阶段
"这个内存泄漏很复杂，咨询 Claude Opus 4.1 专家意见"
```

## 🔧 开发和扩展

### 本地开发环境

#### 1. 环境准备
```bash
# 安装 Bun
curl -fsSL https://bun.sh/install | bash

# 克隆项目
git clone https://github.com/shareAI-lab/kode.git
cd kode

# 安装依赖
bun install
```

#### 2. 开发命令
```bash
# 开发模式 (热重载 + 详细输出)
bun run dev

# 构建 CLI 包装器
bun run build

# 清理构建产物
bun run clean

# 运行测试
bun test

# 类型检查
bun run typecheck

# 代码格式化
bun run format
```

### 添加自定义工具

#### 1. 创建工具目录
```bash
mkdir src/tools/MyCustomTool
```

#### 2. 实现工具逻辑
```typescript
// src/tools/MyCustomTool/MyCustomTool.tsx
import { z } from 'zod'
import type { Tool } from '../../Tool'

const inputSchema = z.object({
  input: z.string().describe('工具输入参数')
})

export const MyCustomTool = {
  name: 'MyCustomTool',
  description: async () => '我的自定义工具描述',
  inputSchema,
  prompt: async () => '工具的系统提示词',
  isEnabled: async () => true,
  isReadOnly: () => false,
  needsPermissions: () => true,
  
  async *call(input, { abortController, options }) {
    // 工具核心逻辑
    yield {
      type: 'result',
      data: { result: '处理结果' },
      resultForAssistant: '返回给 AI 的结果描述'
    }
  },
  
  renderToolUseMessage: (input) => `使用 ${input.input}`,
  renderResultForAssistant: (output) => `完成: ${output.result}`,
  renderToolUseRejectedMessage: () => <Text>操作被拒绝</Text>
} satisfies Tool<typeof inputSchema>
```

#### 3. 注册工具
```typescript
// src/tools.ts
import { MyCustomTool } from './tools/MyCustomTool/MyCustomTool'

export async function getTools(): Promise<Tool[]> {
  return [
    // ... 其他工具
    MyCustomTool,
  ]
}
```

### 添加自定义代理

#### 1. 创建代理配置文件
```bash
# 用户级代理 (所有项目可用)
mkdir -p ~/.kode/agents
```

```markdown
<!-- ~/.kode/agents/database-expert.md -->
---
name: database-expert
description: "数据库设计和优化专家"
tools: ["FileRead", "Grep", "Bash"]
model_name: claude-sonnet-4
---

你是一个数据库设计和优化专家。专长包括：

1. **数据库设计**
   - ER 模型设计
   - 表结构优化
   - 索引策略

2. **性能优化**
   - 查询优化
   - 索引分析
   - 执行计划解读

3. **最佳实践**
   - 数据规范化
   - 安全性考虑
   - 备份恢复策略

请根据用户需求提供专业的数据库建议和解决方案。
```

#### 2. 项目级代理
```bash
# 项目级代理 (仅当前项目可用)
mkdir -p ./.kode/agents
```

### 添加新的模型支持

#### 1. 配置模型适配器
```typescript
// src/services/adapters/customProvider.ts
export class CustomProviderAdapter implements ModelAdapter {
  async createChatCompletion(options: ChatCompletionOptions) {
    // 实现自定义提供商的 API 调用逻辑
  }
  
  async validateApiKey(apiKey: string): Promise<boolean> {
    // 实现 API Key 验证逻辑
  }
}
```

#### 2. 注册模型提供商
```typescript
// src/constants/models.ts
export const SUPPORTED_PROVIDERS = {
  // ... 现有提供商
  'custom': {
    name: '自定义提供商',
    adapter: CustomProviderAdapter,
    defaultModels: ['custom-model-1']
  }
}
```

## 📋 常用命令参考

### 内置命令
| 命令 | 功能 | 说明 |
|------|------|------|
| `/help` | 显示帮助 | 列出所有可用命令 |
| `/model` | 模型管理 | 配置和切换 AI 模型 |
| `/config` | 配置管理 | 修改全局和项目配置 |
| `/cost` | 成本统计 | 查看 token 使用量和费用 |
| `/clear` | 清除历史 | 清空当前对话历史 |
| `/agents` | 代理管理 | 查看和管理可用代理 |
| `/init` | 初始化 | 初始化项目上下文 |

### 使用模式

#### YOLO 模式 (默认)
```bash
# 自动批准所有操作，最大化生产力
kode

# 适用场景：
# - 可信环境
# - 非重要项目
# - 快速原型开发
```

#### 安全模式
```bash
# 需要手动确认所有操作
kode --safe

# 适用场景：
# - 重要项目
# - 生产环境
# - 不熟悉的代码库
```

## 🎯 实际应用场景

### 1. 代码重构
```bash
> 我需要重构这个 React 组件，提高性能和可读性

# Kode 会：
# 1. 分析组件结构
# 2. 识别性能瓶颈
# 3. 应用最佳实践
# 4. 自动修改文件
# 5. 生成测试用例
```

### 2. Bug 调试
```bash
> 用户报告登录功能异常，帮我定位问题

# Kode 会：
# 1. 搜索登录相关代码
# 2. 分析错误日志
# 3. 检查数据库连接
# 4. 提供修复方案
# 5. 更新相关文档
```

### 3. 新功能开发
```bash
> 添加用户评论功能，包括前端和后端

# Kode 会：
# 1. 设计数据库表结构
# 2. 创建后端 API 端点
# 3. 实现前端组件
# 4. 编写单元测试
# 5. 更新 API 文档
```

### 4. 项目初始化
```bash
> 创建一个 Next.js + TypeScript + Tailwind 项目模板

# Kode 会：
# 1. 初始化项目结构
# 2. 配置开发环境
# 3. 设置构建脚本
# 4. 创建基础组件
# 5. 编写部署配置
```

## 🔒 安全和权限

### 权限系统
- **细粒度控制**：每个工具使用都需要明确权限
- **用户批准**：文件修改和命令执行需要用户确认
- **工具过滤**：基于代理配置过滤可用工具
- **路径验证**：安全的文件路径验证和沙箱机制

### 最佳安全实践
1. **重要项目使用安全模式**：`kode --safe`
2. **定期检查配置**：`/config` 查看当前设置
3. **监控成本使用**：`/cost` 追踪 API 调用
4. **备份重要文件**：修改前确保有备份
5. **审查代理权限**：检查代理的工具访问权限

## 🚀 性能优化

### 多模型协作策略
1. **架构设计**：使用 o3/GPT-5 等推理能力强的模型
2. **代码实现**：使用 Claude Sonnet 4/Qwen Coder 等代码专长模型  
3. **快速任务**：使用 Claude Haiku 等轻量模型
4. **专家咨询**：针对复杂问题使用 Claude Opus 4.1 等顶级模型

### 上下文管理
- **智能窗口管理**：自动适配不同模型的上下文长度
- **上下文继承**：模型切换时保持对话连续性
- **内存系统**：跨会话保持重要信息

### 并行处理
- **多代理并行**：同时委托多个子代理处理不同任务
- **工具并发**：安全的工具并发执行
- **异步操作**：非阻塞的文件 I/O 和网络请求

## 📊 对比分析

### vs Claude Code
| 特性 | Kode | Claude Code |
|------|------|-------------|
| 支持模型数量 | 无限制，可配置任意模型 | 仅支持 Claude 系列 |
| 模型切换 | Tab 键快速切换 | 需要重启会话 |
| 并行处理 | 多代理并行工作 | 单线程处理 |
| 成本追踪 | 多模型分别统计 | 单一模型成本 |
| 代理系统 | 5级动态加载 | 内置固定代理 |
| 开源协议 | Apache 2.0 | 专有软件 |

### vs GitHub Copilot
| 特性 | Kode | GitHub Copilot |
|------|------|----------------|
| 应用场景 | 终端 + 全工作流 | IDE 代码补全 |
| 任务复杂度 | 多步骤复杂任务 | 单行/函数补全 |
| 代码理解 | 项目级理解 | 文件级理解 |
| 工具集成 | 丰富的工具生态 | 基础 Git 集成 |
| 自定义性 | 高度可定制 | 配置选项有限 |

## 🔮 未来发展

### 计划功能
1. **更多 MCP 集成**：支持更多外部工具和服务
2. **可视化界面**：可选的 Web UI 界面
3. **团队协作**：多用户代理共享和协作
4. **插件市场**：社区驱动的工具和代理市场
5. **智能学习**：基于使用习惯的个性化优化

### 社区贡献
- **工具开发**：贡献新的专门化工具
- **代理配置**：分享优秀的代理配置
- **文档改进**：完善文档和教程
- **Bug 修复**：报告和修复问题
- **功能建议**：提出新功能需求

## 📚 学习资源

### 官方文档
- [项目主页](https://github.com/shareAI-lab/kode)
- [贡献指南](CONTRIBUTING.md)
- [API 文档](docs/develop/)
- [架构设计](docs/develop/architecture.md)

### 社区资源
- [讨论区](https://github.com/shareAI-lab/kode/discussions)
- [问题反馈](https://github.com/shareAI-lab/kode/issues)
- [发布说明](docs/release-notes.md)

---

## 💡 小贴士

1. **善用 Tab 补全**：输入时按 Tab 获得智能补全建议
2. **多模型实验**：尝试不同模型组合找到最佳搭配
3. **定制代理**：为常用任务创建专门的代理配置
4. **监控成本**：定期检查 API 使用量避免超支
5. **社区学习**：关注社区分享的最佳实践和技巧

通过这个教程，你应该已经全面了解了 Kode 的功能特性、架构设计和使用方法。Kode 不仅仅是一个工具，更是一个 AI 开发生态系统，能够显著提升开发效率和代码质量。开始你的 AI 增强开发之旅吧！

