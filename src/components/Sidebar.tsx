import { useEffect, useRef, useState } from 'react'
import {
  MessageSquare, Plus, Sparkles, Bot, Clock, Wrench, ChevronRight, Pencil, Trash2, Cpu, Settings, Brain, Cable,
} from 'lucide-react'
import { useMainStore } from '../store'
import { api } from '../api'
import { cn } from '../lib/utils'
import type { Agent, Session } from '../types'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog'
import SettingsModal from './SettingsModal'

interface SearchResult {
  sessionId: string
  title: string
  agentId: string
  messageId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

interface Props {
  view: string
  onNewAgent: () => void
  onEditAgent: (agent: Agent) => void
  onNavigate: (view: string) => void
}

export default function Sidebar({ view, onNewAgent, onEditAgent, onNavigate }: Props) {
  // 细粒度订阅：只订阅渲染所需的原始 state（避免流式 text 更新触发整栏重渲染）
  const agents = useMainStore((s) => s.agents)
  const currentAgentId = useMainStore((s) => s.currentAgentId)
  const sessions = useMainStore((s) => s.sessions)
  const currentSessionId = useMainStore((s) => s.currentSessionId)
  const tasks = useMainStore((s) => s.tasks)
  const taskBadge = useMainStore((s) => s.taskBadge)
  const streaming = useMainStore((s) => s.streaming)
  // actions 引用稳定，逐个取（不能打包成对象字面量——会导致 selector 每次返回新引用 → 无限重渲染）
  const switchAgent = useMainStore((s) => s.switchAgent)
  const switchSession = useMainStore((s) => s.switchSession)
  const newSession = useMainStore((s) => s.newSession)
  const deleteAgent = useMainStore((s) => s.deleteAgent)
  const deleteSession = useMainStore((s) => s.deleteSession)
  const renameSession = useMainStore((s) => s.renameSession)
  const clearTaskBadge = useMainStore((s) => s.clearTaskBadge)

  const [editingSessionId, setEditingSessionId] = useState('')
  const [renameDraft, setRenameDraft] = useState('')
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null)
  const [searchQ, setSearchQ] = useState('')
  const [searchFocus, setSearchFocus] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const renameInputRef = useRef<HTMLInputElement>(null)

