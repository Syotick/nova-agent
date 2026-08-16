// 任务调度器：5 段 cron 定时任务
// - 轻量 cron 解析（无第三方依赖）
// - 任务持久化在 SQLite（tasks 表）
// - 每分钟扫描一次到期的任务，触发执行回调（默认：调用 agent 跑一轮）
import { db } from './db.js'
import type { Task } from './types.js'
import { newId } from './store.js'

// ---------- cron 解析（标准 5 段：分 时 日 月 周） ----------

export interface CronField {
  values: Set<number> // 匹配的具体值
  wildcard: boolean
}

// 解析单段："*"、"5"、"1,15"、"*/10"、"1-5"、"1-5/2"
function parseField(field: string, min: number, max: number): CronField {
  const values = new Set<number>()
  // 纯 "*" 才是通配；"*/n"、"a-b/n" 等按具体值集合处理（matches 用 values.has 判断）
  if (field === '*') return { values, wildcard: true }
  let wildcard = false
  for (const part of field.split(',')) {
    const m = part.match(/^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/)
    if (!m) throw new Error(`invalid cron field "${field}" (part "${part}"): expected number, range, step or "*"`)
    let start: number
    let end: number
    if (m[1] === '*') {
      // 仅当无步进（即纯 "*"，已在上面返回）才为通配；此处为 "*/n" 或 "*" 的兜底
      start = min
      end = max
      wildcard = m[3] ? false : true
    } else {
      start = Number(m[1])
      end = m[2] ? Number(m[2]) : start
    }
    const step = m[3] ? Number(m[3]) : 1
    for (let v = start; v <= end && v <= max; v += step) {
      if (v >= min) values.add(v)
    }
  }
  return { values, wildcard }
}

export function parseCron(cron: string): CronField[] {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) throw new Error(`invalid cron "${cron}": expected 5 fields (min hour day month weekday)`)
  return [
    parseField(parts[0], 0, 59), // 分
    parseField(parts[1], 0, 23), // 时
    parseField(parts[2], 1, 31), // 日
    parseField(parts[3], 1, 12), // 月
    parseField(parts[4], 0, 7), // 周（0/7 = 周日）
  ]
}

export function matches(fields: CronField[], date: Date): boolean {
  const [min, hour, day, month, weekday] = fields
  const m = date.getMinutes()
  const h = date.getHours()
  const d = date.getDate()
  const mo = date.getMonth() + 1
  const wd = date.getDay()
  return (
    (min.wildcard || min.values.has(m)) &&
    (hour.wildcard || hour.values.has(h)) &&
    (day.wildcard || day.values.has(d)) &&
    (month.wildcard || month.values.has(mo)) &&
    (weekday.wildcard || weekday.values.has(wd))
  )
}

// ---------- 任务 CRUD（SQLite） ----------

interface TaskRow {
  id: string
  name: string
  agent_id: string
  cron: string
  prompt: string
  enabled: number
  session_id: string | null
  last_run_at: number | null
  next_run_at: number | null
  last_result: string | null
  run_count: number
  created_at: number
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    name: row.name,
    agentId: row.agent_id,
    cron: row.cron,
    prompt: row.prompt,
    enabled: row.enabled === 1,
    sessionId: row.session_id ?? undefined,
    lastRunAt: row.last_run_at ?? undefined,
    nextRunAt: row.next_run_at ?? undefined,
    lastResult: row.last_result ?? undefined,
    runCount: row.run_count,
    createdAt: row.created_at,
  }
}

export function listTasks(): Task[] {
  const rows = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all() as unknown as TaskRow[]
  return rows.map(rowToTask)
}

export function getTask(id: string): Task | undefined {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined
  return row ? rowToTask(row) : undefined
}

