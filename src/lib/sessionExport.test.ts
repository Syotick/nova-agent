import { describe, it, expect } from 'vitest'
import { sessionToMarkdown, sessionToJson, safeFilename, formatDateTime } from './sessionExport'
import type { Session } from '../types'

function mkSession(over: Partial<Session> = {}): Session {
  return {
    id: 's1', agentId: 'a1', title: '测试会话/导出:测试?', createdAt: 0, updatedAt: 0,
    messages: [
      { id: 'm1', role: 'user', content: '你好', createdAt: 0 },
      { id: 'm2', role: 'assistant', content: '你好！有什么可以帮你？', createdAt: 1000 },
    ],
    ...over,
  }
}

describe('会话导出', () => {
  it('safeFilename：过滤路径/非法字符，空值回退缺省', () => {
    expect(safeFilename('测试会话/导出:测试?')).toBe('测试会话_导出_测试_')
    expect(safeFilename('  ')).toBe('会话')
    expect(safeFilename('a'.repeat(100)).length).toBe(80)
  })

  it('formatDateTime：本地时间格式', () => {
    expect(formatDateTime(0)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  it('sessionToMarkdown：标题 + 元信息 + 角色消息 + 时间戳', () => {
    const md = sessionToMarkdown(mkSession(), '助手')
    expect(md).toContain('# 测试会话/导出:测试?')
    expect(md).toContain('**Agent**：助手')
    expect(md).toContain('## 你 ·')
    expect(md).toContain('## 助手 ·')
    expect(md).toContain('你好！有什么可以帮你？')
  })

  it('sessionToMarkdown：工具调用折叠块（旧数据 toolCalls 回退）', () => {
    const s = mkSession({
      messages: [
        { id: 'm1', role: 'assistant', content: '', createdAt: 0, toolCalls: [{ id: 't1', name: 'web_search', input: { q: 'x' }, output: '结果', status: 'success', startedAt: 0, durationMs: 1200 }] },
      ],
    })
    const md = sessionToMarkdown(s)
    expect(md).toContain('<details>')
    expect(md).toContain('web_search')
    expect(md).toContain('成功'.length ? '✅ 工具：web_search（success · 1.2s）' : '')
    expect(md).toContain('"q": "x"')
  })

  it('sessionToMarkdown：segments 时间线优先（文本/工具交错）', () => {
    const s = mkSession({
      messages: [
        {
          id: 'm1', role: 'assistant', content: 'old', createdAt: 0, toolCalls: [],
          segments: [
            { kind: 'text', text: '先查一下' },
            { kind: 'tool', call: { id: 't1', name: 'remember', input: {}, output: 'ok', status: 'success', startedAt: 0, durationMs: 100 } },
          ],
        },
      ],
    })
    const md = sessionToMarkdown(s)
    expect(md.indexOf('先查一下')).toBeGreaterThan(-1)
    expect(md.indexOf('remember')).toBeGreaterThan(md.indexOf('先查一下'))
    expect(md).not.toContain('old')
  })

  it('sessionToMarkdown：超长工具输出截断 + summary 展示', () => {
    const s = mkSession({
      summary: '用户问了上下文窗口的事',
      messages: [
        { id: 'm1', role: 'assistant', content: 'hi', createdAt: 0, toolCalls: [{ id: 't1', name: 'x', input: {}, output: 'a'.repeat(5000), status: 'success', startedAt: 0, durationMs: 0 }] },
      ],
    })
    const md = sessionToMarkdown(s)
    expect(md).toContain('> **摘要**（自动压缩生成）：用户问了上下文窗口的事')
    expect(md).toContain('…（输出过长已截断')
    expect(md.length).toBeLessThan(5000)
  })

  it('sessionToJson：完整无损（消息/工具调用/token 全保留，不截断）', () => {
    const s = mkSession({
      messages: [
        { id: 'm1', role: 'user', content: 'x'.repeat(6000), createdAt: 0, tokens: { input: 10, output: 5 }, toolCalls: [{ id: 't1', name: 'x', input: { a: 1 }, output: 'y'.repeat(5000), status: 'success', startedAt: 0, durationMs: 10 }] },
      ],
    })
    const parsed = JSON.parse(sessionToJson(s, '助手')) as { app: string; title: string; agentName: string; messages: Array<{ content: string; tokens?: { input: number }; toolCalls?: unknown[] }> }
    expect(parsed.app).toBe('nova-agent')
    expect(parsed.agentName).toBe('助手')
    expect(parsed.messages[0].content.length).toBe(6000)
    expect(parsed.messages[0].tokens?.input).toBe(10)
    expect(parsed.messages[0].toolCalls).toHaveLength(1)
  })

  it('sessionToMarkdown：空会话可导出（无内容占位）', () => {
    const md = sessionToMarkdown(mkSession({ messages: [] }))
    expect(md).toContain('**消息**：0 条')
  })
})
