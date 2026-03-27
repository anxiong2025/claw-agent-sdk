import { execFile } from "node:child_process"
import type { ToolDefinition } from "../types.js"

const BLOCKED_PATTERNS = [
  /\brm\s+-rf\s+[/~]/,
  /\bsudo\b/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  />\s*\/dev\/sd/,
]

export function createBashTool(cwd: string, timeout = 30_000): ToolDefinition {
  return {
    name: "bash",
    description: "Execute a shell command and return its output. Has a timeout and blocks dangerous commands.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute" },
      },
      required: ["command"],
    },
    async execute(params) {
      const command = params.command as string

      for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(command)) {
          return `Blocked: command matches dangerous pattern "${pattern.source}"`
        }
      }

      return new Promise<string>((resolve) => {
        execFile(
          "/bin/sh",
          ["-c", command],
          { cwd, timeout, maxBuffer: 1024 * 1024, env: { ...process.env, PATH: process.env.PATH } },
          (error, stdout, stderr) => {
            if (error) {
              const msg = error.killed ? `Command timed out after ${timeout}ms` : error.message
              resolve(stderr ? `Error: ${msg}\nStderr: ${stderr}` : `Error: ${msg}`)
              return
            }
            const output = stdout.trim()
            const errOutput = stderr.trim()
            if (errOutput && output) resolve(`${output}\n---stderr---\n${errOutput}`)
            else resolve(output || errOutput || "(no output)")
          },
        )
      })
    },
  }
}
