# Kode 项目完整实现指南

> 本文档详细说明了 `@src/` 目录下每个文件的实现顺序，按功能模块分组，模拟真实开发过程中的实现-测试-提交循环。

## 📋 目录
- [架构概览](#架构概览)
- [开发流程规范](#开发流程规范)
- [实现阶段划分](#实现阶段划分)
- [详细实现顺序](#详细实现顺序)
- [关键依赖关系](#关键依赖关系)
- [实现要点](#实现要点)

---

## 🏗️ 架构概览

Kode 采用**三层并行架构**，灵感来自 Claude Code：

```
┌─────────────────────────────────────────────────────────────┐
│                    用户交互层 (UI Layer)                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   REPL.tsx      │  │  消息组件        │  │  权限对话框      │ │
│  │  (Ink 终端界面)  │  │ (Message.tsx)   │  │(Permission*.tsx)│ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                   编排层 (Orchestration Layer)                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  TaskTool/      │  │   query.ts      │  │ agentLoader.ts  │ │
│  │ (动态代理系统)   │  │  (查询编排)      │  │ (配置热加载)     │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                   工具执行层 (Tool Execution Layer)            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │    tools/       │  │   services/     │  │  permissions/   │ │
│  │  (各种工具)      │  │  (AI 服务)      │  │  (安全控制)      │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 开发流程规范

### 实现-测试-提交循环 (Implementation-Test-Commit Cycle)

每个功能模块都遵循以下标准开发流程：

```
📝 实现功能 → 🔧 构建测试 → ✅ 功能验证 → 🚀 Git提交 → 🔄 下一功能
```

#### 标准开发步骤
1. **功能实现** - 编写代码实现指定功能
2. **构建验证** - 运行 `bun run build` 确保构建成功
3. **功能测试** - 根据测试指南验证功能正常工作
4. **类型检查** - 运行 `bun run typecheck` 确保类型正确
5. **Git提交** - 使用规范的提交消息提交代码
6. **文档更新** - 必要时更新相关文档

### 📊 测试分类

#### 🟢 构建测试 (Build Test)
```bash
bun run build
```
**目标**: 确保代码可以成功编译和打包

#### 🔵 类型测试 (Type Test) 
```bash
bun run typecheck
```
**目标**: 确保TypeScript类型正确无误

#### 🟡 功能测试 (Functional Test)
```bash
bun run dev
# 或者运行构建后的CLI
./cli.js --help
```
**目标**: 验证实现的功能按预期工作

#### 🟠 集成测试 (Integration Test)
```bash
bun test
```
**目标**: 验证模块间的协作正确

### 🏷️ Git提交规范

#### 提交消息格式
```
<type>(<scope>): <subject>

<body>

<footer>
```

#### 提交类型 (type)
- `feat`: 新功能
- `fix`: 修复bug
- `refactor`: 重构代码
- `test`: 添加测试
- `docs`: 文档变更
- `style`: 代码格式化
- `chore`: 构建或辅助工具变更

#### 示例提交消息
```bash
feat(tools): implement FileReadTool with image support

- Add FileReadTool class with async file reading
- Support for images, PDFs, and Jupyter notebooks
- Add line offset and limit functionality
- Include proper error handling and validation

Closes #123
```

---

## 🚀 实现阶段划分

### 第一阶段：基础设施 (Foundation)
建立整个系统的基础框架和核心接口。

### 第二阶段：核心服务 (Core Services)
实现AI服务和基本工具功能。

### 第三阶段：编排层 (Orchestration)
构建动态代理系统和查询编排机制。

### 第四阶段：用户界面 (User Interface)
实现基于Ink的交互式终端界面。

### 第五阶段：扩展功能 (Extensions)
完善MCP支持和高级工具。

---

## 📝 详细实现顺序

## 第一阶段：基础设施 (Foundation)

### 1.1 核心接口定义

#### `src/Tool.ts` - 工具系统接口 ⭐
**实现优先级：最高**
```typescript
// 核心接口：
interface Tool<TInput, TOutput> {
  name: string;
  description: () => Promise<string>;
  inputSchema: z.ZodObject<any>;
  call: (input: TInput, context: ToolUseContext) => AsyncGenerator;
  // ... 其他方法
}
```
**依赖：** `zod`, `react`
**被依赖：** 所有工具实现

#### `src/constants/` 目录 - 系统常量 ⭐
**实现优先级：最高**

1. `constants/product.ts` - 产品信息
2. `constants/models.ts` - 模型定义
3. `constants/modelCapabilities.ts` - 模型能力映射
4. `constants/keys.ts` - 按键定义
5. `constants/figures.ts` - 图标字符
6. `constants/macros.ts` - 宏定义

**依赖：** 无
**被依赖：** 整个系统

#### `src/utils/config.ts` - 配置管理系统 ⭐
**实现优先级：最高**
```typescript
// 核心功能：
- getGlobalConfig() / saveGlobalConfig()
- getCurrentProjectConfig() / saveCurrentProjectConfig()
- 分层配置合并机制
- API密钥管理
- 模型配置验证
```
**依赖：** `constants/models.ts`, `constants/product.ts`
**被依赖：** 几乎所有模块

### 1.2 基础工具类

#### `src/utils/model.ts` - 模型管理器 ⭐
**实现优先级：高**
```typescript
// 核心功能：
- ModelManager 类
- isDefaultSlowAndCapableModel()
- 模型切换和验证
- 模型能力检查
```
**依赖：** `config.ts`, `constants/models.ts`
**被依赖：** AI服务层，REPL界面

#### `src/utils/` 其他工具类
**实现顺序：**
1. `utils/env.ts` - 环境变量处理
2. `utils/state.ts` - 全局状态管理 (getCwd, setCwd)
3. `utils/log.ts` - 日志系统
4. `utils/debugLogger.ts` - 调试日志
5. `utils/errors.ts` - 错误类型定义

---

## 第二阶段：核心服务 (Core Services)

### 2.1 基础工具实现

#### 文件系统工具 ⭐⭐
**实现优先级：最高**
1. `tools/FileReadTool/FileReadTool.tsx`
2. `tools/FileWriteTool/FileWriteTool.tsx`
3. `tools/FileEditTool/FileEditTool.tsx`
4. `tools/MultiEditTool/MultiEditTool.tsx`

**核心功能：**
```typescript
// FileReadTool
- 文件内容读取
- 图片/PDF/Jupyter支持
- 行号限制和偏移

// FileWriteTool
- 文件创建和覆写
- 权限检查
- 备份机制

// FileEditTool
- 精确字符串替换
- 上下文保持
- 冲突检测

// MultiEditTool
- 批量编辑操作
- 原子性保证
- 回滚支持
```

#### 搜索和导航工具 ⭐⭐
**实现优先级：高**
1. `tools/GrepTool/GrepTool.tsx` - 基于ripgrep的搜索
2. `tools/GlobTool/GlobTool.tsx` - 文件模式匹配
3. `tools/lsTool/lsTool.tsx` - 目录列表

#### 基础工具
**实现优先级：中**
1. `tools/BashTool/BashTool.tsx` - Shell命令执行
2. `tools/ThinkTool/ThinkTool.tsx` - 思考过程记录
3. `tools/TodoWriteTool/TodoWriteTool.tsx` - 任务管理

### 2.2 AI服务层

#### `src/services/claude.ts` - Claude API服务 ⭐
**实现优先级：最高**
```typescript
// 核心功能：
- streamCompletion() - 流式对话
- 工具调用处理
- 错误重试机制
- 上下文窗口管理
```
**依赖：** `@anthropic-ai/sdk`, `config.ts`, `model.ts`

#### 模型适配器系统
**实现顺序：**
1. `services/adapters/base.ts` - 基础适配器接口
2. `services/adapters/chatCompletions.ts` - 通用适配器
3. `services/adapters/responsesAPI.ts` - GPT-5响应API
4. `services/modelAdapterFactory.ts` - 工厂类 ⭐

#### 辅助服务
**实现优先级：中低**
1. `services/openai.ts` - OpenAI兼容服务
2. `services/notifier.ts` - 通知服务
3. `services/statsig.ts` - 特性开关
4. `services/sentry.ts` - 错误监控

---

## 第三阶段：编排层 (Orchestration)

### 3.1 动态代理系统

#### `src/utils/agentLoader.ts` - 代理配置加载器 ⭐
**实现优先级：最高**
```typescript
// 核心功能：
- 5级优先级配置加载
- 文件系统监控和热重载
- LRU缓存优化
- 错误处理和回退机制
```

**5级优先级系统：**
1. Built-in (代码内嵌)
2. `~/.claude/agents/` (Claude用户)
3. `~/.kode/agents/` (Kode用户)  
4. `./.claude/agents/` (Claude项目)
5. `./.kode/agents/` (Kode项目)

**依赖：** `config.ts`, `chokidar`(文件监控)

#### `src/tools/TaskTool/TaskTool.tsx` - 代理编排工具 ⭐
**实现优先级：高**
```typescript
// 核心功能：
- 子代理启动和管理
- 工具权限过滤
- 模型切换
- 结果汇总和传递
```
**依赖：** `agentLoader.ts`, `query.ts`, 所有工具

### 3.2 查询处理

#### `src/query.ts` - 查询编排核心 ⭐
**实现优先级：高**
```typescript
// 核心功能：
- streamQuery() - 主查询处理函数
- 消息流处理
- 工具调用编排
- 上下文管理
```
**依赖：** AI服务, 工具系统, 权限系统

#### `src/utils/messageContextManager.ts` - 上下文管理 ⭐
**实现优先级：高**
```typescript
// 核心功能：
- 智能上下文窗口处理
- 消息压缩和截断
- 历史记录管理
```

---

## 第四阶段：用户界面 (User Interface)

### 4.1 消息处理组件

#### 消息基础组件 ⭐
**实现顺序：**
1. `components/Message.tsx` - 消息基类
2. `components/MessageResponse.tsx` - 响应包装器
3. `components/messages/AssistantTextMessage.tsx`
4. `components/messages/UserTextMessage.tsx`
5. `components/messages/AssistantToolUseMessage.tsx`
6. `components/messages/UserToolResultMessage/`

#### 工具结果消息组件
**实现顺序：**
1. `components/messages/UserToolResultMessage/UserToolResultMessage.tsx`
2. `components/messages/UserToolResultMessage/UserToolSuccessMessage.tsx`
3. `components/messages/UserToolResultMessage/UserToolErrorMessage.tsx`
4. `components/messages/UserToolResultMessage/UserToolRejectMessage.tsx`

### 4.2 权限系统界面

#### `src/permissions.ts` - 权限系统核心 ⭐
**实现优先级：最高**
```typescript
// 核心功能：
- hasPermissionsToUseTool()
- 工具权限检查
- 文件路径验证
- 安全沙箱机制
```

#### 权限请求组件 ⭐
**实现顺序：**
1. `components/permissions/PermissionRequest.tsx` - 基础组件
2. `components/permissions/BashPermissionRequest/`
3. `components/permissions/FileEditPermissionRequest/`
4. `components/permissions/FileWritePermissionRequest/`
5. `components/permissions/FilesystemPermissionRequest/`

### 4.3 主界面组件

#### `src/components/PromptInput.tsx` - 输入组件 ⭐
**实现优先级：高**
```typescript
// 核心功能：
- 多行输入支持
- 历史记录导航
- 快捷键处理
- 自动完成
```

#### `src/screens/REPL.tsx` - 主界面 ⭐⭐⭐
**实现优先级：最高**
```typescript
// 核心功能：
- 整个应用的主界面
- 消息流展示
- 用户交互处理
- 状态管理
```

**依赖：** 几乎所有组件和服务
**关键hooks：**
- `useUnifiedCompletion` - 统一完成处理
- `useTextInput` - 文本输入管理
- `usePermissionRequestLogging` - 权限日志

---

## 第五阶段：扩展功能 (Extensions)

### 5.1 MCP (Model Context Protocol) 支持

#### `src/services/mcpClient.ts` - MCP客户端 ⭐
**实现优先级：中**
```typescript
// 核心功能：
- MCP服务器连接管理
- 工具代理
- 配置管理
- 错误处理
```

#### MCP相关组件
**实现顺序：**
1. `services/mcpServerApproval.tsx` - 服务器审批
2. `components/MCPServerApprovalDialog.tsx`
3. `components/MCPServerMultiselectDialog.tsx`

### 5.2 高级工具

#### 网络和搜索工具
**实现顺序：**
1. `tools/WebSearchTool/WebSearchTool.tsx`
2. `tools/URLFetcherTool/URLFetcherTool.tsx`

#### Notebook支持
**实现顺序：**
1. `tools/NotebookReadTool/NotebookReadTool.tsx`
2. `tools/NotebookEditTool/NotebookEditTool.tsx`

#### 内存和专家模型
**实现顺序：**
1. `tools/MemoryReadTool/MemoryReadTool.tsx`
2. `tools/MemoryWriteTool/MemoryWriteTool.tsx`
3. `tools/AskExpertModelTool/AskExpertModelTool.tsx`

### 5.3 CLI入口点

#### `src/entrypoints/cli.tsx` - 主入口 ⭐⭐⭐
**实现优先级：最后**
```typescript
// 核心功能：
- 命令行参数解析
- 初始化流程
- 配置验证
- 界面启动
```
**依赖：** 整个系统

---

## 🔗 关键依赖关系

### 依赖层次图

```
                    entrypoints/cli.tsx
                           │
                    screens/REPL.tsx
                           │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
     query.ts          工具系统          权限系统
          │                 │                 │
    ┌─────┴─────┐     ┌─────┴─────┐     permissions.ts
    │           │     │           │           │
AI服务层    agentLoader   Tool接口    各个工具    权限组件
    │           │     │           │           │
model.ts    config.ts   utils/     tools/    components/
    │           │                             permissions/
constants/   常量定义
```

### 循环依赖处理

**潜在循环依赖：**
1. `tools.ts` ↔ `tools/*/` - 通过动态导入解决
2. `agentLoader.ts` ↔ `TaskTool` - 通过接口抽象解决
3. `REPL.tsx` ↔ `query.ts` - 通过回调解决

---

## 💡 实现要点

### 关键设计模式

#### 1. 工厂模式
- `modelAdapterFactory.ts` - 模型适配器创建
- `tools.ts` - 工具实例创建

#### 2. 观察者模式
- `agentLoader.ts` - 文件变化监控
- 权限系统事件处理

#### 3. 策略模式
- 不同模型的处理策略
- 不同工具的执行策略

### 性能优化要点

#### 1. 缓存机制
```typescript
// agentLoader.ts
const agentCache = new Map<string, AgentConfig>();

// tools.ts
export const getTools = memoize(async (enableArchitect?: boolean) => {
  // 工具缓存
});
```

#### 2. 异步加载
```typescript
// 动态导入避免循环依赖
const { TaskTool } = await import('./tools/TaskTool/TaskTool');
```

#### 3. 流式处理
```typescript
// query.ts - 流式响应处理
for await (const chunk of stream) {
  yield chunk;
}
```

### 错误处理策略

#### 1. 分层错误处理
- **工具层**：工具特定错误
- **服务层**：网络和API错误  
- **界面层**：用户友好的错误显示

#### 2. 优雅降级
- 配置解析失败 → 使用默认配置
- AI服务失败 → 降级到本地处理
- 工具执行失败 → 显示错误但不中断会话

### 安全考虑

#### 1. 文件路径验证
```typescript
// permissions.ts
const isPathSafe = (path: string) => {
  // 路径遍历攻击防护
  return !path.includes('../');
};
```

#### 2. 命令注入防护
```typescript
// BashTool
const sanitizeCommand = (cmd: string) => {
  // Shell注入防护
};
```

#### 3. API密钥管理
```typescript
// config.ts
const normalizeApiKeyForConfig = (key: string) => {
  // 只存储密钥的部分信息
  return key.substring(0, 8) + '***';
};
```

---

## 🎯 实施建议

### 第一周：基础设施
- 实现所有 `constants/` 文件
- 完成 `Tool.ts` 接口定义
- 实现 `config.ts` 配置系统
- 实现 `model.ts` 模型管理

### 第二周：核心工具
- 实现文件系统工具 (FileRead, FileWrite, FileEdit)
- 实现搜索工具 (Grep, Glob)
- 实现基础服务 (claude.ts)

### 第三周：编排系统
- 实现 `agentLoader.ts`
- 实现 `query.ts` 查询处理
- 实现 `TaskTool`

### 第四周：用户界面
- 实现消息组件
- 实现权限系统
- 实现 `REPL.tsx` 主界面

### 第五周：完善和优化
- 实现 MCP 支持
- 实现高级工具
- 实现 CLI 入口
- 性能优化和测试

---

## 📋 检查清单

### 基础设施完成检查
- [ ] 所有常量定义完成
- [ ] `Tool.ts` 接口定义完成
- [ ] `config.ts` 配置系统完成
- [ ] `model.ts` 模型管理完成
- [ ] 基础工具类完成

### 核心服务完成检查
- [ ] 文件系统工具完成
- [ ] 搜索工具完成
- [ ] AI服务层完成
- [ ] 模型适配器系统完成

### 编排层完成检查
- [ ] `agentLoader.ts` 完成
- [ ] `TaskTool` 完成
- [ ] `query.ts` 完成
- [ ] 上下文管理完成

### 用户界面完成检查
- [ ] 消息组件完成
- [ ] 权限系统完成
- [ ] 主界面 `REPL.tsx` 完成
- [ ] 输入处理完成

### 扩展功能完成检查
- [ ] MCP 支持完成
- [ ] 高级工具完成
- [ ] CLI入口完成
- [ ] 性能优化完成

---

## 🔧 开发环境设置

### 必需依赖
```bash
bun install  # 安装所有依赖
```

### 开发命令
```bash
bun run dev       # 开发模式运行
bun run build     # 构建CLI包装器
bun run typecheck # 类型检查
bun run format    # 代码格式化
bun test         # 运行测试
```

### 调试技巧
```bash
# 启用详细调试输出
bun run dev --debug-verbose

# 安全模式运行
bun run dev --safe
```

---

*本实现指南确保了正确的依赖顺序和系统架构的完整性，为Kode项目的成功实施提供了详细的路线图。*