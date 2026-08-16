// Express 服务器：SSE 流式 + 全部 API 路由
import express from 'express'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { McpServerConfig, Agent, Session, ChatEvent } from './types.js'
import {
  listAgents, getAgent, saveAgent, deleteAgent, listSessions, getSession, saveSession, deleteSession, newId,
  saveExternalKey, hasExternalKey, resolveApiKey,
} from './store.js'
import { connectServer, getConnections } from './mcp.js'
import { loadSkills, saveSkill, deleteSkill } from './skills.js'
import { runTurn, abortRun } from './agentLoop.js'
import { shouldCompact, compactSession } from './compact.js'

const app = express()
app.use(express.json({ limit: '2mb' }))

const PORT = Number(process.env.NOVA_AGENT_PORT ?? 8787)

// ---------- MCP server 配置（mcp-servers/*.json） ----------
function loadMcpConfigs(): McpServerConfig[] {
  const dir = join(process.cwd(), 'mcp-servers')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const raw = JSON.parse(readFileSync(join(dir, f), 'utf8'))
      return {
        id: raw.id ?? f.replace(/\.json$/, ''),
        name: raw.name ?? raw.id ?? f,
        command: raw.command,
        args: raw.args ?? [],
        env: raw.env,
        timeoutMs: raw.timeoutMs,
      }
    })
    .filter((c) => c.command)
}

// 启动时连接所有配置的 MCP server（失败不影响启动，打印警告）
const mcpConfigs = loadMcpConfigs()
for (const cfg of mcpConfigs) {
  connectServer(cfg).catch((err) => {
    console.error(`[mcp] server "${cfg.id}" failed to connect: ${(err as Error).message}`)
  })
}

// ---------- SSE 工具 ----------
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

// ---------- Agent 路由 ----------
app.get('/api/agents', (_req, res) => {
  res.json(listAgents())
})

app.post('/api/agents', (req, res) => {
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

app.put('/api/agents/:id', (req, res) => {
  const existing = getAgent(req.params.id)
  if (!existing) return res.status(404).json({ error: 'agent not found' })
  const body = req.body as Partial<Agent>
  const agent: Agent = { ...existing, ...body, id: existing.id }
  saveAgent(agent)
  res.json(agent)
})

app.delete('/api/agents/:id', (req, res) => {
  const existing = getAgent(req.params.id)
  if (!existing) return res.status(404).json({ error: 'agent not found' })
  deleteAgent(req.params.id)
  // 连带删除该 agent 的所有会话
  for (const s of listSessions(req.params.id)) {
    deleteSession(s.id)
  }
  res.json({ ok: true })
})

// ---------- MCP servers / Skills 清单（配置页勾选用） ----------
app.get('/api/mcp-servers', (_req, res) => {
  res.json(mcpConfigs)
})

// ---------- Skills CRUD（可视化编辑器后端） ----------
app.get('/api/skills', (_req, res) => {
  res.json(loadSkills())
})

app.post('/api/skills', (req, res) => {
  const body = req.body as { id?: string; name?: string; description?: string; whenToUse?: string; content?: string }
  if (!body.name?.trim()) return res.status(400).json({ error: 'name (string) required' })
  const skill = saveSkill({
    id: body.id,
    name: body.name.trim(),
    description: body.description?.trim() ?? '',
    whenToUse: body.whenToUse?.trim(),
    content: body.content ?? '',
  })
  res.json(skill)
})

app.delete('/api/skills/:id', (req, res) => {
  const ok = deleteSkill(req.params.id)
  if (!ok) return res.status(404).json({ error: 'skill not found' })
  res.json({ ok: true })
})

// ---------- Tools 浏览（聚合所有 MCP server 的工具 + schema） ----------
app.get('/api/tools', (_req, res) => {
  const conns = getConnections()
  const result = []
  for (const [serverId, conn] of conns) {
    for (const t of conn.tools) {
      result.push({
        serverId,
        serverName: conn.config.name ?? serverId,
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })
    }
  }
  res.json(result)
})

// ---------- Session 路由 ----------
app.get('/api/sessions', (req, res) => {
  const agentId = typeof req.query.agentId === 'string' ? req.query.agentId : undefined
  res.json(listSessions(agentId))
})

app.post('/api/sessions', (req, res) => {
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

app.get('/api/sessions/:id', (req, res) => {
  const session = getSession(req.params.id)
  if (!session) return res.status(404).json({ error: 'session not found' })
  res.json(session)
})

// 会话重命名
app.put('/api/sessions/:id', (req, res) => {
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
app.delete('/api/sessions/:id', (req, res) => {
  const session = getSession(req.params.id)
  if (!session) return res.status(404).json({ error: 'session not found' })
  deleteSession(req.params.id)
  res.json({ ok: true })
})

// ---------- 聊天（SSE 流式） ----------
app.post('/api/chat', async (req, res) => {
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
app.post('/api/chat/stop', (req, res) => {
  const { sessionId } = req.body as { sessionId?: string }
  if (sessionId) abortRun(sessionId)
  res.json({ ok: true })
})

// ---------- 手动压缩（真实 summarization：LLM 总结旧消息） ----------
app.post('/api/sessions/:id/compact', async (req, res) => {
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

// ---------- 健康检查 ----------
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    agents: listAgents().length,
    sessions: listSessions().length,
    mcpServers: mcpConfigs.map((c) => c.id),
    hasApiKey: Boolean(resolveApiKey()),
  })
})

app.listen(PORT, () => {
  console.log(`[server] nova-agent API listening on http://localhost:${PORT}`)
  console.log(`[server] MCP servers: ${mcpConfigs.map((c) => c.id).join(', ') || '(none)'}`)
  console.log(`[server] Skills: ${loadSkills().map((s) => s.id).join(', ') || '(none)'}`)
  console.log(`[server] DEEPSEEK_API_KEY set: ${Boolean(process.env.DEEPSEEK_API_KEY)}`)
})
