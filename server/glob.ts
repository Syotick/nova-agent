// 内置工具：glob —— 按文件名模式匹配工作区文件（Claude Code 六大核心编程工具之一）
// 支持 glob 语法：*（单段）、**（跨任意层）、?（单字符）；默认排除 node_modules/.git
import { readdirSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { getWorkspacePath } from './workspace.js'

export interface GlobArgs {
  pattern: string
  /** 相对工作区的搜索起点（可选；默认工作区根） */
  cwd?: string
}

export interface GlobResult {
  content: string
  isError?: boolean
}

const MAX_RESULTS = 200 // 防止匹配海量文件刷爆 token
const SKIP_DIRS = new Set(['node_modules', '.git'])

/** 把 glob 转成正则（支持 * ? **；/ 为路径分隔，跨平台统一） */
export function globToRegExp(pattern: string): RegExp {
  // Windows 反斜杠写法统一为 /（globFiles 里也统一，这里兜底）
  pattern = pattern.replace(/\\/g, '/')
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        i += 1
        re += '(?:.*/)?' // ** 跨任意层（含零层），吃掉后面的 /
        if (pattern[i + 1] === '/') i += 1
      } else {
        re += '[^/]*'
      }
    } else if (c === '?') {
      re += '[^/]'
    } else if ('\\^$.|+()[]{}'.includes(c)) {
      re += `\\${c}`
    } else {
      re += c
    }
  }
  return new RegExp(`^${re}$`)
}

/** 递归收集目录下所有相对路径（跳过 SKIP_DIRS；结果统一正斜杠） */
function walk(dir: string, prefix: string, out: string[]) {
  let entries: import('node:fs').Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      walk(join(dir, e.name), prefix ? `${prefix}/${e.name}` : e.name, out)
      continue
    }
    out.push(prefix ? `${prefix}/${e.name}` : e.name)
  }
}

export function globFiles(pattern: string, cwdDir?: string): { files: string[]; truncated: boolean } {
  const wsRoot = getWorkspacePath()
  const base = cwdDir ? resolve(wsRoot, cwdDir) : wsRoot
  // 越界防护：搜索起点必须落在工作区内
  if (cwdDir && !(base === wsRoot || base.startsWith(wsRoot + sep))) {
    throw new Error(`cwd 必须位于工作区内（${wsRoot}）`)
  }
  const regex = globToRegExp(pattern.replace(/\\/g, '/'))
  const rels: string[] = []
  walk(base, '', rels)
  const matched = rels.filter((r) => regex.test(r))
  return { files: matched.slice(0, MAX_RESULTS), truncated: matched.length > MAX_RESULTS }
}

export function executeGlob(args: GlobArgs): GlobResult {
  const pattern = (args.pattern ?? '').trim()
  if (!pattern) return { content: 'Error: pattern 必填（如 **/*.ts、src/**/*.js、*.md）', isError: true }
  if (pattern.split('/').some((seg) => seg === '..')) {
    return { content: 'Error: pattern 不能包含 ".."（禁止越出工作区）', isError: true }
  }
  try {
    const { files, truncated } = globFiles(pattern, args.cwd)
    if (!files.length) return { content: `没有匹配 ${pattern} 的文件（在 ${getWorkspacePath()}${args.cwd ? `/${args.cwd}` : ''} 下）` }
    const list = files.map((f) => `- ${f}`).join('\n')
    return {
      content: `匹配 ${pattern} 的文件（共 ${truncated ? `${files.length}+` : files.length} 个，相对工作区${args.cwd ? `/${args.cwd}` : ''}）：\n${list}${truncated ? '\n…（结果过多已截断）' : ''}`,
    }
  } catch (err) {
    return { content: `Error: ${(err as Error).message}`, isError: true }
  }
}