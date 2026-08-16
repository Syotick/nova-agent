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

// 把选中的技能拼进 system prompt
export function injectSkills(skillIds: string[]): string {
  if (!skillIds.length) return ''
  const parts = skillIds
    .map((id) => getSkill(id))
    .filter((s): s is SkillMeta => s !== undefined)
    .map((s) => `## Skill: ${s.name}\n${s.whenToUse ? `(使用时机: ${s.whenToUse})\n` : ''}${s.content}`)
  return parts.length ? `\n\n---\n\n# 可用技能（按需使用）\n\n${parts.join('\n\n')}` : ''
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