  // 搜索防抖
  useEffect(() => {
    const q = searchQ.trim()
    if (!q) { setSearchResults([]); setSearching(false); return }
    setSearching(true)
    const timer = setTimeout(async () => {
      try { setSearchResults(await api.searchSessions(q)) } catch { setSearchResults([]) }
      finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQ])

  // 重命名聚焦
  useEffect(() => {
    if (editingSessionId) renameInputRef.current?.focus()
  }, [editingSessionId])

  const removeAgent = (agent: Agent) => {
    setConfirmState({
      title: '删除 Agent',
      message: `确定删除 Agent「${agent.name}」？其所有会话也会被删除，此操作不可恢复。`,
      onConfirm: () => { void deleteAgent(agent.id); setConfirmState(null) },
    })
  }
  const removeSession = (session: Session) => {
    setConfirmState({
      title: '删除会话',
      message: `确定删除会话「${session.title}」？此操作不可恢复。`,
      onConfirm: () => { void deleteSession(session.id); setConfirmState(null) },
    })
  }

  const startRename = (session: Session) => {
    setEditingSessionId(session.id)
    setRenameDraft(session.title)
  }
  const saveRename = async (sessionId: string) => {
    if (!editingSessionId) return
    const title = renameDraft.trim()
    if (title) await renameSession(sessionId, title)
    setEditingSessionId('')
    setRenameDraft('')
  }

  const snippet = (content: string) => {
    const q = searchQ.trim().toLowerCase()
    const idx = content.toLowerCase().indexOf(q)
    const start = Math.max(0, idx - 20)
    const slice = content.slice(start, start + 80)
    return (start > 0 ? '…' : '') + slice + (content.length > start + 80 ? '…' : '')
  }

  const jumpToResult = async (r: SearchResult) => {
    onNavigate('chat')
    if (currentAgentId !== r.agentId) await switchAgent(r.agentId)
    setSearchQ(''); setSearchFocus(false); setSearchResults([])
    await switchSession(r.sessionId)
    window.dispatchEvent(new CustomEvent('nova:search-jump', { detail: r.messageId }))
    setTimeout(() => {
      const el = document.querySelector(`[data-mid="${r.messageId}"]`)
      el?.scrollIntoView({ block: 'center' })
      el?.classList.add('search-hit')
      setTimeout(() => el?.classList.remove('search-hit'), 2500)
    }, 100)
  }

  const navItems = [
    { id: 'chat', label: '对话', icon: <MessageSquare className="h-3.5 w-3.5" /> },
    { id: 'trajectory', label: '轨迹', icon: <ChevronRight className="h-3.5 w-3.5" /> },
    { id: 'models', label: '模型渠道', icon: <Cpu className="h-3.5 w-3.5" /> },
    { id: 'skills', label: '技能管理', icon: <Sparkles className="h-3.5 w-3.5" /> },
    { id: 'memories', label: '记忆', icon: <Brain className="h-3.5 w-3.5" /> },
    { id: 'mcps', label: 'MCP 服务器', icon: <Cable className="h-3.5 w-3.5" /> },
    { id: 'tasks', label: '定时任务', icon: <Clock className="h-3.5 w-3.5" />, badge: taskBadge },
    { id: 'tools', label: '工具浏览', icon: <Wrench className="h-3.5 w-3.5" /> },
  ]

  return (
    <aside className="flex h-full w-[264px] flex-none flex-col gap-4 border-r border-border bg-card/60 px-3 py-4 backdrop-blur-xl">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-2">
        <div className="gradient-brand flex h-10 w-10 items-center justify-center rounded-xl shadow-[0_4px_16px_rgba(77,107,254,0.25)]">
          <Bot className="h-5 w-5 text-white" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-gradient text-[15px] font-bold">nova-agent</span>
          <span className="text-[11px] text-muted-foreground">Open-Source AI Agent</span>
        </div>
      </div>

      {/* Agents */}
      <div className="flex max-h-[38%] min-h-[60px] flex-col gap-2 overflow-y-auto">
        <div className="flex items-center justify-between px-2">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Agents</span>
          <button className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary" title="新建 Agent" onClick={onNewAgent}>
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex flex-col gap-0.5">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className={cn(
                'group flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 transition-all hover:translate-x-0.5 hover:bg-muted',
                agent.id === currentAgentId && 'gradient-brand-soft border-primary/25',
              )}
              onClick={() => { onNavigate('chat'); void switchAgent(agent.id) }}
              onDoubleClick={() => onEditAgent(agent)}
            >
              <span
                className="flex h-7 w-7 flex-none items-center justify-center rounded-lg text-[13px] font-bold text-white"
                style={{ background: agent.color }}
              >
                {agent.name.charAt(0)}
              </span>
              <span className={cn('flex-1 truncate text-[13px]', agent.id === currentAgentId && 'font-semibold')}>{agent.name}</span>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground" title={`工具: ${agent.mcpServerIds.length} 技能: ${agent.skillIds.length}`}>
                {agent.mcpServerIds.length + agent.skillIds.length}
              </span>
              <span className="hidden gap-0.5 group-hover:flex">
                <button className="rounded-md p-1 text-muted-foreground hover:bg-primary/15 hover:text-primary" title="编辑" onClick={(e) => { e.stopPropagation(); onEditAgent(agent) }}>
                  <Pencil className="h-3 w-3" />
                </button>
                <button className="rounded-md p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive" title="删除" onClick={(e) => { e.stopPropagation(); removeAgent(agent) }}>
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            </div>
          ))}
          {!agents.length && <div className="px-2.5 py-1 text-xs text-muted-foreground">还没有 Agent</div>}
        </div>
      </div>

      {/* Sessions */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        <div className="flex items-center justify-between px-2">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">会话</span>
          <button className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary" title="新建会话" onClick={() => { onNavigate('chat'); void newSession() }}>
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* 搜索框 */}
        <div className="mx-0.5 flex items-center gap-1.5 rounded-lg border border-border bg-input px-2.5 focus-within:border-primary/45 focus-within:ring-2 focus-within:ring-primary/10">
          <MessageSquare className="h-3 w-3 flex-none text-muted-foreground" />
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onFocus={() => setSearchFocus(true)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setSearchQ(''); setSearchFocus(false) } }}
            placeholder="搜索历史消息…"
            autoComplete="off"
            className="h-8 min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
          {searchQ && (
            <button className="text-[10px] text-muted-foreground hover:text-foreground" onClick={() => { setSearchQ(''); setSearchFocus(false) }}>✕</button>
          )}
        </div>

        {/* 搜索结果 */}
        {searchFocus && searchQ.trim() && (
          <div className="flex max-h-[280px] flex-col gap-0.5 overflow-y-auto px-0.5 animate-fade-in">
            {searching && <div className="px-2.5 py-2 text-xs text-muted-foreground">搜索中…</div>}
            {!searching && !searchResults.length && <div className="px-2.5 py-2 text-xs text-muted-foreground">没有匹配的消息</div>}
            {searchResults.map((r, i) => (
              <div key={r.messageId + i} className="cursor-pointer rounded-lg border border-transparent px-2.5 py-2 transition-colors hover:border-primary/20 hover:bg-muted" onClick={() => void jumpToResult(r)}>
                <div className="mb-0.5 flex items-center gap-2">
                  <span className="flex-1 truncate text-xs font-semibold text-foreground">{r.title}</span>
                  <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] text-primary">{r.role === 'user' ? '你' : 'AI'}</span>
                </div>
                <div className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{snippet(r.content)}</div>
              </div>
            ))}
          </div>
        )}

        {(!searchFocus || !searchQ.trim()) && (
          <div className="flex flex-col gap-0.5">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={cn(
                  'group flex cursor-pointer items-center gap-2 rounded-lg border border-transparent px-2.5 py-2 text-[13px] text-muted-foreground transition-all hover:translate-x-0.5 hover:bg-muted hover:text-foreground',
                  session.id === currentSessionId && 'gradient-brand-soft border-primary/20 text-foreground',
                )}
                onClick={() => { onNavigate('chat'); void switchSession(session.id) }}
              >
                <MessageSquare className="h-3 w-3 flex-none opacity-70" />
                {editingSessionId === session.id ? (
                  <input
                    ref={renameInputRef}
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void saveRename(session.id)
                      if (e.key === 'Escape') { setEditingSessionId(''); setRenameDraft('') }
                    }}
                    onBlur={() => void saveRename(session.id)}
                    autoComplete="off"
                    className="h-6 min-w-0 flex-1 rounded-md border border-primary/50 bg-input px-1.5 text-xs outline-none ring-2 ring-primary/10"
                  />
                ) : (
                  <span className="flex-1 truncate">{session.title}</span>
                )}
                {editingSessionId !== session.id && (
                  <span className="hidden gap-0.5 group-hover:flex">
                    <button className="rounded-md p-1 text-muted-foreground hover:bg-primary/15 hover:text-primary" title="重命名" onClick={(e) => { e.stopPropagation(); startRename(session) }}>
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button className="rounded-md p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive" title="删除" onClick={(e) => { e.stopPropagation(); removeSession(session) }}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </div>
            ))}
            {!sessions.length && <div className="px-2.5 py-1 text-xs text-muted-foreground">还没有会话，点 ＋ 新建</div>}
          </div>
        )}
      </div>

      {/* 导航 */}
      <div className="flex flex-none flex-col gap-1.5">
        <span className="px-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">导航</span>
        <div className="flex flex-col gap-0.5">
          {navItems.map((item) => (
            <div
              key={item.id}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground transition-all hover:translate-x-0.5 hover:bg-muted hover:text-foreground',
                view === item.id && 'gradient-brand-soft border border-primary/25 text-foreground',
              )}
              onClick={() => {
                onNavigate(item.id)
                if (item.id === 'tasks') clearTaskBadge()
              }}
            >
              <span className="relative">{item.icon}{item.badge && <span className="absolute -right-1.5 -top-1.5 h-2 w-2 animate-pulse rounded-full bg-destructive shadow-[0_0_6px_rgba(248,113,113,0.8)]" />}</span>
              <span className="font-medium">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer：状态 + 设置（其余功能收进设置弹窗） */}
      <div className="flex flex-none items-center gap-2 border-t border-border px-2 pt-2.5 text-xs text-muted-foreground">
        <span className={cn('h-1.5 w-1.5 flex-none rounded-full', streaming ? 'bg-warning shadow-[0_0_8px_rgba(251,191,36,0.7)]' : 'bg-success shadow-[0_0_8px_rgba(52,211,153,0.6)]')} />
        <span className="flex-1">{streaming ? '运行中' : '就绪'}</span>
        <button
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-all hover:bg-muted hover:text-foreground"
          title="设置"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings className="h-3.5 w-3.5" />
          <span className="text-[11px]">设置</span>
        </button>
      </div>

      {/* 设置弹窗 */}
      <SettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onGoModels={() => { setSettingsOpen(false); onNavigate('models') }}
      />

      {/* 确认弹窗 */}
      <AlertDialog open={!!confirmState} onOpenChange={(open) => { if (!open) setConfirmState(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmState?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmState?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmState?.onConfirm}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  )
}
