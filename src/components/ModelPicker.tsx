import { useState, Fragment, type ReactNode } from 'react'
import { ChevronDown, Check, AlertTriangle } from 'lucide-react'
import { useMainStore } from '../store'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from './ui/dropdown-menu'

interface Props {
  /** 自定义触发内容（默认 header 风格：当前模型名 + ▾） */
  trigger?: ReactNode
  align?: 'start' | 'end'
  className?: string
}

// 模型选择器（DSH 风格）：点击展开 → 渠道分组 + 模型列表 → 点选立即生效
export default function ModelPicker({ trigger, align = 'start', className }: Props) {
  const models = useMainStore((s) => s.models)
  const agents = useMainStore((s) => s.agents)
  const currentAgentId = useMainStore((s) => s.currentAgentId)
  const providerKeyStatus = useMainStore((s) => s.providerKeyStatus)
  const updateAgent = useMainStore((s) => s.updateAgent)
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState('')

  const agent = agents.find((a) => a.id === currentAgentId)
  const agentModel = agent?.model ?? ''
  const slash = agentModel.indexOf('/')
  const curPid = slash > 0 ? agentModel.slice(0, slash) : ''
  const curMid = slash > 0 ? agentModel.slice(slash + 1) : agentModel

  // 当前模型显示名（渠道 · 模型）
  const label = (() => {
    if (!agent) return '未设置模型'
    const p = models.find((x) => x.id === curPid)
    const m = p?.models.find((x) => x.id === curMid)
    return m?.name ? `${p?.name ?? curPid} · ${m.name}` : agentModel
  })()

  const switchModel = async (pid: string, mid: string) => {
    if (!agent || (pid === curPid && mid === curMid)) return
    setErr('')
    try {
      await updateAgent(agent.id, { model: `${pid}/${mid}` })
      setOpen(false)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <button
            title="切换当前 Agent 的模型（点选即生效）"
            className={`group flex items-center gap-1 rounded-md px-1 py-0.5 font-mono text-[11px] tracking-wide text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary ${className ?? ''}`}
          >
            {label}
            <ChevronDown className="h-3 w-3 opacity-60 transition-transform group-hover:translate-y-px" />
          </button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align={align} className="w-72">
        {err && <p className="px-2.5 py-1 text-[11px] text-destructive">{err}</p>}
        {models.map((p, i) => (
          <Fragment key={p.id}>
            <DropdownMenuLabel>
              <span className="flex items-center gap-1.5">
                {p.name}
                {(providerKeyStatus[p.id] ?? 'none') === 'none' && (
                  <span className="inline-flex items-center gap-0.5 rounded bg-warning/15 px-1 py-px text-[9px] font-normal normal-case tracking-normal text-warning">
                    <AlertTriangle className="h-2.5 w-2.5" />未配key
                  </span>
                )}
              </span>
            </DropdownMenuLabel>
            {p.models.map((m) => {
              const active = p.id === curPid && m.id === curMid
              return (
                <DropdownMenuItem key={m.id} onClick={() => void switchModel(p.id, m.id)}>
                  <span className="flex-1 truncate">{m.name || m.id}</span>
                  {active && <Check className="h-3.5 w-3.5 flex-none text-primary" />}
                </DropdownMenuItem>
              )
            })}
            {i < models.length - 1 && <DropdownMenuSeparator />}
          </Fragment>
        ))}
        {!models.length && <div className="px-2.5 py-2 text-xs text-muted-foreground">暂无可用模型</div>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
