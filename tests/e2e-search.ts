import { agent, createScheduler } from "../src/index.js"

const ai = agent({ provider: "qwen", tools: true })

async function main() {
  // 测试 1: 查天气
  console.log("=== 测试 1: 查天气 ===")
  const r1 = await ai.run("今天深圳的天气怎么样？")
  console.log("回复:", r1.text.slice(0, 500))
  console.log("工具:", r1.steps.map((s) => s.tool).join(" → "))
  console.log("tokens:", r1.usage.totalTokens, "| 耗时:", r1.duration, "ms\n")

  // 测试 2: 查 AI 资讯
  console.log("=== 测试 2: AI 资讯（国内+国外） ===")
  const r2 = await ai.run("搜索今天最新的 AI 行业动态，包括国内和国外的，给我列出 5 条关键新闻")
  console.log("回复:", r2.text.slice(0, 800))
  console.log("工具:", r2.steps.map((s) => s.tool).join(" → "))
  console.log("tokens:", r2.usage.totalTokens, "| 耗时:", r2.duration, "ms\n")

  // 测试 3: 硅谷 AI 产品动态
  console.log("=== 测试 3: 硅谷 AI 产品动态 ===")
  const r3 = await ai.run("搜索硅谷最新的 AI 产品发布和动态，特别是 OpenAI、Google、Anthropic 的最新消息")
  console.log("回复:", r3.text.slice(0, 800))
  console.log("工具:", r3.steps.map((s) => s.tool).join(" → "))
  console.log("tokens:", r3.usage.totalTokens, "| 耗时:", r3.duration, "ms\n")

  // 测试 4: 今天日期
  console.log("=== 测试 4: 今天日期 ===")
  const r4 = await ai.run("今天是几号？星期几？")
  console.log("回复:", r4.text)
  console.log("工具:", r4.steps.map((s) => s.tool).join(" → "))
  console.log()

  // 测试 5: 定时任务（演示）
  console.log("=== 测试 5: 定时任务 ===")
  const scheduler = createScheduler(ai)

  scheduler.add({
    id: "ai-daily",
    schedule: "every 5m", // 演示用 5 分钟间隔，实际用 "daily 08:00"
    prompt: "搜索今天最重要的 3 条 AI 新闻，用中文简要概括",
    onResult: (result) => {
      console.log("[AI 日报]", result.text.slice(0, 300))
      console.log("[日报工具]", result.steps.map((s) => s.tool).join(" → "))
    },
  })

  console.log("已注册定时任务:", scheduler.list())
  console.log("立即执行一次...")
  const r5 = await scheduler.runNow("ai-daily")
  console.log("[AI 日报]", r5?.text.slice(0, 500))
  console.log("tokens:", r5?.usage.totalTokens, "| 耗时:", r5?.duration, "ms")

  scheduler.stopAll()
  console.log("\n✅ 全部测试完成")
}

main().catch(console.error)
