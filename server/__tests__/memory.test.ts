// 跨会话记忆单元测试
import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { db } from '../db.js'
import {
  addMemory, deleteMemory, listMemories, searchMemories, updateMemory, consolidateMemories,
  similarity, loadProjectMemory, MEMORY_LIMIT, MEMORY_MAX_LENGTH, recencyFactor, recentMemories,
  buildMemoryBlock,
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

describe('memory 热度（recencyFactor）', () => {
  const DAY = 86_400_000
  const now = Date.now()
  it('越近越高：刚用=1，30 天≈0.67，超 90 天=0', () => {
    expect(recencyFactor(now, now)).toBe(1)
    expect(recencyFactor(now - 30 * DAY, now)).toBeCloseTo(1 - 30 / 90, 5)
    expect(recencyFactor(now - 90 * DAY, now)).toBe(0)
    expect(recencyFactor(now - 180 * DAY, now)).toBe(0)
  })
  it('lastUsedAt<=0（旧数据未记录）按 0 处理', () => {
    expect(recencyFactor(0, now)).toBe(0)
    expect(recencyFactor(-1, now)).toBe(0)
  })
})

describe('memory 综合分排序（覆盖率 + 热度）', () => {
  it('覆盖率：同样命中，短记忆（覆盖比例高）排前', () => {
    addMemory(TEST_AGENT, '简洁回答', 'manual') // 命中"简洁"覆盖 2/4
    addMemory(TEST_AGENT, '简洁这个词出现在一条很长的记忆里其余部分与当前问题毫无关系', 'auto') // 覆盖比例低
    const hits = searchMemories(TEST_AGENT, '简洁', 5)
    expect(hits[0].content).toBe('简洁回答')
  })

  it('热度：词面命中相当，最近使用的排前（直接插库绕过合并）', () => {
    const now = Date.now()
    const ins = db.prepare(
      'INSERT INTO memories (id, agent_id, content, source, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    ins.run('mem_hot_new', TEST_AGENT, '项目用甲框架', 'auto', now, now)              // 刚用过
    ins.run('mem_hot_old', TEST_AGENT, '项目用乙框架', 'auto', now, now - 200 * 86_400_000) // 很久没用
    const hits = searchMemories(TEST_AGENT, '项目', 5)
    expect(hits[0].content).toContain('甲框架')
  })

  it('完全不相关的记忆不会因热度被带进来（先词面过滤再打分）', () => {
    addMemory(TEST_AGENT, '用户喜欢咖啡', 'manual')
    addMemory(TEST_AGENT, '项目使用数据库', 'auto')
    // 查询只命中"咖啡"那条；"数据库"那条即使最近用过也不出现
    const hits = searchMemories(TEST_AGENT, '咖啡', 5)
    expect(hits.every((m) => m.content.includes('咖啡'))).toBe(true)
    expect(hits.length).toBeLessThan(2)
  })
})

describe('memory 最近使用列表（recentMemories）', () => {
  it('按 last_used_at 降序返回（注入的热度补齐来源）', () => {
    const now = Date.now()
    const ins = db.prepare(
      'INSERT INTO memories (id, agent_id, content, source, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    ins.run('mem_rec_a', TEST_AGENT, '甲记忆', 'manual', now, now)
    ins.run('mem_rec_b', TEST_AGENT, '乙记忆', 'manual', now, now - 10 * 86_400_000)
    ins.run('mem_rec_c', TEST_AGENT, '丙记忆', 'manual', now, now - 50 * 86_400_000)
    const recents = recentMemories(TEST_AGENT, 3)
    expect(recents.map((m) => m.content)).toEqual(['甲记忆', '乙记忆', '丙记忆'])
  })
})

describe('memory 注入块构建（buildMemoryBlock，可插拔解耦）', () => {
  it('有词面命中 → 返回含内容与标题的注入块', () => {
    addMemory(TEST_AGENT, '用户喜欢简洁的回答', 'auto')
    const block = buildMemoryBlock(TEST_AGENT, '请简洁回答我', 5)
    expect(block).toContain('长期记忆')
    expect(block).toContain('用户喜欢简洁的回答')
  })

  it('无词面命中但有最近使用 → 热度补齐进注入块', () => {
    addMemory(TEST_AGENT, '用户喜欢表格化输出', 'auto')
    // 无共同词的问题：词面检索空 → 靠热度补齐兜底
    const block = buildMemoryBlock(TEST_AGENT, '今天天气怎么样', 5)
    expect(block).toContain('用户喜欢表格化输出')
  })

  it('完全无记忆 → 返回空串（不注入占位）', () => {
    expect(buildMemoryBlock(TEST_AGENT, '任意问题', 5)).toBe('')
  })

  it('注入后 touch 保活：命中条 last_used_at 被刷新', () => {
    const { memory } = addMemory(TEST_AGENT, '用户喜欢极简风格', 'auto')
    const oldUsed = memory.lastUsedAt
    buildMemoryBlock(TEST_AGENT, '极简风格', 5)
    const updated = listMemories(TEST_AGENT).find((m) => m.id === memory.id)
    expect(updated?.lastUsedAt).toBeGreaterThanOrEqual(oldUsed)
  })
})

describe('memory 存量归并（consolidateMemories）', () => {
  it('高相似历史条目：归并保留较新一条', () => {
    // 直接插入两条近似内容（绕过写入时合并，模拟历史积压）
    const now = Date.now()
    const ins = db.prepare(
      'INSERT INTO memories (id, agent_id, content, source, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    ins.run('mem_c1', TEST_AGENT, '项目使用 Express 框架和 SQLite 数据库', 'auto', now, now)
    ins.run('mem_c2', TEST_AGENT, '项目使用 Express 框架和 SQLite 数据库，路由模块化', 'auto', now + 100, now + 100)

    const removed = consolidateMemories(TEST_AGENT)
    expect(removed).toBe(1)
    const list = listMemories(TEST_AGENT)
    expect(list).toHaveLength(1)
    expect(list[0].content).toContain('路由模块化') // 保留较新（细节更全）
  })

  it('无近似条目：不做删除', () => {
    addMemory(TEST_AGENT, '用户喜欢简洁的回答', 'manual')
    addMemory(TEST_AGENT, '项目使用 Express + SQLite', 'auto')
    addMemory(TEST_AGENT, '部署目标是单机', 'auto')
    expect(consolidateMemories(TEST_AGENT)).toBe(0)
    expect(listMemories(TEST_AGENT)).toHaveLength(3)
  })
})

describe('memory 项目记忆文件（AGENTS.md）', () => {
  it('无文件返回空；存在则读取；AGENTS.local.md 追加', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nova-agents-test-'))
    try {
      // 空目录 → ''
      expect(loadProjectMemory(dir)).toBe('')

      // AGENTS.md → 内容
      writeFileSync(join(dir, 'AGENTS.md'), '项目用 Express + SQLite\n前端 React', 'utf8')
      const one = loadProjectMemory(dir)
      expect(one).toContain('项目用 Express + SQLite')

      // AGENTS.local.md → 追加在后
      writeFileSync(join(dir, 'AGENTS.local.md'), '本机：用 127.0.0.1 调试', 'utf8')
      const two = loadProjectMemory(dir)
      expect(two).toContain('本机：用 127.0.0.1 调试')
      expect(two.indexOf('本机')).toBeGreaterThan(two.indexOf('前端 React'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('文件损坏按不存在处理（不抛错）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nova-agents-test-'))
    try {
      mkdirSync(join(dir, 'AGENTS.md')) // 目录冒充文件 → 读抛错 → 返回 ''
      expect(loadProjectMemory(dir)).toBe('')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
