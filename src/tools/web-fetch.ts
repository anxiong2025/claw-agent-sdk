import type { ToolDefinition } from "../types.js"

export function createWebFetchTool(): ToolDefinition {
  return {
    name: "web_fetch",
    description: "Fetch content from a URL. Returns the text content of the page.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to fetch" },
      },
      required: ["url"],
    },
    async execute(params) {
      const url = params.url as string
      const res = await fetch(url, {
        headers: { "User-Agent": "claw-agent-sdk/0.1" },
        signal: AbortSignal.timeout(15_000),
      })

      if (!res.ok) {
        return `HTTP ${res.status}: ${res.statusText}`
      }

      const contentType = res.headers.get("content-type") ?? ""
      if (!contentType.includes("text") && !contentType.includes("json") && !contentType.includes("xml")) {
        return `Binary content (${contentType}), ${res.headers.get("content-length") ?? "unknown"} bytes`
      }

      const text = await res.text()
      // 限制返回大小，避免 token 爆炸
      const MAX_CHARS = 20_000
      if (text.length > MAX_CHARS) {
        return text.slice(0, MAX_CHARS) + `\n\n... (truncated, total ${text.length} chars)`
      }
      return text
    },
  }
}
