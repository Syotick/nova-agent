// Agent 路由
import express from 'express'
import type { Agent } from '../types.js'
import { listAgents, getAgent, saveAgent, deleteAgent, listSessions, deleteSession, newId } from '../store.js'

export const agentsRouter = express.Router()

agentsRouter.get('/', (_req, res) => {
  res.json(listAgents())
})

agentsRouter.post('/', (req, res) => {
  const body = req.body as Partial<Agent>
  const agent: Agent = {
    id: newId('agent'),
    name: body.name?.trim() || '新 Agent',
    persona: body.persona?.trim() || 'You are a helpful assistant.',
    model: body.model?.trim() || 'deepseek-v4-flash',
    mcpServerIds: body.mcpServerIds ?? [],
    skillIds: body.skillIds ?? [],
    color: body.color ?? '#4d6bfe',
    createdAt: Date.now(),
  }
  saveAgent(agent)
  res.json(agent)
})

agentsRouter.put('/:id', (req, res) => {
  const existing = getAgent(req.params.id)
  if (!existing) return res.status(404).json({ error: 'agent not found' })
  const body = req.body as Partial<Agent>
  const agent: Agent = { ...existing, ...body, id: existing.id }
  saveAgent(agent)
  res.json(agent)
})

agentsRouter.delete('/:id', (req, res) => {
  const existing = getAgent(req.params.id)
  if (!existing) return res.status(404).json({ error: 'agent not found' })
  deleteAgent(req.params.id)
  // 连带删除该 agent 的所有会话（SQLite 外键级联已处理，这里兼容旧逻辑显式删除）
  for (const s of listSessions(req.params.id)) {
    deleteSession(s.id)
  }
  res.json({ ok: true })
})
