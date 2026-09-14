// 后台子代理注册表（continuable subagent）：durable id + 父链 + inbox 队列 + 结算通知
//
// 为什么单独一个模块/一张表，而不是直接复用 sessions 表：
//   - 子代理是"后台常驻"的独立实体，有自己的生命周期（running/idle）和父子关系，
//     存进 sessions 表会污染前端会话列表（用户会看到一堆 sub_xxx 会话）。
//   - 子代理的持久历史（messages）存在本表 messages 列，resume 时重新组装 Session 喂 runTurn。
//
// 依赖方向（避免循环）：本模块只 import db/store/types，不 import agentLoop/toolRegistry；
// "启动/续跑子轮"由 toolRegistry 持 runtime.runSubagent 引用驱动，本模块只做数据与队列。
import { db } from './db.js'
import { newId } from './store.js'
import type { Message } from './types.js'

export interface SubagentRecord {
  /** durable id（sub_xxx，同时作为子会话 id 喂 runTurn） */
  id: string
  /** 父会话 id（结算通知的投递目标） */
  parentId: string
  agentId: string
  task: string
  model?: string
  status: 'running' | 'idle'
  /** 父→子的消息队列（子 running 时排队，settle 后若非空自动续跑） */
  inbox: { content: string; at: number }[]
  /** 子会话持久历史（resume 时组装 Session） */
  messages: Message[]
  /** 待送达父的通知文本（子→父留言 + settle 结果；父下一轮注入后消费） */
  notice: string
  createdAt: number
  updatedAt: number
}

function rowToRecord(row: Record<string, unknown>): SubagentRecord {
  return {
    id: String(row.id),
    parentId: String(row.parent_id),
    agentId: String(row.agent_id),
    task: String(row.task ?? ''),
    model: row.model != null ? String(row.model) : undefined,
    status: String(row.status) === 'running' ? 'running' : 'idle',
    inbox: JSON.parse(String(row.inbox ?? '[]')) as SubagentRecord['inbox'],
    messages: JSON.parse(String(row.messages ?? '[]')) as Message[],
    notice: String(row.notice ?? ''),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

// 运行态：当前轮的 abort 句柄（不持久化；interrupt_agent 用）
const aborts = new Map<string, () => void>()

export function setSubagentAbort(id: string, fn: () => void) {
  aborts.set(id, fn)
}

export function clearSubagentAbort(id: string) {
  aborts.delete(id)
}

/** 定向中断：中止子代理当前轮并消费句柄（一次中断一个作用），但保留注册表/inbox/历史（不是销毁） */
export function interruptSubagent(id: string): boolean {
  const fn = aborts.get(id)
  if (!fn) return false
  aborts.delete(id)
  fn()
  return true
}

export function createSubagent(input: { parentId: string; agentId: string; task: string; model?: string }): SubagentRecord {
  const now = Date.now()
  const rec: SubagentRecord = {
    id: newId('sub'),
    parentId: input.parentId,
    agentId: input.agentId,
    task: input.task,
    model: input.model,
    status: 'idle',
    inbox: [],
    messages: [],
    notice: '',
    createdAt: now,
    updatedAt: now,
  }
  db.prepare(
    `INSERT INTO subagents (id, parent_id, agent_id, task, model, status, inbox, messages, notice, notice_consumed, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(rec.id, rec.parentId, rec.agentId, rec.task, rec.model ?? null, rec.status, JSON.stringify(rec.inbox), JSON.stringify(rec.messages), rec.notice, rec.createdAt, rec.updatedAt)
  return rec
}

export function saveSubagent(rec: SubagentRecord) {
  rec.updatedAt = Date.now()
  // 只更新状态/inbox/messages；notice 与 notice_consumed 由 appendNotice/consumeNotice 单独管理
  db.prepare(
    `UPDATE subagents SET status = ?, inbox = ?, messages = ?, updated_at = ?
     WHERE id = ?`,
  ).run(rec.status, JSON.stringify(rec.inbox), JSON.stringify(rec.messages), rec.updatedAt, rec.id)
}

export function getSubagent(id: string): SubagentRecord | undefined {
  const row = db.prepare('SELECT * FROM subagents WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? rowToRecord(row) : undefined
}

/** 按"会话 id"反查子代理：子 agent 的 runTurn 里 session.id 就是 sub_xxx，send_message(to='parent') 靠它认亲 */
export function findSubagentBySessionId(sessionId: string): SubagentRecord | undefined {
  return getSubagent(sessionId)
}

export function listSubagents(parentId?: string): SubagentRecord[] {
  const rows = (parentId
    ? db.prepare('SELECT * FROM subagents WHERE parent_id = ? ORDER BY updated_at DESC').all(parentId)
    : db.prepare('SELECT * FROM subagents ORDER BY updated_at DESC').all()) as Record<string, unknown>[]
  return rows.map(rowToRecord)
}

/** 追加一段待送达父的通知（子→父留言 / settle 结果共用一条通道），并标记未消费 */
export function appendNotice(id: string, text: string) {
  const rec = getSubagent(id)
  if (!rec) return
  rec.notice = rec.notice ? `${rec.notice}\n\n${text}` : text
  db.prepare('UPDATE subagents SET notice = ?, notice_consumed = 0, updated_at = ? WHERE id = ?').run(
    rec.notice, Date.now(), rec.id,
  )
}

/** 父会话视角：所有未消费的子代理结算通知（父下一轮组装 history 时注入） */
export function pendingNotices(parentId: string): { id: string; text: string }[] {
  const rows = db.prepare(
    'SELECT id, notice FROM subagents WHERE parent_id = ? AND notice_consumed = 0 AND notice != ?',
  ).all(parentId, '') as { id: string; notice: string }[]
  return rows.map((r) => ({ id: String(r.id), text: String(r.notice) }))
}

export function consumeNotice(id: string) {
  db.prepare('UPDATE subagents SET notice_consumed = 1 WHERE id = ?').run(id)
}

export function deleteSubagent(id: string) {
  aborts.delete(id)
  db.prepare('DELETE FROM subagents WHERE id = ?').run(id)
}
