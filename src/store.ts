// Zustand store：agents / sessions / tasks / models / 流式状态
import { create } from 'zustand'
import { api, streamChat, autoTitle } from './api'
import { translateModelError } from './lib/errors'
import type {
  Agent, Session, SkillMeta, McpServerConfig, Message, ToolCallRecord, ChatEvent, ModelProvider, Attachment, Task,
  KeySource, CustomProvider, ReasoningOption, MessageSegment,
} from './types'

// 网络请求自动重试（后端启动竞态兜底）
async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 800): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= retries) throw err
      await new Promise((r) => setTimeout(r, delay))
    }
  }
}

// 思考模式本地持久化 key
const REASONING_KEY = 'nova.reasoning.pref'

function loadReasoningPref(): ReasoningOption {
  try {
    const raw = localStorage.getItem(REASONING_KEY)
    if (raw) {
      const p = JSON.parse(raw) as ReasoningOption
      if (p && ['adaptive', 'enabled', 'disabled'].includes(p.type)) return p
    }
  } catch { /* ignore */ }
  return { type: 'adaptive' }
}

interface MainState {
  // 数据
  agents: Agent[]
  sessions: Session[]
  currentAgentId: string
  currentSessionId: string
  mcpServers: McpServerConfig[]
  skills: SkillMeta[]
  models: ModelProvider[]
  customProviders: CustomProvider[]
  tasks: Task[]
  taskBadge: boolean

  // 流式状态
  streaming: boolean
  streamingSessionId: string // 正在流式的会话（会话锁：防止并发发送）
  compacting: boolean
  currentText: string
  currentToolCalls: ToolCallRecord[]
  currentSegments: MessageSegment[] // 流式时间线（文本/工具交错，DSH 风格）
  error: string
  cancelFn: (() => void) | null

  // config
  providerKeyStatus: Record<string, KeySource> // providerId → key 状态
  reasoningPref: ReasoningOption // 思考模式偏好（输入框旁切换，localStorage 持久化）
  initialized: boolean // init 幂等标志（StrictMode 防重复）

  // getters
  currentAgent: () => Agent | undefined
  currentSession: () => Session | undefined
  currentMessages: () => Message[]
  currentModelLabel: () => string
  defaultModelId: () => string

