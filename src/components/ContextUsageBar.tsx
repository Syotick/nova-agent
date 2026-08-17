import { useMainStore } from '../store'
import { cn } from '../lib/utils'

// 文本 token 估算：中文约 0.7 token/字，其他约 0.25 token/字符
export function estimateTokens(text: string): number {
  let cn = 0
  let other = 0
  for (const ch of text) {
    if (/[\u4e00-\u9fff]/.test(ch)) cn++
    else other++
  }
  return Math.ceil(cn * 0.7 + other / 4)
}

// 会话当前上下文占用（成熟项目做法：真实 API 计数优先）：
// 最后一条带 tokens 的 assistant 消息的 input = 那次请求的完整输入（含全部历史），
// 以其为基准 + 其后新增消息的估算
export function sessionContextUsage(messages: Array<{ role: string; content: string; tokens?: { input?: number; output?: number } }>): number {
  let base = 0
  let baseIdx = -1
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m.tokens && (m.tokens.input ?? 0) > 0) {
      base = m.tokens.input ?? 0
      baseIdx = i
    }
  }
  let used = base
  for (let i = baseIdx + 1; i < messages.length; i++) {
    const m = messages[i]
    if (m.tokens) used += m.tokens.output ?? 0
    else used += estimateTokens(m.content)
  }
  return used
}

// 上下文窗口兜底：非法值（0/负数/非数字）回退缺省 1M（与后端 sanitizeContextWindow 一致）
export function sanitizeContextWindow(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1_000_000
}

// 当前会话上下文用量 + 模型上下文窗口
export function useSessionContext() {
  const sessions = useMainStore((s) => s.sessions)
  const currentSessionId = useMainStore((s) => s.currentSessionId)
  const agents = useMainStore((s) => s.agents)
  const currentAgentId = useMainStore((s) => s.currentAgentId)
  const models = useMainStore((s) => s.models)

  const session = sessions.find((s) => s.id === currentSessionId)
  const agent = agents.find((a) => a.id === currentAgentId)

  const used = session ? sessionContextUsage(session.messages) : 0

  // 当前模型上下文窗口（模型级优先，供应商级次之；非法值回退 1M）
  const agentModel = agent?.model ?? ''
  const slash = agentModel.indexOf('/')
  const pid = slash > 0 ? agentModel.slice(0, slash) : ''
  const mid = slash > 0 ? agentModel.slice(slash + 1) : agentModel
  const provider = models.find((p) => p.id === pid)
  const modelEntry = provider?.models.find((m) => m.id === mid)
  const contextWindow = sanitizeContextWindow(modelEntry?.contextWindow ?? provider?.contextWindow)

  const pct = Math.min(100, Math.round((used / contextWindow) * 100))
  return { used, contextWindow, pct }
}

// 上下文用量进度条（输入框工具栏展示；压缩阈值线在 COMPACT_PCT 处）
export default function ContextUsageBar() {
  const { used, contextWindow, pct } = useSessionContext()
  if (!used) return null

  // 自动压缩阈值（与后端 NOVA_AGENT_COMPACT_PCT 对齐；后端默认 90）
  const compactPct = 90

  // 颜色：<阈值前段正常 / 接近阈值 黄 / 超阈值 红
  const tone = pct >= compactPct ? 'bg-destructive' : pct >= compactPct - 20 ? 'bg-warning' : 'bg-primary'
  const textTone = pct >= compactPct ? 'text-destructive' : pct >= compactPct - 20 ? 'text-warning' : 'text-muted-foreground'
  const nearLimit = pct >= compactPct - 10

  return (
    <div
      className={cn('relative flex items-center gap-1.5 rounded-lg border border-border bg-input px-2 py-1', textTone)}
      title={`上下文用量 ${used.toLocaleString()} / ${contextWindow.toLocaleString()} tokens（${pct}%），超过 ${compactPct}% 自动压缩最早消息`}
    >
      <div className="relative h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        {/* 压缩阈值线 */}
        <div className="absolute top-0 h-full w-px bg-destructive/70" style={{ left: `${compactPct}%` }} />
        <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[10px]">{pct}%</span>
      {nearLimit && <span className="text-[9px] text-warning">将压缩</span>}
    </div>
  )
}
