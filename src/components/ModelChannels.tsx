import { useRef, useState } from 'react'
import { KeyRound, Plus, Trash2, Pencil, Building2, Cpu, Check, X, PencilLine } from 'lucide-react'
import { useMainStore } from '../store'
import { Button } from './ui/button'
import { Input, Textarea } from './ui/input'
import { Label } from './ui/label'
import { cn } from '../lib/utils'
import type { KeySource } from '../types'
import ModelPicker from './ModelPicker'

// 状态徽章样式
const SOURCE_META: Record<KeySource, { text: string; cls: string }> = {
  configured: { text: '已配置', cls: 'bg-success/15 text-success' },
  env: { text: '环境变量', cls: 'bg-warning/15 text-warning' },
  none: { text: '未配置', cls: 'bg-muted text-muted-foreground' },
}

// 解析模型文本：每行一个模型，支持 "id" 或 "id:显示名"
function parseModelsText(text: string): Array<{ id: string; name?: string }> {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const idx = l.indexOf(':')
      return idx > 0 ? { id: l.slice(0, idx).trim(), name: l.slice(idx + 1).trim() } : { id: l }
    })
}

interface CustomForm {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  modelsText: string
}

const EMPTY_FORM: CustomForm = { id: '', name: '', baseUrl: '', apiKey: '', modelsText: '' }