  // actions
  init: () => Promise<void>
  saveProviderKey: (providerId: string, key: string) => Promise<void>
  setReasoningPref: (r: ReasoningOption) => void
  saveCustomProvider: (p: CustomProvider) => Promise<void>
  deleteCustomProvider: (id: string) => Promise<void>
  refreshModelCatalog: () => Promise<void>
  loadSessions: (agentId: string) => Promise<void>
  createAgent: (body: Partial<Agent>) => Promise<Agent>
  updateAgent: (id: string, body: Partial<Agent>) => Promise<Agent>
  deleteAgent: (id: string) => Promise<void>
  switchAgent: (agentId: string) => Promise<void>
  newSession: () => Promise<void>
  switchSession: (sessionId: string) => Promise<void>
  renameSession: (sessionId: string, title: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  compactSession: () => Promise<{ skipped?: boolean; message?: string } | undefined>
  cancelStream: () => void
  send: (text: string, attachments?: Attachment[]) => Promise<void>
  requestNotifyPermission: () => Promise<void>
  clearTaskBadge: () => void
}

let taskPollTimer: ReturnType<typeof setInterval> | null = null
let initPromise: Promise<void> | null = null // init 并发锁（防 StrictMode 双执行重复建 Agent）

export const useMainStore = create<MainState>()((set, get) => ({
  agents: [],
  sessions: [],
  currentAgentId: '',
  currentSessionId: '',
  mcpServers: [],
  skills: [],
  models: [],
  customProviders: [],
  tasks: [],
  taskBadge: false,
  streaming: false,
  streamingSessionId: '',
  compacting: false,
  currentText: '',
  currentToolCalls: [],
  currentSegments: [],
  error: '',
  cancelFn: null,
  providerKeyStatus: {},
  reasoningPref: { type: 'adaptive' },
  initialized: false,

  currentAgent: () => get().agents.find((a) => a.id === get().currentAgentId),
  currentSession: () => get().sessions.find((s) => s.id === get().currentSessionId),
  currentMessages: () => get().currentSession()?.messages ?? [],
  currentModelLabel: () => {
    const s = get()
    const agent = s.agents.find((a) => a.id === s.currentAgentId)
    if (!agent) return ''
    const slash = agent.model.indexOf('/')
    const pid = slash > 0 ? agent.model.slice(0, slash) : ''
    const mid = slash > 0 ? agent.model.slice(slash + 1) : agent.model
    const p = s.models.find((x) => x.id === pid)
    const m = p?.models.find((x) => x.id === mid)
    return m?.name ? `${p?.name ?? pid} · ${m.name}` : agent.model
  },
  defaultModelId: () => {
    const p = get().models[0]
    if (p && p.models.length) return `${p.id}/${p.models[0].id}`
    return 'deepseek-v4-flash'
  },

  async init() {
    // 幂等：StrictMode dev 下 useEffect 双调用/并发调用不会重复初始化/重复建 Agent
    if (get().initialized) return
    if (initPromise) return initPromise
    initPromise = (async () => {
      // 后端启动竞态兜底：dev 下 vite 比 server 先就绪，首次请求可能 ECONNREFUSED，
      // 自动重试（最多 3 次，间隔 800ms）避免"初始化失败"一闪而过
      const [agents, mcpServers, skills, models, providerKeys, customProviders] = await fetchWithRetry(() =>
        Promise.all([
          api.listAgents(), api.listMcpServers(), api.listSkills(), api.listModels(),
          api.getProviderKeys(), api.listCustomProviders(),
        ]),
      )
      set({
        agents, mcpServers, skills, models,
        customProviders,
        providerKeyStatus: toKeyStatusMap(providerKeys.providers),
        reasoningPref: loadReasoningPref(),
      })
      if (!agents.length) {
        await get().createAgent({ name: '默认助手', persona: 'You are a helpful assistant. 用中文回答。', model: get().defaultModelId() })
      } else {
        set({ currentAgentId: agents[0].id })
        await get().loadSessions(agents[0].id)
      }
      set({ initialized: true })
      startTaskPolling(set)
    })()
    return initPromise
  },

  async saveProviderKey(providerId: string, key: string) {
    await api.setProviderKey(providerId, key)
    // 空串 = 删除；保存后刷新状态（后端按 文件 > 环境变量 判定）
    const keys = await api.getProviderKeys()
    set({ providerKeyStatus: toKeyStatusMap(keys.providers) })
  },

  setReasoningPref(r: ReasoningOption) {
    set({ reasoningPref: r })
    try { localStorage.setItem(REASONING_KEY, JSON.stringify(r)) } catch { /* ignore */ }
  },

  async saveCustomProvider(p: CustomProvider) {
    await api.saveCustomProvider(p)
    await get().refreshModelCatalog()
  },

  async deleteCustomProvider(id: string) {
    await api.deleteCustomProvider(id)
    await get().refreshModelCatalog()
  },

  async refreshModelCatalog() {
    const [models, customProviders, providerKeys] = await Promise.all([
      api.listModels(), api.listCustomProviders(), api.getProviderKeys(),
    ])
    set({ models, customProviders, providerKeyStatus: toKeyStatusMap(providerKeys.providers) })
  },

  async loadSessions(agentId: string) {
    const sessions = await api.listSessions(agentId)
    set({
      sessions,
      currentAgentId: agentId,
      currentSessionId: sessions.length ? sessions[0].id : '',
      currentText: '',
      currentToolCalls: [],
    })
  },

  async createAgent(body: Partial<Agent>): Promise<Agent> {
    const agent = await api.createAgent(body)
    set({ agents: [...get().agents, agent], currentAgentId: agent.id, sessions: [], currentSessionId: '' })
    return agent
  },

  async updateAgent(id: string, body: Partial<Agent>): Promise<Agent> {
    const updated = await api.updateAgent(id, body)
    set({ agents: get().agents.map((a) => (a.id === id ? updated : a)) })
    return updated
  },

  async deleteAgent(id: string) {
    if (get().currentAgentId === id && get().streaming) get().cancelStream()
    await api.deleteAgent(id)
    const agents = get().agents.filter((a) => a.id !== id)
    if (get().currentAgentId === id) {
      if (agents.length) {
        set({ agents })
        await get().loadSessions(agents[0].id)
      } else {
        set({ agents, sessions: [], currentSessionId: '', currentAgentId: '' })
      }
    } else {
      set({ agents, sessions: get().sessions.filter((s) => s.agentId !== id) })
    }
  },

  async switchAgent(agentId: string) {
    if (get().streaming) get().cancelStream()
    await get().loadSessions(agentId)
  },

  async newSession() {
    if (!get().currentAgentId) return
    if (get().streaming) get().cancelStream()
    const session = await api.createSession(get().currentAgentId)
    set({ sessions: [session, ...get().sessions], currentSessionId: session.id, currentText: '', currentToolCalls: [] })
  },

  async switchSession(sessionId: string) {
    if (get().streaming) get().cancelStream()
    set({ currentSessionId: sessionId, currentText: '', currentToolCalls: [] })
    const local = get().sessions.find((s) => s.id === sessionId)
    if (local && !local.messages.length) {
      const fresh = await api.getSession(sessionId)
      set({ sessions: get().sessions.map((s) => (s.id === sessionId ? fresh : s)) })
    }
  },

  async renameSession(sessionId: string, title: string) {
    const updated = await api.renameSession(sessionId, title)
    set({ sessions: get().sessions.map((s) => (s.id === sessionId ? updated : s)) })
  },

  async deleteSession(sessionId: string) {
    if (get().currentSessionId === sessionId && get().streaming) get().cancelStream()
    await api.deleteSession(sessionId)
    const sessions = get().sessions.filter((s) => s.id !== sessionId)
    let currentSessionId = get().currentSessionId
    if (currentSessionId === sessionId) {
      currentSessionId = sessions.length ? sessions[0].id : ''
    }
    set({ sessions, currentSessionId, currentText: '', currentToolCalls: [] })
  },

  async compactSession() {
    const session = get().currentSession()
    if (!session || get().compacting || get().streaming) return
    set({ compacting: true })
    try {
      const res = await api.compactSession(session.id)
      if (res.skipped) return { skipped: true, message: res.message }
      if (res.summary !== undefined) {
        const patched = { ...session, summary: res.summary }
        if (typeof res.removed === 'number' && patched.messages.length >= res.removed) {
          patched.messages = patched.messages.slice(res.removed)
        }
        set({ sessions: get().sessions.map((s) => (s.id === session.id ? patched : s)) })
      }
      return res
    } finally {
      set({ compacting: false })
    }
  },

  cancelStream() {
    const s = get()
    if (s.cancelFn) { s.cancelFn(); set({ cancelFn: null }) }
    // 流式尾部落盘到发起流式的会话（不依赖 currentSession）
    if (s.currentText || s.currentToolCalls.length || s.currentSegments.length) {
      const sid = s.streamingSessionId || s.currentSessionId
      const session = findSession(s, sid)
      if (session) {
        const { content, toolCalls, segments } = tailFromSegments(s.currentSegments, s.currentText)
        const msg: Message = {
          id: `msg_${Date.now().toString(36)}`,
          role: 'assistant',
          content: content || '(已中断)',
          toolCalls,
          segments,
          createdAt: Date.now(),
        }
        const patched = { ...session, messages: [...session.messages, msg] }
        set({ sessions: s.sessions.map((x) => (x.id === session.id ? patched : x)) })
      }
    }
    set({ streaming: false, streamingSessionId: '', currentText: '', currentToolCalls: [], currentSegments: [] })
  },

  async send(text: string, attachments?: Attachment[]) {
    const trimmed = text.trim()
    if (!trimmed && !attachments?.length) return
    // 会话锁：一次只允许一个流式（无论哪个会话）
    if (get().streaming) return

    let session = get().currentSession()
    if (!session) {
      if (!get().currentAgentId) return
      session = await api.createSession(get().currentAgentId)
      set({ sessions: [session, ...get().sessions], currentSessionId: session.id })
    } else {
      try {
        await api.getSession(session.id)
      } catch {
        if (!get().currentAgentId) return
        session = await api.createSession(get().currentAgentId)
        set({ sessions: [session, ...get().sessions], currentSessionId: session.id })
      }
    }
    if (session.title === '新会话') {
      session.title = autoTitle(trimmed || (attachments?.[0]?.name ?? '新会话'))
    }

    const userMsg: Message = {
      id: `msg_${Date.now().toString(36)}`,
      role: 'user',
      content: trimmed,
      attachments,
      createdAt: Date.now(),
    }
    session.messages = [...session.messages, userMsg]
    set({ sessions: get().sessions.map((x) => (x.id === session.id ? session : x)) })

    set({ currentText: '', currentToolCalls: [], currentSegments: [], streaming: true, streamingSessionId: session.id, error: '' })

    const { cancel } = streamChat(session.id, text, (e: ChatEvent) => {
      handleEvent(set, get, e)
    }, attachments, get().reasoningPref)
    set({ cancelFn: cancel })
  },

  async requestNotifyPermission() {
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission()
      }
    } catch { /* ignore */ }
  },

  clearTaskBadge() {
    set({ taskBadge: false })
  },
}))

