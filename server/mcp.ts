// MCP 客户端管理：用官方 SDK 拉起多个 MCP server（stdio 子进程）+ 健康检查/自动重连
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { McpServerConfig } from './types.js'

export interface McpTool {
  serverId: string
  name: string
  description: string
  inputSchema: unknown
  timeoutMs?: number
}

export interface McpConnectionStatus {
  serverId: string
  name: string
  connected: boolean
  toolCount: number
  lastError?: string
}

interface McpConnection {
  config: McpServerConfig
  client: Client
  transport: StdioClientTransport
  tools: McpTool[]
  lastError?: string
  retryCount: number
}

const connections = new Map<string, McpConnection>()

// ---------- MCP server 配置加载（mcp-servers/*.json） ----------
export function loadMcpConfigs(): McpServerConfig[] {
  const dir = join(process.cwd(), 'mcp-servers')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const raw = JSON.parse(readFileSync(join(dir, f), 'utf8'))
      return {
        id: raw.id ?? f.replace(/\.json$/, ''),
        name: raw.name ?? raw.id ?? f,
        command: raw.command,
        args: raw.args ?? [],
        env: raw.env,
        timeoutMs: raw.timeoutMs,
      }
    })
    .filter((c) => c.command)
}

// ---------- MCP 配置动态管理（管理页 CRUD，保存后即时生效无需重启） ----------

const MCP_DIR = join(process.cwd(), 'mcp-servers')

// 保存/更新配置（写 mcp-servers/{id}.json）；id 安全字符校验 + command 必填
export function saveMcpConfig(config: McpServerConfig): McpServerConfig {
  const id = (config.id ?? '').trim()
  if (!/^[\w-]+$/.test(id)) throw new Error('id 只能包含字母、数字、下划线、连字符')
  if (!config.command?.trim()) throw new Error('command 必填（如 npx）')
  const clean: McpServerConfig = {
    id,
    name: config.name?.trim() || id,
    command: config.command.trim(),
    args: Array.isArray(config.args) ? config.args.map((a) => String(a)) : [],
    env: config.env && Object.keys(config.env).length ? config.env : undefined,
    timeoutMs: Number(config.timeoutMs) > 0 ? Number(config.timeoutMs) : undefined,
  }
  mkdirSync(MCP_DIR, { recursive: true })
  writeFileSync(join(MCP_DIR, `${id}.json`), JSON.stringify(clean, null, 2), 'utf8')
  return clean
}

// 删除配置（删文件 + 断开连接 + 清重连定时器）
export function deleteMcpConfig(id: string): boolean {
  const file = join(MCP_DIR, `${id}.json`)
  if (!existsSync(file)) return false
  rmSync(file, { force: true })
  return true
}

// 断开连接（管理页删除/更新前调用；同时清理重连定时器）
export async function disconnectServer(serverId: string) {
  const timer = reconnectTimers.get(serverId)
  if (timer) { clearTimeout(timer); reconnectTimers.delete(serverId) }
  const conn = connections.get(serverId)
  if (conn) {
    try { await conn.transport.close() } catch { /* ignore */ }
    try { await conn.client.close() } catch { /* ignore */ }
    connections.delete(serverId)
  }
}

// 重连（管理页"重连"按钮：断开后重新 establish）
export async function reconnectServer(serverId: string): Promise<McpConnectionStatus> {
  await disconnectServer(serverId)
  const config = loadMcpConfigs().find((c) => c.id === serverId)
  if (!config) return { serverId, name: serverId, connected: false, toolCount: 0, lastError: 'config not found' }
  try {
    await connectServer(config)
    const conn = connections.get(serverId)!
    return { serverId, name: config.name ?? serverId, connected: true, toolCount: conn.tools.length }
  } catch (err) {
    return { serverId, name: config.name ?? serverId, connected: false, toolCount: 0, lastError: (err as Error).message }
  }
}

// 自动重连配置
const RECONNECT_BASE_DELAY_MS = 5_000
const RECONNECT_MAX_DELAY_MS = 120_000
const RECONNECT_MAX_ATTEMPTS = 20 // 超过后暂停重连，等手动触发或下次调用

