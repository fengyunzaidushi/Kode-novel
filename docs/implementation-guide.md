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

**🔧 实现内容**
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

**📋 开发步骤**
1. **实现接口定义**
   - 定义 `Tool` 泛型接口
   - 定义 `ToolUseContext` 和相关类型
   - 添加 `ValidationResult` 和 `ExtendedToolUseContext`

2. **🔧 构建测试**
   ```bash
   bun run build
   ```
   - 验证TypeScript编译通过
   - 确认接口导出正确

3. **🔵 类型测试**
   ```bash
   bun run typecheck
   ```
   - 验证接口定义无类型错误
   - 确认泛型约束正确

4. **🚀 提交代码**
   ```bash
   git add src/Tool.ts
   git commit -m "feat(core): implement Tool interface with generic support

   - Add Tool<TInput, TOutput> generic interface
   - Define ToolUseContext for execution context
   - Add ValidationResult and ExtendedToolUseContext types
   - Support for async tool descriptions and validation"
   ```

**依赖：** `zod`, `react`
**被依赖：** 所有工具实现

#### `src/constants/` 目录 - 系统常量 ⭐
**实现优先级：最高**

**🔧 实现顺序**
1. `constants/product.ts` - 产品信息
2. `constants/models.ts` - 模型定义
3. `constants/modelCapabilities.ts` - 模型能力映射
4. `constants/keys.ts` - 按键定义
5. `constants/figures.ts` - 图标字符
6. `constants/macros.ts` - 宏定义

**📋 开发步骤**

**第1步: `constants/product.ts`**
```typescript
// 实现内容
export const PRODUCT_NAME = 'Kode';
export const PRODUCT_COMMAND = 'kode';
```

**🔧 构建&测试**
```bash
bun run build && bun run typecheck
```
**验证**: 确认常量导出正确，无类型错误

**🚀 提交**
```bash
git commit -m "feat(constants): add product information constants"
```

**第2步: `constants/models.ts`**
```typescript
// 实现内容
export const DEFAULT_MODELS = {
  CLAUDE_OPUS: 'claude-3-opus-20240229',
  CLAUDE_SONNET: 'claude-3-5-sonnet-20241022',
  // ... 其他模型定义
}
```

**🔧 构建&测试**
```bash
bun run build && bun run typecheck
```
**验证**: 模型常量定义正确，类型推导正确

**🚀 提交**
```bash
git commit -m "feat(constants): add model definitions and defaults"
```

**第3-6步: 其他常量文件**
- 按相同流程依次实现剩余常量文件
- 每个文件独立提交，确保原子性

**依赖：** 无  
**被依赖：** 整个系统

#### `src/utils/config.ts` - 配置管理系统 ⭐
**实现优先级：最高**

**🔧 实现内容**
```typescript
// 核心功能：
- getGlobalConfig() / saveGlobalConfig()
- getCurrentProjectConfig() / saveCurrentProjectConfig()  
- 分层配置合并机制
- API密钥管理
- 模型配置验证
```

**📋 开发步骤**

**1. 实现基础配置接口**
```typescript
interface GlobalConfig {
  theme?: 'light' | 'dark';
  hasCompletedOnboarding?: boolean;
  models?: ModelConfig[];
  // ... 其他配置
}
```

**2. 实现配置文件操作**
- `getGlobalConfig()` - 读取全局配置
- `saveGlobalConfig()` - 保存全局配置  
- `getCurrentProjectConfig()` - 读取项目配置
- `saveCurrentProjectConfig()` - 保存项目配置

**3. 🔧 构建测试**
```bash
bun run build
```
**验证目标**:
- ✅ 配置接口编译通过
- ✅ 导出函数签名正确
- ✅ 依赖关系解析正确

**4. 🔵 类型测试**
```bash
bun run typecheck
```
**验证目标**:
- ✅ 配置接口类型正确
- ✅ 函数返回类型匹配
- ✅ 可选属性处理正确

