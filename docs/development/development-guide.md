# Kode 开发指南

## 开发环境设置

### 1. 环境要求

- **Node.js**: >= 18.0.0
- **Bun**: 最新版本 (推荐)
- **Git**: 用于版本控制
- **IDE**: VSCode (推荐) 或其他支持TypeScript的编辑器

### 2. 安装步骤

```bash
# 1. 克隆项目
git clone <repository-url>
cd kode

# 2. 安装Bun (如果尚未安装)
curl -fsSL https://bun.sh/install | bash

# 3. 安装项目依赖
bun install

# 4. 验证安装
bun run --version
bun test
```

### 3. 开发工具配置

#### VSCode推荐扩展
```json
{
  "recommendations": [
    "ms-vscode.vscode-typescript-next",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-json",
    "bradlc.vscode-tailwindcss"
  ]
}
```

#### VSCode设置 (`.vscode/settings.json`)
```json
{
  "typescript.preferences.preferTypeOnlyAutoImports": true,
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "files.associations": {
    "*.md": "markdown"
  }
}
```

## 项目结构

```
src/
├── entrypoints/          # 应用程序入口点
│   └── cli.tsx          # CLI主入口
├── screens/             # UI屏幕组件
│   └── REPL.tsx         # 交互式终端界面
├── commands/            # 斜杠命令
├── tools/              # 工具实现
├── utils/              # 工具函数
├── services/           # 服务层
├── components/         # React组件
├── hooks/              # React Hooks
├── context/            # React Context
├── constants/          # 常量定义
└── types/              # TypeScript类型定义
```

## 开发工作流程

### 1. 日常开发命令

```bash
# 开发模式 (热重载)
bun run dev

# 类型检查
bun run typecheck

# 代码格式化
bun run format

# 格式检查
bun run format:check

# 运行测试
bun test

# 构建项目
bun run build

# 清理构建文件
bun run clean
```

### 2. Git工作流

```bash
# 创建新功能分支
git checkout -b feature/your-feature-name

# 开发并提交更改
git add .
git commit -m "feat: add new feature"

# 推送到远程
git push origin feature/your-feature-name

# 创建Pull Request
# 在GitHub上创建PR并请求审查
```

### 3. 代码规范

#### TypeScript规范
- 使用严格模式 (`strict: true`)
- 优先使用类型而非接口
- 避免使用 `any` 类型
- 使用明确的返回类型

#### 命名规范
- **文件名**: PascalCase (组件), camelCase (工具函数)
- **类名**: PascalCase
- **函数名**: camelCase
- **常量**: SCREAMING_SNAKE_CASE
- **接口**: PascalCase, 以 `I` 开头

#### 注释规范
```typescript
/**
 * 函数描述
 * @param param1 - 参数1描述
 * @param param2 - 参数2描述
 * @returns 返回值描述
 */
function functionName(param1: string, param2: number): boolean {
  // 实现
}
```

## 开发新功能

### 1. 添加新工具

#### 步骤1: 创建工具目录
```bash
mkdir -p src/tools/YourTool
```

#### 步骤2: 实现工具
```typescript
// src/tools/YourTool/YourTool.tsx
import { Tool } from '../../Tool'
import { z } from 'zod'

export class YourTool implements Tool {
  name = 'your-tool'
  description = 'Your tool description'

  parameters = z.object({
    param1: z.string().describe('Parameter 1 description'),
    param2: z.number().optional().describe('Parameter 2 description'),
  })

  async execute(params: z.infer<typeof this.parameters>) {
    // 工具实现
    return {
      success: true,
      result: 'Tool execution result'
    }
  }
}
```

#### 步骤3: 创建工具提示
```typescript
// src/tools/YourTool/prompt.ts
export const toolPrompt = `
You are a specialized tool for...

Your capabilities include:
- Capability 1
- Capability 2
- Capability 3

When using this tool, remember to:
- Consideration 1
- Consideration 2
- Consideration 3
`
```

#### 步骤4: 注册工具
```typescript
// src/tools.ts
import { YourTool } from './tools/YourTool/YourTool'

export const tools = [
  // ... 其他工具
  new YourTool(),
]
```

### 2. 添加新命令

#### 步骤1: 创建命令文件
```typescript
// src/commands/yourCommand.tsx
import { Command } from '../Command'
import { Box, Text } from 'ink'

export const yourCommand: Command = {
  name: 'your-command',
  description: 'Your command description',
  options: [
    {
      name: 'option',
      description: 'Option description',
      type: 'string',
      required: false,
    },
  ],
  async execute(args) {
    return (
      <Box>
        <Text>Command executed with args: {JSON.stringify(args)}</Text>
      </Box>
    )
  },
}
```

#### 步骤2: 注册命令
```typescript
// src/commands.ts
import { yourCommand } from './commands/yourCommand'

export const commands = [
  // ... 其他命令
  yourCommand,
]
```

### 3. 添加新Agent

#### 步骤1: 创建Agent定义文件
```markdown
---
name: your-agent
description: "When to use this agent"
tools: ["FileRead", "Bash", "YourTool"]
model: claude-3-5-sonnet-20241022
---

You are a specialized agent for...

Your expertise includes:
- Expertise 1
- Expertise 2
- Expertise 3

Your approach should be:
- Approach 1
- Approach 2
- Approach 3
```

#### 步骤2: 放置Agent文件
```bash
# 根据作用域选择位置
# 全局Agent: ~/.kode/agents/your-agent.md
# 项目Agent: ./.kode/agents/your-agent.md
```

### 4. 添加新模型

