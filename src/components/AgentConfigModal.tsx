import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useMainStore } from '../store'
import { Button } from './ui/button'
import { Input, Textarea } from './ui/input'
import { Label } from './ui/label'
import { Checkbox } from './ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { cn } from '../lib/utils'
import type { Agent } from '../types'

const PALETTE = ['#4d6bfe', '#8b7bff', '#38bdf8', '#34d399', '#fbbf24', '#f87171', '#f472b6', '#22d3ee']

// 内置工具勾选清单（与后端 builtinToolDefs 对应；load_skill 不进清单——它随"勾选技能"自动装配）
const BUILTIN_TOOLS: Array<{ id: string; label: string; desc: string }> = [
  { id: 'web_search', label: '搜索', desc: '在线搜索' },
  { id: 'run_command', label: '终端', desc: '执行命令/启动项目' },
  { id: 'glob', label: '文件匹配', desc: '按文件名找文件' },
  { id: 'remember', label: '记忆', desc: '跨会话记忆' },
  { id: 'subagent', label: '子代理', desc: '任务分发' },
]
const ALL_BUILTIN = BUILTIN_TOOLS.map((x) => x.id)

interface Props {
  visible: boolean
  editingAgent: Agent | null
  onClose: () => void
}

interface FormState {
  name: string
  model: string
  persona: string
  mcpServerIds: string[]
  skillIds: string[]
  builtinTools: string[]
  color: string
}

