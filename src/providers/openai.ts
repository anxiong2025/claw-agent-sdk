import type {
  ChatCompletionChunk,
  ChatCompletionResponse,
  ChatOptions,
  Message,
  OpenAITool,
  Provider,
} from "../types.js"

/**
 * OpenAI 兼容 Provider — 覆盖所有支持 /v1/chat/completions 的模型
 * Qwen / DeepSeek / GPT / Gemini / GLM / MiniMax / OpenRouter 等
 */
export class OpenAIProvider implements Provider {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  async chat(messages: Message[], tools: OpenAITool[], options: ChatOptions): Promise<ChatCompletionResponse> {
    const body: Record<string, unknown> = {
      model: options.model,
      messages,
      max_tokens: options.maxTokens,
    }
    if (tools.length > 0) {
      body.tools = tools
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`LLM API error ${res.status}: ${text}`)
    }

    return (await res.json()) as ChatCompletionResponse
  }

  async *chatStream(
    messages: Message[],
    tools: OpenAITool[],
    options: ChatOptions,
  ): AsyncIterable<ChatCompletionChunk> {
    const body: Record<string, unknown> = {
      model: options.model,
      messages,
      max_tokens: options.maxTokens,
      stream: true,
    }
    if (tools.length > 0) {
      body.tools = tools
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`LLM API error ${res.status}: ${text}`)
    }

    const reader = res.body?.getReader()
    if (!reader) throw new Error("No response body")

    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith("data: ")) continue
        const data = trimmed.slice(6)
        if (data === "[DONE]") return
        try {
          yield JSON.parse(data) as ChatCompletionChunk
        } catch {
          // skip malformed chunks
        }
      }
    }
  }
}
