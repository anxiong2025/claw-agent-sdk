import fg from "fast-glob"
import type { ToolDefinition } from "../types.js"

export function createGlobTool(cwd: string): ToolDefinition {
  return {
    name: "glob",
    description: "Search for files matching a glob pattern. Returns matching file paths.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: 'Glob pattern (e.g. "**/*.ts", "src/**/*.json")' },
      },
      required: ["pattern"],
    },
    async execute(params) {
      const files = await fg(params.pattern as string, {
        cwd,
        dot: false,
        ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
      })
      if (files.length === 0) return "No files found"
      return files.sort().join("\n")
    },
  }
}