export function saveTask(input: {
  id?: string
  name: string
  agentId: string
  cron: string
  prompt?: string
  enabled?: boolean
}): Task {
  // 校验 cron 语法，非法直接抛错
  parseCron(input.cron)
  const existing = input.id ? getTask(input.id) : undefined
  const task: Task = {
    id: input.id ?? existing?.id ?? newId('task'),
    name: input.name.trim(),
    agentId: input.agentId,
    cron: input.cron.trim(),
    prompt: input.prompt?.trim() ?? existing?.prompt ?? '',
    enabled: input.enabled ?? existing?.enabled ?? true,
    sessionId: existing?.sessionId,
    lastRunAt: existing?.lastRunAt,
    nextRunAt: existing?.nextRunAt,
    lastResult: existing?.lastResult,
    runCount: existing?.runCount ?? 0,
    createdAt: existing?.createdAt ?? Date.now(),
  }
  db.prepare(
    `INSERT INTO tasks (id, name, agent_id, cron, prompt, enabled, session_id, last_run_at, next_run_at, last_result, run_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       agent_id = excluded.agent_id,
       cron = excluded.cron,
       prompt = excluded.prompt,
       enabled = excluded.enabled`,
  ).run(
    task.id, task.name, task.agentId, task.cron, task.prompt, task.enabled ? 1 : 0,
    task.sessionId ?? null, task.lastRunAt ?? null, task.nextRunAt ?? null, task.lastResult ?? null,
    task.runCount, task.createdAt,
  )
  return task
}

export function deleteTask(id: string): boolean {
  const r = db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
  return Number(r.changes) > 0
}

// 任务首次执行创建专用会话后，把 session_id 回写任务
export function setTaskSession(id: string, sessionId: string) {
  db.prepare('UPDATE tasks SET session_id = ? WHERE id = ?').run(sessionId, id)
}

// ---------- 调度循环 ----------

type TaskRunner = (task: Task) => Promise<string> // 返回执行结果文本

let timer: ReturnType<typeof setInterval> | null = null
let running = new Set<string>() // 正在执行的任务（防重入）
let runner: TaskRunner | null = null

export function startScheduler(execute: TaskRunner) {
  if (timer) return
  runner = execute
  // 每分钟扫描一次（秒对齐，避免启动即触发）
  const delay = 60_000 - (Date.now() % 60_000)
  setTimeout(() => {
    scan()
    timer = setInterval(scan, 60_000)
  }, delay)
}

export function stopScheduler() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  runner = null
}

async function scan() {
  if (!runner) return
  const now = Date.now()
  const tasks = listTasks().filter((t) => t.enabled)
  for (const task of tasks) {
    // 到期判断：nextRunAt 到点，或（无 nextRunAt 且当前分钟匹配 cron）
    const due = task.nextRunAt != null ? task.nextRunAt <= now : matches(parseCron(task.cron), new Date())
    if (!due) continue
    if (running.has(task.id)) continue // 上一次还没跑完，跳过本轮
    void runTask(task.id, runner)
  }
}

async function runTask(id: string, execute: TaskRunner) {
  const task = getTask(id)
  if (!task) return
  running.add(id)
  const started = Date.now()
  try {
    const result = await execute(task)
    db.prepare('UPDATE tasks SET last_run_at = ?, last_result = ?, run_count = run_count + 1 WHERE id = ?')
      .run(started, String(result).slice(0, 4000), id)
    console.log(`[scheduler] task "${task.name}" done (${Date.now() - started}ms)`)
  } catch (err) {
    db.prepare('UPDATE tasks SET last_run_at = ?, last_result = ? WHERE id = ?')
      .run(started, `ERROR: ${(err as Error).message}`.slice(0, 4000), id)
    console.warn(`[scheduler] task "${task.name}" failed: ${(err as Error).message}`)
  } finally {
    running.delete(id)
  }
}

// 手动立即执行一次任务（等待结果返回；失败抛错）
export async function runTaskNow(id: string): Promise<string> {
  const task = getTask(id)
  if (!task) throw new Error('task not found')
  if (!runner) throw new Error('scheduler not started')
  if (running.has(id)) throw new Error('task already running')
  running.add(id)
  try {
    const result = await runner(task)
    db.prepare('UPDATE tasks SET last_run_at = ?, last_result = ?, run_count = run_count + 1 WHERE id = ?')
      .run(Date.now(), String(result).slice(0, 4000), id)
    return String(result)
  } finally {
    running.delete(id)
  }
}
