// Express 服务器：路由挂载 + 调度器启动 + 健康检查
import express from 'express'
import { connectServer, loadMcpConfigs, getHealth } from './mcp.js'
import {
  listAgents, listSessions, getSession, getAgent, saveSession, resolveApiKey,
  saveProviderKey, providerKeySource, listCustomProviders, upsertCustomProvider, deleteCustomProvider,
} from './store.js'
import { startScheduler, setTaskSession } from './scheduler.js'
import { runTurn } from './agentLoop.js'
import { agentsRouter } from './routes/agents.js'
import { sessionsRouter } from './routes/sessions.js'
import { skillsRouter, toolsRouter, mcpServersRouter } from './routes/catalogs.js'
import { chatRouter } from './routes/chat.js'
import { tasksRouter } from './routes/tasks.js'
import { uploadsRouter } from './routes/uploads.js'
import { listModelCatalog, loadModelProviders, invalidateModelProvidersCache } from './models.js'
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

// ---------- 多渠道 API key 管理 ----------
// GET：各 provider key 状态（不返回明文）
app.get('/api/providers/keys', (_req, res) => {
  const providers = loadModelProviders()
  res.json({
    providers: Object.fromEntries(
      providers.map((p) => [p.id, { source: providerKeySource(p.id, p.apiKeyEnv) }]),
    ),
  })
})

// ---------- 业务路由 ----------
app.use('/api/agents', agentsRouter)
app.use('/api/sessions', sessionsRouter)
app.use('/api/skills', skillsRouter)
app.use('/api/mcp-servers', mcpServersRouter)
app.use('/api/tools', toolsRouter)
app.use('/api/chat', chatRouter)
app.use('/api/tasks', tasksRouter)
app.use('/api/uploads', uploadsRouter)

// ---------- 模型注册表（只读目录） ----------
app.get('/api/models', (_req, res) => {
  res.json(listModelCatalog())
})

// ---------- 多渠道 API key 管理 ----------
// GET：各 provider key 状态（不返回明文），全局 key 状态
app.get('/api/providers/keys', (_req, res) => {
  const providers = loadModelProviders()
  res.json({
        providers: Object.fromEntries(
      providers.map((p) => [p.id, { source: providerKeySource(p.id, p.apiKeyEnv) }]),
    ),
  })
})

// POST：保存/更新/删除（空串删除）某 provider 的 key，存项目外文件
app.post('/api/providers/keys', (req, res) => {
  const { providerId, apiKey } = req.body as { providerId?: string; apiKey?: string }
  if (typeof providerId !== 'string' || !providerId.trim()) {
    return res.status(400).json({ error: 'providerId (string) required' })
  }
  if (typeof apiKey !== 'string') return res.status(400).json({ error: 'apiKey (string) required' })
  saveProviderKey(providerId.trim(), apiKey.trim())
  res.json({ ok: true })
})

// ---------- 自定义模型提供商（设置页管理，存 SQLite，注册表即时生效） ----------

app.get('/api/providers/custom', (_req, res) => {
  res.json(listCustomProviders())
})

app.post('/api/providers/custom', (req, res) => {
  const p = req.body as { id?: string; name?: string; baseUrl?: string; apiKeyEnv?: string; models?: Array<{ id: string; name?: string }> }
  if (!p || typeof p !== 'object') return res.status(400).json({ error: 'body required' })
  const result = upsertCustomProvider({
    id: p.id ?? '',
    name: p.name ?? '',
    baseUrl: p.baseUrl ?? '',
    apiKeyEnv: p.apiKeyEnv,
    models: Array.isArray(p.models) ? p.models : [],
  })
  if (!result.ok) return res.status(400).json({ error: result.error })
  invalidateModelProvidersCache()
  res.json({ ok: true, provider: listCustomProviders().find((x) => x.id === p.id) })
})

app.delete('/api/providers/custom/:id', (req, res) => {
  const ok = deleteCustomProvider(req.params.id)
  invalidateModelProvidersCache()
  if (!ok) return res.status(404).json({ error: 'provider not found' })
  res.json({ ok: true })
})

// ---------- 健康检查 ----------
app.get('/api/health', async (_req, res) => {
  const mcpHealth = await getHealth()
  res.json({
    ok: true,
    agents: listAgents().length,
    sessions: listSessions().length,
    mcpServers: mcpHealth.map((m) => ({ id: m.serverId, connected: m.connected, tools: m.toolCount })),
    // 全局 key 已废弃：仅报告环境变量兜底是否存在
    deepseekEnvKey: Boolean(resolveApiKey()),
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
// 默认只绑定回环地址（本地单用户应用，防局域网/公网访问）；NOVA_AGENT_HOST 可覆盖
const HOST = process.env.NOVA_AGENT_HOST ?? '127.0.0.1'
app.listen(PORT, HOST, () => {
  console.log(`[server] nova-agent API listening on http://${HOST}:${PORT}`)
  console.log(`[server] MCP servers: ${mcpConfigs.map((c) => c.id).join(', ') || '(none)'}`)
  console.log(`[server] DEEPSEEK_API_KEY set: ${Boolean(process.env.DEEPSEEK_API_KEY)}`)
  startScheduler(taskRunner)
  console.log(`[server] task scheduler started`)
})
