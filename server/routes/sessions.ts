// 会话路由（含手动压缩）
import express from 'express'
import type { Session } from '../types.js'
import { listSessions, getSession, saveSession, deleteSession, getAgent, newId } from '../store.js'
import { shouldCompact, compactSession } from '../compact.js'

export const sessionsRouter = express.Router()

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
