import { useEffect, useRef, useState } from 'react'
import { useMainStore } from '../store'
import { Paperclip, Bot } from 'lucide-react'
import ToolCallCard from './ToolCallCard'
import ThinkingOrb from './ThinkingOrb'
import { renderMarkdown, renderStreaming } from '../markdown'
import { cn, fmtSize, fmtTokens } from '../lib/utils'
import type { Message, MessageSegment } from '../types'

function isImage(att: { mime: string }) { return att.mime.startsWith('image/') }

// 时间线分段渲染：文本块与工具调用按发生顺序交错（DSH 风格）
function renderSegments(segments: MessageSegment[], streaming?: boolean) {
  return (
    <>
      {segments.map((seg, i) => (
        seg.kind === 'text' ? (
          <div key={`t${i}`} className="markdown-body" dangerouslySetInnerHTML={{
            __html: streaming ? renderStreaming(seg.text) : renderMarkdown(seg.text),
          }} />
        ) : (
          <ToolCallCard key={`c${i}-${seg.call.id}`} call={seg.call} />
        )
      ))}
    </>
  )
}

export default function MessageList() {
  const sessions = useMainStore((s) => s.sessions)
  const currentSessionId = useMainStore((s) => s.currentSessionId)
  const streaming = useMainStore((s) => s.streaming)
  const currentText = useMainStore((s) => s.currentText)
  const currentToolCalls = useMainStore((s) => s.currentToolCalls)
  const currentSegments = useMainStore((s) => s.currentSegments)
  const [visibleLimit, setVisibleLimit] = useState(100)
  const listRef = useRef<HTMLDivElement>(null)  // 思考计时：流式且尚无可见输出（思考/等工具阶段）时每秒累计；有输出或结束即归零
  const [thinkSeconds, setThinkSeconds] = useState(0)
  useEffect(() => {
    const active = streaming && !currentText && currentSegments.length === 0
    if (!active) { setThinkSeconds(0); return }
    const t = setInterval(() => setThinkSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [streaming, currentText, currentSegments])

  const currentSession = sessions.find((s) => s.id === currentSessionId)
  const messages = currentSession?.messages ?? []
  const visibleMessages = messages.length > visibleLimit ? messages.slice(-visibleLimit) : messages
  const hasOlder = messages.length > visibleLimit
  const olderCount = messages.length - visibleLimit

  const scrollBottom = () => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  // 新消息/流式文本变化 → 滚到底
  useEffect(() => { scrollBottom() }, [currentText, currentSegments])
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [currentSession?.id])

  // 搜索跳转：命中消息不在窗口内 → 拉满
  useEffect(() => {
    const handler = (e: Event) => {
      const mid = (e as CustomEvent).detail as string
      const target = document.querySelector(`[data-mid="${mid}"]`)
      if (!target && hasOlder) {
        setVisibleLimit(messages.length)
        setTimeout(() => {
          const el = document.querySelector(`[data-mid="${mid}"]`)
          el?.scrollIntoView({ block: 'center' })
          el?.classList.add('search-hit')
          setTimeout(() => el?.classList.remove('search-hit'), 2500)
        }, 50)
      }
    }
    window.addEventListener('nova:search-jump', handler)
    return () => window.removeEventListener('nova:search-jump', handler)
  }, [hasOlder, messages.length])

  const loadEarlier = () => {
    const el = listRef.current
    const prevHeight = el ? el.scrollHeight : 0
    const prevTop = el?.scrollTop ?? 0
    setVisibleLimit((v) => v + 100)
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevHeight + prevTop
    })
  }

  const renderBubble = (msg: Message) => (
    <div className={cn('msg-bubble max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed', msg.role === 'user' ? 'gradient-brand text-white shadow-[0_4px_20px_rgba(77,107,254,0.28)] rounded-br-md' : 'glass border border-border rounded-bl-md')}>
      {msg.attachments && msg.attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {msg.attachments.map((att) => {
            const href = `/api/uploads/${att.path.split('/').pop()}`
            return isImage(att) ? (
              <a key={att.id} href={href} target="_blank" rel="noopener noreferrer" className="block">
                <img src={href} alt={att.name} loading="lazy" className="block max-h-[160px] max-w-[220px] rounded-xl border border-border object-cover transition-transform hover:scale-[1.02]" />
              </a>
            ) : (
              <a key={att.id} href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-1.5 text-xs transition-colors hover:border-primary/50">
                <Paperclip className="h-3.5 w-3.5 flex-none text-muted-foreground" />
                <span className="max-w-[160px] truncate">{att.name}</span>
                <span className="text-[11px] text-muted-foreground">{fmtSize(att.size)}</span>
              </a>
            )
          })}
        </div>
      )}
      {/* 时间线分段：文本与工具按发生顺序交错；旧消息回退（文本 + 工具列表） */}
      {msg.segments?.length
        ? renderSegments(msg.segments)
        : (
          <>
            <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
            {msg.toolCalls?.map((tc) => <ToolCallCard key={tc.id} call={tc} />)}
          </>
        )}
      {/* token 用量（assistant 消息） */}
      {msg.role === 'assistant' && msg.tokens && (msg.tokens.input > 0 || msg.tokens.output > 0) && (
        <div className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground/80" title={`输入 ${msg.tokens.input.toLocaleString()} tokens · 输出 ${msg.tokens.output.toLocaleString()} tokens`}>
          <span className="rounded bg-muted px-1.5 py-px">↑{fmtTokens(msg.tokens.input)}</span>
          <span className="rounded bg-muted px-1.5 py-px">↓{fmtTokens(msg.tokens.output)}</span>
          <span className="rounded bg-primary/10 px-1.5 py-px text-primary">Σ{fmtTokens(msg.tokens.input + msg.tokens.output)}</span>
        </div>
      )}
    </div>
  )

  return (
    <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-6 pb-7 pt-7 scroll-smooth">
      {hasOlder && (
        <div className="pb-3.5 text-center">
          <button className="rounded-full border border-border bg-card/70 px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary" onClick={loadEarlier}>
            加载更早的消息（还有 {olderCount} 条）
          </button>
        </div>
      )}
      <div className="mx-auto flex max-w-[860px] flex-col gap-4">
        {visibleMessages.map((msg) => (
          <div key={msg.id} data-mid={msg.id} className={cn('flex gap-3 rounded-xl transition-colors', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            {msg.role === 'assistant' && (
              <div className="mt-0.5 flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[10px] border border-border bg-muted shadow-[0_2px_10px_rgba(0,0,0,0.25)]">
                <Bot className="h-4 w-4 text-primary" />
              </div>
            )}
            {renderBubble(msg)}
          </div>
        ))}

        {/* 流式中的临时消息（时间线交错：文本与工具按发生顺序） */}
        {(streaming || currentText || currentToolCalls.length > 0 || currentSegments.length > 0) && (
          <div className="flex gap-3 animate-fade-in-up">
            <div className="mt-0.5 flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[10px] border border-border bg-muted">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="glass max-w-[82%] rounded-2xl rounded-bl-md border border-primary/35 px-4 py-3 text-sm leading-relaxed shadow-glow">
              {currentSegments.length > 0 ? (
                renderSegments(currentSegments, true)
              ) : (
                <>
                  {currentText ? (
                    <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderStreaming(currentText) }} />
                  ) : (
                    <div className="flex items-center gap-2.5">
                      <ThinkingOrb active={streaming} />
                      <span
                        className="markdown-body"
                        dangerouslySetInnerHTML={{
                          __html: '<span class="text-muted-foreground text-[13px]">思考中 · <span class="text-primary font-medium tabular-nums">' +
                            String(thinkSeconds) + '</span>s</span><span class="inline-flex gap-0.5 ml-1.5 align-middle">' +
                            '<i class="h-1 w-1 rounded-full bg-primary animate-bounce" style="animation-delay:0s"></i>' +
                            '<i class="h-1 w-1 rounded-full bg-primary animate-bounce" style="animation-delay:0.15s"></i>' +
                            '<i class="h-1 w-1 rounded-full bg-primary animate-bounce" style="animation-delay:0.3s"></i></span>',
                        }}
                      />
                    </div>
                  )}
                  {currentToolCalls.map((tc) => <ToolCallCard key={'s' + tc.id} call={tc} />)}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
