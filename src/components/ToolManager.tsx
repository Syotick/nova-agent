import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { api } from '../api'
import { Card } from './ui/card'
import { cn } from '../lib/utils'
import type { ToolInfo } from '../types'

export default function ToolManager() {
  const [tools, setTools] = useState<ToolInfo[]>([])
  const [openServer, setOpenServer] = useState<string | null>(null)

  useEffect(() => {
    api.listTools().then(setTools).catch(() => setTools([]))
  }, [])

  const groups = new Map<string, ToolInfo[]>()
  for (const t of tools) {
    const list = groups.get(t.serverName) ?? []
    list.push(t)
    groups.set(t.serverName, list)
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-7">
      <div className="mx-auto max-w-[860px]">
        <div className="mb-5 flex items-start gap-3.5">
          <div className="gradient-brand-soft flex h-[42px] w-[42px] flex-none items-center justify-center rounded-xl text-xl">🧰</div>
          <div>
            <h3 className="text-[17px] font-bold">工具浏览</h3>
            <p className="mt-0.5 text-[13px] text-muted-foreground">所有 MCP 工具按服务器分组展示，共 {tools.length} 个工具</p>
          </div>
        </div>

        {[...groups.entries()].map(([serverName, list]) => (
          <Card key={serverName} className="mb-3 overflow-hidden">
            <button
              className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
              onClick={() => setOpenServer(openServer === serverName ? null : serverName)}
            >
              <span className="text-base">🔌</span>
              <span className="text-sm font-semibold">{serverName}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{list.length} 工具</span>
              <ChevronDown className={cn('ml-auto h-4 w-4 text-muted-foreground transition-transform', openServer === serverName && 'rotate-180')} />
            </button>
            {openServer === serverName && (
              <div className="flex flex-col gap-2 border-t border-border p-3">
                {list.map((t) => (
                  <div key={t.name} className="rounded-xl border border-border bg-muted/30 p-3">
                    <div className="font-mono text-[13px] font-medium text-primary">{t.name}</div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.description || '（无描述）'}</p>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">参数 Schema</summary>
                      <pre className="mt-1.5 max-h-[200px] overflow-auto rounded-lg bg-background/60 p-2 font-mono text-[11px] leading-relaxed">
                        {JSON.stringify(t.inputSchema, null, 2)}
                      </pre>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
        {!tools.length && (
          <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            暂无工具（MCP 服务器未连接或未配置）
          </div>
        )}
      </div>
    </div>
  )
}
