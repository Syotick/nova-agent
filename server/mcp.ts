// MCP 客户端管理：用官方 SDK 拉起多个 MCP server（stdio 子进程）
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

interface McpConnection {
  config: McpServerConfig
  client: Client
  transport: StdioClientTransport
  tools: McpTool[]
}

const connections = new Map<string, McpConnection>()

function envFor(config: McpServerConfig): Record<string, string> {
  return { ...process.env, ...(config.env ?? {}) } as Record<string, string>
}

export async function connectServer(config: McpServerConfig): Promise<McpConnection> {
  const existing = connections.get(config.id)
  if (existing) return existing

  const client = new Client(
    { name: 'my-agent', version: '0.1.0' },
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

  const conn: McpConnection = { config, client, transport, tools }
  connections.set(config.id, conn)
  return conn
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
