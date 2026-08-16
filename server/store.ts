// 存储层：SQLite（node:sqlite）持久化 Agent / Session / Config
// 旧 JSON 数据由 db.ts 启动时自动迁移
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { Agent, Session } from './types.js'
import { db, rowToAgent, rowToSession } from './db.js'

// ---------- API keys（项目外文件，agent 的工具无法读取） ----------
// 外部文件结构：{ providers: { [providerId]: key } }（无全局 key 概念）
const EXTERNAL_KEY_PATH = join(dirname(process.cwd()), '.nova-agent-key.json')

interface ExternalKeys {
  apiKey?: string // 旧数据兼容（全局 key 已废弃，读取时忽略）
  providers?: Record<string, string>
}

function readExternalKeys(): ExternalKeys {
  try {
    return JSON.parse(readFileSync(EXTERNAL_KEY_PATH, 'utf8')) as ExternalKeys
  } catch {
    return {}
  }
}

function writeExternalKeys(keys: ExternalKeys) {
  writeFileSync(EXTERNAL_KEY_PATH, JSON.stringify(keys, null, 2), 'utf8')
}

// 全局 key 已废弃：仅保留 DEEPSEEK_API_KEY 环境变量作为兜底（旧部署迁移用）
export function resolveApiKey(): string | undefined {
  return process.env.DEEPSEEK_API_KEY
}

// 项目外文件中该 provider 专属的 key（设置页配置，优先级最高）
export function resolveProviderKey(providerId: string): string | undefined {
  const k = readExternalKeys().providers?.[providerId]
  if (k && k.trim()) return k.trim()
  return undefined
}

export function hasProviderKey(providerId: string): boolean {
  return Boolean(resolveProviderKey(providerId))
}

// provider key 状态（前端展示用）：configured（项目外文件）/ env（环境变量）/ none
export function providerKeySource(providerId: string, apiKeyEnv?: string): 'configured' | 'env' | 'none' {
  if (hasProviderKey(providerId)) return 'configured'
  if (apiKeyEnv && process.env[apiKeyEnv]) return 'env'
  return 'none'
}

// 保存/更新/删除（空串删除）某 provider 的 key
export function saveProviderKey(providerId: string, apiKey: string) {
  const ext = readExternalKeys()
  const providers = { ...(ext.providers ?? {}) }
  const key = apiKey.trim()
  if (key) providers[providerId] = key
  else delete providers[providerId]
  writeExternalKeys({ providers })
}

// ---------- 自定义模型提供商（设置页管理，存 SQLite config 表） ----------

export interface CustomProviderModel {
  id: string
  name?: string
  /** 思考档位声明（可选；未声明时默认开放全部档位） */
  reasoningEfforts?: string[]
}

export interface CustomProvider {
  id: string
  name: string
  baseUrl: string
  apiKeyEnv?: string
  models: CustomProviderModel[]
}

export function listCustomProviders(): CustomProvider[] {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get('customProviders') as
    | { value: string }
    | undefined
  if (!row) return []
  try {
    const list = JSON.parse(row.value) as CustomProvider[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function saveCustomProviders(list: CustomProvider[]) {
  db.prepare(
    'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run('customProviders', JSON.stringify(list))
}

// 新增或更新自定义 provider（id 冲突时报错；仅做合法性校验，不代写模型列表）
export function upsertCustomProvider(p: CustomProvider): { ok: boolean; error?: string } {
  const id = p.id.trim()
  if (!id) return { ok: false, error: 'id 必填' }
  if (!/^[a-z0-9_-]+$/.test(id)) return { ok: false, error: 'id 只能包含小写字母、数字、下划线、连字符' }
  if (!p.name?.trim()) return { ok: false, error: 'name 必填' }
  const baseUrl = p.baseUrl?.trim() ?? ''
  if (!baseUrl) return { ok: false, error: '服务地址（baseUrl）必填' }
  if (!/^https?:\/\/.+/i.test(baseUrl)) return { ok: false, error: '服务地址必须以 http:// 或 https:// 开头' }
  if (!Array.isArray(p.models) || !p.models.length || !p.models.some((m) => m.id?.trim())) {
    return { ok: false, error: '至少需要一个模型 id' }
  }
  for (const m of p.models) {
    if (m.id && !/^[a-zA-Z0-9._:\/-]+$/.test(m.id.trim())) {
      return { ok: false, error: `模型 id "${m.id}" 包含非法字符（仅允许字母/数字/._:/ -）` }
    }
  }
  const list = listCustomProviders()
  const idx = list.findIndex((x) => x.id === id)
  const clean: CustomProvider = {
    id,
    name: p.name.trim(),
    baseUrl,
    apiKeyEnv: p.apiKeyEnv?.trim() || undefined,
    models: p.models
      .filter((m) => m.id?.trim())
      .map((m) => ({ id: m.id.trim(), name: m.name?.trim() || undefined })),
  }
  if (idx === -1) list.push(clean)
  else list[idx] = clean
  saveCustomProviders(list)
  return { ok: true }
}

export function deleteCustomProvider(id: string): boolean {
  const list = listCustomProviders()
  const next = list.filter((x) => x.id !== id)
  if (next.length === list.length) return false
  saveCustomProviders(next)
  return true
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
