// Skills 加载器：扫描 skills/*/SKILL.md，解析 YAML frontmatter
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { SkillMeta } from './types.js'

const SKILLS_ROOT = join(process.cwd(), 'skills')

interface Frontmatter {
  name?: string
  description?: string
  when_to_use?: string
}

// 极简 YAML frontmatter 解析（够用：key: value 单行）
function parseFrontmatter(raw: string): { meta: Frontmatter; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return { meta: {}, body: raw }
  const meta: Frontmatter = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/)
    if (kv) (meta as Record<string, string>)[kv[1]] = kv[2].replace(/^["']|["']$/g, '')
  }
  return { meta, body: m[2].trim() }
}

export function loadSkills(): SkillMeta[] {
  if (!existsSync(SKILLS_ROOT)) return []
  const skills: SkillMeta[] = []
  for (const dir of readdirSync(SKILLS_ROOT, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    const skillPath = join(SKILLS_ROOT, dir.name, 'SKILL.md')
    if (!existsSync(skillPath)) continue
    const raw = readFileSync(skillPath, 'utf8')
    const { meta, body } = parseFrontmatter(raw)
    skills.push({
      id: dir.name,
      name: meta.name ?? dir.name,
      description: meta.description ?? '',
      whenToUse: meta.when_to_use ?? '',
      content: body,
    })
  }
  return skills
}

export function getSkill(id: string): SkillMeta | undefined {
  return loadSkills().find((s) => s.id === id)
}

// 把选中的技能拼成"目录块"注入 system prompt —— 只给名字+描述，不给正文。
// 为什么不是全量注入：技能正文可能很长，全部塞进 prompt 会撑爆 token 并稀释注意力。
// 目录让模型"知道有什么、什么时候该用"，正文由 load_skill 工具按需取（懒加载，见 toolRegistry.ts）。
export function skillCatalog(skillIds: string[]): string {
  if (!skillIds.length) return ''
  const entries = skillIds
    .map((id) => getSkill(id))
    .filter((s): s is SkillMeta => s !== undefined)
    .map((s) => `- ${s.name}（使用时机：${s.whenToUse || '未指定'}）：${s.description || '（无描述）'}`)
  if (!entries.length) return ''
  return [
    '\n\n---\n\n# 可用技能（按需加载）',
    ...entries,
    '',
    '使用说明：需要用到某技能时，必须先用 load_skill 工具按名字加载它的完整指令，再照做；禁止仅凭上面这行描述执行。',
  ].join('\n')
}

// load_skill 工具的加载函数：按名字（或 id）精确匹配，且必须在该 agent 勾选的技能里。
// 返回错误原因而不抛异常，让工具以 isError 呈现，模型可据此修正（未知名/未启用）。
export function loadSkillContent(
  skillIds: string[],
  name: string,
): { ok: true; name: string; id: string; whenToUse: string; content: string } | { ok: false; reason: string } {
  const all = loadSkills()
  const hit = all.find((s) => s.name === name) ?? all.find((s) => s.id === name)
  if (!hit) return { ok: false, reason: `未知技能 "${name}"（可先查看目录里的技能名）` }
  if (!skillIds.includes(hit.id)) return { ok: false, reason: `技能 "${name}" 未在 Agent 勾选中启用（无法加载）` }
  return { ok: true, name: hit.name, id: hit.id, whenToUse: hit.whenToUse ?? '', content: hit.content }
}

// 把 id 转成安全的目录名：保留中文字符和字母数字，其余转连字符
function safeId(name: string): string {
  const cleaned = name.trim().replace(/[^\w\u4e00-\u9fa5-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned || 'skill'
}

// 生成 SKILL.md 文件内容
function renderSkillFile(meta: { name: string; description: string; whenToUse?: string }, content: string): string {
  const lines = ['---', `name: ${meta.name}`, `description: ${meta.description || ''}`]
  if (meta.whenToUse) lines.push(`when_to_use: ${meta.whenToUse}`)
  lines.push('---', '', content.trim(), '')
  return lines.join('\n')
}

// 保存技能（新建或更新）。返回最终的 SkillMeta（含 id）。
export function saveSkill(input: { id?: string; name: string; description: string; whenToUse?: string; content: string }): SkillMeta {
  mkdirSync(SKILLS_ROOT, { recursive: true })
  const id = input.id ?? safeId(input.name)
  const dir = join(SKILLS_ROOT, id)
  mkdirSync(dir, { recursive: true })
  const skillPath = join(dir, 'SKILL.md')
  writeFileSync(skillPath, renderSkillFile(
    { name: input.name, description: input.description, whenToUse: input.whenToUse },
    input.content,
  ), 'utf8')
  return { id, name: input.name, description: input.description, whenToUse: input.whenToUse ?? '', content: input.content }
}

// 删除技能（删除整个目录）
export function deleteSkill(id: string): boolean {
  // 防路径穿越：id 必须是安全字符（字母数字中文连字符），拒绝 / \ .. 等
  if (!/^[\w\u4e00-\u9fa5-]+$/.test(id)) return false
  const dir = join(SKILLS_ROOT, id)
  if (!existsSync(dir)) return false
  rmSync(dir, { recursive: true, force: true })
  return true
}
