// 工作区设置表单（Agent 文件权限边界）——共享：设置页 & 对话区顶部的 WorkspacePicker 都用它
import { useEffect, useState } from 'react'
import { Check, FolderOpen, RotateCcw } from 'lucide-react'
import { useMainStore } from '../store'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { cn } from '../lib/utils'

export default function WorkspaceForm({ compact }: { compact?: boolean }) {
  const workspace = useMainStore((s) => s.workspace)
  const saveWorkspace = useMainStore((s) => s.saveWorkspace)
  const loadWorkspace = useMainStore((s) => s.loadWorkspace)

  const [wsInput, setWsInput] = useState('')
  const [wsSaving, setWsSaving] = useState(false)
  const [wsSaved, setWsSaved] = useState(false)
  const [wsError, setWsError] = useState('')

  // 挂载即拉最新配置并回填输入框
  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])
  useEffect(() => {
    if (workspace) setWsInput(workspace.configured ?? '')
  }, [workspace])

  const saveWs = async (pathOverride?: string) => {
    setWsSaving(true)
    setWsError('')
    try {
      const err = await saveWorkspace(pathOverride ?? wsInput.trim())
      if (err) {
        setWsError(err)
      } else {
        setWsSaved(true)
        setTimeout(() => setWsSaved(false), 2000)
      }
    } finally {
      setWsSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="flex items-center gap-1.5 text-[12px]">
        <FolderOpen className="h-3.5 w-3.5 text-primary" />工作区
        {workspace && !workspace.isDefault && (
          <span className="rounded-full bg-warning/15 px-2 py-px text-[10px] font-medium text-warning">自定义</span>
        )}
        {wsSaved && <span className="ml-auto flex items-center gap-0.5 text-[11px] text-success"><Check className="h-3 w-3" />已保存</span>}
      </Label>
      <div className="flex gap-2">
        <Input
          value={wsInput}
          onChange={(e) => { setWsInput(e.target.value); setWsError('') }}
          onKeyDown={(e) => { if (e.key === 'Enter') void saveWs() }}
          placeholder="留空 = 兜底工具区（项目内 workspace/）"
          autoComplete="off"
          className="h-8.5 font-mono text-xs"
        />
        <Button onClick={() => void saveWs()} disabled={wsSaving} className="h-8.5 shrink-0">
          {wsSaving ? '保存中…' : '保存'}
        </Button>
        {workspace && !workspace.isDefault && (
          <Button
            variant="outline"
            className="h-8.5 shrink-0 px-2.5"
            title="重置为默认 workspace/"
            onClick={() => { setWsInput(''); void saveWs('') }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {wsError && <p className="text-[11px] text-destructive">{wsError}</p>}
      {workspace?.reconnected?.some((r) => !r.ok) && (
        <p className="text-[11px] text-warning">
          工作区已保存，但以下 MCP 服务器重连失败：{workspace.reconnected.filter((r) => !r.ok).map((r) => r.serverId).join('、')}（可在 MCP 管理页手动重连）
        </p>
      )}
      {workspace && (
        <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-muted/30 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="flex-1 truncate font-mono" title={workspace.resolved}>{workspace.resolved}</span>
            <span className={cn(
              'flex-none rounded-full px-1.5 py-px text-[10px]',
              workspace.exists ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning',
            )}>
              {workspace.exists ? '已存在' : '不存在（自动创建）'}
            </span>
          </span>
          {!compact && (
            <span>Agent 的文件操作（filesystem 工具）与附件上传都以此为根。支持相对路径（相对项目根）或绝对路径；MCP 配置里可用 <code className="rounded bg-muted px-1 font-mono text-[10px]">{"{{workspace}}"}</code> 占位符引用。留空则用兜底工具区（项目内 <code className="rounded bg-muted px-1 font-mono text-[10px]">workspace/</code>）。</span>
          )}
        </div>
      )}
    </div>
  )
}