# Kode 项目快速启动模板

> 从零开始快速构建 Kode CLI 工具的最小可运行版本

## 📋 快速启动清单

### 1. 项目初始化 (5分钟)
```bash
# 创建新项目
mkdir my-kode-project
cd my-kode-project

# 初始化 package.json
npm init -y

# 安装必需依赖
bun install
```

### 2. 基础文件结构
```
my-kode-project/
├── package.json           # 项目配置
├── tsconfig.json          # TypeScript配置
├── src/
│   ├── constants/
│   │   ├── product.ts     # 产品信息
│   │   └── models.ts      # 模型定义
│   ├── utils/
│   │   └── config.ts      # 配置管理
│   ├── Tool.ts            # 工具接口
│   ├── tools.ts           # 工具注册
│   ├── entrypoints/
│   │   └── cli.tsx        # CLI入口
│   └── screens/
│       └── SimpleREPL.tsx # 简单界面
├── scripts/
│   └── build.ts           # 构建脚本
└── docs/
```

## 📁 核心文件模板

### package.json
```json
{
  "name": "my-kode",
  "version": "0.1.0",
  "bin": {
    "my-kode": "cli.js"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "main": "cli.js",
  "scripts": {
    "dev": "bun run ./src/entrypoints/cli.tsx",
    "build": "bun run scripts/build.ts",
    "typecheck": "tsc --noEmit",
    "test": "echo 'Hello from my-kode!'"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@commander-js/extra-typings": "^13.1.0",
    "ink": "^5.2.1",
    "react": "18.3.1",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/node": "^24.1.0",
    "@types/react": "^19.1.8",
    "typescript": "^5.9.2"
  }
}
```

### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "esModuleInterop": true,
    "strict": false,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowJs": true,
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react",
    "baseUrl": ".",
    "types": ["bun-types", "node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### src/constants/product.ts
```typescript
export const PRODUCT_NAME = 'My Kode';
export const PRODUCT_COMMAND = 'my-kode';
export const VERSION = '0.1.0';
```

### src/constants/models.ts
```typescript
export const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';

export const MODELS = {
  CLAUDE_SONNET: 'claude-3-5-sonnet-20241022',
  CLAUDE_OPUS: 'claude-3-opus-20240229',
} as const;
```

### src/Tool.ts
```typescript
import { z } from 'zod';
import * as React from 'react';

export interface ToolUseContext {
  messageId: string | undefined;
  abortController: AbortController;
}

export interface Tool<
  TInput extends z.ZodObject<any> = z.ZodObject<any>,
  TOutput = any,
> {
  name: string;
  description: () => Promise<string>;
  inputSchema: TInput;
  call: (
    input: z.infer<TInput>,
    context: ToolUseContext,
  ) => AsyncGenerator<{ type: 'result'; data: TOutput }, void, unknown>;
}
```

### src/utils/config.ts
```typescript
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

interface GlobalConfig {
  apiKey?: string;
  model?: string;
  theme?: 'light' | 'dark';
}

const CONFIG_DIR = join(homedir(), '.my-kode');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export function getGlobalConfig(): GlobalConfig {
  if (!existsSync(CONFIG_FILE)) {
    return {};
  }
  
  try {
    const content = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export function saveGlobalConfig(config: GlobalConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}
```

### src/tools.ts
```typescript
import { Tool } from './Tool';

// 简单的回显工具作为示例
export const EchoTool: Tool = {
  name: 'echo',
  description: async () => 'Echo back the input text',
  inputSchema: require('zod').object({
    text: require('zod').string(),
  }),
  async *call(input) {
    yield {
      type: 'result',
      data: `Echo: ${input.text}`,
    };
  },
};

export async function getTools(): Promise<Tool[]> {
  return [EchoTool];
}
```

### src/screens/SimpleREPL.tsx
```typescript
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface Props {
  onExit: () => void;
}

export function SimpleREPL({ onExit }: Props) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<string[]>([
    'Welcome to My Kode! Type "help" for commands or "exit" to quit.',
  ]);

  useInput((input, key) => {
    if (key.return) {
      const command = input.trim();
      setMessages(prev => [...prev, `> ${command}`]);
      
      if (command === 'exit') {
        onExit();
      } else if (command === 'help') {
        setMessages(prev => [...prev, 'Available commands: help, exit']);
      } else if (command.startsWith('echo ')) {
        setMessages(prev => [...prev, command.slice(5)]);
      } else {
        setMessages(prev => [...prev, 'Unknown command. Type "help" for available commands.']);
      }
      
      setInput('');
    } else if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
    } else if (!key.ctrl && !key.meta) {
      setInput(prev => prev + input);
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="column" marginBottom={1}>
        {messages.map((msg, i) => (
          <Text key={i}>{msg}</Text>
        ))}
      </Box>
      <Box>
        <Text color="blue">$ </Text>
        <Text>{input}</Text>
        <Text color="gray">_</Text>
      </Box>
    </Box>
  );
}
```

### src/entrypoints/cli.tsx
```typescript
#!/usr/bin/env -S bun --no-warnings
import React from 'react';
import { render } from 'ink';
import { Command } from '@commander-js/extra-typings';
import { SimpleREPL } from '../screens/SimpleREPL';
import { PRODUCT_NAME, PRODUCT_COMMAND, VERSION } from '../constants/product';

async function main() {
  const program = new Command();

  program
    .name(PRODUCT_COMMAND)
    .description(`${PRODUCT_NAME} - AI-powered terminal assistant`)
    .version(VERSION)
    .action(() => {
      // 启动简单的REPL界面
      const { unmount } = render(<SimpleREPL onExit={() => {
        unmount();
        process.exit(0);
      }} />);
    });

  await program.parseAsync(process.argv);
}

main().catch(console.error);
```

### scripts/build.ts
```typescript
#!/usr/bin/env bun
import { writeFileSync, chmodSync, existsSync, rmSync } from 'fs';

async function build() {
  console.log('🚀 Building My Kode CLI...\n');
  
  // Clean previous builds
  if (existsSync('cli.js')) {
    rmSync('cli.js');
  }
  
  // Create CLI wrapper
  const wrapper = `#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const cliPath = path.join(__dirname, 'src', 'entrypoints', 'cli.tsx');

// Try bun first, fallback to tsx
try {
  const { execSync } = require('child_process');
  execSync('bun --version', { stdio: 'ignore' });
  
  const child = spawn('bun', ['run', cliPath, ...args], { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code || 0));
} catch {
  const child = spawn('npx', ['tsx', cliPath, ...args], { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code || 0));
}
`;
  
  writeFileSync('cli.js', wrapper);
  chmodSync('cli.js', 0o755);
  
  console.log('✅ Build completed!');
  console.log('📦 Generated: cli.js');
}

if (import.meta.main) {
  build();
}
```

## 🚀 快速启动步骤

### Step 1: 创建项目
```bash
mkdir my-kode-project
cd my-kode-project

# 复制所有上述文件到对应位置
```

### Step 2: 安装依赖
```bash
bun install
```

### Step 3: 开发模式运行
```bash
bun run dev
```

### Step 4: 构建和测试
```bash
# 构建CLI
bun run build

# 测试构建结果
./cli.js --version
./cli.js
```

## 🧪 验证清单

```bash
# ✅ 构建测试
bun run build
[ ] 生成 cli.js 文件
[ ] 文件有执行权限

# ✅ 功能测试  
./cli.js
[ ] 显示欢迎信息
[ ] 可以输入命令
[ ] help 命令工作
[ ] exit 命令退出

# ✅ 开发测试
bun run dev  
[ ] 开发模式启动
[ ] 热重载工作
[ ] TypeScript 编译无错误
```

## 🎯 下一步扩展

基于这个最小模板，你可以按照实现指南逐步添加：

1. **配置系统增强** - API密钥管理、多环境配置
2. **AI服务集成** - Claude API、流式响应处理
3. **工具系统** - 文件操作、搜索、命令执行工具
4. **权限系统** - 安全控制、用户确认
5. **完整UI** - 消息组件、权限对话框、进度显示

## 📝 提交建议

```bash
git init
git add .
git commit -m "feat: initial Kode CLI project setup

- Add basic project structure and configuration
- Implement simple REPL interface
- Add build system with bun/tsx fallback
- Include TypeScript configuration
- Add basic tool system foundation

Ready for feature development following implementation guide."
```

这个模板提供了一个**立即可运行**的基础版本，你可以在此基础上按照详细实现指南逐步构建完整功能。