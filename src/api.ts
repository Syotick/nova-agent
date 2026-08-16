// API 封装：REST + SSE 流式聊天
import type { Agent, Session, SkillMeta, McpServerConfig, ChatEvent, Message, ToolInfo, Task } from './types'

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
  listSkills: () => json<SkillMeta[]>('/skills'),
  listTools: () => json<ToolInfo[]>('/tools'),

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
  renameSession: (id: string, title: string) => json<Session>(`/sessions/${id}`, { method: 'PUT', body: JSON.stringify({ title }) }),
  deleteSession: (id: string) => json<{ ok: boolean }>(`/sessions/${id}`, { method: 'DELETE' }),
  compactSession: (id: string) =>
    json<{ ok: boolean; skipped?: boolean; message?: string; summary?: string; removed?: number; kept?: number }>(
      `/sessions/${id}/compact`, { method: 'POST' }),

  stopChat: (sessionId: string) => json<{ ok: boolean }>('/chat/stop', { method: 'POST', body: JSON.stringify({ sessionId }) }),

  // tasks（定时任务）
  listTasks: () => json<Task[]>('/tasks'),
  createTask: (body: { name: string; agentId: string; cron: string; prompt?: string }) =>
    json<Task>('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  updateTask: (id: string, body: Partial<{ name: string; cron: string; prompt: string; enabled: boolean }>) =>
    json<Task>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  runTask: (id: string) => json<{ ok: boolean; result: string }>(`/tasks/${id}/run`, { method: 'POST' }),
  deleteTask: (id: string) => json<{ ok: boolean }>(`/tasks/${id}`, { method: 'DELETE' }),

  // config
  getConfig: () => json<{ hasApiKey: boolean; apiKeySource: string }>('/config'),
  setApiKey: (apiKey: string) => json<{ ok: boolean; hasApiKey: boolean }>('/config', { method: 'POST', body: JSON.stringify({ apiKey }) }),
}

// SSE 流式聊天：onEvent 回调返回一个 cancel 函数
export function streamChat(
  sessionId: string,
  text: string,
  onEvent: (e: ChatEvent) => void,
): { cancel: () => void } {
  const controller = new AbortController()

  ;(async () => {
    try {
      const res = await fetch(`${BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, text }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}))
        onEvent({ type: 'error', message: (body as { error?: string }).error ?? `HTTP ${res.status}` })
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
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
              onEvent(JSON.parse(line.slice(6)) as ChatEvent)
            } catch {
              // 忽略坏帧
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        onEvent({ type: 'error', message: (err as Error).message })
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
