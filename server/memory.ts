// 跨会话记忆：按 Agent 隔离，LIKE 子串检索（记忆量小，全表扫描足够快；
// 避免 FTS5 中文分词问题，不引向量库——可解释、零依赖）
//
// 生命周期管理（高质量 + 防膨胀）：
//   写入：去重合并（bigram Jaccard ≥ 阈值 → 更新旧条而非新增）+ 长度上限（200 字）
//   容量：每 Agent 上限 MEMORY_LIMIT 条，超限淘汰最久未使用（LRU，last_used_at）
//   注入：命中 Top-K；注入后 touch last_used_at（保活高频记忆）
//   删除/编辑：UI 管理
import { db } from './db.js'
import { newId } from './store.js'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { getWorkspacePath } from './workspace.js'

export interface Memory {
  id: string
  agentId: string
  content: string
  source: 'auto' | 'manual'
  createdAt: number
  lastUsedAt: number
}

// 单条记忆长度上限（防超长垃圾）
export const MEMORY_MAX_LENGTH = 200
// 每 Agent 记忆条数上限（防无限膨胀）
export const MEMORY_LIMIT = 100
// 去重合并相似度阈值（短侧覆盖率：≥0.6 视为同一事实的更新）
export const MEMORY_MERGE_THRESHOLD = 0.6

function rowToMemory(row: Record<string, unknown>): Memory {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    content: String(row.content),
    source: String(row.source) === 'auto' ? 'auto' : 'manual',
    createdAt: Number(row.created_at),
    lastUsedAt: Number(row.last_used_at ?? 0),
  }
}

export function listMemories(agentId: string): Memory[] {
  const rows = db.prepare(
    'SELECT * FROM memories WHERE agent_id = ? ORDER BY created_at DESC',
  ).all(agentId) as Record<string, unknown>[]
  return rows.map(rowToMemory)
}

// ---------- 项目记忆文件（AGENTS.md，开放标准） ----------
// AGENTS.md 是 OpenAI/GitHub 推进的"给 agent 看的项目说明"文件约定（Claude Code / Codex 等多家读取），
// 无品牌归属、可跨工具互操作。语义：项目的领域约定、架构决策、常用命令——agent 每轮都读到。
// 两个层级：
//   AGENTS.md        项目共享约定（入库，git 管理）
//   AGENTS.local.md  个人私有说明（不入库，见 .gitignore）——仅本机生效
export function loadProjectMemory(customDir?: string): string {
  const ws = customDir ?? getWorkspacePath()
  const parts: string[] = []
  for (const file of ['AGENTS.md', 'AGENTS.local.md']) {
    try {
      const p = join(ws, file)
      if (existsSync(p)) {
        const t = readFileSync(p, 'utf8').trim()
        if (t) parts.push(t)
      }
    } catch { /* ignore（文件损坏按不存在处理） */ }
  }
  return parts.join('\n\n')
}

// ---------- 相似度（词面版本：bigram Jaccard，中文实词多为双字词） ----------

function bigrams(s: string): Set<string> {
  const out = new Set<string>()
  const t = s.trim()
  if (!t) return out
  if (t.length <= 2) { out.add(t); return out }
  for (let i = 0; i + 2 <= t.length; i++) out.add(t.slice(i, i + 2))
  return out
}

export function similarity(a: string, b: string): number {
  const ga = bigrams(a)
  const gb = bigrams(b)
  if (!ga.size || !gb.size) return 0
  let inter = 0
  for (const g of ga) if (gb.has(g)) inter++
  // 短侧覆盖率：交集 / 较小集合 —— 追加修饰/同义改写时旧内容被完全覆盖（→合并），
  // 语义相反时公共词少（→不合并）。比 Jaccard 对"补充说明"场景更鲁棒。
  return inter / Math.min(ga.size, gb.size)
}

// ---------- 写入（去重合并 + 上限淘汰 + 长度校验） ----------

export interface AddMemoryResult {
  memory: Memory
  /** true = 与旧记忆相似，更新了旧条；false = 新增 */
  merged: boolean
}