export default function AgentConfigModal({ visible, editingAgent, onClose }: Props) {
  const store = useMainStore()
  const [form, setForm] = useState<FormState>({ name: '', model: '', persona: '', mcpServerIds: [], skillIds: [], builtinTools: [...ALL_BUILTIN], color: PALETTE[0] })
  const [formProvider, setFormProvider] = useState('')
  const [formModelId, setFormModelId] = useState('')
  const [skillSearch, setSkillSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const editing = Boolean(editingAgent)
  const currentProvider = store.models.find((p) => p.id === formProvider)
  const currentModels = currentProvider?.models ?? []
  // 所选渠道未配置 key（项目外文件或环境变量都没有）时提示
  const providerNoKey = currentProvider ? (store.providerKeyStatus[formProvider] ?? 'none') === 'none' : false

  const filteredSkills = skillSearch.trim()
    ? store.skills.filter((s) => s.name.toLowerCase().includes(skillSearch.toLowerCase()) || s.description.toLowerCase().includes(skillSearch.toLowerCase()) || s.id.toLowerCase().includes(skillSearch.toLowerCase()))
    : store.skills

  // 打开时初始化表单
  useEffect(() => {
    if (!visible) return
    setSkillSearch('')
    if (editingAgent) {
      setForm({
        name: editingAgent.name,
        model: editingAgent.model,
        persona: editingAgent.persona,
        mcpServerIds: [...editingAgent.mcpServerIds],
        skillIds: [...editingAgent.skillIds],
        builtinTools: editingAgent.builtinTools?.length ? [...editingAgent.builtinTools] : [...ALL_BUILTIN],
        color: editingAgent.color,
      })
    } else {
      setForm({ name: '', model: store.defaultModelId(), persona: 'You are a helpful assistant. 用中文回答。', mcpServerIds: [], skillIds: [], builtinTools: [...ALL_BUILTIN], color: PALETTE[Math.floor(Math.random() * PALETTE.length)] })
    }
  }, [visible, editingAgent])

  // 解析 form.model → provider + modelId
  useEffect(() => {
    if (!visible) return
    const providers = store.models
    if (!providers.length) return
    const slash = form.model.indexOf('/')
    let pid = slash > 0 ? form.model.slice(0, slash) : ''
    let mid = slash > 0 ? form.model.slice(slash + 1) : form.model
    if (!pid) {
      const hit = providers.find((p) => p.models.some((m) => m.id === mid))
      if (hit) pid = hit.id
      // 找不到匹配 provider：保留空（保存时用原 form.model，不做静默覆盖）
    }
    // 校验 provider 存在且包含该模型；不匹配则置空选择（防止保存时静默覆盖）
    const provider = providers.find((p) => p.id === pid)
    if (!provider || !provider.models.some((m) => m.id === mid)) {
      pid = ''
      mid = ''
    }
    setFormProvider(pid)
    setFormModelId(mid)
  }, [visible, form.model, store.models])

  const save = async () => {
    // 若模型选择无效（原模型不在注册表且用户未改），保留原 form.model
    const finalForm = { ...form, model: formProvider && formModelId ? `${formProvider}/${formModelId}` : form.model }
    setSaving(true)
    try {
      if (editingAgent) {
        await store.updateAgent(editingAgent.id, finalForm)
      } else {
        await store.createAgent(finalForm)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={visible} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[84vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? '编辑 Agent' : '新建 Agent'}</DialogTitle>
          <DialogDescription>配置助手的人设、模型、工具与技能</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3.5">
          <div className="grid grid-cols-[1fr_70px] gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>名称</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：浏览器助手" autoComplete="off" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>颜色</Label>
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="h-9 w-full cursor-pointer rounded-lg border border-border bg-input p-1"
              />
            </div>
          </div>

          {/* 模型两级选择 */}
          <div className="flex flex-col gap-1.5">
            <Label>模型</Label>
            <div className="grid grid-cols-[46%_1fr] gap-2">
              <select
                value={formProvider}
                onChange={(e) => {
                  const p = store.models.find((x) => x.id === e.target.value)
                  setFormProvider(e.target.value)
                  setFormModelId(p?.models[0]?.id ?? '')
                }}
                className="h-9 rounded-lg border border-border bg-input px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {store.models.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select
                value={formModelId}
                onChange={(e) => setFormModelId(e.target.value)}
                className="h-9 rounded-lg border border-border bg-input px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {currentModels.map((m) => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}
              </select>
            </div>
            {currentProvider?.baseUrl && (
              <p className="text-[11px] text-muted-foreground">服务地址：<code className="rounded bg-primary/10 px-1 font-mono text-primary">{currentProvider.baseUrl}</code></p>
            )}
            {providerNoKey && (
              <p className="flex items-start gap-1 rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-[11px] text-warning">
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5 flex-none" />
                该渠道尚未配置 API Key，调用会失败。请先到「模型渠道」页填写 {formProvider} 的 key。
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>系统提示词（persona）</Label>
            <Textarea rows={3} value={form.persona} onChange={(e) => setForm({ ...form, persona: e.target.value })} placeholder="定义这个 Agent 的身份与行为…" />
          </div>

          {/* 工具 */}
          <div className="flex flex-col gap-2">
            <Label>工具（MCP Servers）</Label>
            <div className="grid grid-cols-2 gap-2">
              {store.mcpServers.map((srv) => {
                const checked = form.mcpServerIds.includes(srv.id)
                return (
                  <label
                    key={srv.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-[13px] transition-all',
                      checked ? 'border-primary/35 bg-primary/10' : 'border-border bg-muted/30 hover:bg-muted',
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        setForm({
                          ...form,
                          mcpServerIds: v
                            ? [...form.mcpServerIds, srv.id]
                            : form.mcpServerIds.filter((x) => x !== srv.id),
                        })
                      }}
                    />
                    <span className="font-medium">{srv.name}</span>
                  </label>
                )
              })}
              {!store.mcpServers.length && <div className="text-xs text-muted-foreground">暂无 MCP 服务器</div>}
            </div>
          </div>

          {/* 内置工具（默认全选；取消勾选 = 该 Agent 不可用对应工具，作用于所有会话） */}
          <div className="flex flex-col gap-2">
            <Label>内置工具</Label>
            <div className="grid grid-cols-2 gap-2">
              {BUILTIN_TOOLS.map((tool) => {
                const checked = form.builtinTools.includes(tool.id)
                return (
                  <label
                    key={tool.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-[13px] transition-all',
                      checked ? 'border-primary/35 bg-primary/10' : 'border-border bg-muted/30 hover:bg-muted',
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        setForm({
                          ...form,
                          builtinTools: v
                            ? [...form.builtinTools, tool.id]
                            : form.builtinTools.filter((x) => x !== tool.id),
                        })
                      }}
                    />
                    <span className="font-medium">{tool.label}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">{tool.desc}</span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* 技能 */}
          <div className="flex flex-col gap-2">
            <Label>技能</Label>
            <Input value={skillSearch} onChange={(e) => setSkillSearch(e.target.value)} placeholder="搜索技能…" className="h-8 text-xs" />
            <div className="grid max-h-[180px] grid-cols-2 gap-2 overflow-y-auto pr-1">
              {filteredSkills.map((skill) => {
                const checked = form.skillIds.includes(skill.id)
                return (
                  <label
                    key={skill.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-[13px] transition-all',
                      checked ? 'border-primary/35 bg-primary/10' : 'border-border bg-muted/30 hover:bg-muted',
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        setForm({
                          ...form,
                          skillIds: v ? [...form.skillIds, skill.id] : form.skillIds.filter((x) => x !== skill.id),
                        })
                      }}
                    />
                    <span className="truncate">{skill.name}</span>
                  </label>
                )
              })}
              {!filteredSkills.length && <div className="col-span-2 text-xs text-muted-foreground">没有匹配的技能</div>}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={() => void save()} disabled={!form.name.trim() || saving}>{editing ? '保存' : '创建'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
