import { useMainStore } from '../store'
import MessageList from './MessageList'
import Composer from './Composer'

export default function ChatView() {
  const sessions = useMainStore((s) => s.sessions)
  const currentSessionId = useMainStore((s) => s.currentSessionId)
  const error = useMainStore((s) => s.error)
  const compacting = useMainStore((s) => s.compacting)
  const compactSession = useMainStore((s) => s.compactSession)
  const currentSession = sessions.find((s) => s.id === currentSessionId)

  const canCompact = currentSession && currentSession.messages.length > 40 && !currentSession.summary

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col">
        {currentSession ? (
          <>
            {/* 压缩横幅 */}
            {(currentSession.summary || canCompact) && (
              <div className="mx-6 mt-2.5 flex flex-none items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-2 text-xs text-muted-foreground animate-fade-in">
                <span className="text-primary">✂</span>
                {currentSession.summary ? (
                  <>
                    <span className="flex-none font-semibold text-primary">已压缩</span>
                    <span className="min-w-0 flex-1 truncate" title={currentSession.summary}>{currentSession.summary}</span>
                  </>
                ) : (
                  <>
                    <span className="flex-none font-semibold text-primary">会话较长（{currentSession.messages.length} 条消息）</span>
                    <button
                      className="flex-none rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs text-primary transition-all hover:brightness-125 disabled:opacity-50"
                      disabled={compacting}
                      onClick={() => void compactSession()}
                    >
                      {compacting ? '压缩中…' : '压缩上下文'}
                    </button>
                  </>
                )}
              </div>
            )}
            <MessageList />
            {error && (
              <div className="mx-6 mb-2 flex flex-none items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-[13px] text-destructive animate-fade-in">
                <span className="h-1.5 w-1.5 flex-none rounded-full bg-destructive shadow-[0_0_8px_rgba(248,113,113,0.7)]" />
                {error}
              </div>
            )}
          </>
        ) : (
          <div className="relative flex flex-1 flex-col items-center justify-center gap-3 overflow-hidden pb-10">
            <div className="pointer-events-none absolute h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle_at_40%_35%,rgba(139,123,255,0.15),rgba(77,107,254,0.07)_45%,transparent_70%)] blur-2xl" />
            <div className="gradient-brand relative flex h-13 w-13 animate-bounce-slow items-center justify-center rounded-2xl shadow-[0_8px_30px_rgba(77,107,254,0.35)]" style={{ width: 52, height: 52, animation: 'fadeInUp 0.4s ease-out' }}>
              <span className="text-2xl">✨</span>
            </div>
            <h2 className="relative text-xl font-bold">直接对话</h2>
            <p className="relative text-[13px] text-muted-foreground">在下方输入消息，即可开始 —— 不需要先新建会话</p>
          </div>
        )}
      </div>
      <Composer />
    </div>
  )
}
