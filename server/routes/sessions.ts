// 会话路由（含手动压缩 + 全文搜索）
import express from 'express'
import type { Session, Message } from '../types.js'
import { listSessions, getSession, saveSession, deleteSession, getAgent, newId } from '../store.js'
import { shouldCompact, compactSession } from '../compact.js'

export const sessionsRouter = express.Router()

// 命中片段截取：关键词前后各 40 字符，总长 ≤ 160（避免返回完整消息内容）
function snippet(content: string, q: string): string {
  const idx = content.toLowerCase().indexOf(q)
  const start = Math.max(0, idx - 40)
  const slice = content.slice(start, start + 160)
  return (start > 0 ? '…' : '') + slice + (content.length > start + 160 ? '…' : '')
}

// 全文搜索：GET /api/sessions/search?q=关键词（在全部会话消息里匹配）
sessionsRouter.get('/search', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : ''
  if (!q) return res.json([])
  const results: Array<{
    sessionId: string
    title: string
    agentId: string
    messageId: string
    role: 'user' | 'assistant'
    content: string
    createdAt: number
  }> = []
  for (const s of listSessions()) {
    for (const m of s.messages) {
      if (m.content && m.content.toLowerCase().includes(q)) {
        results.push({
          sessionId: s.id,
          title: s.title,
          agentId: s.agentId,
          messageId: m.id,
          role: m.role,
          // 只返回命中片段，不返回完整消息内容（配合无认证场景减小暴露面）
          content: snippet(m.content, q),
          createdAt: m.createdAt,
        })
        if (results.length >= 100) break
      }
    }
    if (results.length >= 100) break
  }
  // 按时间倒序
  results.sort((a, b) => b.createdAt - a.createdAt)
  res.json(results)
})

sessionsRouter.get('/', (req, res) => {
  const agentId = typeof req.query.agentId === 'string' ? req.query.agentId : undefined
  res.json(listSessions(agentId))
})

sessionsRouter.post('/', (req, res) => {
  const body = req.body as Partial<Session>
  const agentId = body.agentId
  if (!agentId || !getAgent(agentId)) return res.status(400).json({ error: 'valid agentId required' })
  const session: Session = {
    id: newId('session'),
    agentId,
    title: '新会话',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  saveSession(session)
  res.json(session)
})

sessionsRouter.get('/:id', (req, res) => {
  const session = getSession(req.params.id)
  if (!session) return res.status(404).json({ error: 'session not found' })
  res.json(session)
})

// 会话重命名
sessionsRouter.put('/:id', (req, res) => {
  const session = getSession(req.params.id)
  if (!session) return res.status(404).json({ error: 'session not found' })
  const { title } = req.body as { title?: string }
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title (string) required' })
  }
  session.title = title.trim()
  saveSession(session)
  res.json(session)
})

// 会话删除
sessionsRouter.delete('/:id', (req, res) => {
  const session = getSession(req.params.id)
  if (!session) return res.status(404).json({ error: 'session not found' })
  deleteSession(req.params.id)
  res.json({ ok: true })
})

// 手动压缩（真实 summarization：LLM 总结旧消息）
sessionsRouter.post('/:id/compact', async (req, res) => {
  const session = getSession(req.params.id)
  if (!session) return res.status(404).json({ error: 'session not found' })
  if (!shouldCompact(session)) {
    return res.json({ ok: true, skipped: true, message: '会话还不够长，无需压缩' })
  }
  const agent = getAgent(session.agentId)
  if (!agent) return res.status(500).json({ error: 'agent not found' })

  try {
    const result = await compactSession(session, agent)
    saveSession(session)
    res.json({ ok: true, skipped: false, ...result })
  } catch (err) {
    res.status(500).json({ error: `压缩失败: ${(err as Error).message}` })
  }
})