// ---------- 事件处理（SSE 流） ----------
type StoreSet = (partial: Partial<MainState>) => void

// API 返回 { providerId: { source } } → 拍平成 Record<providerId, KeySource>
function toKeyStatusMap(providers: Record<string, { source: KeySource }>): Record<string, KeySource> {
  return Object.fromEntries(Object.entries(providers).map(([k, v]) => [k, v.source]))
}

// 中断/错误时：从流式时间线生成尾部落盘消息（文本段拼接 + 工具段列表）
function tailFromSegments(segments: MessageSegment[], fallbackText: string): {
  content: string
  toolCalls?: ToolCallRecord[]
  segments?: MessageSegment[]
} {
  if (segments.length) {
    const content = segments
      .filter((x): x is Extract<MessageSegment, { kind: 'text' }> => x.kind === 'text')
      .map((x) => x.text)
      .join('')
    const calls = segments
      .filter((x): x is Extract<MessageSegment, { kind: 'tool' }> => x.kind === 'tool')
      .map((x) => x.call)
    return {
      content: content || fallbackText,
      toolCalls: calls.length ? calls : undefined,
      segments,
    }
  }
  return { content: fallbackText }
}

// 按事件携带的 sessionId 定位目标会话（不依赖 currentSession，杜绝会话竞态）
function findSession(s: MainState, sessionId: string): Session | undefined {
  return s.sessions.find((x) => x.id === sessionId)
}