**5. 🟡 功能测试**
```bash
# 创建简单测试脚本
node -e "
const { getGlobalConfig, saveGlobalConfig } = require('./dist/utils/config.js');
console.log('测试配置系统...');
const config = getGlobalConfig();
console.log('✅ 读取配置成功');
saveGlobalConfig({ ...config, test: true });
console.log('✅ 保存配置成功');
"
```
**验证目标**:
- ✅ 配置文件读取成功
- ✅ 配置文件写入成功
- ✅ 默认值处理正确
- ✅ 错误情况处理正常

**6. 🟠 集成测试**
```bash
# 测试配置系统与其他模块的集成
bun run dev --help
```
**验证目标**:
- ✅ CLI可以成功启动
- ✅ 配置系统被正确调用
- ✅ 默认配置生效

**7. 🚀 提交代码**
```bash
git add src/utils/config.ts
git commit -m "feat(config): implement hierarchical configuration system

- Add GlobalConfig and ProjectConfig interfaces
- Implement getGlobalConfig/saveGlobalConfig functions
- Add getCurrentProjectConfig/saveCurrentProjectConfig
- Support for configuration merging and validation
- Include API key management utilities

Tests:
- ✅ Build test passed
- ✅ Type checking passed  
- ✅ Functional tests passed
- ✅ Integration tests passed"
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

### Step 1: `tools/FileReadTool/FileReadTool.tsx`

**🔧 实现内容**
```typescript
// 核心功能：
- 文件内容读取 (文本、二进制)
- 图片/PDF/Jupyter支持
- 行号限制和偏移
- 错误处理和验证
```

**📋 开发步骤**

**1. 实现基础文件读取**
```typescript
class FileReadTool implements Tool {
  async call(input: FileReadInput, context: ToolUseContext) {
    // 实现文件读取逻辑
  }
}
```

**2. 🔧 构建测试**
```bash
bun run build
```
**验证**: 确保工具编译通过，导出正确

**3. 🔵 类型测试**
```bash
bun run typecheck
```
**验证**: Tool接口实现正确，输入输出类型匹配

**4. 🟡 功能测试**
```bash
# 创建测试环境
mkdir -p test-files
echo "Hello World" > test-files/test.txt
echo '{"test": true}' > test-files/test.json

# 运行工具测试
bun run dev
# 在REPL中测试:
# > 请读取 test-files/test.txt 文件
```
**验证目标**:
- ✅ 能够读取文本文件
- ✅ 能够处理不存在的文件
- ✅ 行号显示正确
- ✅ 支持偏移和限制参数

**5. 🟠 集成测试**
```bash
# 测试与权限系统集成
bun run dev --safe
# 验证权限请求正常弹出
```

**6. 🚀 提交代码**
```bash
git add src/tools/FileReadTool/
git commit -m "feat(tools): implement FileReadTool with multi-format support

- Add FileReadTool class with file reading capabilities
- Support text, image, PDF, and Jupyter notebook formats
- Include line offset and limit functionality
- Add proper error handling and path validation
- Integrate with permission system

Tests passed:
- ✅ Build and type checking
- ✅ Text file reading
- ✅ Error handling for missing files
- ✅ Permission integration"
```

### Step 2: `tools/FileWriteTool/FileWriteTool.tsx`

**🔧 实现内容**
```typescript
// 核心功能：
- 文件创建和覆写
- 权限检查和确认
- 备份机制 (可选)
- 目录自动创建
```

**📋 开发步骤**

**1-3. 基础实现 + 构建&类型测试** (同上)

**4. 🟡 功能测试**
```bash
# 测试文件写入
bun run dev
# 在REPL中测试:
# > 创建文件 test-files/new-file.txt 内容为 "测试内容"
# > 覆写文件 test-files/test.txt 内容为 "新内容"

# 验证文件内容
cat test-files/new-file.txt
cat test-files/test.txt
```
**验证目标**:
- ✅ 能够创建新文件
- ✅ 能够覆写现有文件  
- ✅ 目录不存在时自动创建
- ✅ 权限检查正常工作
- ✅ 错误处理正确

**5. 🚀 提交代码**
```bash
git commit -m "feat(tools): implement FileWriteTool with permission integration"
```

### Step 3: `tools/FileEditTool/FileEditTool.tsx`

**🔧 实现内容**
```typescript
// 核心功能：
- 精确字符串替换
- 上下文保持 (保持缩进格式)
- 替换冲突检测
- 替换预览功能
```

**📋 开发步骤**

**4. 🟡 功能测试**
```bash
# 准备测试文件
echo -e "function test() {\n  console.log('hello');\n}" > test-files/code.js

