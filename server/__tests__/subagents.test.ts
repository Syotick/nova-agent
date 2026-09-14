// 后台子代理注册表（continuable）测试：durable id / 持久化 / inbox / 结算通知 / 中断句柄
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db.js'
import {
  createSubagent, getSubagent, saveSubagent, listSubagents, findSubagentBySessionId,
  appendNotice, pendingNotices, consumeNotice, setSubagentAbort, interruptSubagent,
  clearSubagentAbort, deleteSubagent,
} from '../subagents.js'

const PARENT = 'parent-s1'
const AGENT = 'subagents-test-agent'

beforeEach(() => {
  // subagents.agent_id 外键引用 agents(id)：测试库先插入一个真实 agent
  db.prepare('INSERT OR IGNORE INTO agents (id, name, model, created_at) VALUES (?, ?, ?, ?)').run(
    AGENT, '子代理测试', 'deepseek-v4-flash', Date.now(),
  )
  db.prepare('DELETE FROM subagents').run()
})

describe('subagents 注册表', () => {
  it('create + get：durable id，status 默认 idle，持久化', () => {
    const rec = createSubagent({ parentId: PARENT, agentId: AGENT, task: '查资料' })
    expect(rec.id).toMatch(/^sub_/)
    expect(rec.status).toBe('idle')
    const loaded = getSubagent(rec.id)
    expect(loaded).toBeTruthy()
    expect(loaded!.parentId).toBe(PARENT)
    expect(loaded!.task).toBe('查资料')
  })

  it('save：更新 status/inbox/messages，不动 notice', () => {
    const rec = createSubagent({ parentId: PARENT, agentId: AGENT, task: 't' })
    rec.inbox.push({ content: '继续', at: 1 })
    rec.status = 'running'
    saveSubagent(rec)
    const loaded = getSubagent(rec.id)!
    expect(loaded.status).toBe('running')
    expect(loaded.inbox.length).toBe(1)
    expect(loaded.inbox[0].content).toBe('继续')
    // save 不碰 notice
    appendNotice(rec.id, 'hello')
    const r2 = getSubagent(rec.id)!
    r2.inbox = []
    saveSubagent(r2)
    expect(getSubagent(rec.id)!.notice).toContain('hello')
  })

  it('appendNotice + pendingNotices + consumeNotice：通知闭环', () => {
    const rec = createSubagent({ parentId: PARENT, agentId: AGENT, task: 't' })
    // 新创建 notice 为空且已消费（无通知）
    expect(pendingNotices(PARENT)).toEqual([])
    appendNotice(rec.id, '[子代理 sub_x 已空闲] 完成')
    appendNotice(rec.id, '[子代理 sub_x 留言] 补充')
    const pending = pendingNotices(PARENT)
    expect(pending.length).toBe(1)
    expect(pending[0].text).toContain('完成')
    expect(pending[0].text).toContain('补充')
    consumeNotice(rec.id)
    expect(pendingNotices(PARENT)).toEqual([])
    // 其他父的会话看不到这个通知
    expect(pendingNotices('other-parent')).toEqual([])
  })

  it('listSubagents：按父会话过滤', () => {
    const a = createSubagent({ parentId: PARENT, agentId: AGENT, task: 'a' })
    createSubagent({ parentId: 'other', agentId: AGENT, task: 'b' })
    const mine = listSubagents(PARENT)
    expect(mine.map((s) => s.id)).toEqual([a.id])
    expect(listSubagents().length).toBe(2)
  })

  it('findSubagentBySessionId：子会话（session.id = sub_xxx）反查', () => {
    const rec = createSubagent({ parentId: PARENT, agentId: AGENT, task: 't' })
    expect(findSubagentBySessionId(rec.id)?.id).toBe(rec.id)
    expect(findSubagentBySessionId('no-such')).toBeUndefined()
  })

  it('setSubagentAbort + interruptSubagent：定向中断当前轮（保留注册表）', () => {
    const rec = createSubagent({ parentId: PARENT, agentId: AGENT, task: 't' })
    let aborted = false
    setSubagentAbort(rec.id, () => { aborted = true })
    expect(interruptSubagent(rec.id)).toBe(true)
    expect(aborted).toBe(true)
    clearSubagentAbort(rec.id)
    // 无运行句柄：报告不在运行
    expect(interruptSubagent(rec.id)).toBe(false)
    // 注册表仍保留
    expect(getSubagent(rec.id)).toBeTruthy()
  })

  it('deleteSubagent：清理注册表与 abort 句柄', () => {
    const rec = createSubagent({ parentId: PARENT, agentId: AGENT, task: 't' })
    setSubagentAbort(rec.id, () => {})
    deleteSubagent(rec.id)
    expect(getSubagent(rec.id)).toBeUndefined()
    expect(interruptSubagent(rec.id)).toBe(false)
  })
})
