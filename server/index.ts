// Express 服务器：路由挂载 + 调度器启动 + 健康检查
import express from 'express'
import { connectServer, loadMcpConfigs, getHealth } from './mcp.js'
import { listAgents, listSessions, getSession, getAgent, saveSession, saveExternalKey, hasExternalKey, resolveApiKey } from './store.js'
import { startScheduler, setTaskSession } from './scheduler.js'
import { runTurn } from './agentLoop.js'
import { agentsRouter } from './routes/agents.js'
import { sessionsRouter } from './routes/sessions.js'
import { skillsRouter, toolsRouter, mcpServersRouter } from './routes/catalogs.js'
import { chatRouter } from './routes/chat.js'
import { tasksRouter } from './routes/tasks.js'
import type { Task } from './types.js'

const app = express()
app.use(express.json({ limit: '2mb' }))

const PORT = Number(process.env.NOVA_AGENT_PORT ?? 8787)

// ---------- MCP server 启动连接（失败不影响启动，打印警告） ----------
const mcpConfigs = loadMcpConfigs()
for (const cfg of mcpConfigs) {
  connectServer(cfg).catch((err) => {
    console.error(`[mcp] server "${cfg.id}" failed to connect: ${(err as Error).message}`)
  })
}

// ---------- 全局配置（API key） ----------
app.get('/api/config', (_req, res) => {
  res.json({
    hasApiKey: Boolean(resolveApiKey()),
    // 不返回明文 key，只告诉前端"已配置"
    apiKeySource: hasExternalKey() ? 'configured' : process.env.DEEPSEEK_API_KEY ? 'env' : 'none',
  })
})

app.post('/api/config', (req, res) => {
  const { apiKey } = req.body as { apiKey?: string }
  if (typeof apiKey !== 'string') return res.status(400).json({ error: 'apiKey (string) required' })
  saveExternalKey(apiKey.trim())
  res.json({ ok: true, hasApiKey: Boolean(apiKey.trim()) })
})

// ---------- 业务路由 ----------
app.use('/api/agents', agentsRouter)
app.use('/api/sessions', sessionsRouter)
app.use('/api/skills', skillsRouter)
app.use('/api/mcp-servers', mcpServersRouter)
app.use('/api/tools', toolsRouter)
app.use('/api/chat', chatRouter)
app.use('/api/tasks', tasksRouter)

// ---------- 健康检查 ----------
app.get('/api/health', async (_req, res) => {
  const mcpHealth = await getHealth()
  res.json({
    ok: true,
    agents: listAgents().length,
    sessions: listSessions().length,
    mcpServers: mcpHealth.map((m) => ({ id: m.serverId, connected: m.connected, tools: m.toolCount })),
    hasApiKey: Boolean(resolveApiKey()),
  })
})

// ---------- 定时任务调度器 ----------
// 任务执行体：用任务专用会话跑一轮 agent（无 SSE，结果落库）
async function taskRunner(task: Task): Promise<string> {
  const agent = getAgent(task.agentId)
  if (!agent) throw new Error(`agent "${task.agentId}" not found`)

  // 首次执行自动创建任务专用会话，之后复用（上下文连续）
  let session = task.sessionId ? getSession(task.sessionId) : undefined
  if (!session) {
    const { newId } = await import('./store.js')
    session = {
      id: newId('session'),
      agentId: agent.id,
      title: `[定时任务] ${task.name}`,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    saveSession(session)
    setTaskSession(task.id, session.id)
  }
  if (!session) throw new Error('failed to create task session')

  // 静默跑一轮（不推 SSE，只拿最终文本）
  const result = await runTurn(session, agent, task.prompt || `（定时任务 ${task.name}）`, () => {})
  saveSession(session)
  return result.content || '(无输出)'
}

// 启动调度器（server 起来后再 start，避免模块加载期执行）
app.listen(PORT, () => {
  console.log(`[server] nova-agent API listening on http://localhost:${PORT}`)
  console.log(`[server] MCP servers: ${mcpConfigs.map((c) => c.id).join(', ') || '(none)'}`)
  console.log(`[server] DEEPSEEK_API_KEY set: ${Boolean(process.env.DEEPSEEK_API_KEY)}`)
  startScheduler(taskRunner)
  console.log(`[server] task scheduler started`)
})
