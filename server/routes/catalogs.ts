// Skills CRUD + MCP servers / Tools 浏览路由
import express from 'express'
import { loadSkills, saveSkill, deleteSkill } from '../skills.js'
import { getConnections, loadMcpConfigs } from '../mcp.js'

export const skillsRouter = express.Router()
export const toolsRouter = express.Router()
export const mcpServersRouter = express.Router()

// MCP server 配置清单（启动时加载一次）
const mcpConfigs = loadMcpConfigs()

// ---------- Skills CRUD ----------

skillsRouter.get('/', (_req, res) => {
  res.json(loadSkills())
})

skillsRouter.post('/', (req, res) => {
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

skillsRouter.delete('/:id', (req, res) => {
  const ok = deleteSkill(req.params.id)
  if (!ok) return res.status(404).json({ error: 'skill not found' })
  res.json({ ok: true })
})

// ---------- MCP servers ----------

mcpServersRouter.get('/', (_req, res) => {
  res.json(mcpConfigs)
})

// ---------- Tools 浏览（聚合所有 MCP server 的工具 + schema） ----------

toolsRouter.get('/', (_req, res) => {
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
