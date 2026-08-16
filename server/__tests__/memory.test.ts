// 跨会话记忆单元测试
import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import { db } from '../db.js'
import {
  addMemory, deleteMemory, listMemories, searchMemories, updateMemory,
  similarity, MEMORY_LIMIT, MEMORY_MAX_LENGTH,
} from '../memory.js'

// 用独立 agentId 隔离测试数据（memories 外键引用 agents，需先建测试 agent）
const TEST_AGENT = '__test_memory_agent__'

beforeAll(() => {
  db.prepare(
    'INSERT OR IGNORE INTO agents (id, name, persona, model, mcp_server_ids, skill_ids, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(TEST_AGENT, 'test', '', 'deepseek/deepseek-v4-flash', '[]', '[]', '#4d6bfe', Date.now())
})

beforeEach(() => {
  db.prepare('DELETE FROM memories WHERE agent_id = ?').run(TEST_AGENT)
})

describe('memory 存储', () => {
  it('添加/列表/删除', () => {
    const { memory: m1 } = addMemory(TEST_AGENT, '用户喜欢简洁的回答', 'manual')
    const { memory: m2 } = addMemory(TEST_AGENT, '项目使用 Express + SQLite', 'auto')
    const list = listMemories(TEST_AGENT)
    expect(list).toHaveLength(2)
    expect(list.some((m) => m.id === m1.id && m.content.includes('简洁'))).toBe(true)
    expect(deleteMemory(m1.id)).toBe(true)
    expect(listMemories(TEST_AGENT)).toHaveLength(1)
    expect(m2.content).toContain('SQLite')
  })

  it('长度校验：超 200 字拒绝', () => {
    expect(() => addMemory(TEST_AGENT, '长'.repeat(MEMORY_MAX_LENGTH + 1), 'manual')).toThrow()
  })
})

describe('memory 去重合并（防膨胀核心）', () => {
  it('相似内容 → 合并更新而非新增', () => {
    const a = addMemory(TEST_AGENT, '用户喜欢简洁的回答', 'auto')
    expect(a.merged).toBe(false)
    // 同义改写（高相似度）→ merged=true，条数不变
    const b = addMemory(TEST_AGENT, '用户喜欢简洁的回答，不要长篇大论', 'auto')
    expect(b.merged).toBe(true)
    expect(listMemories(TEST_AGENT)).toHaveLength(1)
    expect(listMemories(TEST_AGENT)[0].content).toContain('不要长篇大论')
    // 无关内容 → 新增
    const c = addMemory(TEST_AGENT, '项目使用 Express + SQLite', 'auto')
    expect(c.merged).toBe(false)
    expect(listMemories(TEST_AGENT)).toHaveLength(2)
  })

  it('相似度函数：相关文本高、无关文本低', () => {
    // 追加修饰 → 旧内容被完全覆盖 → 高相似
    expect(similarity('用户喜欢简洁的回答', '用户喜欢简洁的回答，不要长篇大论')).toBeGreaterThan(0.6)
    // 语义相反（详细 vs 简洁）→ 公共词少 → 低相似
    expect(similarity('用户喜欢简洁的回答', '用户喜欢详细的分析')).toBeLessThan(0.5)
    // 完全无关 → 极低
    expect(similarity('用户喜欢简洁的回答', '项目使用 Express + SQLite')).toBeLessThan(0.3)
  })
})

describe('memory 上限淘汰（LRU）', () => {
  it('超限淘汰最久未使用', () => {
    // 绕过合并逻辑，直接插入不同内容的记录填满上限
    const insert = db.prepare(
      'INSERT INTO memories (id, agent_id, content, source, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    const now = Date.now()
    for (let i = 0; i < MEMORY_LIMIT; i++) {
      insert.run(`mem_test_lru_${i}`, TEST_AGENT, `第${i}号独立记忆：主题甲${i}乙${i}丙${i}丁${i}戊${i}`, 'manual', now + i, now + i)
    }
    expect(listMemories(TEST_AGENT)).toHaveLength(MEMORY_LIMIT)
    // 新加一条（内容与现有不同，不触发合并）→ 淘汰 last_used_at 最旧的（编号0）
    addMemory(TEST_AGENT, '全新独立记忆：主题子丑寅卯辰巳午未申酉', 'manual')
    const list = listMemories(TEST_AGENT)
    expect(list).toHaveLength(MEMORY_LIMIT)
    expect(list.some((m) => m.content.includes('甲0'))).toBe(false)
    expect(list.some((m) => m.content.includes('全新独立记忆'))).toBe(true)
  })
})

describe('memory 编辑', () => {
  it('updateMemory 更新内容', () => {
    const { memory } = addMemory(TEST_AGENT, '用户喜欢简洁的回答', 'manual')
    const updated = updateMemory(memory.id, '用户喜欢详细的分析')
    expect(updated?.content).toContain('详细的分析')
    expect(listMemories(TEST_AGENT)[0].content).toContain('详细的分析')
  })
})

describe('memory 检索', () => {
  it('按查询片段命中并排序（命中多的在前）', () => {
    addMemory(TEST_AGENT, '用户喜欢简洁的回答', 'manual')
    addMemory(TEST_AGENT, '用户喜欢中文回答', 'manual')
    addMemory(TEST_AGENT, '项目使用 Express + SQLite', 'auto')

    const hits = searchMemories(TEST_AGENT, '请用简洁的方式回答我', 5)
    expect(hits.length).toBeGreaterThanOrEqual(1)
    expect(hits[0].content).toContain('简洁')

    // 无关查询 → 空
    expect(searchMemories(TEST_AGENT, '今天天气怎么样', 5)).toHaveLength(0)

    // limit 生效
    const limited = searchMemories(TEST_AGENT, '用户 喜欢 回答 中文', 1)
    expect(limited).toHaveLength(1)
    expect(limited[0].content).toContain('中文')
  })

  it('空查询/短片段返回空', () => {
    addMemory(TEST_AGENT, '测试内容', 'manual')
    expect(searchMemories(TEST_AGENT, '')).toHaveLength(0)
    expect(searchMemories(TEST_AGENT, 'a b c')).toHaveLength(0)
  })
})
