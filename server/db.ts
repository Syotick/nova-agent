// SQLite 存储层：基于 Node 内置 node:sqlite（零依赖）
// - 单文件数据库 data/nova-agent.db
// - 首次启动自动迁移旧 JSON 数据（data/agents/*.json、data/sessions/*.json）
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readFileSync, readdirSync, existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import type { Agent, Message, Session } from './types.js'

const DATA_DIR = join(process.cwd(), 'data')
const DB_PATH = join(DATA_DIR, 'nova-agent.db')
const BACKUP_DIR = join(DATA_DIR, 'imported-json-backup')

// 全新环境（CI/首次运行）没有 data 目录，必须先创建，否则 SQLite 打不开
mkdirSync(DATA_DIR, { recursive: true })

export const db = new DatabaseSync(DB_PATH)

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS agents (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    persona       TEXT NOT NULL DEFAULT '',
    model         TEXT NOT NULL DEFAULT 'deepseek-v4-flash',
    mcp_server_ids TEXT NOT NULL DEFAULT '[]',
    skill_ids     TEXT NOT NULL DEFAULT '[]',
    color         TEXT NOT NULL DEFAULT '#4d6bfe',
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    title       TEXT NOT NULL DEFAULT '新会话',
    messages    TEXT NOT NULL DEFAULT '[]',
    summary     TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    agent_id     TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    cron         TEXT NOT NULL,
    prompt       TEXT NOT NULL DEFAULT '',
    enabled      INTEGER NOT NULL DEFAULT 1,
    session_id   TEXT,
    last_run_at  INTEGER,
    next_run_at  INTEGER,
    last_result  TEXT,
    run_count    INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL
  );
`)

// 兼容：旧库可能缺 session_id 列（ALTER 幂等性靠 try/catch）
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN session_id TEXT`)
} catch {
  // 列已存在
}

// ---------- 旧 JSON 数据自动迁移（幂等：迁移后原文件移入备份目录） ----------

interface JsonAgent extends Agent {}
interface JsonSession extends Session {}

function migrateJsonData() {
  const agentsDir = join(DATA_DIR, 'agents')
  const sessionsDir = join(DATA_DIR, 'sessions')
  let migrated = 0

  // 迁移 agents
  if (existsSync(agentsDir)) {
    for (const f of readdirSync(agentsDir).filter((x) => x.endsWith('.json'))) {
      try {
        const a = JSON.parse(readFileSync(join(agentsDir, f), 'utf8')) as JsonAgent
        if (!a?.id) continue
        db.prepare(
          `INSERT OR IGNORE INTO agents (id, name, persona, model, mcp_server_ids, skill_ids, color, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(a.id, a.name, a.persona, a.model, JSON.stringify(a.mcpServerIds ?? []), JSON.stringify(a.skillIds ?? []), a.color ?? '#4d6bfe', a.createdAt ?? Date.now())
        migrated++
      } catch { /* 跳过坏文件 */ }
    }
  }

  // 迁移 sessions
  if (existsSync(sessionsDir)) {
    for (const f of readdirSync(sessionsDir).filter((x) => x.endsWith('.json'))) {
      try {
        const s = JSON.parse(readFileSync(join(sessionsDir, f), 'utf8')) as JsonSession
        if (!s?.id) continue
        db.prepare(
          `INSERT OR IGNORE INTO sessions (id, agent_id, title, messages, summary, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(s.id, s.agentId, s.title, JSON.stringify(s.messages ?? []), s.summary ?? null, s.createdAt ?? Date.now(), s.updatedAt ?? Date.now())
        migrated++
      } catch { /* 跳过坏文件 */ }
    }
  }

  // 有迁移内容时，把旧 JSON 移入备份目录（保留可追溯，不删除）
  if (migrated > 0) {
    mkdirSync(BACKUP_DIR, { recursive: true })
    const stamp = Date.now().toString(36)
    for (const [srcDir, sub] of [[agentsDir, 'agents'], [sessionsDir, 'sessions']] as const) {
      if (!existsSync(srcDir)) continue
      const dest = join(BACKUP_DIR, `${sub}-${stamp}`)
      mkdirSync(dest, { recursive: true })
      for (const f of readdirSync(srcDir).filter((x) => x.endsWith('.json'))) {
        try { renameSync(join(srcDir, f), join(dest, f)) } catch { /* 忽略 */ }
      }
    }
    console.log(`[db] migrated ${migrated} records from JSON files → SQLite (backup at data/imported-json-backup)`)
  }
}

migrateJsonData()

// ---------- 通用 row → 对象映射 ----------

export function rowToAgent(row: Record<string, unknown>): Agent {
  return {
    id: String(row.id),
    name: String(row.name),
    persona: String(row.persona ?? ''),
    model: String(row.model),
    mcpServerIds: JSON.parse(String(row.mcp_server_ids ?? '[]')) as string[],
    skillIds: JSON.parse(String(row.skill_ids ?? '[]')) as string[],
    color: String(row.color ?? '#4d6bfe'),
    createdAt: Number(row.created_at),
  }
}

export function rowToSession(row: Record<string, unknown>): Session {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    title: String(row.title),
    messages: JSON.parse(String(row.messages ?? '[]')) as Message[],
    summary: row.summary != null ? String(row.summary) : undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

export function rowToConfig(row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  if (row && row.key != null && row.value != null) out[String(row.key)] = String(row.value)
  return out
}
