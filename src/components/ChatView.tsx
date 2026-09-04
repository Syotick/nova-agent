import { Scissors, Rocket } from 'lucide-react'
import { useMainStore } from '../store'
import MessageList from './MessageList'
import Composer from './Composer'
import WelcomePanel from './WelcomePanel'

export default function ChatView() {
  const sessions = useMainStore((s) => s.sessions)
  const currentSessionId = useMainStore((s) => s.currentSessionId)
  const error = useMainStore((s) => s.error)
  const compacting = useMainStore((s) => s.compacting)
  const compactSession = useMainStore((s) => s.compactSession)
  const vibeRound = useMainStore((s) => s.vibeRound)
  const send = useMainStore((s) => s.send)
  const currentSession = sessions.find((s) => s.id === currentSessionId)

  const canCompact = currentSession && currentSession.messages.length > 40 && !currentSession.summary

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col">
        {currentSession ? (
          <>
            {/* Vibe 运行指示 */}
            {vibeRound && (
              <div className="mx-6 mt-2.5 flex flex-none items-center gap-2 rounded-lg border border-primary/25 bg-primary/8 px-3.5 py-2 text-xs text-primary animate-fade-in">
                <Rocket className="h-3.5 w-3.5" />
                <span className="font-semibold">Vibe 运行中</span>
                <span className="text-muted-foreground">第 {vibeRound.round || 1}/{vibeRound.maxRounds} 轮 · Agent 正在自动执行，可随时停止</span>
              </div>
            )}
            {/* 压缩横幅 */}
            {(currentSession.summary || canCompact) && (
              <div className="mx-6 mt-2.5 flex flex-none items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-2 text-xs text-muted-foreground animate-fade-in">
                <Scissors className="h-3 w-3" />
                {currentSession.summary ? (
                  <>
                    <span className="flex-none font-semibold text-primary">
                      已压缩{currentSession.lastCompactRemoved ? ` ${currentSession.lastCompactRemoved} 条` : ''}
                      {currentSession.lastCompactTrigger === 'overflow' && <span className="ml-1.5 font-normal text-muted-foreground">（溢出自动恢复）</span>}
                    </span>
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
          <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto">
            <WelcomePanel onPick={(text) => void send(text)} />
          </div>
        )}      </div>
      <Composer />
    </div>
  )
}
