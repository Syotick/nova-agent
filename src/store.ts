// Pinia store：agents / sessions / 当前会话 / 流式状态
import { defineStore } from 'pinia'
import { api, streamChat, autoTitle } from './api'
import type { Agent, Session, SkillMeta, McpServerConfig, Message, ToolCallRecord, ChatEvent } from './types'

export const useMainStore = defineStore('main', {
  state: () => ({
    agents: [] as Agent[],
    sessions: [] as Session[],
    currentAgentId: '' as string,
    currentSessionId: '' as string,
    mcpServers: [] as McpServerConfig[],
    skills: [] as SkillMeta[],
    streaming: false,
    currentText: '', // 流式中的临时文本
    currentToolCalls: [] as ToolCallRecord[], // 流式中的临时工具调用
    error: '' as string,
    cancelFn: null as null | (() => void),
    hasApiKey: false,
    apiKeySource: 'none' as 'none' | 'env' | 'configured',
  }),

  getters: {
    currentAgent(state): Agent | undefined {
      return state.agents.find((a) => a.id === state.currentAgentId)
    },
    currentSession(state): Session | undefined {
      return state.sessions.find((s) => s.id === state.currentSessionId)
    },
    currentMessages(state): Message[] {
      return state.currentSession?.messages ?? []
    },
  },

  actions: {
    async init() {
      const [agents, mcpServers, skills, config] = await Promise.all([
        api.listAgents(),
        api.listMcpServers(),
        api.listSkills(),
        api.getConfig(),
      ])
      this.agents = agents
      this.mcpServers = mcpServers
      this.skills = skills
      this.hasApiKey = config.hasApiKey
      this.apiKeySource = (config.apiKeySource ?? 'none') as 'none' | 'env' | 'configured'
      // 默认第一个 agent；没有则建一个默认的
      if (!agents.length) {
        await this.createAgent({ name: '默认助手', persona: 'You are a helpful assistant. 用中文回答。', model: 'deepseek-v4-flash' })
      } else {
        this.currentAgentId = agents[0].id
        await this.loadSessions(agents[0].id)
      }
    },

    async saveApiKey(apiKey: string) {
      const res = await api.setApiKey(apiKey)
      this.hasApiKey = res.hasApiKey
      this.apiKeySource = 'configured'
      return res
    },

    async loadSessions(agentId: string) {
      this.sessions = await api.listSessions(agentId)
      this.currentAgentId = agentId
      if (this.sessions.length) {
        this.currentSessionId = this.sessions[0].id
      } else {
        this.currentSessionId = ''
      }
      this.currentText = ''
      this.currentToolCalls = []
    },

    async createAgent(body: Partial<Agent>): Promise<Agent> {
      const agent = await api.createAgent(body)
      this.agents.push(agent)
      this.currentAgentId = agent.id
      this.sessions = []
      this.currentSessionId = ''
      return agent
    },

    async updateAgent(id: string, body: Partial<Agent>) {
      const updated = await api.updateAgent(id, body)
      const local = this.agents.find((a) => a.id === id)
      if (local) Object.assign(local, updated)
      return updated
    },

    async deleteAgent(id: string) {
      if (this.currentAgentId === id && this.streaming) this.cancelStream()
      await api.deleteAgent(id)
      this.agents = this.agents.filter((a) => a.id !== id)
      // 若删除的是当前 agent，切换到下一个
      if (this.currentAgentId === id) {
        if (this.agents.length) {
          await this.loadSessions(this.agents[0].id)
        } else {
          this.sessions = []
          this.currentSessionId = ''
          this.currentAgentId = ''
        }
      } else {
        this.sessions = this.sessions.filter((s) => s.agentId !== id)
      }
    },

    async switchAgent(agentId: string) {
      if (this.streaming) this.cancelStream()
      await this.loadSessions(agentId)
    },

    async newSession() {
      if (!this.currentAgentId) return
      if (this.streaming) this.cancelStream()
      const session = await api.createSession(this.currentAgentId)
      this.sessions.unshift(session)
      this.currentSessionId = session.id
      this.currentText = ''
      this.currentToolCalls = []
    },

    async switchSession(sessionId: string) {
      if (this.streaming) this.cancelStream()
      this.currentSessionId = sessionId
      this.currentText = ''
      this.currentToolCalls = []
      // 从本地列表取（已含消息），必要时刷新
      const local = this.sessions.find((s) => s.id === sessionId)
      if (local && !local.messages.length) {
        const fresh = await api.getSession(sessionId)
        // 原地更新（保持引用稳定，确保 Vue2 响应式链不中断）
        Object.assign(local, fresh)
      }
    },

    async renameSession(sessionId: string, title: string) {
      const updated = await api.renameSession(sessionId, title)
      const local = this.sessions.find((s) => s.id === sessionId)
      if (local) Object.assign(local, updated)
    },

    async deleteSession(sessionId: string) {
      if (this.currentSessionId === sessionId && this.streaming) this.cancelStream()
      await api.deleteSession(sessionId)
      this.sessions = this.sessions.filter((s) => s.id !== sessionId)
      // 若删的是当前会话，切到下一个或留空
      if (this.currentSessionId === sessionId) {
        if (this.sessions.length) {
          this.currentSessionId = this.sessions[0].id
        } else {
          this.currentSessionId = ''
        }
      }
      this.currentText = ''
      this.currentToolCalls = []
    },

    cancelStream() {
      if (this.cancelFn) {
        this.cancelFn()
        this.cancelFn = null
      }
      // 若流式中有临时内容，保留为一条 assistant 消息
      if (this.currentText || this.currentToolCalls.length) {
        this.commitStreamingTail()
      }
      this.streaming = false
    },

    // 把流式临时内容固化为一条消息
    commitStreamingTail() {
      const session = this.currentSession
      if (!session) return
      const msg: Message = {
        id: `msg_${Date.now().toString(36)}`,
        role: 'assistant',
        content: this.currentText || '(已中断)',
        toolCalls: this.currentToolCalls.length ? this.currentToolCalls : undefined,
        createdAt: Date.now(),
      }
      session.messages.push(msg)
      this.currentText = ''
      this.currentToolCalls = []
    },

    async send(text: string) {
      const trimmed = text.trim()
      if (!trimmed || this.streaming) return

      // 没有会话时自动创建一个（绑定当前 agent）
      let session = this.currentSession
      if (!session) {
        if (!this.currentAgentId) return
        session = await api.createSession(this.currentAgentId)
        this.sessions.unshift(session)
        this.currentSessionId = session.id
      } else {
        // 会话可能已在后端被删（如数据清理）—— 校验存在性，不存在则重建
        try {
          await api.getSession(session.id)
        } catch {
          if (!this.currentAgentId) return
          session = await api.createSession(this.currentAgentId)
          this.sessions.unshift(session)
          this.currentSessionId = session.id
        }
      }
      // 标题：首个用户消息时
      if (session.title === '新会话') {
        session.title = autoTitle(trimmed)
      }

      // 乐观加入用户消息
      const userMsg: Message = {
        id: `msg_${Date.now().toString(36)}`,
        role: 'user',
        content: trimmed,
        createdAt: Date.now(),
      }
      session.messages.push(userMsg)

      // 准备 assistant 流式容器
      this.currentText = ''
      this.currentToolCalls = []
      this.streaming = true
      this.error = ''

      const { cancel } = streamChat(session.id, text, (e: ChatEvent) => {
        this.handleEvent(e)
      })
      this.cancelFn = cancel
    },

    handleEvent(e: ChatEvent) {
      const session = this.currentSession
      if (!session) return
      switch (e.type) {
        case 'text':
          this.currentText += e.delta
          break
        case 'tool_call_start': {
          // 替换同名的 running 记录，或追加
          const existing = this.currentToolCalls.find((c) => c.name === e.call.name && c.status === 'running')
          if (existing) Object.assign(existing, e.call)
          else this.currentToolCalls.push(e.call)
          break
        }
        case 'tool_call_end': {
          const idx = this.currentToolCalls.findIndex((c) => c.id === e.call.id)
          if (idx !== -1) this.currentToolCalls[idx] = e.call
          else this.currentToolCalls.push(e.call)
          break
        }
        case 'step':
          break
        case 'usage':
          break
        case 'done': {
          // 服务端已固化，用服务端消息替换流式容器
          session.messages.push(e.message)
          this.currentText = ''
          this.currentToolCalls = []
          this.streaming = false
          this.cancelFn = null
          break
        }
        case 'error':
          this.error = e.message
          this.commitStreamingTail()
          this.streaming = false
          this.cancelFn = null
          break
      }
    },
  },
})
