import { agent } from "../src/index.js"

async function main() {
  // 测试 1: 纯对话
  console.log("=== 测试 1: 纯对话 ===")
  const chat = agent({ provider: "qwen" })
  const r1 = await chat.run("用一句话解释什么是 TypeScript")
  console.log("回复:", r1.text)
  console.log("tokens:", r1.usage.totalTokens, "| 耗时:", r1.duration, "ms\n")

  // 测试 2: Agent 模式（带工具）
  console.log("=== 测试 2: Agent + 工具 ===")
  const ai = agent({ provider: "qwen", tools: true })
  const r2 = await ai.run("读取当前目录的 package.json，告诉我项目名称和版本号")
  console.log("回复:", r2.text)
  console.log("工具调用:")
  for (const step of r2.steps) {
    console.log(`  - ${step.tool}(${JSON.stringify(step.input)}) [${step.duration}ms]`)
  }
  console.log("tokens:", r2.usage.totalTokens, "| 耗时:", r2.duration, "ms\n")

  // 测试 3: 流式输出
  console.log("=== 测试 3: 流式输出 ===")
  for await (const chunk of ai.stream("用 3 个要点说明 Node.js 的优势")) {
    if (chunk.type === "text") process.stdout.write(chunk.text ?? "")
    if (chunk.type === "done") console.log(`\ntokens: ${chunk.result?.usage.totalTokens} | 耗时: ${chunk.result?.duration}ms`)
  }
}

main().catch(console.error)
