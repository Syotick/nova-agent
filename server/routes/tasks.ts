// 定时任务路由（CRUD + 启停）
import express from 'express'
import { listTasks, getTask, saveTask, deleteTask, runTaskNow } from '../scheduler.js'
import { getAgent } from '../store.js'

export const tasksRouter = express.Router()

tasksRouter.get('/', (_req, res) => {
  res.json(listTasks())
})

tasksRouter.post('/', (req, res) => {
  const body = req.body as { name?: string; agentId?: string; cron?: string; prompt?: string }
  if (!body.name?.trim()) return res.status(400).json({ error: 'name (string) required' })
  if (!body.agentId || !getAgent(body.agentId)) return res.status(400).json({ error: 'valid agentId required' })
  if (!body.cron?.trim()) return res.status(400).json({ error: 'cron (string) required' })
  try {
    const task = saveTask({ name: body.name, agentId: body.agentId, cron: body.cron, prompt: body.prompt })
    res.json(task)
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

tasksRouter.put('/:id', (req, res) => {
  const existing = getTask(req.params.id)
  if (!existing) return res.status(404).json({ error: 'task not found' })
  const body = req.body as { name?: string; cron?: string; prompt?: string; enabled?: boolean }
  try {
    const task = saveTask({
      id: existing.id,
      name: body.name ?? existing.name,
      agentId: existing.agentId,
      cron: body.cron ?? existing.cron,
      prompt: body.prompt ?? existing.prompt,
      enabled: body.enabled ?? existing.enabled,
    })
    res.json(task)
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

// 手动触发一次（不入调度队列，立即执行）
tasksRouter.post('/:id/run', async (req, res) => {
  const task = getTask(req.params.id)
  if (!task) return res.status(404).json({ error: 'task not found' })
  try {
    const result = await runTaskNow(task.id)
    res.json({ ok: true, result })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

tasksRouter.delete('/:id', (req, res) => {
  const ok = deleteTask(req.params.id)
  if (!ok) return res.status(404).json({ error: 'task not found' })
  res.json({ ok: true })
})
