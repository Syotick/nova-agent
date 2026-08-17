import { describe, it, expect } from 'vitest'
import { estimateTokens, shouldCompact, contextWindowFor, contextUsage, sanitizeContextWindow, COMPACT_PCT } from '../compact.js'
import type { Session } from '../types.js'

function mkSession(messages: Array<{ role: string; content: string; tokens?: { input: number; output: number } }>): Session {
  return {
    id: 's', agentId: 'a', title: 't', createdAt: 0, updatedAt: 0,
    messages: messages.map((m, i) => ({ id: `m${i}`, role: m.role as 'user' | 'assistant', content: m.content, tokens: m.tokens, createdAt: 0 })),
  }
}

describe('compact 估算', () => {
  it('estimateTokens：中文按 0.7/字、其他按 0.25/字符', () => {
    expect(estimateTokens('你好世界')).toBe(3) // 4 字 × 0.7 = 2.8 → 3
    expect(estimateTokens('hello world')).toBe(3) // 11 字符 × 0.25 = 2.75 → 3
  })

  it('shouldCompact：消息数超限触发（40 条兜底）', () => {
    const s = mkSession(Array.from({ length: 41 }, (_, i) => ({ role: 'user', content: '短' })))
    expect(shouldCompact(s, 'deepseek/deepseek-v4-flash')).toBe(true)
  })

  it(`shouldCompact：上下文占用超窗口 ${COMPACT_PCT}% 触发（真实计数优先）`, () => {
    // 最后一条 assistant 的 input = 完整上下文（真实计数）；模拟 90 万 tokens 输入 → 触发
    const s = mkSession([
      { role: 'user', content: '你好' },
      { role: 'assistant', content: 'hi', tokens: { input: 950_000, output: 100 } },
    ])
    expect(shouldCompact(s, 'deepseek/deepseek-v4-flash')).toBe(true)
  })

  it('shouldCompact：占用低于阈值不触发', () => {
    const s = mkSession([
      { role: 'user', content: '你好' },
      { role: 'assistant', content: 'hi', tokens: { input: 100_000, output: 100 } },
    ])
    expect(shouldCompact(s, 'deepseek/deepseek-v4-flash')).toBe(false)
  })

  it('contextUsage：以最新 input 为基准 + 其后消息估算', () => {
    const s = mkSession([
      { role: 'user', content: 'a'.repeat(400) },      // 估算 100
      { role: 'assistant', content: 'hi', tokens: { input: 50_000, output: 200 } },
      { role: 'user', content: '你好世界' },            // 估算 3
    ])
    // base = 50000（input 已含历史，不再累加前面的 user）+ 3(新增 user 估算) = 50003；
    // baseIdx 自身的 output 已含在下一次请求的 input 里，不重复计
    expect(contextUsage(s.messages)).toBe(50_003)
  })

  it('shouldCompact：少量消息不触发', () => {
    const s = mkSession([{ role: 'user', content: '你好' }])
    expect(shouldCompact(s, 'deepseek/deepseek-v4-flash')).toBe(false)
  })

  it('contextWindowFor：models.json 注册表内置（V4 = 1M），缺省 1M', () => {
    expect(contextWindowFor('deepseek/deepseek-v4-flash')).toBe(1_000_000)
    expect(contextWindowFor('unknown/model')).toBe(1_000_000)
  })

  it('sanitizeContextWindow：非法值（0/负数/非数字）兜底为 1M', () => {
    expect(sanitizeContextWindow(0)).toBe(1_000_000)
    expect(sanitizeContextWindow(-5)).toBe(1_000_000)
    expect(sanitizeContextWindow(Number.NaN)).toBe(1_000_000)
    expect(sanitizeContextWindow('abc')).toBe(1_000_000)
    expect(sanitizeContextWindow('200000')).toBe(200_000)
    expect(sanitizeContextWindow(200_000)).toBe(200_000)
  })
})
