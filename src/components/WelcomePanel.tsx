// 欢迎面板：AI 对话应用首屏的"有内容"状态（大标题 + 可点击示例问题）
// 无会话 / 有会话但无消息时显示；点击示例 = 直接以该文本发送
import { FileText, Rocket, Search, FolderOpen } from 'lucide-react'

const SUGGESTIONS = [
  {
    icon: <FileText className="h-4 w-4" />,
    title: '让它写个文件',
    text: '在工作区创建一个 README.md，写一段简短的项目介绍',
  },
  {
    icon: <Rocket className="h-4 w-4" />,
    title: '试试 Vibe 目标',
    text: '用 Vibe 写一个计算器页面，然后用 node 跑通它',
  },
  {
    icon: <Search className="h-4 w-4" />,
    title: '问点什么',
    text: 'MCP 协议是什么？用搜索工具查一下并用大白话解释',
  },
  {
    icon: <FolderOpen className="h-4 w-4" />,
    title: '看看工作区',
    text: '列出工作区里有哪些文件，并讲讲它们的结构',
  },
]

export default function WelcomePanel({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col items-center gap-6 px-6 pb-8 pt-16">
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 className="text-2xl font-bold tracking-tight">今天想让它帮你做什么？</h2>
        <p className="text-[13px] text-muted-foreground">输入问题直接开始，或点下面的示例——它会读写文件、搜资料、甚至自己跑起来验证</p>
      </div>

      <div className="grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            onClick={() => onPick(s.text)}
            className="group flex items-start gap-3 rounded-xl border border-border/80 bg-card/50 px-3.5 py-3 text-left backdrop-blur-sm transition-all hover:border-primary/40 hover:bg-card/80 hover:shadow-[0_4px_20px_rgba(77,107,254,0.12)]"
          >
            <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
              {s.icon}
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[13px] font-semibold">{s.title}</span>
              <span className="text-[12px] leading-relaxed text-muted-foreground">{s.text}</span>
            </span>
          </button>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground/80">提示：工作区决定了它能碰哪些文件，可点输入框旁的 📁 切换</p>
    </div>
  )
}