// 存储层：SQLite（node:sqlite）持久化 Agent / Session / Config
// 旧 JSON 数据由 db.ts 启动时自动迁移
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { Agent, Session } from './types.js'
import { db, rowToAgent, rowToSession } from './db.js'

// ---------- 全局配置（API key 等） ----------

export interface AppConfig {
  apiKey?: string
}

export function getConfig(): AppConfig {
  const row = db.prepare('SELECT key, value FROM config WHERE key = ?').get('apiKey') as
    | { key: string; value: string }
    | undefined
  return row ? { apiKey: row.value } : {}
}

export function saveConfig(config: AppConfig) {
  db.prepare(
    'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run('apiKey', config.apiKey ?? '')
}

// 解析 key 优先级：项目外存储 > 环境变量
// （key 存在项目外，避免 agent 通过 filesystem 工具读取到项目内的 key）
const EXTERNAL_KEY_PATH = join(dirname(process.cwd()), '.nova-agent-key.json')

export function resolveApiKey(): string | undefined {
  try {
    const ext = JSON.parse(readExternalKeyFile()) as { apiKey?: string }
    if (ext.apiKey && ext.apiKey.trim()) return ext.apiKey.trim()
  } catch {
    // 忽略外部 key 文件读取失败
  }
  return process.env.DEEPSEEK_API_KEY
}

function readExternalKeyFile(): string {
  // 文件不存在时抛错由调用方 catch
  return readFileSync(EXTERNAL_KEY_PATH, 'utf8')
}

// 保存 API key 到项目外（agent 不可达的位置）
export function saveExternalKey(apiKey: string) {
  writeFileSync(EXTERNAL_KEY_PATH, JSON.stringify({ apiKey }, null, 2), 'utf8')
}

// 是否已通过项目外文件配置 key
export function hasExternalKey(): boolean {
  try {
    const ext = JSON.parse(readExternalKeyFile()) as { apiKey?: string }
    return Boolean(ext.apiKey && ext.apiKey.trim())
  } catch {
    return false
  }
}

// ---------- Agents ----------

export function listAgents(): Agent[] {
  const rows = db.prepare('SELECT * FROM agents ORDER BY created_at ASC').all() as Record<string, unknown>[]
  return rows.map(rowToAgent)
}

export function getAgent(id: string): Agent | undefined {
  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? rowToAgent(row) : undefined
}

export function saveAgent(agent: Agent) {
  db.prepare(
    `INSERT INTO agents (id, name, persona, model, mcp_server_ids, skill_ids, color, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       persona = excluded.persona,
       model = excluded.model,
       mcp_server_ids = excluded.mcp_server_ids,
       skill_ids = excluded.skill_ids,
       color = excluded.color`,
  ).run(
    agent.id,
    agent.name,
    agent.persona,
    agent.model,
    JSON.stringify(agent.mcpServerIds ?? []),
    JSON.stringify(agent.skillIds ?? []),
    agent.color ?? '#4d6bfe',
    agent.createdAt ?? Date.now(),
  )
}

export function deleteAgent(id: string) {
  // sessions 有外键级联删除；tasks 同样级联
  db.prepare('DELETE FROM agents WHERE id = ?').run(id)
}

// ---------- Sessions（含检查点：每条消息落盘） ----------

export function listSessions(agentId?: string): Session[] {
  const rows = (agentId
    ? db.prepare('SELECT * FROM sessions WHERE agent_id = ? ORDER BY updated_at DESC').all(agentId)
    : db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all()) as Record<string, unknown>[]
  return rows.map(rowToSession)
}

export function getSession(id: string): Session | undefined {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? rowToSession(row) : undefined
}

// 检查点：写入整个 session（append 语义由调用方控制调用时机）
export function saveSession(session: Session) {
  session.updatedAt = Date.now()
  db.prepare(
    `INSERT INTO sessions (id, agent_id, title, messages, summary, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       agent_id = excluded.agent_id,
       title = excluded.title,
       messages = excluded.messages,
       summary = excluded.summary,
       updated_at = excluded.updated_at`,
  ).run(
    session.id,
    session.agentId,
    session.title,
    JSON.stringify(session.messages ?? []),
    session.summary ?? null,
    session.createdAt ?? Date.now(),
    session.updatedAt ?? Date.now(),
  )
}

export function deleteSession(id: string) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}
