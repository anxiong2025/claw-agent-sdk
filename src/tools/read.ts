import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import type { ToolDefinition } from "../types.js"

export function createReadTool(cwd: string): ToolDefinition {
  return {
    name: "read",
    description: "Read a file's content. Returns the text content with line numbers.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path (relative to working directory)" },
        offset: { type: "number", description: "Start line number (1-based, optional)" },
        limit: { type: "number", description: "Max lines to read (optional)" },
      },
      required: ["path"],
    },
    async execute(params) {
      const filePath = resolve(cwd, params.path as string)
      const content = await readFile(filePath, "utf-8")
      let lines = content.split("\n")

      const offset = (params.offset as number | undefined) ?? 1
      const limit = params.limit as number | undefined
      if (offset > 1 || limit) {
        const start = Math.max(0, offset - 1)
        lines = lines.slice(start, limit ? start + limit : undefined)
      }

      return lines
        .map((line, i) => `${String(offset + i).padStart(5)} ${line}`)
        .join("\n")
    },
  }
}
