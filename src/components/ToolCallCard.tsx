import { useState } from 'react'
import { ChevronDown, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'
import type { ToolCallRecord } from '../types'

export default function ToolCallCard({ call }: { call: ToolCallRecord }) {
  const [open, setOpen] = useState(false)
  const [showOutput, setShowOutput] = useState(false)

  const statusIcon = {
    running: <Loader2 className="h-3.5 w-3.5 animate-spin text-warning" />,
    success: <CheckCircle2 className="h-3.5 w-3.5 text-success" />,
    error: <XCircle className="h-3.5 w-3.5 text-destructive" />,
  }[call.status]

  const statusColor = {
    running: 'text-warning border-warning/30',
    success: 'text-success border-success/30',
    error: 'text-destructive border-destructive/30',
  }[call.status]

  const fmtInput = (input: unknown) => {
    try { return JSON.stringify(input, null, 2) } catch { return String(input) }
  }

  // 一行摘要：对象/数组转紧凑 JSON，字符串/数字原样，截断 60 字符（避免 [object Object]）
  const inputSummary = (() => {
    try {
      const v = call.input
      if (v == null) return ''
      const s = typeof v === 'string' ? v : JSON.stringify(v)
      return s.length > 60 ? s.slice(0, 60) + '…' : s
    } catch {
      return String(call.input ?? '')
    }
  })()

  return (
    <div className={cn('mt-2 overflow-hidden rounded-xl border bg-muted/50 text-xs', statusColor)}>
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        onClick={() => setOpen(!open)}
      >
        {statusIcon}
        <span className="font-mono font-medium">{call.name}</span>
        <span className="flex-1 truncate font-mono text-muted-foreground">{inputSummary}</span>
        <span className="flex-none text-[10px] text-muted-foreground">
          {call.status === 'running' ? '运行中' : `${(call.durationMs / 1000).toFixed(1)}s`}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 flex-none transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-t border-border px-3 py-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-medium text-muted-foreground">输入参数</span>
          </div>
          <pre className="max-h-[180px] overflow-auto rounded-lg bg-background/60 p-2 font-mono text-[11px] leading-relaxed">{fmtInput(call.input)}</pre>

          <button
            className="mt-2.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setShowOutput(!showOutput)}
          >
            <ChevronDown className={cn('h-3 w-3 transition-transform', showOutput && 'rotate-180')} />
            输出结果（{(call.output || '').length} 字符）
          </button>
          {showOutput && (
            <pre className="mt-1.5 max-h-[240px] overflow-auto rounded-lg bg-background/60 p-2 font-mono text-[11px] leading-relaxed">
              {call.output || '(空)'}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
