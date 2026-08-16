import { useEffect, useRef, useState } from 'react'
import { Cable, Plus, Pencil, Trash2, RefreshCw, Wifi, WifiOff, X } from 'lucide-react'
import { useMainStore } from '../store'
import { api } from '../api'
import { Button } from './ui/button'
import { Input, Textarea } from './ui/input'
import { Label } from './ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { cn } from '../lib/utils'
import type { McpServerConfig } from '../types'

interface McpStatus {
  serverId: string
  name: string
  connected: boolean
  toolCount: number
  lastError?: string
}

// 解析 env 文本：每行 key=value
function parseEnvText(text: string): Record<string, string> | undefined {
  const env: Record<string, string> = {}
  let found = false
  for (const line of text.split('\n')) {
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (kv) { env[kv[1]] = kv[2].trim(); found = true }
  }
  return found ? env : undefined
}

interface FormState {
  id: string
  name: string
  command: string
  argsText: string
  envText: string
  timeoutMs: string
}

const EMPTY_FORM: FormState = { id: '', name: '', command: '', argsText: '', envText: '', timeoutMs: '' }

export default function McpManager() {
  const mcpServers = useMainStore((s) => s.mcpServers)
  const [statuses, setStatuses] = useState<Record<string, McpStatus>>({})
  const [refreshing, setRefreshing] = useState(false)
  const [editorVisible, setEditorVisible] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const refresh = async () => {
    setRefreshing(true)
    try {
      const list = await api.listMcpServerStatus()
      setStatuses(Object.fromEntries(list.map((s) => [s.serverId, s])))
    } catch { /* ignore */ } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  const isEdit = Boolean(editingId)

  const openCreate = () => {
    setEditingId('')
    setForm(EMPTY_FORM)
    setFormError('')
    setEditorVisible(true)
  }
  const openEdit = (cfg: McpServerConfig) => {
    setEditingId(cfg.id)
    setForm({
      id: cfg.id,
      name: cfg.name ?? '',
      command: cfg.command,
      argsText: (cfg.args ?? []).join('\n'),
      envText: Object.entries(cfg.env ?? {}).map(([k, v]) => `${k}=${v}`).join('\n'),
      timeoutMs: cfg.timeoutMs ? String(cfg.timeoutMs) : '',
    })
    setFormError('')
    setEditorVisible(true)
  }

  const submit = async () => {
    if (!form.id.trim() || !form.command.trim()) {
      setFormError('ID 和启动命令（command）必填')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const config: McpServerConfig = {
        id: form.id.trim(),
        name: form.name.trim() || form.id.trim(),
        command: form.command.trim(),
        args: form.argsText.split('\n').map((a) => a.trim()).filter(Boolean),
        env: parseEnvText(form.envText),
        timeoutMs: Number(form.timeoutMs) > 0 ? Number(form.timeoutMs) : undefined,
      }
      if (isEdit) {
        await api.updateMcpServer(form.id.trim(), config)
      } else {
        await api.createMcpServer(config)
      }
      useMainStore.setState({ mcpServers: await api.listMcpServers() })
      setEditorVisible(false)
      void refresh()
    } catch (e) {
      setFormError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm(`确定删除 MCP 服务器「${id}」？会同时断开连接并删除配置文件。`)) return
    await api.deleteMcpServer(id)
    useMainStore.setState({ mcpServers: await api.listMcpServers() })
    void refresh()
  }

  const reconnect = async (id: string) => {
    const st = await api.reconnectMcpServer(id)
    setStatuses((prev) => ({ ...prev, [id]: st }))
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-7">
      <div className="mx-auto max-w-[860px]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="gradient-brand-soft flex h-[42px] w-[42px] flex-none items-center justify-center rounded-xl text-xl">🔌</div>
            <div>
              <h3 className="text-[17px] font-bold">MCP 服务器</h3>
              <p className="mt-0.5 max-w-[560px] text-[13px] leading-relaxed text-muted-foreground">
                MCP 是 Agent 的工具来源（浏览器 / 文件系统 / 数据库…）。新增服务器保存后立即连接，无需重启。
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void refresh()} disabled={refreshing} title="刷新连接状态">
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            </Button>
            <Button onClick={openCreate}><Plus className="h-4 w-4" />添加服务器</Button>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          {mcpServers.map((cfg) => {
            const st = statuses[cfg.id]
            const connected = st?.connected ?? false
            return (
              <div key={cfg.id} className="rounded-2xl border border-border bg-card/50 px-4 py-3.5">
                <div className="flex items-center gap-2.5">
                  <Cable className="h-4 w-4 flex-none text-primary" />
                  <span className="text-[14px] font-semibold">{cfg.name}</span>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{cfg.id}</code>
                  <span className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                    connected ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive',
                  )}>
                    {connected ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
                    {connected ? `已连接 · ${st?.toolCount ?? 0} 工具` : '未连接'}
                  </span>
                  <span className="ml-auto flex items-center gap-1">
                    {!connected && (
                      <button className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/15 hover:text-primary" title="重连" onClick={() => void reconnect(cfg.id)}>
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/15 hover:text-primary" title="编辑" onClick={() => openEdit(cfg)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive" title="删除" onClick={() => void remove(cfg.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
                <div className="mt-1.5 truncate font-mono text-[11px] text-muted-foreground">
                  {cfg.command} {cfg.args?.join(' ')}
                </div>
                {!connected && st?.lastError && (
                  <div className="mt-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
                    连接失败：{st.lastError}
                  </div>
                )}
              </div>
            )
          })}
          {!mcpServers.length && (
            <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-xs text-muted-foreground">
              还没有 MCP 服务器。点「添加服务器」接入第一个——例如官方文件系统或浏览器工具。
            </div>
          )}
        </div>
      </div>

      {/* 编辑器 */}
      <Dialog open={editorVisible} onOpenChange={setEditorVisible}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEdit ? '编辑 MCP 服务器' : '添加 MCP 服务器'}</DialogTitle>
            <DialogDescription>保存后立即尝试连接（失败可在列表看到原因）</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {formError && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{formError}</div>}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>ID（唯一，字母数字连字符）</Label>
                <Input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} disabled={isEdit} placeholder="filesystem" autoComplete="off" className="font-mono text-xs" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>名称</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="文件系统" autoComplete="off" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>启动命令（command）</Label>
              <Input value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} placeholder="npx" autoComplete="off" className="font-mono text-xs" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>参数（args，每行一个）</Label>
              <Textarea rows={2} value={form.argsText} onChange={(e) => setForm({ ...form, argsText: e.target.value })} placeholder={'-y\n@modelcontextprotocol/server-filesystem\nD:/workspace'} className="font-mono text-xs" />
            </div>
            <div className="grid grid-cols-[1fr_1fr] gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>环境变量（可选，每行 KEY=value）</Label>
                <Textarea rows={2} value={form.envText} onChange={(e) => setForm({ ...form, envText: e.target.value })} placeholder={'API_KEY=xxx\nDEBUG=true'} autoComplete="off" className="font-mono text-xs" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>工具超时 ms（可选）</Label>
                <Input value={form.timeoutMs} onChange={(e) => setForm({ ...form, timeoutMs: e.target.value })} placeholder="120000" autoComplete="off" className="font-mono text-xs" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorVisible(false)}>取消</Button>
            <Button onClick={() => void submit()} disabled={saving}>{saving ? '保存中…' : isEdit ? '保存并重连' : '添加'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
