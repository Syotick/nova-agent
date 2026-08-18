// 工作区选择器：常驻在对话区顶部——显示当前工作区路径，点击弹出设置（随时可切换，不再只靠首启弹窗）
import { useState } from 'react'
import { FolderOpen, ChevronsUpDown } from 'lucide-react'
import { useMainStore } from '../store'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import WorkspaceForm from './WorkspaceForm'

export default function WorkspacePicker() {
  const workspace = useMainStore((s) => s.workspace)
  const [open, setOpen] = useState(false)

  // 截断中间显示（前面留 14 字符、后面留 24 字符），完整路径放 title
  function midTruncate(p: string): string {
    if (p.length <= 40) return p
    return `${p.slice(0, 14)}…${p.slice(-24)}`
  }

  return (
    <>
      <button
        className="mx-6 mt-2.5 flex flex-none w-fit items-center gap-2 rounded-lg border border-border/80 bg-card/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        title={workspace?.resolved ?? '点击设置工作区'}
        onClick={() => setOpen(true)}
      >
        <FolderOpen className="h-3.5 w-3.5 text-primary" />
        <span className="max-w-[260px] truncate font-mono">{workspace ? midTruncate(workspace.resolved) : '未加载'}</span>
        {workspace && !workspace.isDefault && (
          <span className="rounded-full bg-warning/15 px-1.5 py-px text-[10px] font-medium text-warning">自定义</span>
        )}
        <ChevronsUpDown className="h-3 w-3 text-muted-foreground" />
      </button>

      <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>工作区</DialogTitle>
            <DialogDescription>Agent 的文件操作（filesystem 工具）与附件上传都以此为根。建议为任务选择专属目录，留空用兜底工具区。</DialogDescription>
          </DialogHeader>
          <WorkspaceForm />
        </DialogContent>
      </Dialog>
    </>
  )
}
