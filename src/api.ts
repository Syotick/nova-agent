// API 封装：REST + SSE 流式聊天
import type { Agent, Session, SkillMeta, McpServerConfig, ChatEvent, Message, ToolInfo, Task, ModelProvider, Attachment, KeySource, CustomProvider, ReasoningOption, Memory } from './types'

const BASE = '/api'

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  // agents
  listAgents: () => json<Agent[]>('/agents'),
  createAgent: (body: Partial<Agent>) => json<Agent>('/agents', { method: 'POST', body: JSON.stringify(body) }),
  updateAgent: (id: string, body: Partial<Agent>) => json<Agent>(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteAgent: (id: string) => json<{ ok: boolean }>(`/agents/${id}`, { method: 'DELETE' }),

  // catalogs
  listMcpServers: () => json<McpServerConfig[]>('/mcp-servers'),
  listMcpServerStatus: () => json<Array<{ serverId: string; name: string; connected: boolean; toolCount: number; lastError?: string }>>('/mcp-servers/status'),
  createMcpServer: (config: McpServerConfig) =>
    json<{ config: McpServerConfig; status: unknown }>('/mcp-servers', { method: 'POST', body: JSON.stringify({ config }) }),
  updateMcpServer: (id: string, config: McpServerConfig) =>
    json<{ config: McpServerConfig; status: unknown }>(`/mcp-servers/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ config }) }),
  deleteMcpServer: (id: string) =>
    json<{ ok: boolean }>(`/mcp-servers/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  reconnectMcpServer: (id: string) =>
    json<{ serverId: string; name: string; connected: boolean; toolCount: number; lastError?: string }>(`/mcp-servers/${encodeURIComponent(id)}/reconnect`, { method: 'POST' }),
  listSkills: () => json<SkillMeta[]>('/skills'),
  listTools: () => json<ToolInfo[]>('/tools'),
  listModels: () => json<ModelProvider[]>('/models'),

  // skills CRUD（可视化编辑）
  createSkill: (body: { name: string; description: string; whenToUse?: string; content: string }) =>
    json<SkillMeta>('/skills', { method: 'POST', body: JSON.stringify(body) }),
  updateSkill: (id: string, body: { name: string; description: string; whenToUse?: string; content: string }) =>
    json<SkillMeta>('/skills', { method: 'POST', body: JSON.stringify({ id, ...body }) }),
  deleteSkill: (id: string) => json<{ ok: boolean }>(`/skills/${id}`, { method: 'DELETE' }),

  // sessions
  listSessions: (agentId?: string) => json<Session[]>(`/sessions${agentId ? `?agentId=${agentId}` : ''}`),
  createSession: (agentId: string) => json<Session>('/sessions', { method: 'POST', body: JSON.stringify({ agentId }) }),
  getSession: (id: string) => json<Session>(`/sessions/${id}`),
  searchSessions: (q: string) =>
    json<Array<{ sessionId: string; title: string; agentId: string; messageId: string; role: 'user' | 'assistant'; content: string; createdAt: number }>>(
      `/sessions/search?q=${encodeURIComponent(q)}`),
  renameSession: (id: string, title: string) => json<Session>(`/sessions/${id}`, { method: 'PUT', body: JSON.stringify({ title }) }),
  deleteSession: (id: string) => json<{ ok: boolean }>(`/sessions/${id}`, { method: 'DELETE' }),
  compactSession: (id: string) =>
    json<{ ok: boolean; skipped?: boolean; message?: string; summary?: string; removed?: number; kept?: number }>(
      `/sessions/${id}/compact`, { method: 'POST' }),

  stopChat: (sessionId: string) => json<{ ok: boolean }>('/chat/stop', { method: 'POST', body: JSON.stringify({ sessionId }) }),

  // 附件上传（multipart）
  async uploadFile(file: File): Promise<Attachment> {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${BASE}/uploads`, { method: 'POST', body: form })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
    }
    return res.json() as Promise<Attachment>
  },

  // 删除附件
  deleteFile: (filename: string) =>
    json<{ ok: boolean }>(`/uploads/${encodeURIComponent(filename)}`, { method: 'DELETE' }),

  // tasks（定时任务）
  listTasks: () => json<Task[]>('/tasks'),
  createTask: (body: { name: string; agentId: string; cron: string; prompt?: string }) =>
    json<Task>('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  updateTask: (id: string, body: Partial<{ name: string; cron: string; prompt: string; enabled: boolean }>) =>
    json<Task>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  runTask: (id: string) => json<{ ok: boolean; result: string }>(`/tasks/${id}/run`, { method: 'POST' }),
  deleteTask: (id: string) => json<{ ok: boolean }>(`/tasks/${id}`, { method: 'DELETE' }),

  // 多渠道 API key（状态不返回明文）
  getProviderKeys: () =>
    json<{ providers: Record<string, { source: KeySource }> }>('/providers/keys'),
  setProviderKey: (providerId: string, apiKey: string) =>
    json<{ ok: boolean }>('/providers/keys', { method: 'POST', body: JSON.stringify({ providerId, apiKey }) }),

  // 自定义模型提供商
  listCustomProviders: () => json<CustomProvider[]>('/providers/custom'),
  saveCustomProvider: (p: CustomProvider) =>
    json<{ ok: boolean }>('/providers/custom', { method: 'POST', body: JSON.stringify(p) }),
  deleteCustomProvider: (id: string) =>
    json<{ ok: boolean }>(`/providers/custom/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // 跨会话记忆
  listMemories: (agentId: string) => json<Memory[]>(`/memories?agentId=${encodeURIComponent(agentId)}`),
  addMemory: (agentId: string, content: string) =>
    json<{ memory: Memory; merged: boolean }>('/memories', { method: 'POST', body: JSON.stringify({ agentId, content }) }),
  updateMemory: (id: string, content: string) =>
    json<Memory>(`/memories/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ content }) }),
  deleteMemory: (id: string) =>
    json<{ ok: boolean }>(`/memories/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}

// SSE 流式聊天：onEvent 回调返回一个 cancel 函数
export function streamChat(
  sessionId: string,
  text: string,
  onEvent: (e: ChatEvent) => void,
  attachments?: Attachment[],
  reasoning?: ReasoningOption,
): { cancel: () => void } {
  const controller = new AbortController()

  ;(async () => {
    try {
      const res = await fetch(`${BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, text, attachments, reasoning }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}))
        onEvent({ type: 'error', sessionId, message: (body as { error?: string }).error ?? `HTTP ${res.status}` })
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let sawDone = false
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        // SSE 按空行分帧
        let idx: number
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 2)
          const line = frame.split('\n').find((l) => l.startsWith('data: '))
          if (line) {
            try {
              const ev = JSON.parse(line.slice(6)) as ChatEvent
              if (ev.type === 'done') sawDone = true
              onEvent(ev)
            } catch {
              // 忽略坏帧
            }
          }
        }
      }
      // 流正常结束但没收到 done 帧（后端异常中断）：兜底清理前端流式状态，
      // 避免 streaming 永远挂着（否则后续任何操作都会触发 cancelStream 落盘"已中断"）
      if (!sawDone) {
        onEvent({ type: 'error', sessionId, message: '' })
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        onEvent({ type: 'error', sessionId, message: (err as Error).message })
      }
    }
  })()

  return { cancel: () => controller.abort() }
}

// 工具：根据 toolCalls 生成初始消息标题
export function autoTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length > 24 ? `${t.slice(0, 24)}…` : t || '新会话'
}
