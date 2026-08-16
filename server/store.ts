// 存储层：Agent / Session 的 JSON 持久化 + 检查点
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { Agent, Session } from './types.js'

const DATA_DIR = join(process.cwd(), 'data')
const AGENTS_DIR = join(DATA_DIR, 'agents')
const SESSIONS_DIR = join(DATA_DIR, 'sessions')
const CONFIG_PATH = join(DATA_DIR, 'config.json')

function ensureDirs() {
  mkdirSync(AGENTS_DIR, { recursive: true })
  mkdirSync(SESSIONS_DIR, { recursive: true })
}
ensureDirs()

// ---------- 全局配置（API key 等，前端可读写） ----------

export interface AppConfig {
  apiKey?: string
}

export function getConfig(): AppConfig {
  return readJson<AppConfig>(CONFIG_PATH, {})
}

export function saveConfig(config: AppConfig) {
  writeJson(CONFIG_PATH, config)
}

// 解析 key 优先级：项目外存储 > 环境变量
// （key 存在项目外，避免 agent 通过 filesystem 工具读取到项目内的 key）
const EXTERNAL_KEY_PATH = join(dirname(process.cwd()), '.my-agent-key.json')

export function resolveApiKey(): string | undefined {
  try {
    const ext = readJson<{ apiKey?: string }>(EXTERNAL_KEY_PATH, {})
    if (ext.apiKey && ext.apiKey.trim()) return ext.apiKey.trim()
  } catch {
    // 忽略外部 key 文件读取失败
  }
  return process.env.DEEPSEEK_API_KEY
}

// 保存 API key 到项目外（agent 不可达的位置）
export function saveExternalKey(apiKey: string) {
  writeJson(EXTERNAL_KEY_PATH, { apiKey })
}

// 是否已通过项目外文件配置 key
export function hasExternalKey(): boolean {
  try {
    const ext = readJson<{ apiKey?: string }>(EXTERNAL_KEY_PATH, {})
    return Boolean(ext.apiKey && ext.apiKey.trim())
  } catch {
    return false
  }
}

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf8')
}

// ---------- Agents ----------

export function listAgents(): Agent[] {
  if (!existsSync(AGENTS_DIR)) return []
  return readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson<Agent | null>(join(AGENTS_DIR, f), null))
    .filter((a): a is Agent => a !== null)
    .sort((a, b) => a.createdAt - b.createdAt)
}

export function getAgent(id: string): Agent | undefined {
  return readJson<Agent | null>(join(AGENTS_DIR, `${id}.json`), null) ?? undefined
}

export function saveAgent(agent: Agent) {
  writeJson(join(AGENTS_DIR, `${agent.id}.json`), agent)
}

export function deleteAgent(id: string) {
  rmSync(join(AGENTS_DIR, `${id}.json`), { force: true })
}

// ---------- Sessions（含检查点：每条消息落盘） ----------

export function listSessions(agentId?: string): Session[] {
  if (!existsSync(SESSIONS_DIR)) return []
  return readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson<Session | null>(join(SESSIONS_DIR, f), null))
    .filter((s): s is Session => s !== null)
    .filter((s) => (agentId ? s.agentId === agentId : true))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getSession(id: string): Session | undefined {
  return readJson<Session | null>(join(SESSIONS_DIR, `${id}.json`), null) ?? undefined
}

// 检查点：写入整个 session（append 语义由调用方控制调用时机）
export function saveSession(session: Session) {
  session.updatedAt = Date.now()
  writeJson(join(SESSIONS_DIR, `${session.id}.json`), session)
}

export function deleteSession(id: string) {
  rmSync(join(SESSIONS_DIR, `${id}.json`), { force: true })
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}