export function addMemory(
  agentId: string,
  content: string,
  source: 'auto' | 'manual' = 'manual',
): AddMemoryResult {
  const text = content.trim()
  if (!text) throw new Error('记忆内容不能为空')
  if (text.length > MEMORY_MAX_LENGTH) {
    throw new Error(`记忆内容过长（最多 ${MEMORY_MAX_LENGTH} 字）`)
  }
  const now = Date.now()

  // 去重合并：与现有记忆高度相似 → 视为同一事实的更新（覆盖旧条，不新增）
  const existing = db.prepare('SELECT * FROM memories WHERE agent_id = ?').all(agentId) as Record<string, unknown>[]
  for (const row of existing) {
    if (similarity(text, String(row.content)) >= MEMORY_MERGE_THRESHOLD) {
      db.prepare(
        'UPDATE memories SET content = ?, last_used_at = ?, created_at = ? WHERE id = ?',
      ).run(text, now, now, String(row.id))
      return { memory: rowToMemory(db.prepare('SELECT * FROM memories WHERE id = ?').get(String(row.id)) as Record<string, unknown>), merged: true }
    }
  }

  // 容量上限：新增前淘汰最久未使用的（LRU）
  const count = db.prepare('SELECT COUNT(*) AS c FROM memories WHERE agent_id = ?').get(agentId) as { c: number }
  if (count.c >= MEMORY_LIMIT) {
    const oldest = db.prepare(
      'SELECT id FROM memories WHERE agent_id = ? ORDER BY last_used_at ASC, created_at ASC LIMIT 1',
    ).get(agentId) as { id: string } | undefined
    if (oldest) db.prepare('DELETE FROM memories WHERE id = ?').run(oldest.id)
  }

  const memory: Memory = {
    id: newId('mem'),
    agentId,
    content: text,
    source,
    createdAt: now,
    lastUsedAt: now,
  }
  db.prepare(
    'INSERT INTO memories (id, agent_id, content, source, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(memory.id, memory.agentId, memory.content, memory.source, memory.createdAt, memory.lastUsedAt)

  // 节流触发存量归并（防每次写入都跑全表 O(n²)）
  if (Date.now() - lastConsolidateAt > CONSOLIDATE_INTERVAL_MS) {
    lastConsolidateAt = Date.now()
    consolidateMemories(agentId)
  }
  return { memory, merged: false }
}

// 存量归并：两两"高相似"的记忆 → 保留较新一条、删重复（纯本地、零 LLM 成本）。
// 写入时的去重合并只管"新写的 vs 旧的"；存量归并管"历史里积存下来的近似条目"，
// 是记忆系统的第二轮自我维护（防"同一个事实被不同表述存了 N 次"）。
let lastConsolidateAt = 0
const CONSOLIDATE_INTERVAL_MS = 5 * 60_000

export function consolidateMemories(agentId: string): number {
  const rows = db.prepare(
    'SELECT id, agent_id, content, source, created_at, last_used_at FROM memories WHERE agent_id = ? ORDER BY created_at DESC',
  ).all(agentId) as Record<string, unknown>[]
  if (rows.length < 2) return 0
  const list: Array<Memory | null> = rows.map(rowToMemory)
  let removed = 0
  for (let i = 0; i < list.length; i++) {
    if (!list[i]) continue
    for (let j = i + 1; j < list.length; j++) {
      if (!list[j]) continue
      if (similarity(list[i]!.content, list[j]!.content) >= MEMORY_MERGE_THRESHOLD) {
        // 保留较新（created_at 大），删较旧
        const keepIdx = (list[i]!.createdAt >= list[j]!.createdAt) ? i : j
        const dropIdx = keepIdx === i ? j : i
        db.prepare('DELETE FROM memories WHERE id = ?').run(list[dropIdx]!.id)
        list[dropIdx] = null
        removed++
      }
    }
  }
  return removed
}

// 编辑（UI）：更新内容，同样走长度校验；不做相似合并（用户显式编辑）
export function updateMemory(id: string, content: string): Memory | null {
  const text = content.trim()
  if (!text || text.length > MEMORY_MAX_LENGTH) return null
  const now = Date.now()
  const res = db.prepare(
    'UPDATE memories SET content = ?, last_used_at = ?, created_at = ? WHERE id = ?',
  ).run(text, now, now, id)
  if (res.changes === 0) return null
  return rowToMemory(db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as Record<string, unknown>)
}

export function deleteMemory(id: string): boolean {
  const res = db.prepare('DELETE FROM memories WHERE id = ?').run(id)
  return res.changes > 0
}

// 注入后 touch：保活高频记忆（LRU 淘汰时保护）
export function touchMemories(ids: string[]) {
  if (!ids.length) return
  const now = Date.now()
  const stmt = db.prepare('UPDATE memories SET last_used_at = ? WHERE id = ?')
  for (const id of ids) stmt.run(now, id)
}

// ---------- 检索 ----------

// 长片段生成 2-gram（中文实词多为双字词："请用简洁的方式回答我" → 简洁/方式/回答 等）
function bigramsOf(s: string): Set<string> {
  return bigrams(s)
}

// 检索：用户消息按标点/空白切出片段，统计每个记忆的命中数排序取 Top-K
export function searchMemories(agentId: string, query: string, limit = 5): Memory[] {
  const fragments = query
    .split(/[\s,，。.;；:：!！?？"'“”‘’()（）\[\]【】<>《》、|/\\-]+/)
    .map((f) => f.trim())
    .filter((f) => f.length >= 2)
  if (!fragments.length) return []

  const rows = db.prepare(
    'SELECT * FROM memories WHERE agent_id = ?',
  ).all(agentId) as Record<string, unknown>[]

  const scored: Array<{ memory: Memory; hits: number; exact: boolean }> = []
  for (const row of rows) {
    const content = String(row.content)
    let hits = 0
    let exact = false
    for (const f of fragments) {
      if (f.length > 8) {
        // 长片段（中文整句无空格）：2-gram 与记忆内容交叉命中计数
        for (const g of bigramsOf(f)) {
          if (content.includes(g)) { hits++; exact = true }
        }
      } else if (content.includes(f)) {
        hits++
        exact = true
      }
    }
    if (hits > 0) scored.push({ memory: rowToMemory(row), hits, exact })
  }
  scored.sort((a, b) => b.hits - a.hits || Number(b.exact) - Number(a.exact))
  return scored.slice(0, limit).map((s) => s.memory)
}