# 测试编辑功能
bun run dev
# 在REPL中测试:
# > 将 test-files/code.js 中的 'hello' 替换为 'world'
```
**验证目标**:
- ✅ 精确字符串匹配和替换
- ✅ 保持原有缩进和格式
- ✅ 处理替换冲突 (字符串不唯一)
- ✅ 显示替换预览

**5. 🚀 提交代码**
```bash
git commit -m "feat(tools): implement FileEditTool with precise string replacement"
```

### Step 4: `tools/MultiEditTool/MultiEditTool.tsx`

**🔧 实现内容**
```typescript
// 核心功能：
- 批量编辑操作
- 原子性保证 (全成功或全失败)
- 编辑冲突检测
- 操作回滚支持
```

**📋 开发步骤**

**4. 🟡 功能测试**
```bash
# 准备多个测试文件
mkdir -p test-files/multi
echo "const version = '1.0.0'" > test-files/multi/file1.js  
echo "const version = '1.0.0'" > test-files/multi/file2.js

# 测试批量编辑
bun run dev
# 在REPL中测试:
# > 在多个文件中将 '1.0.0' 替换为 '1.1.0'
```
**验证目标**:
- ✅ 能够同时编辑多个文件
- ✅ 所有编辑操作的原子性
- ✅ 编辑冲突时正确回滚
- ✅ 操作成功时显示汇总

**6. 📊 完整集成测试**
```bash
# 测试所有文件工具的协作
bun run dev
# 测试序列:
# 1. 读取文件 -> 2. 编辑文件 -> 3. 写入新文件 -> 4. 批量编辑
```

**7. 🚀 最终提交**
```bash
git add .
git commit -m "feat(tools): complete file system tools implementation

Implemented comprehensive file operation tools:
- FileReadTool: multi-format file reading
- FileWriteTool: safe file creation and writing  
- FileEditTool: precise string-based editing
- MultiEditTool: atomic batch editing operations

All tools include:
- Complete error handling
- Permission system integration
- Comprehensive test coverage
- User-friendly error messages

Integration tests passed for all file operations."
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

## 📋 完整测试验收清单

### 阶段一验收 - 基础设施
```bash
# 🔧 构建测试
bun run build
[ ] ✅ 编译无错误
[ ] ✅ 生成 cli.js 文件
[ ] ✅ 依赖关系正确解析

# 🔵 类型测试  
bun run typecheck
[ ] ✅ 无 TypeScript 错误
[ ] ✅ 接口定义完整
[ ] ✅ 泛型约束正确

# 🟡 基础功能测试
./cli.js --version
[ ] ✅ 显示版本信息
[ ] ✅ 配置系统加载成功
[ ] ✅ 模型管理器初始化
```

### 阶段二验收 - 核心服务
```bash
# 文件系统工具测试
echo "test" > test.txt && bun run dev
# 在REPL中执行: "读取 test.txt 文件"
[ ] ✅ FileReadTool 工作正常
[ ] ✅ FileWriteTool 创建文件成功
[ ] ✅ FileEditTool 编辑准确
[ ] ✅ 权限系统正常弹出

# AI服务测试
# 在REPL中执行: "Hello, how are you?"
[ ] ✅ Claude API 连接成功
[ ] ✅ 流式响应正常
[ ] ✅ 错误处理正确
[ ] ✅ 工具调用功能正常
```

### 阶段三验收 - 编排层
```bash
# 代理系统测试
bun run dev
# 在REPL中执行: "使用任务代理帮我分析这个项目"
[ ] ✅ agentLoader 加载配置
[ ] ✅ TaskTool 启动子代理
[ ] ✅ 工具权限过滤正确
[ ] ✅ 结果聚合正常

# 查询编排测试
# 在REPL中执行复杂多步骤任务
[ ] ✅ 多工具协作顺畅
[ ] ✅ 上下文管理正确
[ ] ✅ 错误恢复机制有效
```

