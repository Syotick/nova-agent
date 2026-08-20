import { useRef, useState } from 'react'
import { ChevronDown, CheckCircle2, XCircle, Loader2, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react'
import { useMainStore } from '../store'
import { cn } from '../lib/utils'
import type { ToolCallRecord } from '../types'

function fmtInput(input: unknown) {
  try { return JSON.stringify(input, null, 2) } catch { return String(input) }
}

function ToolInspector({ call }: { call: ToolCallRecord }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'input' | 'output'>('input')
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <button
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-left text-xs',
          call.status === 'error' ? 'bg-destructive/5' : 'bg-muted/40',
        )}
        onClick={() => setOpen(!open)}
      >
        {call.status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin text-warning" />}
        {call.status === 'success' && <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
        {call.status === 'error' && <XCircle className="h-3.5 w-3.5 text-destructive" />}
        <span className="font-mono font-medium">{call.name}</span>
        <span className="flex-1 text-right text-[10px] text-muted-foreground">
          {call.status === 'running' ? '运行中' : `${(call.durationMs / 1000).toFixed(1)}s`}
        </span>
        <ChevronDown className={cn('h-3 w-3 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t border-border">
          <div className="flex gap-1 border-b border-border px-2 py-1">
            {(['input', 'output'] as const).map((t) => (
              <button
                key={t}
                className={cn('rounded-md px-2.5 py-0.5 text-[11px]', tab === t ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground')}
                onClick={() => setTab(t)}
              >
                {t === 'input' ? '输入' : '输出'}
              </button>
            ))}
          </div>
          <pre className="max-h-[220px] overflow-auto bg-background/60 p-2.5 font-mono text-[11px] leading-relaxed">
            {tab === 'input' ? fmtInput(call.input) : call.output || '(空)'}
          </pre>
        </div>
      )}
    </div>
  )
}

type Step = { type: 'msg'; msg: { role: 'user' | 'assistant'; content: string; tokens?: { input?: number; output?: number } } } | { type: 'tool'; call: ToolCallRecord }

export default function TrajectoryView() {
  const sessions = useMainStore((s) => s.sessions)
  const currentSessionId = useMainStore((s) => s.currentSessionId)
  const currentToolCalls = useMainStore((s) => s.currentToolCalls)
  const messages = sessions.find((s) => s.id === currentSessionId)?.messages ?? []

  const steps: Step[] = []
  for (const m of messages) {
    if (m.toolCalls?.length) {
      for (const tc of m.toolCalls) steps.push({ type: 'tool', call: tc })
    }
    steps.push({ type: 'msg', msg: m })
  }
  for (const tc of currentToolCalls) steps.push({ type: 'tool', call: tc })

  // 过滤：全部 / 仅工具（教学：只看 agent 干了什么）/ 仅消息
  const [filter, setFilter] = useState<'all' | 'tool' | 'msg'>('all')
  // 回放：聚焦第 i 步（其他淡化），上一步/下一步导航
  const [focusIdx, setFocusIdx] = useState<number | null>(null)
  const itemRefs = useRef<Array<HTMLDivElement | null>>([])

  const filtered = steps.filter((s) => filter === 'all' || (filter === 'tool' ? s.type === 'tool' : s.type === 'msg'))
  const totalInput = messages.reduce((a, m) => a + (m.tokens?.input ?? 0), 0)
  const totalOutput = messages.reduce((a, m) => a + (m.tokens?.output ?? 0), 0)

  const focusStep = (i: number | null) => {
    setFocusIdx(i)
    if (i != null) itemRefs.current[i]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-7">
      <div className="mx-auto max-w-[760px]">
        <div className="mb-4">
          <h3 className="text-lg font-bold">轨迹视图</h3>
          <p className="mt-1 text-[13px] text-muted-foreground">
            本次对话共 {steps.length} 步 · Token：输入 {totalInput.toLocaleString()} / 输出 {totalOutput.toLocaleString()}
          </p>
        </div>

        {/* 筛选 + 回放控制条 */}
        <div className="mb-4 flex items-center gap-2">
          <div className="flex rounded-lg border border-border bg-card/60 p-0.5">
            {(['all', 'tool', 'msg'] as const).map((f) => (
              <button
                key={f}
                className={cn('rounded-md px-2.5 py-1 text-[11px] transition-colors', filter === f ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground')}
                onClick={() => { setFilter(f); setFocusIdx(null) }}
              >
                {f === 'all' ? '全部' : f === 'tool' ? '仅工具' : '仅消息'}
              </button>
            ))}
          </div>
          {filtered.length > 1 && (
            <div className="ml-auto flex items-center gap-1.5">
              <button
                className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:pointer-events-none disabled:opacity-30"
                title="上一步"
                disabled={focusIdx == null || focusIdx <= 0}
                onClick={() => focusStep(focusIdx != null ? Math.max(0, focusIdx - 1) : 0)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[64px] text-center text-[11px] tabular-nums text-muted-foreground">
                {focusIdx == null ? '回放' : `第 ${focusIdx + 1}/${filtered.length} 步`}
              </span>
              <button
                className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:pointer-events-none disabled:opacity-30"
                title="下一步"
                disabled={focusIdx == null || focusIdx >= filtered.length - 1}
                onClick={() => focusStep(focusIdx != null ? Math.min(filtered.length - 1, focusIdx + 1) : 0)}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <button
                className="rounded-lg border border-border px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                onClick={() => { if (focusIdx == null) focusStep(0); else setFocusIdx(null) }}
              >
                {focusIdx == null ? '开始回放' : '退出'}
              </button>
            </div>
          )}
        </div>

        <div className="relative flex flex-col gap-2.5 pl-5 before:absolute before:left-[5px] before:top-1 before:bottom-1 before:w-px before:bg-border">
          {filtered.length === 0 && <div className="text-sm text-muted-foreground">还没有轨迹，先进行一段对话</div>}
          {filtered.map((s, i) => (
            <div
              key={i}
              ref={(el) => { itemRefs.current[i] = el }}
              className={cn(
                'relative rounded-xl transition-opacity',
                focusIdx != null && focusIdx !== i && 'opacity-35',
              )}
            >
              <span
                className={cn(
                  'absolute -left-5 top-2 h-[11px] w-[11px] rounded-full border-2 border-background',
                  s.type === 'tool' ? (s.call.status === 'error' ? 'bg-destructive' : s.call.status === 'running' ? 'bg-warning' : 'bg-primary') : 'bg-muted-foreground/50',
                )}
              />
              {s.type === 'tool' ? (
                <div className={cn('rounded-xl transition-shadow', focusIdx === i && 'shadow-[0_0_0_1px_rgba(77,107,254,0.5)]')}>
                  <ToolInspector call={s.call} />
                </div>
              ) : (
                <div className={cn('flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs', s.msg.role === 'user' ? 'bg-primary/5' : 'bg-card', focusIdx === i && 'border-primary/50 bg-primary/8')}>
                  <MessageSquare className="h-3.5 w-3.5 flex-none opacity-60" />
                  <span className="flex-none font-medium">{s.msg.role === 'user' ? '用户' : '助手'}</span>
                  <span className="flex-1 truncate text-muted-foreground">{s.msg.content.slice(0, 80)}</span>
                  {s.msg.tokens && (
                    <span className="flex-none text-[10px] text-muted-foreground">
                      {(s.msg.tokens.input ?? 0).toLocaleString()} in / {(s.msg.tokens.output ?? 0).toLocaleString()} out
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
