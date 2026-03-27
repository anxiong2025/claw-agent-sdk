import { readFile } from "node:fs/promises"
import fg from "fast-glob"
import type { ToolDefinition } from "../types.js"

export function createGrepTool(cwd: string): ToolDefinition {
  return {
    name: "grep",
    description: "Search file contents using a regex pattern. Returns matching lines with file paths and line numbers.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex pattern to search for" },
        glob: { type: "string", description: 'File glob filter (e.g. "*.ts"). Defaults to all files.' },
      },
      required: ["pattern"],
    },
    async execute(params) {
      const globPattern = (params.glob as string) ?? "**/*"
      const files = await fg(globPattern, {
        cwd,
        dot: false,
        ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
        onlyFiles: true,
      })

      const regex = new RegExp(params.pattern as string, "gi")
      const results: string[] = []
      const MAX_RESULTS = 100

      for (const file of files.sort()) {
        if (results.length >= MAX_RESULTS) break
        try {
          const content = await readFile(`${cwd}/${file}`, "utf-8")
          const lines = content.split("\n")
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              results.push(`${file}:${i + 1}: ${lines[i].trim()}`)
              if (results.length >= MAX_RESULTS) break
            }
            regex.lastIndex = 0
          }
        } catch {
          // skip binary / unreadable files
        }
      }

      return results.length > 0 ? results.join("\n") : "No matches found"
    },
  }
}
