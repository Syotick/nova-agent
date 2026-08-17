// 工作区管理：Agent 文件权限边界（filesystem MCP 的挂载根目录）
// - 默认：项目内 `workspace/`（兜底，保持开箱即用）
// - 可配置：设置页让用户选择任意目录（相对路径按项目根解析，或绝对路径）——Codex 式工作区
// - MCP 配置里可用 `{{workspace}}` 占位符，启动时替换为当前工作区绝对路径
import { resolve, isAbsolute, join, normalize, dirname, sep } from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'
import { getConfigValue, setConfigValue, deleteConfigValue } from './store.js'

const CONFIG_KEY = 'workspacePath'
export const DEFAULT_WORKSPACE = 'workspace' // 相对项目根

// API key 文件位于项目上级目录（项目外，Agent 不可达是安全基线）。
// 工作区若指向该目录或其祖先，filesystem 工具即可读取密钥 → 必须拒绝。
const KEY_FILE_PARENT = dirname(join(dirname(process.cwd()), '.nova-agent-key.json'))

/** 大小写不敏感比较（Windows 路径不区分大小写） */
function samePath(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/** 用户配置的原始值（null = 未配置，用默认） */
export function getWorkspaceRaw(): string | null {
  return getConfigValue(CONFIG_KEY)
}

/** 解析工作区绝对路径：相对 → 项目根；绝对 → 原样 */
export function resolveWorkspace(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return join(process.cwd(), DEFAULT_WORKSPACE)
  return isAbsolute(trimmed) ? resolve(trimmed) : resolve(process.cwd(), trimmed)
}

/** 当前生效的工作区绝对路径 */
export function getWorkspacePath(): string {
  return resolveWorkspace(getWorkspaceRaw())
}

/** 确保工作区存在（启动/保存时调用） */
export function ensureWorkspace(): string {
  const p = getWorkspacePath()
  mkdirSync(p, { recursive: true })
  return p
}

export interface WorkspaceInfo {
  /** 用户配置的原始值（null = 默认 workspace/） */
  configured: string | null
  /** 解析后的绝对路径 */
  resolved: string
  /** 目录当前是否存在（不存在会在启动/上传时自动创建） */
  exists: boolean
  /** 是否为默认（未自定义） */
  isDefault: boolean
}

export function workspaceInfo(): WorkspaceInfo {
  const raw = getWorkspaceRaw()
  const resolved = resolveWorkspace(raw)
  return { configured: raw, resolved, exists: existsSync(resolved), isDefault: !raw }
}

/**
 * 校验工作区原始值（纯函数，不触碰存储，便于测试）：
 * 空串 = 合法（重置语义）。返回错误信息（null = 合法）。
 * 拒绝三类危险目标：项目根（源码/数据库）、密钥文件所在目录及其祖先（API key）。
 */
export function validateWorkspaceRaw(raw: string): string | null {
  const trimmed = (raw ?? '').trim()
  if (trimmed === '') return null
  if (trimmed.includes('\u0000')) return '路径不能包含 NUL 字符'
  if (trimmed.length > 1024) return '路径过长'
  const resolved = resolveWorkspace(trimmed)
  const resolvedLower = resolved.toLowerCase()
  const cwdLower = process.cwd().toLowerCase()
  // 项目根：Agent 会获得项目源码/数据库访问权限
  if (resolvedLower === cwdLower) return '工作区不能是项目根目录（Agent 会获得项目文件访问权限）'
  // 密钥文件所在目录或其任何祖先：filesystem 即可读到项目外的 API key
  const keyParentLower = KEY_FILE_PARENT.toLowerCase()
  if (resolvedLower === keyParentLower || keyParentLower.startsWith(resolvedLower + sep)) {
    return '工作区不能位于项目上级目录（API key 文件所在区域，Agent 会获得密钥访问权限）'
  }
  return null
}

/** 设置工作区；空串 = 重置回默认。返回校验错误（null = 成功） */
export function setWorkspacePath(raw: string): string | null {
  const trimmed = (raw ?? '').trim()
  if (trimmed === '') {
    deleteConfigValue(CONFIG_KEY)
    return null
  }
  const err = validateWorkspaceRaw(trimmed)
  if (err) return err
  setConfigValue(CONFIG_KEY, trimmed)
  return null
}

/**
 * 解析 MCP 配置的 args（establish 启动子进程时调用）：
 * - `{{workspace}}` 占位符 → 当前工作区绝对路径（可嵌在参数中间，如 `-p {{workspace}}/docs`）
 * - 以 `./` 或 `../` 开头的参数 → 按项目根解析为绝对路径（子进程不保证 cwd）
 */
export function resolveMcpArgs(args: string[]): string[] {
  const ws = getWorkspacePath()
  return args.map((arg) => {
    if (arg.includes('{{workspace}}')) return normalize(arg.replaceAll('{{workspace}}', ws))
    if (arg.startsWith('./') || arg.startsWith('../')) return resolve(process.cwd(), arg)
    return arg
  })
}
