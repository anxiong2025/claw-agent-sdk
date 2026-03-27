/**
 * claw-agent-sdk 基础示例
 *
 * 运行前设置环境变量：
 *   export DASHSCOPE_API_KEY=sk-xxx
 *
 * 运行：
 *   npx tsx examples/basic.ts
 */
import { agent } from "../src/index.js"

// Level 1: 纯对话（无工具）
const chat = agent({ provider: "qwen" })
const r1 = await chat.run("用一句话解释什么是 TypeScript")
console.log("💬 对话:", r1.text)
console.log(`   (${r1.usage.totalTokens} tokens, ${r1.duration}ms)\n`)

// Level 2: Agent 模式（带内置工具）
const ai = agent({ provider: "qwen", tools: true })
const r2 = await ai.run("读取当前目录的 package.json，告诉我项目名称和版本号")
console.log("🤖 Agent:", r2.text)
console.log("   Steps:")
for (const step of r2.steps) {
  console.log(`   - ${step.tool}(${JSON.stringify(step.input)}) → ${step.output.slice(0, 80)}...`)
}
console.log(`   (${r2.usage.totalTokens} tokens, ${r2.duration}ms)\n`)

// Level 3: 流式输出
console.log("📡 Stream: ", "")
for await (const chunk of ai.stream("列出 src/ 目录下的所有 .ts 文件")) {
  if (chunk.type === "text") process.stdout.write(chunk.text ?? "")
  if (chunk.type === "tool_start") console.log(`\n   [调用 ${chunk.tool}]`)
  if (chunk.type === "tool_end") console.log(`   [${chunk.tool} 完成: ${chunk.step?.duration}ms]`)
}
console.log()
