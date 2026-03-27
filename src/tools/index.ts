import type { ToolDefinition } from "../types.js"
import { createBashTool } from "./bash.js"
import { createGlobTool } from "./glob.js"
import { createGrepTool } from "./grep.js"
import { createReadTool } from "./read.js"
import { createWebFetchTool } from "./web-fetch.js"
import { createWebSearchTool } from "./web-search.js"
import { createWriteTool } from "./write.js"

/** 所有内置工具名 */
export const BUILTIN_TOOL_NAMES = ["read", "write", "glob", "grep", "bash", "web_fetch", "web_search"] as const

/** 创建全部内置工具 */
export function createBuiltinTools(cwd: string): ToolDefinition[] {
  return [
    createReadTool(cwd),
    createWriteTool(cwd),
    createGlobTool(cwd),
    createGrepTool(cwd),
    createBashTool(cwd),
    createWebFetchTool(),
    createWebSearchTool(),
  ]
}

/**
 * 根据配置解析最终工具列表
 * - true → 全部内置工具
 * - false / undefined → 无工具
 * - string[] → 按名称过滤内置工具
 * - ToolDefinition[] → 直接使用自定义工具
 */
export function resolveTools(
  config: boolean | string[] | ToolDefinition[] | undefined,
  extraTools: ToolDefinition[] | undefined,
  cwd: string,
): ToolDefinition[] {
  let tools: ToolDefinition[] = []

  if (config === true) {
    tools = createBuiltinTools(cwd)
  } else if (Array.isArray(config)) {
    if (config.length > 0 && typeof config[0] === "string") {
      const names = new Set(config as string[])
      tools = createBuiltinTools(cwd).filter((t) => names.has(t.name))
    } else {
      tools = config as ToolDefinition[]
    }
  }

  if (extraTools?.length) {
    tools = [...tools, ...extraTools]
  }

  return tools
}
