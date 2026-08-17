import { useRef, useState } from 'react'
import { Paperclip, Send, Square, Brain, Image, X, Rocket } from 'lucide-react'
import { useMainStore } from '../store'
import { api } from '../api'
import { cn, fmtSize } from '../lib/utils'
import type { Attachment, ReasoningOption } from '../types'
import ModelPicker from './ModelPicker'
import ContextUsageBar from './ContextUsageBar'

// 思考模式基础选项（所有 DeepSeek 模型都有）：thinking 开关，纯英文
const BASE_REASONING: Array<{ value: string; label: string; option: ReasoningOption }> = [
  { value: 'adaptive', label: 'adaptive', option: { type: 'adaptive' } },
  { value: 'off', label: 'off', option: { type: 'disabled' } },
]

export default function Composer() {
  const streaming = useMainStore((s) => s.streaming)
  const send = useMainStore((s) => s.send)
  const sendVibe = useMainStore((s) => s.sendVibe)
  const cancelStream = useMainStore((s) => s.cancelStream)
  const reasoningPref = useMainStore((s) => s.reasoningPref)
  const setReasoningPref = useMainStore((s) => s.setReasoningPref)
  const agents = useMainStore((s) => s.agents)
  const models = useMainStore((s) => s.models)
  const currentAgentId = useMainStore((s) => s.currentAgentId)
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  // 当前 Agent 模型（渠道 + 模型）
  const agentModel = agents.find((a) => a.id === currentAgentId)?.model ?? ''
  const slash = agentModel.indexOf('/')
  const curPid = slash > 0 ? agentModel.slice(0, slash) : ''
  const curMid = slash > 0 ? agentModel.slice(slash + 1) : agentModel

  // 思考选项随模型能力联动（DSH 同款）：effort 档位 = 当前模型声明的能力
  // （自定义供应商的模型后端默认补全档位；无档位声明的模型只有 adaptive/off）
  const curProvider = models.find((p) => p.id === curPid)
  const curModel = curProvider?.models.find((m) => m.id === curMid)
  const efforts = curModel?.reasoningEfforts ?? []
  const reasoningOptions = [
    ...BASE_REASONING,
    ...efforts.map((e) => ({
      value: e,
      label: e,
      option: { type: 'enabled' as const, effort: e as ReasoningOption['effort'] },
    })),
  ]
  const canReasoning = efforts.length > 0

  // 当前选中值（反向映射；切模型后若档位不存在则回落 adaptive）
  const rawValue = reasoningPref.type === 'adaptive' ? 'adaptive'
    : reasoningPref.type === 'disabled' ? 'off'
    : (reasoningPref.effort ?? '')
  const reasoningValue = reasoningOptions.some((o) => o.value === rawValue) ? rawValue : 'adaptive'

  const isImage = (a: Attachment) => a.mime.startsWith('image/')

  const uploadFiles = async (files: File[]) => {
    if (!files.length || streaming) return
    setUploading(true)
    try {
      for (const f of files) {
        if (f.size > 50 * 1024 * 1024) { alert(`「${f.name}」超过 50MB，已跳过`); continue }
        const att = await api.uploadFile(f)
        setAttachments((prev) => [...prev, att])
      }
    } catch (err) {
      alert(`上传失败: ${(err as Error).message}`)
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void uploadFiles(Array.from(e.dataTransfer.files))
  }

  const handleSend = async () => {
    const text = draft.trim()
    if ((!text && !attachments.length) || streaming || uploading) return
    const atts = attachments.length ? [...attachments] : undefined
    setAttachments([])
    await send(text, atts)
    setDraft('')
    if (taRef.current) taRef.current.style.height = 'auto'
  }

  // vibe 自治循环：输入框内容作为目标，交给 agent 多轮自愈直到收敛
  const handleVibe = async () => {
    const text = draft.trim()
    if (!text || streaming || uploading) return
    setDraft('')
    if (taRef.current) taRef.current.style.height = 'auto'
    await sendVibe(text)
  }

  return (
    <div className="mx-auto w-full max-w-[860px] flex-none px-6 pb-6 pt-2.5">
      <div
        className={cn(
          'flex flex-col gap-2.5 rounded-2xl border bg-card/80 p-4 pb-3 shadow-card backdrop-blur-xl transition-all',
          focused && 'border-primary/45 shadow-glow',
          streaming && 'border-primary/40 shadow-[0_0_0_1px_rgba(77,107,254,0.2),0_8px_40px_rgba(77,107,254,0.18)]',
          dragging && 'border-success/60 bg-success/5 shadow-[0_0_0_2px_rgba(52,211,153,0.25)]',
        )}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {/* 附件预览 */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((a, i) => (
              <div key={a.id} className="flex items-center gap-1.5 rounded-xl border border-border bg-muted px-2.5 py-1.5 text-xs animate-fade-in-up" title={a.name}>
                {isImage(a) ? <Image className="h-3.5 w-3.5 text-primary" /> : <Paperclip className="h-3.5 w-3.5 text-primary" />}
                <span className="max-w-[150px] truncate">{a.name}</span>
                <span className="text-[11px] text-muted-foreground">{fmtSize(a.size)}</span>
                <button
                  className="rounded p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                  onClick={() => {
                    const att = attachments[i]
                    setAttachments((prev) => prev.filter((_, j) => j !== i))
                    // 同步删除磁盘文件（防磁盘 DoS，删除失败静默忽略）
                    void api.deleteFile(att.path.split('/').pop() ?? '').catch(() => {})
                  }}
                ><X className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        )}

        {/* 工具栏：模型切换 + 思考程度（输入框上方，与同类产品一致） */}
        <div className="flex items-center gap-2 px-1">
          <ModelPicker />
          <ContextUsageBar />
          <div
            className={cn(
              'flex items-center gap-1 rounded-lg border border-border bg-input px-2 py-1',
              !canReasoning && 'opacity-50',
            )}
            title={canReasoning ? 'reasoning: adaptive = 按需思考, off = 直接回答, low~max = 强制思考强度（档位随模型能力变化）' : '该模型不支持思考模式'}
          >
            <Brain className="h-3 w-3 flex-none text-muted-foreground" />
            <select
              value={reasoningValue}
              disabled={!canReasoning || streaming}
              onChange={(e) => {
                const opt = reasoningOptions.find((o) => o.value === e.target.value)
                if (opt) setReasoningPref(opt.option)
              }}
              className="bg-transparent text-[11px] text-muted-foreground outline-none disabled:cursor-not-allowed [&>option]:bg-card [&>option]:text-foreground"
            >
              {reasoningOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={streaming ? '正在回复…' : '输入消息，Enter 发送，Shift+Enter 换行；可拖拽文件到这里'}
          disabled={streaming}
          autoComplete="off"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() }
          }}
          className="max-h-[180px] min-h-[44px] w-full resize-y border-none bg-transparent px-1 py-1.5 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />

        <div className="flex items-center justify-end gap-2.5">
          <span className="mr-auto text-[11px] text-muted-foreground animate-fade-in">
            {!streaming && draft && 'Enter 发送 · Shift+Enter 换行'}
          </span>
          {!streaming && (
            <>
              <button
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted-foreground transition-all hover:bg-muted hover:text-primary"
                title="上传附件（最大 50MB）"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => { void uploadFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
            </>
          )}
          {!streaming ? (
            <div className="flex items-center gap-2">
              <button
                className="flex h-9 items-center gap-1.5 rounded-xl border border-primary/30 px-3 text-[13px] font-medium text-primary transition-all hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-40"
                title="Vibe 模式：把输入作为目标，Agent 自动多轮执行直到完成（最长 5 轮/15 分钟）"
                disabled={!draft.trim() || uploading}
                onClick={() => void handleVibe()}
              >
                <Rocket className="h-3.5 w-3.5" />
                Vibe
              </button>
              <button
                className="gradient-brand flex items-center gap-2 rounded-xl px-5 py-2 text-[13px] font-semibold text-white shadow-[0_3px_16px_rgba(77,107,254,0.35)] transition-all hover:-translate-y-px hover:brightness-110 active:translate-y-0 disabled:pointer-events-none disabled:opacity-40"
                disabled={(!draft.trim() && !attachments.length) || uploading}
                onClick={() => void handleSend()}
              >
                {uploading ? '上传中…' : '发送'}
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-5 py-2 text-[13px] font-semibold text-destructive transition-all hover:scale-[1.03] hover:bg-destructive/20" onClick={cancelStream}>
              <Square className="h-2.5 w-2.5 fill-current" />
              停止
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
