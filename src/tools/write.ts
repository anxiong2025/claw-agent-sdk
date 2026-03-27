import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import type { ToolDefinition } from "../types.js"

export function createWriteTool(cwd: string): ToolDefinition {
  return {
    name: "write",
    description: "Write content to a file. Creates parent directories if needed.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path (relative to working directory)" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["path", "content"],
    },
    async execute(params) {
      const filePath = resolve(cwd, params.path as string)
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, params.content as string, "utf-8")
      return `Written to ${params.path}`
    },
  }
}
