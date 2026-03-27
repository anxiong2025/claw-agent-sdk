import { OpenAIProvider } from "./providers/openai.js"
import { PRESETS } from "./providers/presets.js"
import { resolveTools } from "./tools/index.js"
import type {
  AgentConfig,
  ChatOptions,
  Message,
  OpenAITool,
  Provider,
  RunResult,
  StreamChunk,
  ToolCall,
  ToolDefinition,
  ToolStep,
} from "./types.js"

export class Agent {
  private provider: Provider
  private tools: ToolDefinition[]
  private model: string
  private maxTurns: number
  private maxTokens: number
  private timeout: number
  private systemPrompt: string | undefined
  private cwd: string

  constructor(config: AgentConfig) {
    this.cwd = config.cwd ?? process.cwd()
    this.maxTurns = config.maxTurns ?? 10
    this.maxTokens = config.maxTokens ?? 4096
    this.timeout = config.timeout ?? 120_000
    this.systemPrompt = config.systemPrompt

    // 解析 Provider
    const { provider, apiKey, model, baseUrl } = this.resolveProvider(config)
    this.provider = provider
    this.model = model

    // 解析工具
    this.tools = resolveTools(config.tools, config.extraTools, this.cwd)
  }

  private resolveProvider(config: AgentConfig): {
    provider: Provider
    apiKey: string
    model: string
    baseUrl: string
  } {
    let baseUrl: string
    let apiKey: string
    let model: string

    if (typeof config.provider === "string") {
      const preset = PRESETS[config.provider]
      if (!preset) throw new Error(`Unknown provider "${config.provider}". Available: ${Object.keys(PRESETS).join(", ")}`)
      baseUrl = config.baseUrl ?? preset.baseUrl
      model = config.model ?? preset.model
      apiKey = config.apiKey ?? process.env[preset.apiKeyEnv] ?? ""
      if (!apiKey) throw new Error(`API key required. Set ${preset.apiKeyEnv} env var or pass apiKey option.`)
    } else {
      baseUrl = config.baseUrl ?? config.provider.baseUrl
      model = config.model ?? config.provider.model
      apiKey = config.apiKey ?? config.provider.apiKey
    }

    return { provider: new OpenAIProvider(baseUrl, apiKey), apiKey, model, baseUrl }
  }

