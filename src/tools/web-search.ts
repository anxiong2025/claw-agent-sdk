import type { ToolDefinition } from "../types.js"

/**
 * Web Search 工具 — 使用 DuckDuckGo HTML 搜索
 * 零配置，不需要任何 API Key
 */
export function createWebSearchTool(): ToolDefinition {
  return {
    name: "web_search",
    description:
      "Search the web for current information. Use this for weather, news, trends, product updates, real-time data, or anything the model doesn't know. Returns search results with titles, snippets, and URLs.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        count: { type: "number", description: "Max results to return (default 8)" },
      },
      required: ["query"],
    },
    async execute(params) {
      const query = params.query as string
      const count = (params.count as number) ?? 8

      // 尝试多个搜索源，确保可用性
      try {
        return await duckduckgoSearch(query, count)
      } catch {
        try {
          return await duckduckgoLite(query, count)
        } catch (e) {
          return `Search failed: ${e instanceof Error ? e.message : String(e)}`
        }
      }
    },
  }
}

/** DuckDuckGo HTML 搜索 — 解析搜索结果页 */
async function duckduckgoSearch(query: string, count: number): Promise<string> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/html",
      "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
    },
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) throw new Error(`DuckDuckGo returned ${res.status}`)
  const html = await res.text()
  return parseSearchResults(html, count)
}

/** DuckDuckGo Lite 搜索 — 备用 */
async function duckduckgoLite(query: string, count: number): Promise<string> {
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) throw new Error(`DuckDuckGo Lite returned ${res.status}`)
  const html = await res.text()
  return parseLiteResults(html, count)
}

/** 解析 DuckDuckGo HTML 搜索结果 */
function parseSearchResults(html: string, count: number): string {
  const results: Array<{ title: string; url: string; snippet: string }> = []

  // 按结果块分割 — 每个结果以 class="...web-result" 开头
  const resultBlocks = html.split(/class="result results_links/)

  for (let i = 1; i < resultBlocks.length && results.length < count; i++) {
    const block = resultBlocks[i]

    // 提取标题和 URL: <a rel="nofollow" class="result__a" href="URL">TITLE</a>
    const linkMatch = block.match(/class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/)
    // 提取摘要: <a class="result__snippet" ...>SNIPPET</a>
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)

    if (linkMatch) {
      let url = linkMatch[1]
      // DuckDuckGo 跳转链接 → 提取真实 URL
      const uddgMatch = url.match(/uddg=([^&]+)/)
      if (uddgMatch) url = decodeURIComponent(uddgMatch[1])

      results.push({
        title: stripHtml(linkMatch[2]).trim(),
        url,
        snippet: snippetMatch ? stripHtml(snippetMatch[1]).trim() : "",
      })
    }
  }

  if (results.length === 0) {
    return "No search results found. Try a different query."
  }

  return results
    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
    .join("\n\n")
}

/** 解析 DuckDuckGo Lite 搜索结果 */
function parseLiteResults(html: string, count: number): string {
  const results: Array<{ title: string; url: string; snippet: string }> = []

  // Lite 版结果格式更简单
  const rows = html.split(/<tr>/)
  let current: { title: string; url: string; snippet: string } | null = null

  for (const row of rows) {
    if (results.length >= count) break

    // 链接行
    const linkMatch = row.match(/<a[^>]*href="([^"]*)"[^>]*class="result-link"[^>]*>([\s\S]*?)<\/a>/)
    if (linkMatch) {
      if (current) results.push(current)
      current = { title: stripHtml(linkMatch[2]).trim(), url: linkMatch[1], snippet: "" }
      continue
    }

    // 摘要行
    const snippetMatch = row.match(/class="result-snippet"[^>]*>([\s\S]*?)<\/td>/)
    if (snippetMatch && current) {
      current.snippet = stripHtml(snippetMatch[1]).trim()
    }
  }
  if (current) results.push(current)

  if (results.length === 0) {
    return "No search results found. Try a different query."
  }

  return results
    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
    .join("\n\n")
}

/** 去除 HTML 标签 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
}
