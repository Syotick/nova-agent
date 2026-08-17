import { useEffect, useState } from 'react'
import { Plus, Trash2, Play, Clock, Pause, PlayCircle, Pencil } from 'lucide-react'
import { useMainStore } from '../store'
import { api } from '../api'
import { Button } from './ui/button'
import { Input, Textarea } from './ui/input'
import { Label } from './ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Card } from './ui/card'
import { cn, fmtTime } from '../lib/utils'
import type { Task } from '../types'

export default function TaskManager() {
  const tasks = useMainStore((s) => s.tasks)
  const agents = useMainStore((s) => s.agents)
  const [editorVisible, setEditorVisible] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [runningId, setRunningId] = useState('')
  const [form, setForm] = useState({ name: '', agentId: '', cron: '', prompt: '' })
  const [formError, setFormError] = useState('')

  useEffect(() => { void api.listTasks().then((ts) => useMainStore.setState({ tasks: ts })) }, [])

  const agentName = (id: string) => agents.find((a) => a.id === id)?.name ?? id.slice(0, 8)

  const openCreate = () => {
    setEditingId('')
    setForm({ name: '', agentId: agents[0]?.id ?? '', cron: '', prompt: '' })
    setFormError('')
    setEditorVisible(true)
  }
  const openEdit = (t: Task) => {
    setEditingId(t.id)
    setForm({ name: t.name, agentId: t.agentId, cron: t.cron, prompt: t.prompt })
    setFormError('')
    setEditorVisible(true)
  }

  const save = async () => {
    setFormError('')
    try {
      if (editingId) await api.updateTask(editingId, form)
      else await api.createTask(form)
      setEditorVisible(false)
      useMainStore.setState({ tasks: await api.listTasks() })
    } catch (err) {
      setFormError((err as Error).message)
    }
  }

  const toggle = async (t: Task) => {
    await api.updateTask(t.id, { enabled: !t.enabled })
    useMainStore.setState({ tasks: await api.listTasks() })
  }

  const runNow = async (t: Task) => {
    setRunningId(t.id)
    try {
      await api.runTask(t.id)
      useMainStore.setState({ tasks: await api.listTasks() })
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setRunningId('')
    }
  }

  const remove = async (t: Task) => {
    if (!confirm(`确定删除定时任务「${t.name}」？`)) return
    await api.deleteTask(t.id)
    useMainStore.setState({ tasks: await api.listTasks() })
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-7">
      <div className="mx-auto max-w-[860px]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="gradient-brand-soft flex h-[42px] w-[42px] flex-none items-center justify-center rounded-xl">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-[17px] font-bold">定时任务</h3>
              <p className="mt-0.5 max-w-[560px] text-[13px] leading-relaxed text-muted-foreground">
                让 Agent 按 cron 定时执行任务（如每 5 分钟盯盘、每日生成日报）。任务在专用会话中运行，上下文连续。
              </p>
            </div>
          </div>
          <Button onClick={openCreate}><Plus className="h-4 w-4" />新建任务</Button>
        </div>

        <div className="flex flex-col gap-3">
          {tasks.map((task) => (
            <Card key={task.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className={cn('h-2 w-2 flex-none rounded-full', task.enabled ? 'bg-success shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-muted-foreground/50')} />
                <span className="text-sm font-semibold">{task.name}</span>
                <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">{task.cron}</span>
                <span className="ml-auto text-xs text-muted-foreground">{agentName(task.agentId)}</span>
              </div>
              {task.prompt && <p className="mt-2 text-[13px] leading-relaxed">{task.prompt}</p>}
              <div className="mt-2 flex flex-wrap gap-3.5 text-xs text-muted-foreground">
                <span>运行 {task.runCount} 次</span>
                {task.lastRunAt && <span>上次：{fmtTime(task.lastRunAt)}</span>}
                {task.lastResult && <span className="max-w-full truncate">结果：{task.lastResult.slice(0, 80)}{task.lastResult.length > 80 ? '…' : ''}</span>}
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => void toggle(task)}>
                  {task.enabled ? <><Pause className="h-3 w-3" />暂停</> : <><Play className="h-3 w-3" />启用</>}
                </Button>
                <Button variant="outline" size="sm" disabled={runningId === task.id} onClick={() => void runNow(task)}>
                  <PlayCircle className={cn('h-3 w-3', runningId === task.id && 'animate-spin')} />
                  {runningId === task.id ? '执行中…' : '立即执行'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => openEdit(task)}><Pencil className="h-3 w-3" />编辑</Button>
                <Button variant="destructive" size="sm" onClick={() => void remove(task)}><Trash2 className="h-3 w-3" />删除</Button>
              </div>
            </Card>
          ))}
          {!tasks.length && (
            <div className="rounded-xl border border-dashed border-border py-12 text-center">
              <p className="text-sm text-muted-foreground">还没有定时任务，点「新建任务」创建第一个</p>
              <p className="mt-2 text-xs text-muted-foreground/70">示例：<code className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-primary">*/5 * * * *</code> = 每 5 分钟；<code className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-primary">0 23 * * *</code> = 每天 23:00</p>
            </div>
          )}
        </div>
      </div>

      {/* 编辑器 */}
      <Dialog open={editorVisible} onOpenChange={setEditorVisible}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑任务' : '新建任务'}</DialogTitle>
            <DialogDescription>5 段 cron：分 时 日 月 周</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <Label>任务名称</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：每5分钟盯盘" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>执行 Agent</Label>
              <select
                value={form.agentId}
                onChange={(e) => setForm({ ...form, agentId: e.target.value })}
                className="flex h-9 w-full rounded-lg border border-border bg-input px-3 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Cron 表达式</Label>
              <Input value={form.cron} onChange={(e) => setForm({ ...form, cron: e.target.value })} placeholder="如：0 */5 * * *" className="font-mono" />
              <p className="text-[11px] text-muted-foreground">* 每分钟｜0 */5 * * * 每5分钟｜0 9 * * 1-5 工作日9点｜0 23 * * * 每天23点</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>任务指令（告诉 Agent 做什么，可选）</Label>
              <Textarea rows={4} value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} placeholder="如：检查当前持仓的行情，如有异常波动请总结原因并给出建议" />
            </div>
            {formError && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{formError}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorVisible(false)}>取消</Button>
            <Button onClick={() => void save()} disabled={!form.name.trim() || !form.agentId || !form.cron.trim()}>{editingId ? '保存' : '创建'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