  /** 将内部工具转为 OpenAI function calling 格式 */
  private toOpenAITools(): OpenAITool[] {
    return this.tools.map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }))
  }

  /** 执行工具调用 */
  private async executeTool(toolCall: ToolCall): Promise<ToolStep> {
    const tool = this.tools.find((t) => t.name === toolCall.function.name)
    const start = Date.now()

    if (!tool) {
      return {
        tool: toolCall.function.name,
        input: {},
        output: `Error: unknown tool "${toolCall.function.name}"`,
        duration: Date.now() - start,
      }
    }

    let input: Record<string, unknown> = {}
    try {
      input = JSON.parse(toolCall.function.arguments)
    } catch {
      return {
        tool: tool.name,
        input: {},
        output: `Error: invalid JSON arguments: ${toolCall.function.arguments}`,
        duration: Date.now() - start,
      }
    }

    try {
      const output = await tool.execute(input)
      return { tool: tool.name, input, output, duration: Date.now() - start }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { tool: tool.name, input, output: `Error: ${msg}`, duration: Date.now() - start }
    }
  }

  /** 同步执行：完整 ReAct 循环 */
  async run(prompt: string, options?: { sessionId?: string; messages?: Message[] }): Promise<RunResult> {
    const start = Date.now()
    const steps: ToolStep[] = []
    const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

    // 构造初始消息
    const messages: Message[] = options?.messages ? [...options.messages] : []
    if (this.systemPrompt && (messages.length === 0 || messages[0].role !== "system")) {
      messages.unshift({ role: "system", content: this.systemPrompt })
    }
    messages.push({ role: "user", content: prompt })

    const chatOptions: ChatOptions = {
      model: this.model,
      maxTokens: this.maxTokens,
      signal: AbortSignal.timeout(this.timeout),
    }
    const openaiTools = this.toOpenAITools()

    // ReAct 循环
    for (let turn = 0; turn < this.maxTurns; turn++) {
      const response = await this.provider.chat(messages, openaiTools, chatOptions)

      // 累计 usage
      if (response.usage) {
        usage.promptTokens += response.usage.prompt_tokens
        usage.completionTokens += response.usage.completion_tokens
        usage.totalTokens += response.usage.prompt_tokens + response.usage.completion_tokens
      }

      const choice = response.choices[0]
      if (!choice) throw new Error("No response from LLM")

      const assistantMsg = choice.message
      messages.push(assistantMsg)

      // 无工具调用 → 最终回答
      if (!assistantMsg.tool_calls?.length) {
        return {
          text: assistantMsg.content ?? "",
          steps,
          usage,
          duration: Date.now() - start,
        }
      }

      // 执行工具调用
      for (const toolCall of assistantMsg.tool_calls) {
        const step = await this.executeTool(toolCall)
        steps.push(step)
        messages.push({
          role: "tool",
          content: step.output,
          tool_call_id: toolCall.id,
        })
      }
    }

    // 达到 maxTurns，取最后一个 assistant 回复
    const lastAssistant = messages.filter((m) => m.role === "assistant").pop()
    return {
      text: lastAssistant?.content ?? "(Reached max turns without final answer)",
      steps,
      usage,
      duration: Date.now() - start,
    }
  }

  /** 流式执行：实时返回 StreamChunk */
  async *stream(prompt: string, options?: { sessionId?: string; messages?: Message[] }): AsyncIterable<StreamChunk> {
    const start = Date.now()
    const steps: ToolStep[] = []
    const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

    const messages: Message[] = options?.messages ? [...options.messages] : []
    if (this.systemPrompt && (messages.length === 0 || messages[0].role !== "system")) {
      messages.unshift({ role: "system", content: this.systemPrompt })
    }
    messages.push({ role: "user", content: prompt })

    const chatOptions: ChatOptions = {
      model: this.model,
      maxTokens: this.maxTokens,
      signal: AbortSignal.timeout(this.timeout),
    }
    const openaiTools = this.toOpenAITools()

    for (let turn = 0; turn < this.maxTurns; turn++) {
      // 从流式响应中收集完整消息
      let content = ""
      const toolCalls: Map<number, { id: string; name: string; args: string }> = new Map()
      let finishReason: string | null = null

      for await (const chunk of this.provider.chatStream(messages, openaiTools, chatOptions)) {
        if (chunk.usage) {
          usage.promptTokens += chunk.usage.prompt_tokens
          usage.completionTokens += chunk.usage.completion_tokens
          usage.totalTokens += chunk.usage.prompt_tokens + chunk.usage.completion_tokens
        }

        const delta = chunk.choices[0]?.delta
        if (!delta) continue

        // 文本内容
        if (delta.content) {
          content += delta.content
          yield { type: "text", text: delta.content }
        }

        // 工具调用（流式拼接）
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            let entry = toolCalls.get(tc.index)
            if (!entry) {
              entry = { id: tc.id ?? "", name: tc.function?.name ?? "", args: "" }
              toolCalls.set(tc.index, entry)
            }
            if (tc.id) entry.id = tc.id
            if (tc.function?.name) entry.name = tc.function.name
            if (tc.function?.arguments) entry.args += tc.function.arguments
          }
        }

        finishReason = chunk.choices[0]?.finish_reason ?? finishReason
      }

      // 构造 assistant 消息
      const assistantMsg: Message = { role: "assistant", content: content || null }
      if (toolCalls.size > 0) {
        assistantMsg.tool_calls = [...toolCalls.values()].map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.args },
        }))
      }
      messages.push(assistantMsg)

      // 无工具调用 → 完成
      if (!assistantMsg.tool_calls?.length) {
        yield {
          type: "done",
          result: { text: content, steps, usage, duration: Date.now() - start },
        }
        return
      }

      // 执行工具调用
      for (const toolCall of assistantMsg.tool_calls) {
        yield { type: "tool_start", tool: toolCall.function.name }
        const step = await this.executeTool(toolCall)
        steps.push(step)
        yield { type: "tool_end", tool: toolCall.function.name, step }
        messages.push({ role: "tool", content: step.output, tool_call_id: toolCall.id })
      }
    }

    yield {
      type: "done",
      result: {
        text: "(Reached max turns)",
        steps,
        usage,
        duration: Date.now() - start,
      },
    }
  }
}

/** 创建 Agent 实例 — SDK 主入口 */
export function agent(config: AgentConfig): Agent {
  return new Agent(config)
}