### 阶段四验收 - 用户界面
```bash
# REPL界面测试
bun run dev
[ ] ✅ 界面渲染正确
[ ] ✅ 消息显示格式正确
[ ] ✅ 输入处理响应及时
[ ] ✅ 权限对话框正常
[ ] ✅ 快捷键功能正常

# 错误处理测试
# 故意触发各种错误场景
[ ] ✅ 网络错误处理优雅
[ ] ✅ 工具执行错误显示清晰
[ ] ✅ 用户输入错误提示友好
```

### 阶段五验收 - 扩展功能
```bash
# MCP集成测试
bun run dev
# 添加和测试MCP服务器
[ ] ✅ MCP服务器连接成功
[ ] ✅ 外部工具调用正常
[ ] ✅ 配置管理完整

# 高级工具测试
# 测试网络搜索、Notebook等工具
[ ] ✅ WebSearchTool 搜索准确
[ ] ✅ URLFetcherTool 获取内容
[ ] ✅ Notebook工具编辑正常
```

### 最终完整性测试
```bash
# 🔄 完整工作流测试
# 模拟真实使用场景: 分析项目 -> 实现功能 -> 测试 -> 提交
bun run dev
```

**测试场景**: "帮我分析这个React项目，添加一个新的组件，然后运行测试"

**验证清单**:
```
[ ] ✅ 项目分析 (FileRead + Grep + Glob)
[ ] ✅ 代码生成 (FileWrite + FileEdit) 
[ ] ✅ 测试执行 (BashTool)
[ ] ✅ 问题修复 (FileEdit + 错误处理)
[ ] ✅ 版本控制 (Bash + Git操作)
[ ] ✅ 全过程用户体验流畅
[ ] ✅ 错误恢复机制有效
[ ] ✅ 性能表现良好
```

### 🎯 性能基准测试
```bash
# 启动性能
time bun run dev --help
[ ] ✅ 启动时间 < 3秒
[ ] ✅ 内存使用 < 200MB

# 响应性能  
# 测试AI响应和工具执行速度
[ ] ✅ 简单查询响应 < 2秒
[ ] ✅ 文件操作响应 < 1秒
[ ] ✅ 复杂任务反馈及时
```

### 📊 质量指标
```bash
# 代码质量
bun run format:check
[ ] ✅ 代码格式符合规范
[ ] ✅ 无 ESLint 警告
[ ] ✅ 测试覆盖率 > 80%

# 用户体验
[ ] ✅ 错误消息清晰明了
[ ] ✅ 成功反馈及时准确
[ ] ✅ 帮助文档完整
[ ] ✅ 交互流程直观
```

---

## 🚀 部署前最终检查

### 构建和打包
```bash
# 清理和重新构建
bun run clean
bun install
bun run build
[ ] ✅ 干净构建成功
[ ] ✅ cli.js 文件正确生成
[ ] ✅ 依赖打包完整

# 分发测试
./cli.js --help
./cli.js --version  
./cli.js "简单测试问题"
[ ] ✅ 独立运行正常
[ ] ✅ 功能完整可用
[ ] ✅ 无明显性能问题
```

### 文档完整性
```
[ ] ✅ README.md 完整准确
[ ] ✅ API 文档齐全
[ ] ✅ 用户指南清晰
[ ] ✅ 开发者文档详细
[ ] ✅ 更新日志维护
```

### 发布准备
```bash
# 版本管理
[ ] ✅ package.json 版本正确
[ ] ✅ Git 标签创建
[ ] ✅ 更新日志完整

# npm 发布准备
npm pack --dry-run
[ ] ✅ 包内容正确
[ ] ✅ 发布配置完整
[ ] ✅ 许可证文件包含
```

---

*本实现指南提供了详尽的开发-测试-提交流程，确保Kode项目的每个组件都经过充分验证，为高质量的CLI工具奠定坚实基础。*