export default function ModelChannels() {
  const customProviders = useMainStore((s) => s.customProviders)
  const providerKeyStatus = useMainStore((s) => s.providerKeyStatus)
  const agents = useMainStore((s) => s.agents)
  const currentAgentId = useMainStore((s) => s.currentAgentId)
  const currentModelLabel = useMainStore((s) => s.currentModelLabel())
  const saveProviderKey = useMainStore((s) => s.saveProviderKey)
  const saveCustomProvider = useMainStore((s) => s.saveCustomProvider)
  const deleteCustomProvider = useMainStore((s) => s.deleteCustomProvider)

  const [dsKey, setDsKey] = useState('')
  const [savingDs, setSavingDs] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<CustomForm>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [savingCustom, setSavingCustom] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  // 明确的表单模式：add（添加）/ edit（编辑）——切换时彻底重置，杜绝混淆
  const [mode, setMode] = useState<'add' | 'edit'>('add')
  // 保存成功反馈（2 秒后消失）
  const [savedMsg, setSavedMsg] = useState('')
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flash = (msg: string) => {
    setSavedMsg(msg)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSavedMsg(''), 2000)
  }

  const currentAgent = agents.find((a) => a.id === currentAgentId)
  const dsKeyStatus = providerKeyStatus['deepseek'] ?? 'none'
  const isEdit = mode === 'edit'

  const closeForm = () => {
    setFormOpen(false)
    setForm(EMPTY_FORM)
    setFormError('')
  }

  // 底部「添加供应商」：强制进入添加模式（空表单）
  const openAdd = () => {
    setMode('add')
    setForm(EMPTY_FORM)
    setFormError('')
    setFormOpen(true)
  }

  // 列表「编辑」：强制进入编辑模式（填充该供应商，ID 锁定）
  const openEdit = (p: { id: string; name: string; baseUrl: string; models: Array<{ id: string; name?: string }> }) => {
    setMode('edit')
    setForm({
      id: p.id,
      name: p.name,
      baseUrl: p.baseUrl,
      apiKey: '',
      modelsText: p.models.map((m) => (m.name ? `${m.id}:${m.name}` : m.id)).join('\n'),
    })
    setFormError('')
    setFormOpen(true)
  }

  const saveDeepSeek = async () => {
    setSavingDs(true)
    setError('')
    try {
      await saveProviderKey('deepseek', dsKey.trim())
      setDsKey('')
      flash('DeepSeek key 已保存 ✓')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSavingDs(false)
    }
  }

  const submitCustom = async () => {
    const modelsParsed = parseModelsText(form.modelsText)
    if (!form.id.trim() || !form.name.trim() || !form.baseUrl.trim() || !modelsParsed.length) {
      setFormError('请填写 id、名称、服务地址，并至少写一个模型（每行一个，支持 "id:显示名"）')
      return
    }
    setFormError('')
    setSavingCustom(true)
    try {
      await saveCustomProvider({
        id: form.id.trim(),
        name: form.name.trim(),
        baseUrl: form.baseUrl.trim(),
        models: modelsParsed,
      })
      // 表单里填了 key 就一并保存（空 key = 删除，编辑场景留空则不动）
      if (form.apiKey.trim()) {
        await saveProviderKey(form.id.trim(), form.apiKey.trim())
      }
      closeForm()
      flash(isEdit ? `供应商「${form.name.trim()}」已更新 ✓` : `供应商「${form.name.trim()}」已添加 ✓`)
    } catch (e) {
      setFormError(`保存失败：${(e as Error).message}`)
    } finally {
      setSavingCustom(false)
    }
  }

  const deleteOne = async (id: string) => {
    await deleteCustomProvider(id)
    flash(`供应商 ${id} 已删除`)
  }

  const editingName = isEdit ? customProviders.find((c) => c.id === form.id)?.name ?? form.id : ''

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      {savedMsg && (
        <div className="flex items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success animate-fade-in">
          <Check className="h-3.5 w-3.5" />{savedMsg}
        </div>
      )}
      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}

      {/* 当前 Agent 的模型（随时可切换） */}
      <section className="flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl text-[15px] font-bold text-white" style={{ background: currentAgent?.color || '#6d8bff' }}>
          {(currentAgent?.name || '?').charAt(0)}
        </div>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="text-[11px] text-muted-foreground">当前 Agent「{currentAgent?.name ?? '未选择'}」的模型</span>
          <span className="truncate text-[15px] font-semibold">{currentModelLabel || '未设置模型'}</span>
        </div>
        <ModelPicker
          trigger={
            <Button variant="outline" className="ml-auto h-8.5 shrink-0">
              <Cpu className="mr-1 h-3.5 w-3.5" />切换模型
            </Button>
          }
          align="end"
        />
      </section>

      {/* DeepSeek API Key（内置渠道，渠道级配置） */}
      <section className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card/50 p-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">DeepSeek API Key（内置渠道）</span>
          <span className={cn('ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium', SOURCE_META[dsKeyStatus].cls)}>
            {SOURCE_META[dsKeyStatus].text}
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          保存在项目外文件，AI 的工具无法读取。其他渠道（千问 / Kimi / GLM / OpenAI / 本地服务…）请用页面底部的「添加供应商」添加。
        </p>
        <div className="flex gap-2">
          <Input
            type="password"
            autoComplete="new-password"
            value={dsKey}
            onChange={(e) => setDsKey(e.target.value)}
            placeholder={dsKeyStatus === 'none' ? '粘贴 DeepSeek API Key（sk-...）' : '留空并保存可删除已保存的 key'}
            onKeyDown={(e) => { if (e.key === 'Enter') void saveDeepSeek() }}
            className="h-8.5 font-mono text-xs"
          />
          <Button onClick={() => void saveDeepSeek()} disabled={savingDs} className="h-8.5 shrink-0">
            {savingDs ? '保存中…' : '保存'}
          </Button>
        </div>
      </section>

      {/* 自定义供应商列表（排在所有内置模型之后） */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">自定义供应商</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{customProviders.length} 个</span>
        </div>

        <div className="flex flex-col gap-2">
          {customProviders.map((c) => {
            const src = providerKeyStatus[c.id] ?? 'none'
            return (
              <div key={c.id} className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card/50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold">{c.name}</span>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{c.id}</code>
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', SOURCE_META[src].cls)}>{SOURCE_META[src].text}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{c.models.length} 模型</span>
                  <span className="ml-auto flex gap-1">
                    <button className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/15 hover:text-primary" title="编辑" onClick={() => openEdit(c)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                      title="删除"
                      onClick={() => void deleteOne(c.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
                <div className="truncate font-mono text-[10px] text-muted-foreground">{c.baseUrl}</div>
              </div>
            )
          })}
          {!customProviders.length && (
            <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
              还没有自定义供应商。点下方「添加供应商」添加一个——例如千问（阿里云百炼）：
              <br />ID: qwen · 地址: https://dashscope.aliyuncs.com/compatible-mode/v1 · 模型: qwen3.5-397b-a17b
            </div>
          )}
        </div>

        {/* 添加/编辑表单（默认收起；模式有明确提示） */}
        {formOpen && (
          <div className={cn(
            'flex flex-col gap-2.5 rounded-2xl border-2 p-4 animate-fade-in',
            isEdit ? 'border-warning/50 bg-warning/5' : 'border-primary/40 bg-card/30',
          )}>
            {/* 模式提示条 */}
            <div className="flex items-center gap-2">
              {isEdit ? (
                <>
                  <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 text-[11px] font-semibold text-warning">
                    <PencilLine className="h-3 w-3" />编辑模式
                  </span>
                  <span className="text-[13px] font-semibold">正在编辑供应商「{editingName}」</span>
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary">
                    <Plus className="h-3 w-3" />添加模式
                  </span>
                  <span className="text-[13px] font-semibold">添加新供应商</span>
                </>
              )}
              <button
                className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="收起"
                onClick={closeForm}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{formError}</div>}
            <div className="grid grid-cols-[1fr_1.4fr] gap-2">
              <div className="flex flex-col gap-1">
                <Label className="text-[11px]">ID（唯一，小写字母/数字/-）</Label>
                <Input
                  value={form.id}
                  onChange={(e) => setForm({ ...form, id: e.target.value })}
                  placeholder="qwen"
                  autoComplete="off"
                  disabled={isEdit}
                  title={isEdit ? 'ID 创建后不可修改（如需改名请删除后重新添加）' : ''}
                  className="h-8.5 font-mono text-xs disabled:opacity-60"
                />
                {isEdit && <span className="text-[10px] text-muted-foreground">ID 创建后不可修改，如需改名请删除后重新添加</span>}
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[11px]">名称</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="阿里云百炼" className="h-8.5 text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-[1.4fr_1fr] gap-2">
              <div className="flex flex-col gap-1">
                <Label className="text-[11px]">服务地址（OpenAI 兼容 baseUrl，以 http(s):// 开头）</Label>
                <Input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1" autoComplete="off" className="h-8.5 font-mono text-xs" />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[11px]">API Key（可选，编辑时留空 = 不修改）</Label>
                <Input type="password" autoComplete="new-password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="粘贴该平台的 API Key" className="h-8.5 font-mono text-xs" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[11px]">模型列表（每行一个，写模型 id，支持 "id:显示名"）</Label>
              <Textarea
                rows={2}
                value={form.modelsText}
                onChange={(e) => setForm({ ...form, modelsText: e.target.value })}
                placeholder={'qwen3.5-397b-a17b:Qwen3.5 旗舰\nqwen-plus:均衡'}
                className="font-mono text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => void submitCustom()} disabled={savingCustom} className={cn('h-8.5', isEdit && 'bg-warning text-warning-foreground hover:bg-warning/90')}>
                {savingCustom ? '保存中…' : isEdit ? '更新供应商' : '添加供应商'}
              </Button>
              <Button variant="ghost" className="h-8.5" onClick={closeForm}>取消</Button>
            </div>
          </div>
        )}
      </section>

      {/* 底部：添加供应商按钮（始终在页面最下面；点击重置为添加模式） */}
      <Button
        variant="outline"
        className="h-10 w-full border-dashed text-[13px]"
        onClick={openAdd}
      >
        <Plus className="mr-1 h-4 w-4" />添加供应商
      </Button>
    </div>
  )
}
