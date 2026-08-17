// 首次运行引导：选择工作区（Codex 式目录选择）。可跳过 → 使用兜底工具区（项目内 workspace/）
import { useEffect, useState } from 'react'
import { FolderOpen, ArrowRight, X } from 'lucide-react'
import { useMainStore } from '../store'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'

const ONBOARDED_KEY = 'nova.workspace.onboarded'

export default function WorkspaceOnboarding() {
  const workspace = useMainStore((s) => s.workspace)
  const saveWorkspace = useMainStore((s) => s.saveWorkspace)
  const [open, setOpen] = useState(false)
  const [path, setPath] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 已加载、仍是默认（未配置）、且本浏览器从未引导过 → 弹窗
  useEffect(() => {
    if (!workspace || !workspace.isDefault) return
    if (localStorage.getItem(ONBOARDED_KEY)) return
    setOpen(true)
    localStorage.setItem(ONBOARDED_KEY, '1') // 立即标记：跳过/保存都只引导一次
  }, [workspace])

  const close = () => setOpen(false)

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const err = await saveWorkspace(path.trim())
      if (err) {
        setError(err)
      } else {
        close()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-primary" />选择一个工作区
          </DialogTitle>
          <DialogDescription>
            工作区是 Agent 的文件权限边界——它只能读写你选定的这个文件夹（类似 Codex / Claude Code 的目录选择）。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Input
              value={path}
              onChange={(e) => { setPath(e.target.value); setError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') void save() }}
              placeholder="如 D:\projects\myapp 或 my-app（相对项目根）"
              autoComplete="off"
              className="h-8.5 font-mono text-xs"
            />
            <Button onClick={() => void save()} disabled={saving} className="h-8.5 shrink-0">
              {saving ? '保存中…' : '选择'}
              {!saving && <ArrowRight className="ml-1 h-3.5 w-3.5" />}
            </Button>
          </div>
          {error && <p className="text-[11px] text-destructive">{error}</p>}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            留空并跳过的话，Agent 将使用兜底工具区（项目内 <code className="rounded bg-muted px-1 font-mono text-[10px]">workspace/</code>），之后随时可在
            设置 → 工作区 更改。附件上传与 filesystem 工具都以此为根。
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            <X className="mr-1 h-3.5 w-3.5" />跳过（用默认）
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}