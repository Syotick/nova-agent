import { useRef, useState } from 'react'
import { Plus, Pencil, Trash2, Search, Download, Upload } from 'lucide-react'
import { useMainStore } from '../store'
import { api } from '../api'
import { Button } from './ui/button'
import { Input, Textarea } from './ui/input'
import { Label } from './ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './ui/card'
import type { SkillMeta } from '../types'

export default function SkillManager() {
  const skills = useMainStore((s) => s.skills)
  const [search, setSearch] = useState('')
  const [editorVisible, setEditorVisible] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState({ name: '', description: '', whenToUse: '', content: '' })
  const [saving, setSaving] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  const filtered = search.trim()
    ? skills.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.description.toLowerCase().includes(search.toLowerCase()) || s.id.toLowerCase().includes(search.toLowerCase()))
    : skills

  const openCreate = () => { setEditingId(''); setForm({ name: '', description: '', whenToUse: '', content: '' }); setEditorVisible(true) }
  const openEdit = (s: SkillMeta) => { setEditingId(s.id); setForm({ name: s.name, description: s.description, whenToUse: s.whenToUse ?? '', content: s.content }); setEditorVisible(true) }

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editingId) {
        await api.updateSkill(editingId, form)
      } else {
        await api.createSkill(form)
      }
      setEditorVisible(false)
      useMainStore.setState({ skills: await api.listSkills() })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (s: SkillMeta) => {
    if (!confirm(`确定删除技能「${s.name}」？`)) return
    await api.deleteSkill(s.id)
    useMainStore.setState({ skills: await api.listSkills() })
  }

  // 导出单个技能为 JSON 文件
  const exportSkill = (s: SkillMeta) => {
    const blob = new Blob([JSON.stringify({ id: s.id, name: s.name, description: s.description, whenToUse: s.whenToUse ?? '', content: s.content }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${s.id}.skill.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // 导出全部技能为一个 JSON 文件
  const exportAll = () => {
    const data = skills.map((s) => ({ id: s.id, name: s.name, description: s.description, whenToUse: s.whenToUse ?? '', content: s.content }))
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'skills-export.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  // 导入技能（.json 文件，单个或数组）
  const importSkills = async (files: FileList | null) => {
    if (!files?.length) return
    const imported: Array<{ name?: string; description?: string; whenToUse?: string; content?: string }> = []
    for (const f of Array.from(files)) {
      try {
        const data = JSON.parse(await f.text())
        if (Array.isArray(data)) imported.push(...data)
        else imported.push(data)
      } catch {
        alert(`「${f.name}」不是有效的 JSON，已跳过`)
      }
    }
    let ok = 0
    let skipped = 0
    for (const item of imported) {
      if (!item || typeof item.name !== 'string' || !item.name.trim() || typeof item.content !== 'string') {
        skipped++
        continue
      }
      try {
        await api.createSkill({
          name: item.name.trim(),
          description: item.description ?? '',
          whenToUse: item.whenToUse ?? '',
          content: item.content,
        })
        ok++
      } catch {
        skipped++
      }
    }
    useMainStore.setState({ skills: await api.listSkills() })
    alert(`导入完成：成功 ${ok} 个${skipped ? `，跳过 ${skipped} 个（同名会覆盖）` : ''}`)
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-7">
      <div className="mx-auto max-w-[860px]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="gradient-brand-soft flex h-[42px] w-[42px] flex-none items-center justify-center rounded-xl text-xl">📚</div>
            <div>
              <h3 className="text-[17px] font-bold">技能管理</h3>
              <p className="mt-0.5 max-w-[560px] text-[13px] leading-relaxed text-muted-foreground">
                技能是"操作手册"——告诉 Agent 一类任务该怎么做。添加技能不用写代码。
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input ref={importRef} type="file" accept=".json" multiple className="hidden" onChange={(e) => { void importSkills(e.target.files); e.target.value = '' }} />
            <Button variant="outline" onClick={() => importRef.current?.click()} title="导入 .json 技能文件（可多选）">
              <Upload className="h-4 w-4" />导入
            </Button>
            <Button variant="outline" onClick={exportAll} disabled={!skills.length} title="导出全部技能为 JSON">
              <Download className="h-4 w-4" />全部导出
            </Button>
            <Button onClick={openCreate}><Plus className="h-4 w-4" />新建技能</Button>
          </div>
        </div>

        {/* 搜索 */}
        <div className="relative mb-4 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索技能…" className="pl-8" />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((skill) => (
            <Card key={skill.id}>
              <CardHeader className="flex-row items-center gap-2.5">
                <span className="text-lg">📖</span>
                <CardTitle className="text-sm">{skill.name}</CardTitle>
                <span className="font-mono text-xs text-muted-foreground">/{skill.id}</span>
              </CardHeader>
              <CardContent>
                <p className="text-[13px] text-muted-foreground">{skill.description || '（无描述）'}</p>
                {skill.whenToUse && (
                  <p className="mt-2 text-xs"><span className="font-medium text-primary">使用时机：</span><span className="text-muted-foreground">{skill.whenToUse}</span></p>
                )}
              </CardContent>
              <CardFooter className="gap-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(skill)}><Pencil className="h-3 w-3" />编辑</Button>
                <Button variant="outline" size="sm" onClick={() => exportSkill(skill)} title="导出该技能为 JSON"><Download className="h-3 w-3" />导出</Button>
                <Button variant="destructive" size="sm" onClick={() => void remove(skill)}><Trash2 className="h-3 w-3" />删除</Button>
              </CardFooter>
            </Card>
          ))}
          {!filtered.length && (
            <div className="col-span-full rounded-xl border border-dashed border-border py-12 text-center">
              <p className="text-sm text-muted-foreground">还没有技能，点「新建技能」创建第一个</p>
            </div>
          )}
        </div>
      </div>

      {/* 编辑器 */}
      <Dialog open={editorVisible} onOpenChange={setEditorVisible}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑技能' : '新建技能'}</DialogTitle>
            <DialogDescription>技能内容会被注入 Agent 的提示词中</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>技能名称</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：代码审查" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>使用时机（可选）</Label>
                <Input value={form.whenToUse} onChange={(e) => setForm({ ...form, whenToUse: e.target.value })} placeholder="如：用户要求审查代码时" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>简介（一句话说明它教什么）</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="如：教你如何审查代码质量" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>技能内容（操作步骤 / 指导 / 清单）</Label>
              <Textarea rows={10} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder={'1. 先读取文件了解结构\n2. 检查命名、错误处理、安全性\n3. 给出具体修改建议'} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorVisible(false)}>取消</Button>
            <Button onClick={() => void save()} disabled={!form.name.trim() || saving}>{editingId ? '保存' : '创建'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
