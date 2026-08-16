// 聊天路由：SSE 流式对话 + 中断
import express from 'express'
import type { ChatEvent } from '../types.js'
import { getSession, getAgent, saveSession } from '../store.js'
import { runTurn, abortRun } from '../agentLoop.js'

export const chatRouter = express.Router()

function sse(res: express.Response) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  return (e: ChatEvent) => {
    res.write(`data: ${JSON.stringify(e)}\n\n`)
  }
}

chatRouter.post('/', async (req, res) => {
  const { sessionId, text } = req.body as { sessionId?: string; text?: string }
  if (!sessionId || !text) {
    return res.status(400).json({ error: 'sessionId and text required' })
  }
  const session = getSession(sessionId)
  if (!session) return res.status(404).json({ error: 'session not found' })
  const agent = getAgent(session.agentId)
  if (!agent) return res.status(404).json({ error: 'agent not found' })

  const emit = sse(res)
  saveSession(session) // 检查点：用户消息已由 runTurn 落盘

  // 客户端断开 → 中断运行
  res.on('close', () => {
    if (!res.writableEnded) abortRun(sessionId)
  })

  try {
    await runTurn(session, agent, text, emit)
    saveSession(session) // 检查点：完整 turn 落盘
  } catch (err) {
    const msg = (err as Error).message ?? String(err)
    emit({ type: 'error', message: msg })
  } finally {
    res.end()
  }
})

// 中断当前运行
chatRouter.post('/stop', (req, res) => {
  const { sessionId } = req.body as { sessionId?: string }
  if (sessionId) abortRun(sessionId)
  res.json({ ok: true })
})