function handleEvent(set: StoreSet, get: () => MainState, e: ChatEvent) {
  const s = get()
  const session = findSession(s, e.sessionId)
  if (!session) return // 目标会话不存在（已删除等）→ 忽略事件

  const isCurrent = e.sessionId === s.currentSessionId

  switch (e.type) {
    case 'text': {
      // 流式文本只更新到当前会话的临时区；后台会话（已切走）由 done 一次性落盘
      if (isCurrent) {
        const segs = [...s.currentSegments]
        const last = segs[segs.length - 1]
        if (last && last.kind === 'text') last.text += e.delta
        else segs.push({ kind: 'text', text: e.delta })
        set({ currentText: s.currentText + e.delta, currentSegments: segs })
      }
      break
    }
    case 'tool_call_start': {
      if (!isCurrent) break
      const existing = s.currentToolCalls.find((c) => c.name === e.call.name && c.status === 'running')
      const calls = existing
        ? s.currentToolCalls.map((c) => (c.id === existing.id ? e.call : c))
        : [...s.currentToolCalls, e.call]
      // 时间线：工具段追加在最后（文本段之后），保持发生顺序
      const segs = [...s.currentSegments]
      if (existing) {
        const idx = segs.findIndex((x) => x.kind === 'tool' && x.call.id === existing.id)
        if (idx !== -1) segs[idx] = { kind: 'tool', call: e.call }
        else segs.push({ kind: 'tool', call: e.call })
      } else {
        segs.push({ kind: 'tool', call: e.call })
      }
      set({ currentToolCalls: calls, currentSegments: segs })
      break
    }
    case 'tool_call_end': {
      if (!isCurrent) break
      const idx = s.currentToolCalls.findIndex((c) => c.id === e.call.id)
      const calls = [...s.currentToolCalls]
      if (idx !== -1) calls[idx] = e.call
      else calls.push(e.call)
      const segs = [...s.currentSegments]
      const sidx = segs.findIndex((x) => x.kind === 'tool' && x.call.id === e.call.id)
      if (sidx !== -1) segs[sidx] = { kind: 'tool', call: e.call }
      else segs.push({ kind: 'tool', call: e.call })
      set({ currentToolCalls: calls, currentSegments: segs })
      break
    }
    case 'step':
      break
    case 'usage':
      break
    case 'compact': {
      const patched = { ...session }
      patched.messages = patched.messages.slice(e.removed)
      patched.summary = e.summary
      set({ sessions: s.sessions.map((x) => (x.id === session.id ? patched : x)) })
      break
    }
    case 'done': {
      const patched = { ...session, messages: [...session.messages, e.message] }
      const update: Partial<MainState> = {
        sessions: s.sessions.map((x) => (x.id === session.id ? patched : x)),
      }
      // 只有完成的是当前会话才清流式状态；后台会话完成不动临时区
      if (isCurrent) {
        update.currentText = ''
        update.currentToolCalls = []
        update.currentSegments = []
        update.streaming = false
        update.cancelFn = null
        update.streamingSessionId = ''
      }
      set(update)
      break
    }
    case 'error': {
      const update: Partial<MainState> = {}
      // 后台会话错误：静默，不打扰当前视图
      if (isCurrent) {
        // 原始报错 → 用户可读的自然语言（未配 key / 网络 / 模型失效 / 限流等）
        update.error = translateModelError(e.message)
        update.streaming = false
        update.cancelFn = null
        update.streamingSessionId = ''
        // 保留流式尾部为消息
        if (s.currentText || s.currentToolCalls.length || s.currentSegments.length) {
          const { content, toolCalls, segments } = tailFromSegments(s.currentSegments, s.currentText)
          const tail: Message = {
            id: `msg_${Date.now().toString(36)}`,
            role: 'assistant',
            content: content || '(已中断)',
            toolCalls,
            segments,
            createdAt: Date.now(),
          }
          const patched = { ...session, messages: [...session.messages, tail] }
          update.sessions = s.sessions.map((x) => (x.id === session.id ? patched : x))
        }
        update.currentText = ''
        update.currentToolCalls = []
        update.currentSegments = []
      }
      set(update)
      break
    }
  }
}

