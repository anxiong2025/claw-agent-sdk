# claw-agent-sdk

**通用 AI Agent SDK for TypeScript** — 像 Claude Agent SDK 一样强大，但支持所有模型。

```typescript
import { agent } from "claw-agent-sdk"

const ai = agent({ provider: "qwen", apiKey: "sk-xxx" })
const result = await ai.run("读取 src/index.ts 并找出性能瓶颈")
console.log(result.text)
```

一行配置，一行调用。内置文件操作、代码执行、网络搜索 — 不需要自己写工具。

---

## 为什么需要这个 SDK

| 现有产品 | 问题 |
|---|---|
| Claude Agent SDK | 只能用 Claude 模型 |
| Vercel AI SDK | 没有内置工具，需自己写 |
| OpenAI Agents SDK | 内置工具只限 OpenAI |
| LangChain.js | 太复杂，学习成本高 |
| CrewAI | Python，Node.js 用不了 |

**claw-agent-sdk 填补的空白：TypeScript 生态里唯一一个「多模型 + 内置工具 + 开箱即用」的 Agent SDK。**

---

## 特性

- **多模型支持** — Qwen、DeepSeek、GPT、Gemini、Claude、GLM、MiniMax、OpenRouter，以及任何 OpenAI 兼容 API
- **内置工具** — 文件读写、代码搜索、命令执行、网络搜索，开箱即用
- **安全沙箱** — Bash 执行带权限控制，防止危险操作
- **流式输出** — 支持 SSE 流式返回，适配实时场景
- **会话管理** — 自动维护上下文，支持多轮对话
- **MCP 兼容** — 支持 Model Context Protocol 扩展工具
- **轻量** — 零外部依赖（除 Node.js 标准库），不到 1000 行核心代码

---

## 安装

```bash
npm install claw-agent-sdk
```

---

## 快速开始

### 基本对话

```typescript
import { agent } from "claw-agent-sdk"

const ai = agent({
  provider: "deepseek",
  apiKey: process.env.DEEPSEEK_API_KEY,
})

const result = await ai.run("用 TypeScript 写一个快速排序")
console.log(result.text)
```

### Agent 模式（自动使用工具）

```typescript
const ai = agent({
  provider: "qwen",
  apiKey: process.env.DASHSCOPE_API_KEY,
  tools: true, // 启用内置工具
})

// Agent 会自动读取文件、搜索代码、执行命令
const result = await ai.run("分析当前项目的 package.json，列出所有过期的依赖")
console.log(result.text)

// 查看 Agent 执行了哪些工具
for (const step of result.steps) {
  console.log(`${step.tool}: ${step.input} → ${step.output}`)
}
```

### 流式输出

```typescript
for await (const chunk of ai.stream("解释这段代码的作用")) {
  process.stdout.write(chunk.text)
}
```

### 自定义工具

```typescript
import { agent, defineTool } from "claw-agent-sdk"

const weather = defineTool({
  name: "get_weather",
  description: "获取指定城市的天气",
  parameters: {
    type: "object",
    properties: {
      city: { type: "string", description: "城市名" },
    },
    required: ["city"],
  },
  execute: async ({ city }) => {
    const res = await fetch(`https://api.weather.com/${city}`)
    return await res.json()
  },
})

const ai = agent({
  provider: "qwen",
  apiKey: "sk-xxx",
  tools: [weather], // 自定义工具 + 内置工具都可用
})
```

---

## 支持的模型

| Provider | 模型 | 环境变量 |
|---|---|---|
| `qwen` | Qwen Plus / Turbo / Max | `DASHSCOPE_API_KEY` |
| `deepseek` | DeepSeek Chat / Coder | `DEEPSEEK_API_KEY` |
| `gpt` | GPT-4o / GPT-4o-mini | `OPENAI_API_KEY` |
| `claude` | Claude Sonnet / Opus | `ANTHROPIC_API_KEY` |
| `gemini` | Gemini 2.0 Flash / Pro | `GEMINI_API_KEY` |
| `glm` | GLM-4 Plus | `GLM_API_KEY` |
| `minimax` | MiniMax-Text-01 | `MINIMAX_API_KEY` |
| `openrouter` | 300+ 模型 | `OPENROUTER_API_KEY` |
| 自定义 | 任何 OpenAI 兼容 API | - |

### 自定义 Provider

```typescript
const ai = agent({
  provider: {
    baseUrl: "https://your-api.com/v1",
    apiKey: "sk-xxx",
    model: "your-model-name",
  },
})
```

---

## 内置工具

当 `tools: true` 时，Agent 自动获得以下能力：

| 工具 | 功能 | 说明 |
|---|---|---|
| `read` | 读取文件 | 支持文本、图片、PDF |
| `write` | 写入文件 | 创建或覆盖文件 |
| `edit` | 编辑文件 | 精确字符串替换 |
| `glob` | 搜索文件 | 按模式匹配文件路径 |
| `grep` | 搜索内容 | 正则搜索文件内容 |
| `bash` | 执行命令 | 沙箱化 shell 执行 |
| `web_search` | 网络搜索 | 搜索引擎查询 |
| `web_fetch` | 抓取网页 | 获取 URL 内容 |

### 工具权限控制

```typescript
const ai = agent({
  provider: "qwen",
  apiKey: "sk-xxx",
  tools: {
    allow: ["read", "glob", "grep"],           // 只允许读操作
    deny: ["bash", "write"],                    // 禁止执行和写入
    bash: { timeout: 10000, sandbox: true },    // Bash 超时 + 沙箱
  },
})
```

---

## Agent 循环

SDK 使用 ReAct（Reasoning + Acting）模式驱动 Agent：

```
用户消息
   ↓