#### 步骤1: 定义模型配置
```typescript
// src/constants/models.ts
export const YOUR_MODEL: ModelConfig = {
  id: 'your-model',
  name: 'Your Model',
  apiEndpoint: 'https://api.your-model.com/v1',
  apiKey: process.env.YOUR_MODEL_API_KEY,
  model: 'your-model-name',
  maxTokens: 4096,
  temperature: 0.7,
  capabilities: {
    tools: true,
    streaming: true,
    vision: false,
  },
}
```

#### 步骤2: 添加到模型列表
```typescript
// src/constants/models.ts
export const models = [
  // ... 其他模型
  YOUR_MODEL,
]
```

#### 步骤3: 实现模型适配器
```typescript
// src/services/adapters/yourModelAdapter.ts
export class YourModelAdapter implements ModelAdapter {
  async complete(params: CompletionParams): Promise<CompletionResult> {
    // 实现模型调用逻辑
  }
}
```

## 调试和测试

### 1. 调试技巧

#### 启用调试模式
```bash
bun run dev --debug
bun run dev --debug-verbose
```

#### 使用VSCode调试
```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Kode",
      "program": "${workspaceFolder}/src/entrypoints/cli.tsx",
      "console": "integratedTerminal",
      "runtimeArgs": ["--inspect-brk"],
      "runtimeExecutable": "bun"
    }
  ]
}
```

#### 日志调试
```typescript
// 使用调试日志
import { debugLogger } from '../utils/debugLogger'

const debug = debugLogger('your-module')
debug('Debug message: %o', { data: 'value' })
```

### 2. 测试策略

#### 单元测试
```typescript
// test/yourTool.test.ts
import { describe, it, expect } from 'bun:test'
import { YourTool } from '../src/tools/YourTool/YourTool'

describe('YourTool', () => {
  it('should execute successfully', async () => {
    const tool = new YourTool()
    const result = await tool.execute({
      param1: 'test',
      param2: 123,
    })
    
    expect(result.success).toBe(true)
    expect(result.result).toBeDefined()
  })
})
```

#### 集成测试
```typescript
// test/integration/agent.test.ts
import { describe, it, expect } from 'bun:test'
import { loadAgent } from '../src/utils/agentLoader'

describe('Agent Integration', () => {
  it('should load and execute agent', async () => {
    const agent = await loadAgent('test-agent')
    const result = await agent.execute('test prompt')
    
    expect(result).toBeDefined()
  })
})
```

#### 端到端测试
```typescript
// test/e2e/cli.test.ts
import { describe, it, expect } from 'bun:test'
import { spawn } from 'bun'

describe('CLI E2E', () => {
  it('should handle basic interaction', async () => {
    const process = spawn({
      cmd: ['bun', 'run', 'src/entrypoints/cli.tsx', '--help'],
      stdout: 'pipe',
      stderr: 'pipe',
    })
    
    const output = await new Response(process.stdout).text()
    expect(output).toContain('Usage:')
  })
})
```

## 性能优化

### 1. 性能监控

```typescript
// 使用性能监控
import { performance } from 'perf_hooks'

const start = performance.now()
// 执行操作
const end = performance.now()
console.log(`Operation took ${end - start}ms`)
```

### 2. 内存优化

```typescript
// 使用弱引用避免内存泄漏
const cache = new WeakMap()

// 及时清理大对象
let largeObject = createLargeObject()
// 使用后清理
largeObject = null
```

### 3. 异步优化

```typescript
// 使用Promise.all并行处理
const results = await Promise.all([
  operation1(),
  operation2(),
  operation3(),
])

// 使用Promise.allSettled处理部分失败
const settledResults = await Promise.allSettled([
  operation1(),
  operation2(),
  operation3(),
])
```

## 错误处理

### 1. 错误类型定义

```typescript
// src/utils/errors.ts
export class KodeError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message)
    this.name = 'KodeError'
  }
}

export class ToolError extends KodeError {
  constructor(message: string, public toolName: string) {
    super(message, 'TOOL_ERROR', { toolName })
    this.name = 'ToolError'
  }
}
```

### 2. 错误处理模式

```typescript
// 统一错误处理
try {
  const result = await riskyOperation()
  return { success: true, result }
} catch (error) {
  if (error instanceof KodeError) {
    return { success: false, error: error.message }
  }
  return { success: false, error: 'Unknown error' }
}
```

### 3. 重试机制

```typescript
// 指数退避重试
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation()
    } catch (error) {
      if (i === maxRetries - 1) throw error
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)))
    }
  }
  throw new Error('Max retries exceeded')
}
```

## 部署和发布

### 1. 构建流程

```bash
# 构建生产版本
bun run build

# 验证构建结果
node cli.js --help

# 运行发布前检查
node scripts/prepublish-check.js
```

### 2. 版本管理

```bash
# 更新版本号
npm version patch/minor/major

# 发布到npm
npm publish

# 或者跳过bundled依赖检查
SKIP_BUNDLED_CHECK=true npm publish
```

### 3. CI/CD集成

```yaml
# .github/workflows/publish.yml
name: Publish
on:
  push:
    tags:
      - 'v*'
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run build
      - run: npm publish
```

## 最佳实践

### 1. 代码组织

- 按功能模块组织代码
- 使用清晰的目录结构
- 保持单一职责原则
- 避免循环依赖

### 2. 性能考虑

- 避免不必要的计算
- 使用缓存优化重复操作
- 异步处理IO密集型任务
- 监控内存使用

### 3. 安全考虑

- 验证所有用户输入
- 使用安全的随机数生成
- 避免硬编码敏感信息
- 实施适当的权限控制

### 4. 可维护性

- 编写清晰的文档
- 使用类型定义
- 保持代码一致性
- 定期重构和优化

---

这个开发指南为Kode项目的开发者提供了完整的开发流程和最佳实践，确保代码质量和项目可维护性。