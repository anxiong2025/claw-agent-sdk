// ============================================================
// claw-agent-sdk — Core Type Definitions
// ============================================================

/** 模型 Provider 配置 */
export interface ProviderConfig {
  baseUrl: string
  apiKey: string
  model: string
  /** 从环境变量读取 API Key 的变量名 */
  apiKeyEnv?: string
}

/** Agent 创建配置 */
export interface AgentConfig {
  /** 模型名（预设）或自定义 Provider 配置 */
  provider: string | ProviderConfig
  /** API Key（优先于 Provider 预设中的 apiKeyEnv） */
  apiKey?: string
  /** 模型名覆盖 */
  model?: string
  /** API 地址覆盖 */
  baseUrl?: string

  /** 工具配置：true=全部内置工具，false=无工具，数组=指定工具名 */
  tools?: boolean | string[] | ToolDefinition[]
  /** 额外自定义工具（与内置工具合并） */
  extraTools?: ToolDefinition[]
  /** 最大工具调用轮数（默认 10） */
  maxTurns?: number
  /** 单次回复最大 token（默认 4096） */
  maxTokens?: number
  /** 总超时 ms（默认 120000） */
  timeout?: number
  /** 系统提示词 */
  systemPrompt?: string
  /** 工作目录（默认 process.cwd()） */
  cwd?: string
}

/** 工具定义 */
export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute: (params: Record<string, unknown>) => Promise<string>
}

/** 单次工具调用记录 */
export interface ToolStep {
  tool: string
  input: Record<string, unknown>
  output: string
  duration: number
}

/** Agent 执行结果 */
export interface RunResult {
  text: string
  steps: ToolStep[]
  usage: { promptTokens: number; completionTokens: number; totalTokens: number }
  duration: number
}

/** 流式输出块 */
export interface StreamChunk {
  type: "text" | "tool_start" | "tool_end" | "done"
  text?: string
  tool?: string
  step?: ToolStep
  result?: RunResult
}

// ============================================================
// 内部类型（Provider 层 / Agent 循环使用）
// ============================================================

/** 对话消息 */
export interface Message {
  role: "system" | "user" | "assistant" | "tool"
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

/** LLM 返回的工具调用 */
export interface ToolCall {
  id: string
  type: "function"
  function: {
    name: string
    arguments: string
  }
}

/** OpenAI chat completions 响应 */
export interface ChatCompletionResponse {
  id: string
  choices: Array<{
    index: number
    message: Message
    finish_reason: string | null
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/** OpenAI chat completions 流式响应 chunk */
export interface ChatCompletionChunk {
  id: string
  choices: Array<{
    index: number
    delta: Partial<Message> & {
      tool_calls?: Array<{
        index: number
        id?: string
        type?: "function"
        function?: { name?: string; arguments?: string }
      }>
    }
    finish_reason: string | null
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/** Provider 接口 — 负责跟 LLM API 通信 */
export interface Provider {
  chat(messages: Message[], tools: OpenAITool[], options: ChatOptions): Promise<ChatCompletionResponse>
  chatStream(messages: Message[], tools: OpenAITool[], options: ChatOptions): AsyncIterable<ChatCompletionChunk>
}

/** 传给 Provider 的选项 */
export interface ChatOptions {
  model: string
  maxTokens: number
  signal?: AbortSignal
}

/** OpenAI function calling 工具格式 */
export interface OpenAITool {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}