┌─────────────────────────────┐
│  LLM 思考（需要什么信息？）    │ ←──┐
└──────────┬──────────────────┘    │
           ↓                       │
   调用工具（读文件/搜索/执行）      │
           ↓                       │
   工具返回结果                     │
           ↓                       │
   结果喂回 LLM ──────────────────┘
           ↓
   （循环直到 LLM 给出最终回答）
           ↓
      返回结果
```

### 配置循环

```typescript
const ai = agent({
  provider: "deepseek",
  apiKey: "sk-xxx",
  tools: true,
  maxTurns: 20,         // 最大工具调用轮数（默认 10）
  maxTokens: 4096,      // 单次回复最大 token
  timeout: 120000,      // 总超时 2 分钟
})
```

---

## 会话管理

```typescript
// 创建会话
const session = ai.session("user-123")

// 多轮对话，自动维护上下文
await session.run("读取 src/config.ts")
await session.run("把 defaultProvider 改成 deepseek")
await session.run("改完了吗？确认一下")

// 清除会话
session.clear()
```

---

## 与 wechat-ai 集成

claw-agent-sdk 是 [wechat-ai](https://github.com/anxiong2025/wechat-ai) 的底层 Agent 引擎：

```
微信消息 → wechat-ai（网关）→ claw-agent-sdk（执行）→ 回复
```

```typescript
// wechat-ai 内部使用示例
import { agent } from "claw-agent-sdk"

const qwenAgent = agent({
  provider: "qwen",
  apiKey: config.providers.qwen.apiKey,
  tools: true,
})

// 用户发 /qwen 时
const result = await qwenAgent.run(userMessage, { sessionId })
```

---

## 与 Claude Agent SDK 的关系

| 场景 | 用哪个 |
|---|---|
| 需要最强 agent 能力 | Claude Agent SDK（`/cc`） |
| 用国内模型 + agent 能力 | claw-agent-sdk（`/qwen` `/deepseek`） |
| 纯对话，不需要工具 | claw-agent-sdk（tools: false） |

两者在 wechat-ai 中并存，用户通过命令切换：

```
/cc       → Claude Agent SDK（Claude 专属，最强）
/qwen     → claw-agent-sdk + 通义千问
/deepseek → claw-agent-sdk + DeepSeek
```

---

## API 参考

### `agent(config)`

创建 Agent 实例。

```typescript
interface AgentConfig {
  // 模型配置
  provider: string | ProviderConfig   // 模型名或自定义配置
  apiKey?: string                     // API Key
  model?: string                      // 模型名覆盖
  baseUrl?: string                    // API 地址覆盖

  // Agent 配置
  tools?: boolean | string[] | ToolConfig  // 工具配置
  maxTurns?: number                   // 最大工具调用轮数（默认 10）
  maxTokens?: number                  // 单次最大 token（默认 4096）
  timeout?: number                    // 总超时 ms（默认 120000）
  systemPrompt?: string               // 系统提示词

  // 安全
  cwd?: string                        // 工作目录（默认 process.cwd()）
  sandbox?: boolean                   // Bash 沙箱模式（默认 true）
}
```

### `ai.run(prompt, options?)`

执行 Agent 任务，返回结果。

```typescript
interface RunResult {
  text: string                   // 最终回复文本
  steps: ToolStep[]              // 工具调用记录
  usage: { tokens: number }      // Token 使用量
  duration: number               // 执行时长 ms
}

interface ToolStep {
  tool: string                   // 工具名
  input: Record<string, any>     // 工具输入
  output: string                 // 工具输出
  duration: number               // 执行时长 ms
}
```

### `ai.stream(prompt, options?)`

流式执行，返回 AsyncIterable。

```typescript
interface StreamChunk {
  type: "text" | "tool_start" | "tool_end" | "done"
  text?: string
  tool?: string
  step?: ToolStep
}
```

### `ai.session(id)`

创建持久化会话。

```typescript
interface Session {
  run(prompt: string): Promise<RunResult>
  stream(prompt: string): AsyncIterable<StreamChunk>
  clear(): void
  history: Message[]
}
```

### `defineTool(config)`

定义自定义工具。

```typescript
interface ToolDefinition {
  name: string
  description: string
  parameters: JSONSchema
  execute: (params: any) => Promise<any>
}
```

---

## 架构

```
claw-agent-sdk
├── src/
│   ├── index.ts              # 公共 API 导出
│   ├── agent.ts              # Agent 主类
│   ├── session.ts            # 会话管理
│   ├── react-loop.ts         # ReAct 推理循环
│   ├── providers/
│   │   ├── index.ts          # Provider 注册
│   │   ├── openai.ts         # OpenAI 兼容协议（覆盖 90% 模型）
│   │   └── anthropic.ts      # Anthropic 协议（直连 Claude API）
│   ├── tools/
│   │   ├── index.ts          # 工具注册
│   │   ├── read.ts           # 文件读取
│   │   ├── write.ts          # 文件写入
│   │   ├── edit.ts           # 文件编辑
│   │   ├── glob.ts           # 文件搜索
│   │   ├── grep.ts           # 内容搜索
│   │   ├── bash.ts           # 命令执行（沙箱）
│   │   ├── web-search.ts     # 网络搜索
│   │   └── web-fetch.ts      # 网页抓取
│   └── types.ts              # 类型定义
├── package.json
├── tsconfig.json
└── README.md
```

---

## Roadmap

- [x] v0.1 — 核心 Agent 循环 + OpenAI 协议适配 + 内置工具
- [ ] v0.2 — 流式输出 + 会话管理
- [ ] v0.3 — MCP 工具扩展支持
- [ ] v0.4 — Anthropic 协议直连
- [ ] v0.5 — 多 Agent 协作
- [ ] v1.0 — 稳定版发布

---

## License

MIT
