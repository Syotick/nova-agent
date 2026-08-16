import { useMainStore } from '../store'
import ChatView from './ChatView'
import TrajectoryView from './TrajectoryView'
import SkillManager from './SkillManager'
import TaskManager from './TaskManager'
import ToolManager from './ToolManager'
import ModelChannels from './ModelChannels'
import { fmtTokens } from '../lib/utils'

interface Props {
  view: string
  onNavigate: (view: string) => void
}

export default function MainPane({ view }: Props) {
  const agents = useMainStore((s) => s.agents)
  const currentAgentId = useMainStore((s) => s.currentAgentId)
  const currentSessionId = useMainStore((s) => s.currentSessionId)
  const sessions = useMainStore((s) => s.sessions)
  const currentModelLabel = useMainStore((s) => s.currentModelLabel())
  const currentAgent = agents.find((a) => a.id === currentAgentId)

  // 当前会话累计 token 用量（assistant 消息的 tokens 求和）
  const session = sessions.find((s) => s.id === currentSessionId)
  const sessionTokens = (session?.messages ?? []).reduce(
    (acc, m) => {
      if (m.tokens) {
        acc.input += m.tokens.input ?? 0
        acc.output += m.tokens.output ?? 0
      }
      return acc
    },
    { input: 0, output: 0 },
  )
  const hasSessionTokens = sessionTokens.input > 0 || sessionTokens.output > 0

  const isChatView = view === 'chat' || view === 'trajectory'
  const headerMeta: Record<string, { icon: string; title: string; sub: string }> = {
    models: { icon: '🧠', title: '模型渠道', sub: 'Model Providers' },
    skills: { icon: '📚', title: '技能管理', sub: 'Skills' },
    tasks: { icon: '⏱️', title: '定时任务', sub: 'Tasks' },
    tools: { icon: '🧰', title: '工具浏览', sub: 'Tools' },
  }
  const meta = headerMeta[view]

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex h-[60px] flex-none items-center border-b border-border bg-card/40 px-6 backdrop-blur-xl">
        {isChatView ? (
          <div className="flex items-center gap-3">
            <span
              className="flex h-8.5 w-8.5 items-center justify-center rounded-[11px] text-[15px] font-bold text-white shadow-[0_2px_14px_rgba(77,107,254,0.3)]"
              style={{ background: currentAgent?.color || '#6d8bff', width: 34, height: 34 }}
            >
              {(currentAgent?.name || '?').charAt(0)}
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-[15px] font-semibold">{currentAgent?.name || '未选择 Agent'}</span>
              {/* 模型切换已移到输入框工具栏（与同类产品一致）；这里只读展示 */}
              <span className="font-mono text-[11px] tracking-wide text-muted-foreground">{currentModelLabel || '未设置模型'}</span>
            </div>
            {/* 当前会话累计 token 用量 */}
            {hasSessionTokens && (
              <span
                className="ml-3 flex items-center gap-1.5 rounded-lg border border-border bg-muted/60 px-2.5 py-1 font-mono text-[10px] text-muted-foreground"
                title={`本会话累计：输入 ${sessionTokens.input.toLocaleString()} tokens · 输出 ${sessionTokens.output.toLocaleString()} tokens`}
              >
                <span>↑{fmtTokens(sessionTokens.input)}</span>
                <span>↓{fmtTokens(sessionTokens.output)}</span>
                <span className="text-primary">Σ{fmtTokens(sessionTokens.input + sessionTokens.output)}</span>
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-xl">{meta?.icon}</span>
            <div className="flex flex-col leading-tight">
              <span className="text-[15px] font-semibold">{meta?.title}</span>
              <span className="font-mono text-[11px] tracking-wide text-muted-foreground">{meta?.sub}</span>
            </div>
          </div>
        )}
      </header>

      <div className="relative h-full min-h-0 flex-1 overflow-hidden">
        {view === 'chat' && <ChatView key="chat" />}
        {view === 'trajectory' && <TrajectoryView key="traj" />}
        {view === 'models' && <ModelChannels key="models" />}
        {view === 'skills' && <SkillManager key="skills" />}
        {view === 'tasks' && <TaskManager key="tasks" />}
        {view === 'tools' && <ToolManager key="tools" />}
      </div>
    </main>
  )
}
