import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Agent, Session, ChatEvent } from '../types.js'

// mock runTurn：vibe 循环的编排逻辑测试不真跑模型
const runTurnMock = vi.fn()
vi.mock('../agentLoop.js', () => ({
  runTurn: (...args: unknown[]) => runTurnMock(...args),
}))

import { runVibe } from '../vibe.js'

function mkSession(): Session {
  return { id: 's', agentId: 'a', title: 't', messages: [], createdAt: 0, updatedAt: 0 }
}

function mkAgent(): Agent {
  return { id: 'a', name: 'a', persona: 'p', model: 'm', mcpServerIds: [], skillIds: [], color: '#fff' } as Agent
}

function collect() {
  const events: ChatEvent[] = []
  return events
}

beforeEach(() => {
  runTurnMock.mockReset()
})

describe('vibe 自治循环', () => {
  it('收敛：模型回复以 [DONE] 开头 → converged', async () => {
    runTurnMock.mockResolvedValueOnce({ id: 'm1', role: 'assistant', content: '[DONE] 任务完成，测试通过', createdAt: 0 })
    const events = collect()
    const r = await runVibe(mkSession(), mkAgent(), { goal: '写个计算器' }, (e) => events.push(e))
    expect(r.converged).toBe(true)
    expect(r.stopped).toBe('converged')
    expect(r.rounds).toBe(1)
    expect(runTurnMock).toHaveBeenCalledTimes(1)
    expect(events.some((e) => e.type === 'vibe_start')).toBe(true)
    expect(events.some((e) => e.type === 'vibe_done' && e.converged)).toBe(true)
    // 第一轮 prompt 含规划引导
    const prompt = runTurnMock.mock.calls[0][2] as string
    expect(prompt).toContain('[DONE]')
    expect(prompt).toContain('run_command')
  })

  it('自愈：多轮后收敛（失败 → 修正 → [DONE]）', async () => {
    runTurnMock
      .mockResolvedValueOnce({ id: 'm1', role: 'assistant', content: '测试失败了：x is undefined', createdAt: 0 })
      .mockResolvedValueOnce({ id: 'm2', role: 'assistant', content: '[DONE] 已修复，全部通过', createdAt: 0 })
    const r = await runVibe(mkSession(), mkAgent(), { goal: '修好测试' }, () => {})
    expect(r.converged).toBe(true)
    expect(r.rounds).toBe(2)
    // 第二轮 prompt 包含上一轮输出（自愈反馈）
    const prompt2 = runTurnMock.mock.calls[1][2] as string
    expect(prompt2).toContain('测试失败了：x is undefined')
    expect(prompt2).toContain('禁止重复上一轮的相同尝试')
  })

  it('轮数上限：始终不收敛 → max-rounds', async () => {
    // 每轮输出不同（避免触发熔断），但始终不含 [DONE]
    let n = 0
    runTurnMock.mockImplementation(() =>
      Promise.resolve({ id: 'm', role: 'assistant', content: `还在做，进展 ${++n}`, createdAt: 0 }))
    const r = await runVibe(mkSession(), mkAgent(), { goal: 'g', maxRounds: 3 }, () => {})
    expect(r.converged).toBe(false)
    expect(r.stopped).toBe('max-rounds')
    expect(r.rounds).toBe(3)
    expect(runTurnMock).toHaveBeenCalledTimes(3)
  })

  it('熔断：连续 2 轮相同输出 → circuit（提前止损，不烧满轮数）', async () => {
    runTurnMock.mockResolvedValue({ id: 'm', role: 'assistant', content: '同样的错误：EIO', createdAt: 0 })
    const r = await runVibe(mkSession(), mkAgent(), { goal: 'g', maxRounds: 5 }, () => {})
    expect(r.converged).toBe(false)
    expect(r.stopped).toBe('circuit')
    expect(r.note).toContain('熔断')
    expect(runTurnMock).toHaveBeenCalledTimes(2) // 第 2 轮就熔断，不烧满 5 轮
  })

  it('runTurn 抛错 → error 停止并透传事件', async () => {
    runTurnMock.mockRejectedValueOnce(new Error('模型 401'))
    const events = collect()
    const r = await runVibe(mkSession(), mkAgent(), { goal: 'g' }, (e) => events.push(e))
    expect(r.converged).toBe(false)
    expect(r.stopped).toBe('error')
    expect(r.note).toContain('401')
    expect(events.some((e) => e.type === 'error')).toBe(true)
  })

  it('空目标直接报错，不调用 runTurn', async () => {
    const r = await runVibe(mkSession(), mkAgent(), { goal: '   ' }, () => {})
    expect(r.stopped).toBe('error')
    expect(runTurnMock).not.toHaveBeenCalled()
  })
})