// ---------- 任务轮询（20s，有变化点亮徽标 + 浏览器通知） ----------
function startTaskPolling(set: StoreSet) {
  if (taskPollTimer) return
  let prev = new Map<string, number>()
  api.listTasks().then((ts) => {
    prev = new Map(ts.map((t) => [t.id, t.lastRunAt ?? 0]))
    set({ tasks: ts })
  }).catch(() => {})
  taskPollTimer = setInterval(async () => {
    try {
      const ts = await api.listTasks()
      for (const t of ts) {
        const before = prev.get(t.id) ?? 0
        if (t.lastRunAt && t.lastRunAt !== before) {
          set({ taskBadge: true })
          notifyTask(t)
        }
      }
      prev = new Map(ts.map((t) => [t.id, t.lastRunAt ?? 0]))
      set({ tasks: ts })
    } catch { /* 服务不可达忽略 */ }
  }, 20_000)
}

function notifyTask(t: Task) {
  const isErr = t.lastResult?.startsWith('ERROR')
  const body = isErr
    ? `任务「${t.name}」执行失败：${(t.lastResult ?? '').slice(0, 80)}`
    : `任务「${t.name}」执行完成（第 ${t.runCount} 次）`
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`Nova Agent · ${isErr ? '任务失败' : '任务完成'}`, { body })
    }
  } catch { /* ignore */ }
}
