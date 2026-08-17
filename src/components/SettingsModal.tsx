import { useEffect, useState } from 'react'
import { KeyRound, Bell, Cable, Cpu, Check, FolderOpen, RotateCcw } from 'lucide-react'
import { useMainStore } from '../store'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { cn } from '../lib/utils'

interface Props {
  visible: boolean
  onClose: () => void
  onGoModels: () => void
}

// 全局设置：API Key / 通知 / MCP 状态 / 模型渠道入口
export default function SettingsModal({ visible, onClose, onGoModels }: Props) {
  const providerKeyStatus = useMainStore((s) => s.providerKeyStatus)
  const saveProviderKey = useMainStore((s) => s.saveProviderKey)
  const mcpServers = useMainStore((s) => s.mcpServers)
  const requestNotifyPermission = useMainStore((s) => s.requestNotifyPermission)
  const workspace = useMainStore((s) => s.workspace)
  const saveWorkspace = useMainStore((s) => s.saveWorkspace)
  const loadWorkspace = useMainStore((s) => s.loadWorkspace)

  const [keyInput, setKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [notif, setNotif] = useState<NotificationPermission>(() =>
    'Notification' in window ? Notification.permission : 'denied',
  )
  const [wsInput, setWsInput] = useState('')
  const [wsSaving, setWsSaving] = useState(false)
  const [wsSaved, setWsSaved] = useState(false)
  const [wsError, setWsError] = useState('')

  useEffect(() => {
    if (visible) {
      setKeyInput('')
      setSaved(false)
      // 打开时拉最新工作区配置 + 预填输入框
      void loadWorkspace()
      setWsInput(workspace?.configured ?? '')
      setWsSaved(false)
      setWsError('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  // 工作区从后端刷新后同步输入框（首次打开时 workspace 可能还没加载完）
  useEffect(() => {
    if (visible && workspace) setWsInput(workspace.configured ?? '')
  }, [workspace, visible])

  const saveKey = async () => {
    setSaving(true)
    try {
      await saveProviderKey('deepseek', keyInput.trim())
      setKeyInput('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const dsKeyStatus = providerKeyStatus['deepseek'] ?? 'none'

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

  const enableNotify = async () => {
    await requestNotifyPermission()
    setNotif('Notification' in window ? Notification.permission : 'denied')
  }

  return (
    <Dialog open={visible} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>API Key、通知与模型渠道</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* 模型渠道 */}
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/30 p-3">
            <Cpu className="h-4 w-4 flex-none text-primary" />
            <div className="flex flex-col leading-tight">
              <span className="text-[13px] font-medium">模型渠道</span>
              <span className="text-[11px] text-muted-foreground">配置 DeepSeek Key、添加自定义提供商（千问 / Kimi / GLM / 本地服务…）</span>
            </div>
            <Button variant="outline" className="ml-auto h-8 shrink-0 text-xs" onClick={onGoModels}>打开</Button>
          </div>

          {/* API Key */}
          <div className="flex flex-col gap-1.5">
            <Label className="flex items-center gap-1.5 text-[12px]">
              <KeyRound className="h-3.5 w-3.5 text-primary" />DeepSeek API Key
              <span className={cn(
                'rounded-full px-2 py-px text-[10px] font-medium',
                dsKeyStatus === 'configured' && 'bg-success/15 text-success',
                dsKeyStatus === 'env' && 'bg-warning/15 text-warning',
                dsKeyStatus === 'none' && 'bg-muted text-muted-foreground',
              )}>
                {dsKeyStatus === 'configured' ? '已配置' : dsKeyStatus === 'env' ? '环境变量' : '未配置'}
              </span>
              {saved && <span className="ml-auto flex items-center gap-0.5 text-[11px] text-success"><Check className="h-3 w-3" />已保存</span>}
            </Label>
            <div className="flex gap-2">
              <Input
                type="password"
                autoComplete="new-password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="粘贴 DeepSeek API Key（sk-...）"
                onKeyDown={(e) => { if (e.key === 'Enter') void saveKey() }}
                className="h-8.5 font-mono text-xs"
              />
              <Button onClick={() => void saveKey()} disabled={!keyInput.trim() || saving} className="h-8.5 shrink-0">
                {saving ? '保存中…' : '保存'}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">保存在项目外文件，AI 的工具无法读取。</p>
          </div>

          {/* 通知 */}
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/30 p-3">
            <Bell className="h-4 w-4 flex-none text-primary" />
            <div className="flex flex-col leading-tight">
              <span className="text-[13px] font-medium">任务完成通知</span>
              <span className="text-[11px] text-muted-foreground">
                {notif === 'granted' ? '已开启：定时任务完成时提醒' : '开启后定时任务完成时浏览器提醒'}
              </span>
            </div>
            <Button variant="outline" className="ml-auto h-8 shrink-0 text-xs" onClick={() => void enableNotify()} disabled={notif === 'granted'}>
              {notif === 'granted' ? '已开启' : notif === 'denied' ? '已被浏览器阻止' : '开启'}
            </Button>
          </div>

          {/* 工作区（Agent 文件权限边界） */}
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
                <span>Agent 的文件操作（filesystem 工具）与附件上传都以此为根。建议为每个任务选择一个专属目录；留空则用兜底工具区（项目内 <code className="rounded bg-muted px-1 font-mono text-[10px]">workspace/</code>）。支持相对路径（相对项目根）或绝对路径；MCP 配置里可用 <code className="rounded bg-muted px-1 font-mono text-[10px]">{"{{workspace}}"}</code> 占位符引用。</span>
              </div>
            )}
          </div>

          {/* MCP 服务器 */}
          <div className="flex flex-col gap-1.5">
            <Label className="flex items-center gap-1.5 text-[12px]">
              <Cable className="h-3.5 w-3.5 text-primary" />MCP 服务器
              <span className="rounded-full bg-muted px-2 py-px text-[10px] text-muted-foreground">{mcpServers.length} 个</span>
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {mcpServers.map((srv) => (
                <span key={srv.id} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{srv.name}</span>
              ))}
              {!mcpServers.length && <span className="text-[11px] text-muted-foreground">未配置 MCP 服务器</span>}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
