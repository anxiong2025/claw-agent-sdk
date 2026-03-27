# claw-agent-sdk 开发计划

## 项目定位

通用 AI Agent SDK for TypeScript — 像 Claude Agent SDK 一样开箱即用，但支持所有模型。

**一句话：** `npm install claw-agent-sdk` → 配个 API Key → 你的应用就有了 Agent 能力。

**第一落地场景：** 集成到 [wechat-ai](https://github.com/aspect-ai/wechat-ai)，让微信用户通过绿泡泡直接使用 Agent 能力。

---

## 设计哲学：零成本抽象

> 灵感来自 Rust — 你不用的东西，不为它付出代价；你用的东西，没有更好的方式。

### 五个核心原则

1. **零成本抽象** — 高级 API 不引入运行时开销。SDK 零外部依赖，用什么工具才加载什么工具，调什么模型才花什么钱
2. **非技术人 5 分钟上手** — `npm install` → 配 Key → 一行代码跑起来。不需要理解 ReAct、function calling、prompt engineering
3. **Skill 模式** — 借鉴 Claude Code skills，用声明式 YAML/Markdown 定义 Agent 能力模板，非技术人写配置文件就能创建新角色
4. **最省钱** — 默认用最便宜够用的模型，内置 budget 限制，token 使用量透明可控
5. **门槛低，天花板高** — 一行搞定简单场景，深度定制满足复杂需求

### 渐进式复杂度

```typescript
// Level 1: 一行代码（非技术人 / 微信场景）
await agent({ provider: "qwen" }).run("帮我总结这段话")

// Level 2: 带内置工具（初级开发者）
await agent({ provider: "qwen", tools: true }).run("分析这个项目的代码")

// Level 3: Skill 模板（运营 / 非技术人定义角色）
await agent({ skill: "./skills/code-reviewer.yaml" }).run("审查这个 PR")

// Level 4: 完全自定义（高级开发者）
await agent({ provider: {...}, tools: [...], hooks: {...}, budget: {...} }).run(...)
```

### 每个 API 设计决策的检验标准

- 非技术人能不能 5 分钟内跑通？
- 成本是否可控？有没有隐性消耗？
- 是否引入了不必要的复杂度？用户不用的功能是否有代价？

---

## wechat-ai 集成架构

### 现状分析

wechat-ai 当前有两类 Provider：
- **`claude-agent.ts`** — 用 `@anthropic-ai/claude-agent-sdk`，有完整 Agent 能力（工具调用、会话、流式）
- **`openai-compatible.ts`** — 手动 tool calling 循环，只支持 MCP 工具，无内置工具

### 目标架构

```
微信绿泡泡
    ↓
wechat-ai（消息网关）
    ├── /cc      → claude-agent.ts   → Claude Agent SDK（最强质量）
    ├── /qwen    → claw-agent.ts     → claw-agent-sdk（Agent 能力）  ← 新增
    ├── /deepseek→ claw-agent.ts     → claw-agent-sdk（Agent 能力）  ← 新增
    └── /gpt     → claw-agent.ts     → claw-agent-sdk（Agent 能力）  ← 新增
```

### 集成方式

在 wechat-ai 中新增 `src/providers/claw-agent.ts`，实现 Provider 接口：

```typescript
// wechat-ai/src/providers/claw-agent.ts
import { agent } from "claw-agent-sdk"

export class ClawAgentProvider implements Provider {
  readonly name: string
  private ai: ReturnType<typeof agent>

  constructor(config: ProviderConfig) {
    this.name = config.name ?? "claw-agent"
    this.ai = agent({
      provider: {
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
      },
      tools: config.allowedTools ?? true,
      maxTurns: 10,
    })
  }

  async query(prompt: string, sessionId: string): Promise<string> {
    const result = await this.ai.run(prompt, { sessionId })
    return result.text
  }

  async *stream(prompt: string, sessionId: string): AsyncIterable<ProviderResponse> {
    for await (const chunk of this.ai.stream(prompt, { sessionId })) {
      yield { text: chunk.text ?? "", done: chunk.type === "done" }
    }
  }
}
```

### 接口对齐

claw-agent-sdk 的 API 需要跟 wechat-ai 的 Provider 接口无缝对接：

| wechat-ai 需要 | claw-agent-sdk 提供 |
|---|---|
| `query(prompt, sessionId)` → `string` | `ai.run(prompt, { sessionId })` → `RunResult` |
| `stream(prompt, sessionId)` → `AsyncIterable` | `ai.stream(prompt, { sessionId })` → `AsyncIterable<StreamChunk>` |
| MCP 工具注入 | `ai.addTools(mcpTools)` 或构造时传入 |
| 系统提示词 | `agent({ systemPrompt })` 或 `run(prompt, { systemPrompt })` |
| 会话历史管理 | 内置 session 管理，按 sessionId 隔离 |

---

## Phase 1：核心引擎（v0.1.0）

> 目标：跑通「用户输入 → LLM 思考 → 调用工具 → 返回结果」的完整链路

### 1.1 项目骨架

- [ ] `package.json` — ESM, Node.js >= 22, tsup 构建
- [ ] `tsconfig.json` — strict mode, ES2022
- [ ] `.gitignore` / `.npmignore`
- [ ] `vitest.config.ts` — 测试配置

### 1.2 类型定义 `src/types.ts`

```typescript
// 核心接口设计
AgentConfig        // 创建 Agent 的配置
RunResult          // run() 返回值（text + steps + usage）
ToolStep           // 单次工具调用记录
ToolDefinition     // 工具定义（name + description + parameters + execute）
StreamChunk        // 流式输出块
ProviderConfig     // 模型 Provider 配置
Message            // 对话消息（role + content + tool_calls）
```

### 1.3 Provider 层 `src/providers/`

- [ ] `openai.ts` — OpenAI 兼容协议（覆盖 Qwen/DeepSeek/GPT/Gemini/GLM/MiniMax/OpenRouter）
  - chat completions API（`/v1/chat/completions`）
  - function calling（tools 参数）
  - 流式响应（SSE）
  - 内置各厂商预设（baseUrl + 默认 model + apiKeyEnv）
- [ ] `registry.ts` — Provider 注册表，根据名字或自定义 config 实例化

**暂不实现：** Anthropic 协议直连（Phase 3）

### 1.4 工具层 `src/tools/`

每个工具实现 `ToolDefinition` 接口：

- [ ] `read.ts` — 读取文件内容（支持行号范围）
- [ ] `write.ts` — 写入/创建文件
- [ ] `edit.ts` — 精确字符串替换编辑
- [ ] `glob.ts` — 按 glob 模式搜索文件路径
- [ ] `grep.ts` — 正则搜索文件内容
- [ ] `bash.ts` — 执行 shell 命令（带超时 + 沙箱限制）
- [ ] `index.ts` — 工具注册表，根据配置返回可用工具列表

**沙箱策略（bash）：**
- 默认超时 30s
- 可配置禁止命令列表（rm -rf, sudo 等）
- 工作目录限制在 cwd 内
- 可选 deny 模式：完全禁止 bash

### 1.5 Agent 循环 `src/agent/`

- [ ] `react-loop.ts` — ReAct 推理循环核心
  ```
  1. 将用户消息 + 工具定义发给 LLM
  2. LLM 返回 tool_calls → 执行工具 → 结果追加到消息
  3. 重复直到 LLM 返回纯文本（无 tool_calls）或达到 maxTurns
  4. 返回 RunResult
  ```
- [ ] `agent.ts` — Agent 主类，封装 config + provider + tools + loop
  - `run(prompt, options?)` → `Promise<RunResult>`
  - `stream(prompt, options?)` → `AsyncIterable<StreamChunk>`

### 1.6 入口 `src/index.ts`

```typescript
export { agent } from "./agent/agent.js"
export { defineTool } from "./tools/index.js"
export type { AgentConfig, RunResult, ToolStep, StreamChunk, ToolDefinition } from "./types.js"
```

### 1.7 Phase 1 验收标准

```typescript
import { agent } from "claw-agent-sdk"

const ai = agent({ provider: "qwen", apiKey: "sk-xxx", tools: true })
const result = await ai.run("读取当前目录的 package.json，告诉我项目名称")
// result.text → "项目名称是 claw-agent-sdk"
// result.steps → [{ tool: "glob", ... }, { tool: "read", ... }]
```

---

## Phase 2：会话 + 流式（v0.2.0）

> 目标：支持多轮对话和实时流式输出

- [ ] `src/session.ts` — 会话管理
  - 维护每个 sessionId 的消息历史
  - 支持上下文窗口控制（maxHistory / maxTokens）
  - `session.run()` / `session.stream()` / `session.clear()`
- [ ] 流式输出完善
  - `tool_start` / `tool_end` 事件
  - 文本 chunk 实时推送
  - `done` 事件携带完整 RunResult
- [ ] 错误处理增强
  - API 限流自动重试（指数退避）
  - 工具执行失败优雅降级
  - 模型不支持 function calling 时的 fallback

---

## Phase 3：Anthropic 协议 + MCP（v0.3.0）

> 目标：直连 Claude API + MCP 工具扩展

- [ ] `src/providers/anthropic.ts` — Anthropic Messages API 直连
  - 支持 Claude 原生 tool_use 格式
  - thinking/extended thinking 支持
- [ ] MCP 集成
  - 作为 MCP client 连接外部 MCP server
  - 将 MCP tools 注入 Agent 工具列表
  - 支持 `mcpServers` 配置项

---

## Phase 4：接入 wechat-ai（v0.4.0）

> 目标：替换 wechat-ai 的 openai-compatible provider，微信用户直接获得 Agent 能力

- [ ] 在 wechat-ai 新增 `src/providers/claw-agent.ts`，实现 Provider 接口
- [ ] config 中新增 `type: "claw-agent"` provider 类型
- [ ] 将 qwen / deepseek / gpt / gemini 等从 openai-compatible 迁移到 claw-agent
- [ ] `/qwen` `/deepseek` 等命令自动获得内置工具能力（文件、搜索、代码执行）
- [ ] 保留 `/cc` 走 Claude Agent SDK（最强质量兜底）
- [ ] MCP 工具桥接：wechat-ai 的 MCP tools 注入到 claw-agent-sdk
- [ ] 会话管理对接：sessionId 透传，多轮对话无缝衔接
- [ ] Skill 系统对接：wechat-ai 的 skill 配置映射为 claw-agent-sdk 的 skill 模板

### 用户体感变化

迁移前（openai-compatible）：
```
用户: /qwen 分析一下 src/config.ts 的代码
千问: 好的，请把代码发给我看看  ← 没有工具，不能自己读文件
```

迁移后（claw-agent-sdk）：
```
用户: /qwen 分析一下 src/config.ts 的代码
千问: [自动读取文件] 这个文件定义了配置管理...  ← 有 Agent 能力，自己读文件分析
```

---

## Phase 5：多 Agent + 发布（v1.0.0）

> 目标：多 Agent 协作 + 正式发布

- [ ] 多 Agent 编排（Agent A 调用 Agent B）
- [ ] Agent 角色定义（coder / researcher / reviewer）
- [ ] CLI 工具（`npx claw-agent-sdk run "..."` 终端直接用）
- [ ] 完善文档 + 示例项目
- [ ] npm 正式版发布

---

## 技术栈

| 项 | 选型 | 理由 |
|---|---|---|
| 语言 | TypeScript（strict） | 类型安全，npm 生态 |
| 运行时 | Node.js >= 22 | 原生 fetch, fs/promises |
| 构建 | tsup | ESM + CJS 双输出，零配置 |
| 测试 | vitest | 快，TS 原生支持 |
| 包管理 | npm | 最广泛 |
| HTTP | 原生 fetch | 零依赖 |
| 文件操作 | node:fs/promises | 零依赖 |
| Glob | picomatch 或 fast-glob | 轻量 |
| 子进程 | node:child_process | Bash 执行 |

**零依赖目标：** 核心只依赖 Node.js 标准库 + 1-2 个轻量工具库（glob 匹配）。

---

## 目录结构

```
claw-agent-sdk/
├── src/
│   ├── index.ts              # 公共导出
│   ├── types.ts              # 所有类型定义
│   ├── agent/
│   │   ├── agent.ts          # Agent 主类
│   │   ├── react-loop.ts     # ReAct 循环引擎
│   │   └── session.ts        # 会话管理（Phase 2）
│   ├── providers/
│   │   ├── registry.ts       # Provider 注册表
│   │   ├── openai.ts         # OpenAI 兼容协议
│   │   └── anthropic.ts      # Anthropic 协议（Phase 3）
│   └── tools/
│       ├── index.ts          # 工具注册表
│       ├── read.ts           # 文件读取
│       ├── write.ts          # 文件写入
│       ├── edit.ts           # 文件编辑
│       ├── glob.ts           # 文件搜索
│       ├── grep.ts           # 内容搜索
│       ├── bash.ts           # 命令执行
│       ├── web-search.ts     # 网络搜索
│       └── web-fetch.ts      # 网页抓取
├── tests/
│   ├── agent.test.ts         # Agent 集成测试
│   ├── tools.test.ts         # 工具单元测试
│   └── providers.test.ts     # Provider 测试
├── examples/
│   ├── basic.ts              # 基础用法示例
│   ├── tools.ts              # 工具使用示例
│   └── custom-tool.ts        # 自定义工具示例
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── .gitignore
├── .npmignore
├── PLAN.md                   # 本文件
├── README.md                 # 对外文档
└── LICENSE
```

---

## 风险和决策点

### 1. 模型 function calling 质量差异

不同模型的 tool calling 能力差距大。Qwen 和 DeepSeek 的 function calling 可能不如 GPT-4o 精准。

**应对：** 工具描述尽量简洁清晰，参数用最简单的类型。Phase 2 加入模型特定的 prompt 优化。

### 2. Bash 安全性

Agent 能执行 shell 命令，有安全风险。

**应对：** 默认开启沙箱（超时 + 禁止危险命令），提供 `sandbox: false` 选项给信任场景。不尝试做完美沙箱，而是提供合理默认值 + 清晰文档。

### 3. 网络搜索实现

WebSearch 需要搜索引擎 API（Google/Bing），增加了配置成本。

**应对：** Phase 1 先支持 web_fetch（抓取指定 URL），web_search 作为可选功能，需要用户提供搜索 API key。

### 4. 与 Claude Agent SDK 的竞争定位

不是替代 Claude Agent SDK，而是互补：Claude Agent SDK 做最强质量，claw-agent-sdk 做最广覆盖。

---

## 里程碑时间线

| 里程碑 | 内容 | 预估 |
|---|---|---|
| **v0.1.0** | 核心引擎可用 | Phase 1 |
| **v0.2.0** | 会话 + 流式 | Phase 2 |
| **v0.3.0** | Anthropic + MCP | Phase 3 |
| **v0.4.0** | 接入 wechat-ai | Phase 4 |
| **v1.0.0** | 正式发布 | Phase 5 |