function envFor(config: McpServerConfig): Record<string, string> {
  return { ...process.env, ...(config.env ?? {}) } as Record<string, string>
}

async function establish(config: McpServerConfig): Promise<McpConnection> {
  const client = new Client(
    { name: 'nova-agent', version: '0.1.0' },
    { capabilities: {} },
  )
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: envFor(config),
    stderr: 'pipe',
  })
  await client.connect(transport)

  // 拉取工具清单
  const listed = await client.listTools()
  const tools: McpTool[] = (listed.tools ?? []).map((t) => ({
    serverId: config.id,
    name: t.name,
    description: t.description ?? '',
    inputSchema: t.inputSchema ?? {},
    timeoutMs: config.timeoutMs,
  }))

  const conn: McpConnection = { config, client, transport, tools, retryCount: 0 }
  return conn
}

export async function connectServer(config: McpServerConfig): Promise<McpConnection> {
  const existing = connections.get(config.id)
  if (existing && (await isConnected(existing))) return existing
  const conn = await establish(config)
  connections.set(config.id, conn)
  return conn
}

// 健康检查：ping 失败即标记断开并调度重连
export async function checkHealth(): Promise<McpConnectionStatus[]> {
  const statuses: McpConnectionStatus[] = []
  for (const [serverId, conn] of connections) {
    const alive = await isConnected(conn)
    statuses.push({
      serverId,
      name: conn.config.name ?? serverId,
      connected: alive,
      toolCount: alive ? conn.tools.length : 0,
      lastError: conn.lastError,
    })
    if (!alive) scheduleReconnect(serverId)
  }
  return statuses
}

// 真实探测：MCP ping（3s 超时）
async function isConnected(conn: McpConnection): Promise<boolean> {
  try {
    await Promise.race([
      conn.client.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('ping timeout')), 3000)),
    ])
    conn.lastError = undefined
    return true
  } catch {
    return false
  }
}

// 重连调度表：serverId -> timer
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()

function scheduleReconnect(serverId: string) {
  if (reconnectTimers.has(serverId)) return // 已有重连定时器
  const conn = connections.get(serverId)
  if (!conn) return
  if (conn.retryCount >= RECONNECT_MAX_ATTEMPTS) {
    conn.lastError = `reconnect paused after ${RECONNECT_MAX_ATTEMPTS} attempts`
    return
  }
  const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** conn.retryCount, RECONNECT_MAX_DELAY_MS)
  conn.retryCount += 1
  const timer = setTimeout(async () => {
    reconnectTimers.delete(serverId)
    const c = connections.get(serverId)
    if (!c) return
    try {
      const fresh = await establish(c.config)
      connections.set(serverId, fresh)
      console.log(`[mcp] server "${serverId}" reconnected (attempt ${c.retryCount})`)
    } catch (err) {
      c.lastError = (err as Error).message
      scheduleReconnect(serverId) // 继续指数退避
    }
  }, delay)
  reconnectTimers.set(serverId, timer)
}

export async function callMcpTool(serverId: string, name: string, args: unknown, timeoutMs = 120000): Promise<string> {
  const conn = connections.get(serverId)
  if (!conn) throw new Error(`MCP server "${serverId}" not connected`)

  const timer = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`tool call timed out after ${timeoutMs}ms`)), timeoutMs)
  })

  const result = await Promise.race([
    conn.client.callTool({ name, arguments: args as Record<string, unknown> }),
    timer,
  ])

  // MCP 结果：text 数组 → 字符串
  const content = (result.content ?? []) as Array<{ type: string; text?: string }>
  return content.map((c) => c.text ?? '').filter(Boolean).join('\n') || JSON.stringify(result)
}

// 按 agent 配置聚合工具
export async function listToolsFor(mcpServerIds: string[]): Promise<McpTool[]> {
  const all: McpTool[] = []
  for (const id of mcpServerIds) {
    const conn = connections.get(id)
    if (conn) all.push(...conn.tools)
  }
  return all
}

export function getConnections() {
  return connections
}

// 健康状态（供 /api/health 使用）
export async function getHealth(): Promise<McpConnectionStatus[]> {
  return checkHealth()
}
