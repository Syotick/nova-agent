// 目标驱动自治循环（vibe coding）：一条目标 → 多轮自愈直到收敛
// 设计依据（行业调研）：
// - Codex /goal 长任务：状态持久 + resume（我们每轮消息落库，天然支持续跑）
// - "永动机"教训：模型 turn 结束 ≠ 任务结束，循环必须由编排层驱动
// - Circuit Breaker 模式：连续相同失败 = 卡死 → 熔断止损，不能只靠轮数上限
// - Turn-Control 实证：先规划后行动减少无效轮；task budget 分层
import { runTurn } from './agentLoop.js'
import type { Agent, Session, ChatEvent } from './types.js'

export interface VibeOptions {
  goal: string
  /** 轮数上限（默认 5；快速 3 / 标准 5 / 深度 10） */
  maxRounds?: number
  /** 总时长上限（分钟，默认 15） */
  maxMinutes?: number
}

export type VibeStop = 'converged' | 'max-rounds' | 'timeout' | 'circuit' | 'error'

export interface VibeResult {
  converged: boolean
  rounds: number
  stopped: VibeStop
  note: string
}

const DEFAULT_MAX_ROUNDS = 5
const DEFAULT_MAX_MINUTES = 15
const MAX_ROUNDS_HARD_CAP = 20
const CIRCUIT_BREAK_AFTER_SAME = 2 // 连续 N 轮输出指纹相同 → 熔断

/** 轮摘要签名：取输出尾部（失败信息通常在末尾）做哈希近似 */
function roundSignature(output: string): string {
  const tail = output.slice(-300).trim()
  let h = 0
  for (let i = 0; i < tail.length; i++) h = (h * 31 + tail.charCodeAt(i)) | 0
  return String(h)
}

export async function runVibe(
  session: Session,
  agent: Agent,
  opts: VibeOptions,
  push: (e: ChatEvent) => void,
): Promise<VibeResult> {
  const goal = (opts.goal ?? '').trim()
  if (!goal) return { converged: false, rounds: 0, stopped: 'error', note: '目标（goal）必填' }

  const maxRounds = Math.max(1, Math.min(opts.maxRounds ?? DEFAULT_MAX_ROUNDS, MAX_ROUNDS_HARD_CAP))
  const deadline = Date.now() + Math.max(1, opts.maxMinutes ?? DEFAULT_MAX_MINUTES) * 60_000

  push({ type: 'vibe_start', sessionId: session.id, goal, maxRounds })

  let lastOutput = ''
  let lastSignature = ''
  let rounds = 0

  for (let round = 1; round <= maxRounds; round++) {
    // 时长熔断（三保险之二）
    if (Date.now() > deadline) {
      return { converged: false, rounds, stopped: 'timeout', note: `超过时长上限，已执行 ${rounds} 轮` }
    }

    const roundPrompt =
      round === 1
        ? `${goal}\n\n# 执行要求\n- 先读代码/确定方案，再动手实现。\n- 用 filesystem 工具读写文件，用 run_command 工具执行验证命令（构建/测试/运行）。\n- 完成任务且验证通过后，回复以 [DONE] 开头总结结果；未完成就继续做，不要提前结束。`
        : `${goal}\n\n# 第 ${round} 轮（上一轮结果）\n${lastOutput.slice(0, 4000)}\n\n# 要求\n- 如果任务已完成且验证通过，回复以 [DONE] 开头总结结果。\n- 否则：分析失败原因，修复后重新验证；禁止重复上一轮的相同尝试。`

    push({ type: 'vibe_round', sessionId: session.id, round, note: `第 ${round}/${maxRounds} 轮` })
    let content: string
    try {
      const msg = await runTurn(session, agent, roundPrompt, push)
      content = msg.content
    } catch (err) {
      const message = (err as Error).message ?? String(err)
      push({ type: 'error', sessionId: session.id, message })
      return { converged: false, rounds, stopped: 'error', note: message }
    }
    rounds = round
    lastOutput = content

    // 收敛信号：模型显式 [DONE] 声明
    if (content.trimStart().startsWith('[DONE]')) {
      push({ type: 'vibe_done', sessionId: session.id, converged: true, rounds, note: content })
      return { converged: true, rounds, stopped: 'converged', note: content }
    }

    // 熔断：连续相同输出（疑似卡死），止损
    const sig = roundSignature(content)
    if (round > 1 && sig === lastSignature) {
      const note = `连续 ${CIRCUIT_BREAK_AFTER_SAME} 轮输出相同（疑似卡死），已熔断止损`
      push({ type: 'vibe_done', sessionId: session.id, converged: false, rounds, note })
      return { converged: false, rounds, stopped: 'circuit', note }
    }
    lastSignature = sig
  }

  const note = `已达 ${maxRounds} 轮上限，未收敛；最后输出：${lastOutput.slice(0, 200)}`
  push({ type: 'vibe_done', sessionId: session.id, converged: false, rounds, note })
  return { converged: false, rounds, stopped: 'max-rounds', note }
}