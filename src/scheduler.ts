import type { Agent } from "./agent.js"
import type { RunResult } from "./types.js"

/** 定时任务配置 */
export interface ScheduledTask {
  /** 任务唯一 ID */
  id: string
  /** cron 表达式 或 简单间隔："every 1h" / "daily 08:00" / "0 8 * * *" */
  schedule: string
  /** 要执行的 prompt */
  prompt: string
  /** 回调：任务执行完后调用（发微信、发邮件等） */
  onResult: (result: RunResult, task: ScheduledTask) => void | Promise<void>
  /** 是否启用（默认 true） */
  enabled?: boolean
}

interface InternalTask extends ScheduledTask {
  timer: ReturnType<typeof setTimeout> | null
}

/**
 * Scheduler — 定时任务调度器
 *
 * 支持三种格式：
 * - "every 30m" / "every 2h" / "every 1d" — 固定间隔
 * - "daily 08:00" / "daily 21:30" — 每天定时
 * - "0 8 * * *" — 标准 cron（仅支持分钟和小时级别的简单 cron）
 */
export class Scheduler {
  private tasks = new Map<string, InternalTask>()

  constructor(private agent: Agent) {}

  /** 添加定时任务 */
  add(task: ScheduledTask): void {
    if (this.tasks.has(task.id)) {
      this.remove(task.id)
    }

    const internal: InternalTask = { ...task, enabled: task.enabled ?? true, timer: null }
    this.tasks.set(task.id, internal)

    if (internal.enabled) {
      this.scheduleNext(internal)
    }
  }

  /** 移除定时任务 */
  remove(id: string): boolean {
    const task = this.tasks.get(id)
    if (!task) return false
    if (task.timer) clearTimeout(task.timer)
    this.tasks.delete(id)
    return true
  }

  /** 暂停任务 */
  pause(id: string): void {
    const task = this.tasks.get(id)
    if (!task) return
    task.enabled = false
    if (task.timer) {
      clearTimeout(task.timer)
      task.timer = null
    }
  }

  /** 恢复任务 */
  resume(id: string): void {
    const task = this.tasks.get(id)
    if (!task) return
    task.enabled = true
    this.scheduleNext(task)
  }

  /** 立即执行一次（不影响定时计划） */
  async runNow(id: string): Promise<RunResult | null> {
    const task = this.tasks.get(id)
    if (!task) return null
    return this.executeTask(task)
  }

  /** 列出所有任务 */
  list(): Array<{ id: string; schedule: string; prompt: string; enabled: boolean }> {
    return [...this.tasks.values()].map((t) => ({
      id: t.id,
      schedule: t.schedule,
      prompt: t.prompt,
      enabled: t.enabled ?? true,
    }))
  }

  /** 停止所有任务 */
  stopAll(): void {
    for (const task of this.tasks.values()) {
      if (task.timer) clearTimeout(task.timer)
    }
    this.tasks.clear()
  }

  /** 计算下次执行的延迟 ms */
  private getNextDelay(schedule: string): number {
    // "every 30m" / "every 2h" / "every 1d"
    const intervalMatch = schedule.match(/^every\s+(\d+)\s*(m|min|h|hour|d|day)s?$/i)
    if (intervalMatch) {
      const value = parseInt(intervalMatch[1])
      const unit = intervalMatch[2].toLowerCase()
      if (unit.startsWith("m")) return value * 60_000
      if (unit.startsWith("h")) return value * 3_600_000
      if (unit.startsWith("d")) return value * 86_400_000
    }

    // "daily 08:00" / "daily 21:30"
    const dailyMatch = schedule.match(/^daily\s+(\d{1,2}):(\d{2})$/i)
    if (dailyMatch) {
      const targetHour = parseInt(dailyMatch[1])
      const targetMin = parseInt(dailyMatch[2])
      return this.msUntilNextTime(targetHour, targetMin)
    }

    // 简单 cron: "分 时 * * *" — 只支持每天固定时间
    const cronMatch = schedule.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/)
    if (cronMatch) {
      const targetMin = parseInt(cronMatch[1])
      const targetHour = parseInt(cronMatch[2])
      return this.msUntilNextTime(targetHour, targetMin)
    }

    throw new Error(
      `Invalid schedule format: "${schedule}". ` +
        'Supported: "every 30m", "every 2h", "daily 08:00", "0 8 * * *"',
    )
  }

  /** 计算到下一个指定时间点的 ms */
  private msUntilNextTime(hour: number, minute: number): number {
    const now = new Date()
    const target = new Date(now)
    target.setHours(hour, minute, 0, 0)

    // 如果今天的目标时间已过，设为明天
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1)
    }

    return target.getTime() - now.getTime()
  }

  /** 调度下一次执行 */
  private scheduleNext(task: InternalTask): void {
    if (!task.enabled) return
    const delay = this.getNextDelay(task.schedule)
    task.timer = setTimeout(async () => {
      if (!task.enabled) return
      await this.executeTask(task)
      // 循环调度
      this.scheduleNext(task)
    }, delay)
    // 允许进程退出（不阻塞 event loop）
    if (task.timer && typeof task.timer === "object" && "unref" in task.timer) {
      task.timer.unref()
    }
  }

  /** 执行任务 */
  private async executeTask(task: InternalTask): Promise<RunResult> {
    const result = await this.agent.run(task.prompt)
    try {
      await task.onResult(result, task)
    } catch (err) {
      console.error(`[scheduler] Task "${task.id}" onResult error:`, err)
    }
    return result
  }
}

/** 创建调度器 */
export function createScheduler(agent: Agent): Scheduler {
  return new Scheduler(agent)
}
