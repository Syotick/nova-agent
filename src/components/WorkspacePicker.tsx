// 工作区选择器：输入框工具栏的紧凑入口——显示当前目录名，点击弹出设置（随时可切换）
import { useState } from 'react'
import { FolderOpen, ChevronsUpDown } from 'lucide-react'
import { useMainStore } from '../store'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import WorkspaceForm from './WorkspaceForm'

export default function WorkspacePicker() {
  const workspace = useMainStore((s) => s.workspace)
  const [open, setOpen] = useState(false)

  // 显示最后一段目录名（紧凑）；完整路径放 title
  const basename = workspace ? (workspace.resolved.split(/[\\/]/).filter(Boolean).pop() ?? workspace.resolved) : ''

  return (
    <>
      <button
        className="flex h-7 max-w-[180px] items-center gap-1.5 rounded-lg border border-border bg-input px-2 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        title={workspace ? `${workspace.resolved}（点击切换，留空=兜底 workspace/）` : '点击设置工作区'}
        onClick={() => setOpen(true)}
      >
        <FolderOpen className="h-3 w-3 flex-none text-primary" />
        <span className="min-w-0 truncate font-mono">{basename || '工作区'}</span>
        {workspace && !workspace.isDefault && (
          <span className="flex-none rounded-full bg-warning/15 px-1 py-px text-[9px] font-medium text-warning">自定义</span>
        )}
        <ChevronsUpDown className="h-3 w-3 flex-none text-muted-foreground opacity-60" />
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
