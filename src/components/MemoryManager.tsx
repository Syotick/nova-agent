import { useState } from 'react'
import { Brain, Plus, Trash2, Pencil, Check, X, Sparkles } from 'lucide-react'
import { useMainStore } from '../store'
import { Button } from './ui/button'
import { Input, Textarea } from './ui/input'
import { cn } from '../lib/utils'
import { fmtTime } from '../lib/utils'

// 跨会话记忆管理：按当前 Agent 隔离；模型可通过 remember 工具自动写入，也可手动添加
export default function MemoryManager() {
  const agents = useMainStore((s) => s.agents)
  const currentAgentId = useMainStore((s) => s.currentAgentId)
  const memories = useMainStore((s) => s.memories)
  const addMemoryManual = useMainStore((s) => s.addMemoryManual)
  const updateMemory = useMainStore((s) => s.updateMemory)
  const deleteMemory = useMainStore((s) => s.deleteMemory)

  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [mergedMsg, setMergedMsg] = useState('')
  const [editingId, setEditingId] = useState('')
  const [editingText, setEditingText] = useState('')

  const currentAgent = agents.find((a) => a.id === currentAgentId)

  const submit = async () => {
    if (!content.trim()) return
    setSaving(true)
    setError('')
    setMergedMsg('')
    try {
      const merged = await addMemoryManual(content)
      setContent('')
      if (merged) setMergedMsg('内容与现有记忆相似，已合并更新（未新增）')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (id: string, text: string) => {
    setEditingId(id)
    setEditingText(text)
  }
  const saveEdit = async (id: string) => {
    if (!editingText.trim()) return
    try {
      await updateMemory(id, editingText)
      setEditingId('')
      setEditingText('')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      {/* 说明卡 */}
      <section className="flex items-start gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
        <Brain className="mt-0.5 h-5 w-5 flex-none text-primary" />
        <div className="flex flex-col gap-1 leading-tight">
          <span className="text-sm font-semibold">跨会话记忆</span>
          <span className="text-[11px] leading-relaxed text-muted-foreground">
            记住用户偏好与项目事实，之后所有会话自动参考（每轮按问题检索 Top 5 注入）。
            当前记忆库属于 Agent「{currentAgent?.name ?? '未选择'}」；对话中模型可通过 remember 工具自动写入，也可以手动添加。
          </span>
        </div>
      </section>

      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
      {mergedMsg && <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning animate-fade-in">{mergedMsg}</div>}

      {/* 添加 */}
      <section className="flex flex-col gap-2 rounded-2xl border border-dashed border-border bg-card/30 p-4">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">添加记忆（一句话，简洁完整，如"用户喜欢简洁的回答"）</span>
          <Textarea
            rows={2}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={'用户偏好 / 项目事实 / 长期约定…'}
            autoComplete="off"
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit() }}
            className="text-xs"
          />
        </div>
        <div>
          <Button onClick={() => void submit()} disabled={!content.trim() || saving} className="h-8.5">
            <Plus className="mr-1 h-3.5 w-3.5" />{saving ? '保存中…' : '添加记忆'}
          </Button>
        </div>
      </section>

      {/* 列表 */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">记忆列表</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{memories.length} 条</span>
        </div>
        <div className="flex flex-col gap-2">
          {memories.map((m) => (
            <div key={m.id} className="flex items-start gap-2.5 rounded-2xl border border-border bg-card/50 px-4 py-3">
              <span className="mt-0.5 text-sm">💡</span>
              <div className="flex min-w-0 flex-1 flex-col gap-1 leading-tight">
                {editingId === m.id ? (
                  <div className="flex items-start gap-1.5">
                    <Input
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void saveEdit(m.id)
                        if (e.key === 'Escape') { setEditingId(''); setEditingText('') }
                      }}
                      autoFocus
                      autoComplete="off"
                      className="h-8 text-xs"
                    />
                    <button className="rounded-md p-1.5 text-success hover:bg-success/15" title="保存" onClick={() => void saveEdit(m.id)}>
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" title="取消" onClick={() => { setEditingId(''); setEditingText('') }}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <span className="text-[13px] leading-relaxed text-foreground">{m.content}</span>
                )}
                <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className={cn(
                    'rounded-full px-1.5 py-px font-medium',
                    m.source === 'auto' ? 'bg-primary/10 text-primary' : 'bg-muted',
                  )}>
                    {m.source === 'auto' ? '模型自动记录' : '手动添加'}
                  </span>
                  <span>{fmtTime(m.createdAt)}</span>
                </span>
              </div>
              <span className="flex gap-0.5">
                <button
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/15 hover:text-primary"
                  title="编辑这条记忆"
                  onClick={() => startEdit(m.id, m.content)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                  title="删除这条记忆"
                  onClick={() => void deleteMemory(m.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
          ))}
          {!memories.length && (
            <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
              还没有记忆。试试在对话中说「记住我喜欢简洁的回答」，或用上方表单手动添加一条。
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
