// Express 服务器：路由挂载 + 调度器启动 + 健康检查
import express from 'express'
import { connectServer, loadMcpConfigs, getHealth, saveMcpConfig, deleteMcpConfig, disconnectServer, reconnectServer } from './mcp.js'
import type { McpServerConfig } from './types.js'
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
import { listMemories, addMemory, updateMemory, deleteMemory } from './memory.js'
import { workspaceInfo, setWorkspacePath, ensureWorkspace } from './workspace.js'
import type { Task } from './types.js'

const app = express()
app.use(express.json({ limit: '2mb' }))

const PORT = Number(process.env.NOVA_AGENT_PORT ?? 8787)

// 启动即确保工作区存在（默认 workspace/，或用户配置的目录）
ensureWorkspace()

// ---------- MCP server 启动连接（失败不影响启动，打印警告） ----------
const mcpConfigs = loadMcpConfigs()
for (const cfg of mcpConfigs) {
  connectServer(cfg).catch((err) => {
    console.error(`[mcp] server "${cfg.id}" failed to connect: ${(err as Error).message}`)
  })
}

// ---------- 业务路由 ----------
app.use('/api/agents', agentsRouter)
app.use('/api/sessions', sessionsRouter)
app.use('/api/skills', skillsRouter)
app.use('/api/mcp-servers', mcpServersRouter)
app.use('/api/tools', toolsRouter)
app.use('/api/chat', chatRouter)
app.use('/api/tasks', tasksRouter)
app.use('/api/uploads', uploadsRouter)

// ---------- MCP 服务器管理（动态增删改，保存即生效） ----------

// 实时状态（连接探测 + 自动重连调度）
app.get('/api/mcp-servers/status', async (_req, res) => {
  const statuses = await getHealth()
  // 合并配置里存在但未连接（或连接失败）的服务器
  const configs = loadMcpConfigs()
  const byId = new Map(statuses.map((s) => [s.serverId, s]))
  const merged = configs.map((c) => byId.get(c.id) ?? {
    serverId: c.id, name: c.name ?? c.id, connected: false, toolCount: 0,
  })
  res.json(merged)
})

// 添加/更新服务器：保存配置 → 尝试连接（失败不阻塞，状态里可看错误）
app.post('/api/mcp-servers', async (req, res) => {
  const body = req.body as { config?: McpServerConfig; upsert?: boolean }
  const config = body?.config
  if (!config || typeof config !== 'object') return res.status(400).json({ error: 'config required' })
  try {
    const saved = saveMcpConfig(config)
    // 更新场景先断开旧连接（避免新配置不生效）
    if (body.upsert) await disconnectServer(saved.id)
    let status: Record<string, unknown> = { serverId: saved.id, name: saved.name, connected: false, toolCount: 0 }
    try {
      const conn = await connectServer(saved)
      status = { serverId: saved.id, name: saved.name, connected: true, toolCount: conn.tools.length }
    } catch (err) {
      status.lastError = (err as Error).message
    }
    res.json({ config: saved, status })
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

// 更新（保存 + 重连）
app.put('/api/mcp-servers/:id', async (req, res) => {
  const body = req.body as { config?: McpServerConfig }
  const config = body?.config
  if (!config || typeof config !== 'object') return res.status(400).json({ error: 'config required' })
  try {
    config.id = req.params.id
    const saved = saveMcpConfig(config)
    await disconnectServer(saved.id)
    let status: Record<string, unknown> = { serverId: saved.id, name: saved.name, connected: false, toolCount: 0 }
    try {
      const conn = await connectServer(saved)
      status = { serverId: saved.id, name: saved.name, connected: true, toolCount: conn.tools.length }
    } catch (err) {
      status.lastError = (err as Error).message
    }
    res.json({ config: saved, status })
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

// 重连
app.post('/api/mcp-servers/:id/reconnect', async (req, res) => {
  res.json(await reconnectServer(req.params.id))
})

// 删除：断开连接 + 删配置文件
app.delete('/api/mcp-servers/:id', async (req, res) => {
  await disconnectServer(req.params.id)
  const ok = deleteMcpConfig(req.params.id)
  if (!ok) return res.status(404).json({ error: 'server not found' })
  res.json({ ok: true })
})

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

// ---------- 跨会话记忆（按 Agent 隔离） ----------

app.get('/api/memories', (req, res) => {
  const agentId = String(req.query.agentId ?? '')
  if (!agentId) return res.status(400).json({ error: 'agentId required' })
  res.json(listMemories(agentId))
})

app.post('/api/memories', (req, res) => {
  const { agentId, content } = req.body as { agentId?: string; content?: string }
  if (!agentId || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'agentId (string) and content (string) required' })
  }
  try {
    const result = addMemory(agentId, content, 'manual')
    res.json({ memory: result.memory, merged: result.merged })
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

// 编辑记忆（UI；同样走长度校验）
app.put('/api/memories/:id', (req, res) => {
  const { content } = req.body as { content?: string }
  if (typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'content (string) required' })
  }
  const memory = updateMemory(req.params.id, content)
  if (!memory) return res.status(400).json({ error: `记忆内容无效或过长（最多 200 字）` })
  res.json(memory)
})

app.delete('/api/memories/:id', (req, res) => {
  const ok = deleteMemory(req.params.id)
  if (!ok) return res.status(404).json({ error: 'memory not found' })
  res.json({ ok: true })
})

// ---------- 工作区（Agent 文件权限边界，filesystem MCP 挂载根） ----------
// GET：当前配置 + 解析后绝对路径 + 存在状态
app.get('/api/workspace', (_req, res) => {
  res.json(workspaceInfo())
})

// PUT：设置工作区（相对路径按项目根解析；空串 = 重置回默认 workspace/）
app.put('/api/workspace', async (req, res) => {
  const { path } = req.body as { path?: unknown }
  if (typeof path !== 'string') return res.status(400).json({ error: 'path (string) required' })
  const err = setWorkspacePath(path)
  if (err) return res.status(400).json({ error: err })
  // 确保目录存在（否则 filesystem 等挂载工作区的 server 会启动失败）
  ensureWorkspace()
  // 重连挂载工作区的 MCP server（filesystem 等用 {{workspace}} 占位符的），新路径立即生效；
  // 逐个串行并收集结果，让前端知道哪个 server 重连失败
  const reconnected: Array<{ serverId: string; ok: boolean; error?: string }> = []
  for (const cfg of loadMcpConfigs()) {
    if ((cfg.args ?? []).some((a) => a.includes('{{workspace}}'))) {
      const st = await reconnectServer(cfg.id).catch((e: Error) =>
        ({ serverId: cfg.id, name: cfg.name ?? cfg.id, connected: false, toolCount: 0, lastError: e.message }))
      reconnected.push({ serverId: cfg.id, ok: st.connected, error: st.lastError })
    }
  }
  res.json({ ...workspaceInfo(), reconnected })
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
