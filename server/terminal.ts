// 终端工具：run_command —— 在工作区（项目目录）执行 shell 命令（Codex 模式核心）
// 进程生命周期：会话级注册表 + 整树清理（中断/超时/结束时兜底），防幽灵进程占端口
import { spawn, type ChildProcess } from 'node:child_process'
import { resolve, sep } from 'node:path'
import { getWorkspacePath } from './workspace.js'

export interface RunCommandArgs {
  /** 非交互 shell 命令（如 npm run build / git status / node build.mjs） */
  command: string
  /** 工作区内子目录（可选；默认工作区根） */
  cwd?: string
  /** 超时毫秒（可选；默认 120s，上限 600s） */
  timeoutMs?: number
}

export interface RunCommandResult {
  content: string
  isError?: boolean
}

const DEFAULT_TIMEOUT_MS = 120_000
const MAX_TIMEOUT_MS = 600_000
const MAX_OUTPUT_CHARS = 20_000

// ---------- 会话进程注册表 ----------
const sessionProcesses = new Map<string, Set<ChildProcess>>()

export function registerProcess(sessionId: string, child: ChildProcess) {
  let set = sessionProcesses.get(sessionId)
  if (!set) {
    set = new Set()
    sessionProcesses.set(sessionId, set)
  }
  set.add(child)
  child.once('exit', () => set?.delete(child))
}

/** 杀整棵进程树：win 用 taskkill /T /F；unix 用进程组负 PID 信号（detached 生效） */
function killTree(child: ChildProcess): Promise<void> {
  return new Promise((done) => {
    let settled = false
    const finish = () => { if (!settled) { settled = true; done() } }
    const pid = child.pid
    if (pid == null) { finish(); return }
    try {
      if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
        killer.on('exit', () => { try { child.kill('SIGKILL') } catch { /* ignore */ } finish() })
        killer.on('error', finish)
      } else {
        try { process.kill(-pid, 'SIGTERM') } catch { /* ignore */ }
        setTimeout(() => {
          try { process.kill(-pid, 'SIGKILL') } catch { /* ignore */ }
          finish()
        }, 500)
      }
    } catch {
      finish()
    }
  })
}

/** 杀掉会话内全部进程树（abort/中断/兜底清理时调用） */
export async function killSessionProcesses(sessionId: string): Promise<void> {
  const set = sessionProcesses.get(sessionId)
  if (!set || set.size === 0) return
  sessionProcesses.delete(sessionId)
  const list = [...set]
  await Promise.all(list.map(killTree))
}

// ---------- 命令执行 ----------
function normalizeCommandOutput(chunks: Buffer[]): string {
  let out = Buffer.concat(chunks).toString('utf8')
  if (out.length > MAX_OUTPUT_CHARS) {
    out = `${out.slice(0, MAX_OUTPUT_CHARS)}\n…（输出过长已截断）`
  }
  return out
}

export async function executeCommand(sessionId: string, args: RunCommandArgs): Promise<RunCommandResult> {
  const command = (args.command ?? '').trim()
  if (!command) return { content: 'Error: command 必填（非交互 shell 命令）', isError: true }

  const wsRoot = getWorkspacePath()
  let cwd = wsRoot
  if (args.cwd) {
    const sub = resolve(wsRoot, args.cwd)
    // 越界防护：子目录必须落在工作区内
    if (!(sub === wsRoot || sub.startsWith(wsRoot + sep))) {
      return { content: `Error: cwd 必须位于工作区内（${wsRoot}）`, isError: true }
    }
    cwd = sub
  }

  const timeout = Math.min(Math.max(args.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1_000), MAX_TIMEOUT_MS)
  const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'
  const shellArgs = process.platform === 'win32' ? ['/c', command] : ['-c', command]

  // Windows 下必须 verbatim：Node 默认会重写含引号参数的引号，与 cmd /c 的解析叠加会破坏命令
  // （如 node -e "..." 会把内层引号搅乱导致命令无输出/报错）
  // detached 仅 unix 进程组杀树需要；Windows 上 detached 会破坏带引号命令的 stdout 传输（实测），
  // 且 Windows 杀树本就走 taskkill /T（按父子树递归，无需 detached），故 Windows 不设 detached。
  const child = spawn(shell, shellArgs, {
    cwd,
    detached: process.platform !== 'win32',
    windowsHide: true,
    windowsVerbatimArguments: process.platform === 'win32',
  })
  registerProcess(sessionId, child)

  const chunks: Buffer[] = []
  let timedOut = false
  let exitCode: number | null = null

  try {
    const finished = await new Promise<'exit' | 'timeout' | 'error'>((resolveState) => {
      child.stdout?.on('data', (c) => chunks.push(Buffer.from(c)))
      child.stderr?.on('data', (c) => chunks.push(Buffer.from(c)))
      const timer = setTimeout(() => {
        timedOut = true
        // 先终止进程树，再结束等待（保留已收集输出）
        void killTree(child).finally(() => resolveState('timeout'))
      }, timeout)
      child.on('error', () => { clearTimeout(timer); resolveState('error') })
      child.on('close', (code) => {
        clearTimeout(timer)
        exitCode = code
        resolveState('exit')
      })
    })

    const output = normalizeCommandOutput(chunks)
    if (finished === 'error') {
      // spawn 失败（shell 不存在等）
      return {
        content: `$ ${command}\n[目录] ${cwd}\n\n${output || '(无输出)'}\n--- 命令启动失败 ---`,
        isError: true,
      }
    }
    if (timedOut) {
      return {
        content: `$ ${command}\n[目录] ${cwd}\n\n--- 命令超时（${Math.round(timeout / 1000)}s）已自动终止进程树，以下是终止前的输出 ---\n\n${output || '(无输出)'}`,
      }
    }
    return {
      content: `$ ${command}\n[目录] ${cwd}\n\n--- 输出 ---\n\n${output || '(无输出)'}\n--- exit code: ${exitCode ?? 'null'} ---`,
      isError: exitCode === null ? true : undefined,
    }
  } finally {
    // 无论结果如何，确保进程已被回收（超时路径已杀树；正常退出进程已结束）
    if (child.exitCode === null && !timedOut) {
      await killTree(child).catch(() => {})
    }
  }
}