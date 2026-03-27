import type { Agent } from "./agent.js"
import type { Message, RunResult, StreamChunk } from "./types.js"

/** 会话管理 — 维护每个 sessionId 的消息历史 */
export class Session {
  private _history: Message[] = []
  private maxHistory: number

  constructor(
    private agent: Agent,
    readonly id: string,
    options?: { maxHistory?: number; systemPrompt?: string },
  ) {
    this.maxHistory = options?.maxHistory ?? 50
    if (options?.systemPrompt) {
      this._history.push({ role: "system", content: options.systemPrompt })
    }
  }

  get history(): readonly Message[] {
    return this._history
  }

  async run(prompt: string): Promise<RunResult> {
    const result = await this.agent.run(prompt, {
      sessionId: this.id,
      messages: this.getContextMessages(),
    })
    // 记录对话
    this._history.push({ role: "user", content: prompt })
    this._history.push({ role: "assistant", content: result.text })
    this.trimHistory()
    return result
  }

  async *stream(prompt: string): AsyncIterable<StreamChunk> {
    let resultText = ""
    for await (const chunk of this.agent.stream(prompt, {
      sessionId: this.id,
      messages: this.getContextMessages(),
    })) {
      if (chunk.type === "text" && chunk.text) resultText += chunk.text
      yield chunk
    }
    this._history.push({ role: "user", content: prompt })
    this._history.push({ role: "assistant", content: resultText })
    this.trimHistory()
  }

  clear(): void {
    const system = this._history.find((m) => m.role === "system")
    this._history = system ? [system] : []
  }

  private getContextMessages(): Message[] {
    return [...this._history]
  }

  private trimHistory(): void {
    const system = this._history[0]?.role === "system" ? this._history[0] : null
    const rest = system ? this._history.slice(1) : this._history

    if (rest.length > this.maxHistory) {
      const trimmed = rest.slice(-this.maxHistory)
      this._history = system ? [system, ...trimmed] : trimmed
    }
  }
}

/** 全局会话存储 */
const sessions = new Map<string, Session>()

/** 获取或创建会话 */
export function getSession(
  agent: Agent,
  id: string,
  options?: { maxHistory?: number; systemPrompt?: string },
): Session {
  let session = sessions.get(id)
  if (!session) {
    session = new Session(agent, id, options)
    sessions.set(id, session)
  }
  return session
}

/** 删除会话 */
export function deleteSession(id: string): boolean {
  return sessions.delete(id)
}
