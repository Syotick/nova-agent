<template>
  <aside class="sidebar">
    <!-- Brand -->
    <div class="brand">
      <div class="brand-logo">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
          <defs>
            <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#8b7bff" />
              <stop offset="0.5" stop-color="#4d6bfe" />
              <stop offset="1" stop-color="#38bdf8" />
            </linearGradient>
          </defs>
          <path d="M12 2C7 2 3 6 3 11c0 4.4 3.4 8 7.6 8.4L12 22l1.4-2.6C17.6 19 21 15.4 21 11c0-5-4-9-9-9zm-3.5 8.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm7 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" fill="url(#brandGrad)" />
        </svg>
      </div>
      <div class="brand-text">
        <span class="brand-name">my-agent</span>
        <span class="brand-sub">麻雀版 Claude Code</span>
      </div>
    </div>

    <!-- Agents -->
    <div class="section agents-section">
      <div class="section-head">
        <span class="section-title">Agents</span>
        <button class="icon-btn" title="新建 Agent" @click="$emit('new-agent')">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
      </div>
      <div class="agent-list">
        <div
          v-for="agent in store.agents"
          :key="agent.id"
          class="agent-item"
          :class="{ active: agent.id === store.currentAgentId }"
          @click="onAgentClick(agent.id)"
          @dblclick="$emit('edit-agent', agent)"
        >
          <span class="agent-avatar" :style="{ '--accent': agent.color }">
            {{ agent.name.charAt(0) }}
          </span>
          <span class="agent-item-name">{{ agent.name }}</span>
          <span class="agent-count" :title="'工具: ' + agent.mcpServerIds.length + ' 技能: ' + agent.skillIds.length">
            {{ agent.mcpServerIds.length + agent.skillIds.length }}
          </span>
          <!-- hover 操作 -->
          <span class="row-actions">
            <button class="row-btn" title="编辑" @click.stop="$emit('edit-agent', agent)">
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5z" />
              </svg>
            </button>
            <button class="row-btn danger" title="删除" @click.stop="removeAgent(agent)">
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <path d="M3 4h10M6.5 4V2.5h3V4M5 4l.5 9.5h5L11 4" />
              </svg>
            </button>
          </span>
        </div>
        <div v-if="!store.agents.length" class="empty-hint">还没有 Agent</div>
      </div>
    </div>

    <!-- Sessions -->
    <div class="section grow">
      <div class="section-head">
        <span class="section-title">会话</span>
        <button class="icon-btn" title="新建会话" @click="onNewSession()">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
      </div>
      <div class="session-list">
        <div
          v-for="session in store.sessions"
          :key="session.id"
          class="session-item"
          :class="{ active: session.id === store.currentSessionId }"
          @click="onSessionClick(session.id)"
        >
          <svg class="session-icon" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2.5 3h11M2.5 8h11M2.5 13h7" />
          </svg>
          <!-- 行内重命名 -->
          <input
            v-if="editingSessionId === session.id"
            v-model="renameDraft"
            class="rename-input"
            @click.stop
            @keydown.enter.prevent="saveRename(session.id)"
            @keydown.esc="editingSessionId = ''"
            @blur="saveRename(session.id)"
          />
          <span v-else class="session-title">{{ session.title }}</span>
          <!-- hover 操作 -->
          <span class="row-actions" v-if="editingSessionId !== session.id">
            <button class="row-btn" title="重命名" @click.stop="startRename(session)">
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5z" />
              </svg>
            </button>
            <button class="row-btn danger" title="删除" @click.stop="removeSession(session)">
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <path d="M3 4h10M6.5 4V2.5h3V4M5 4l.5 9.5h5L11 4" />
              </svg>
            </button>
          </span>
        </div>
        <div v-if="!store.sessions.length" class="empty-hint">还没有会话，点 ＋ 新建</div>
      </div>
    </div>

    <!-- 视图导航（对话 / 轨迹 / 技能 / 工具 互相切换） -->
    <div class="section nav-section">
      <div class="section-head">
        <span class="section-title">导航</span>
      </div>
      <div class="nav-list">
        <div
          class="nav-item"
          :class="{ active: view === 'chat' }"
          @click="$emit('navigate', 'chat')"
        >
          <span class="nav-icon">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 2a5 5 0 0 0-5 5c0 1.5.6 2.8 1.6 3.8L4 13l2.2-1.1c.6.2 1.2.3 1.8.3a5 5 0 0 0 0-10.2z" />
            </svg>
          </span>
          <span class="nav-label">对话</span>
        </div>
        <div
          class="nav-item"
          :class="{ active: view === 'trajectory' }"
          @click="$emit('navigate', 'trajectory')"
        >
          <span class="nav-icon">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 3h12M2 8h12M2 13h12" />
              <circle cx="5" cy="3" r="1.6" fill="currentColor" stroke="none" />
              <circle cx="11" cy="8" r="1.6" fill="currentColor" stroke="none" />
              <circle cx="7" cy="13" r="1.6" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <span class="nav-label">轨迹</span>
        </div>
        <div
          class="nav-item"
          :class="{ active: view === 'skills' }"
          @click="$emit('navigate', 'skills')"
        >
          <span class="nav-icon">📚</span>
          <span class="nav-label">技能管理</span>
        </div>
        <div
          class="nav-item"
          :class="{ active: view === 'tools' }"
          @click="$emit('navigate', 'tools')"
        >
          <span class="nav-icon">🧰</span>
          <span class="nav-label">工具浏览</span>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <span class="status-dot" :class="{ streaming: store.streaming }"></span>
      <span class="status-text">{{ store.streaming ? '运行中' : '就绪' }}</span>
      <span class="mcp-badge">{{ store.mcpServers.length }} MCP</span>
      <button class="key-btn" :class="{ configured: store.hasApiKey }" title="API Key 设置" @click="$emit('open-key')">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="7.5" cy="7.5" r="3.5" />
          <path d="M10 10l3.5 3.5M12 12l1.5-1.5" />
        </svg>
      </button>
    </div>

    <!-- 确认弹窗 -->
    <ConfirmDialog
      :visible="confirmVisible"
      :title="confirmTitle"
      :message="confirmMessage"
      :confirm-text="confirmText"
      @confirm="doConfirm()"
      @cancel="confirmVisible = false"
    />
  </aside>
</template>

<script lang="ts">
import Vue from 'vue'
import { useMainStore } from '../store'
import ConfirmDialog from './ConfirmDialog.vue'

export default Vue.extend({
  name: 'Sidebar',
  components: { ConfirmDialog },
  props: {
    view: { type: String, default: 'chat' },
  },
  data() {
    return {
      editingSessionId: '',
      renameDraft: '',
      confirmVisible: false,
      confirmTitle: '',
      confirmMessage: '',
      confirmText: '删除',
      pendingConfirm: null as null | (() => void),
    }
  },
  computed: {
    store() {
      return useMainStore()
    },
  },
  methods: {
    // 切换 agent：先回对话视图再执行
    onAgentClick(agentId: string) {
      this.$emit('navigate', 'chat')
      this.store.switchAgent(agentId)
    },
    // 新建会话：先回对话视图再执行
    onNewSession() {
      this.$emit('navigate', 'chat')
      this.store.newSession()
    },
    // 切换会话：先回对话视图再执行
    onSessionClick(sessionId: string) {
      this.$emit('navigate', 'chat')
      this.store.switchSession(sessionId)
    },
    // Agent 删除（弹窗确认）
    removeAgent(agent: { id: string; name: string }) {
      this.confirmTitle = '删除 Agent'
      this.confirmMessage = `确定删除 Agent「${agent.name}」？其所有会话也会被删除，此操作不可恢复。`
      this.confirmText = '删除'
      this.pendingConfirm = () => this.store.deleteAgent(agent.id)
      this.confirmVisible = true
    },
    // 会话删除（弹窗确认）
    removeSession(session: { id: string; title: string }) {
      this.confirmTitle = '删除会话'
      this.confirmMessage = `确定删除会话「${session.title}」？此操作不可恢复。`
      this.confirmText = '删除'
      this.pendingConfirm = () => this.store.deleteSession(session.id)
      this.confirmVisible = true
    },
    // 执行确认
    doConfirm() {
      const fn = this.pendingConfirm
      this.confirmVisible = false
      this.pendingConfirm = null
      if (fn) fn()
    },
    // 会话重命名
    startRename(session: { id: string; title: string }) {
      this.editingSessionId = session.id
      this.renameDraft = session.title
      this.$nextTick(() => {
        const input = this.$el.querySelector('.rename-input') as HTMLInputElement | null
        input?.focus()
        input?.select()
      })
    },
    async saveRename(sessionId: string) {
      const title = this.renameDraft.trim()
      if (this.editingSessionId !== sessionId) return
      if (title) {
        await this.store.renameSession(sessionId, title)
      }
      this.editingSessionId = ''
      this.renameDraft = ''
    },
  },
})
</script>

<style scoped>
.sidebar {
  width: 264px;
  flex: none;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 18px 12px 14px;
  gap: 16px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  backdrop-filter: blur(var(--blur));
  -webkit-backdrop-filter: blur(var(--blur));
}

/* Brand */
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 8px;
}
.brand-logo {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: var(--grad-brand-soft);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 4px 16px rgba(77, 107, 254, 0.25);
  transition: transform 0.3s var(--ease-spring);
}
.brand:hover .brand-logo { transform: rotate(-6deg) scale(1.05); }
.brand-text { display: flex; flex-direction: column; line-height: 1.25; }
.brand-name {
  font-weight: 700;
  font-size: 15px;
  background: var(--grad-brand);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  letter-spacing: 0.01em;
}
.brand-sub { font-size: 11px; color: var(--text-faint); }

/* Section */
.section { display: flex; flex-direction: column; gap: 8px; min-height: 0; }
/* 导航：固定不被压缩 */
.nav-section { flex: none; }
/* Agents：限高可滚动（agent 多时不撑爆侧边栏） */
.agents-section {
  flex: 0 1 auto;
  max-height: 38%;
  min-height: 60px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.agents-section .section-head { flex: none; position: sticky; top: 0; background: var(--bg-sidebar); z-index: 1; }
.agents-section .agent-list { overflow: visible; }
/* 会话：占满剩余空间并滚动 */
.section.grow { flex: 1; overflow-y: auto; }
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
}
.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-faint);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.icon-btn {
  border: none;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s var(--ease-out);
}
.icon-btn:hover {
  background: var(--bg-card-hover);
  color: var(--brand);
  transform: scale(1.08);
}

/* Agent list */
.agent-list, .session-list { display: flex; flex-direction: column; gap: 3px; }
.agent-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.22s var(--ease-out);
  border: 1px solid transparent;
  flex: none;
}
.agent-item:hover {
  background: var(--bg-card-hover);
  transform: translateX(2px);
}
.agent-item.active {
  background: var(--grad-brand-soft);
  border-color: rgba(109, 139, 255, 0.28);
  box-shadow: 0 2px 14px rgba(77, 107, 254, 0.14);
}
.agent-avatar {
  width: 28px;
  height: 28px;
  flex: none;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  background: var(--grad-brand);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
}
.agent-item-name { flex: 1; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agent-item.active .agent-item-name { font-weight: 600; }
.agent-count {
  font-size: 10px;
  color: var(--text-dim);
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  padding: 1px 7px;
}
.agent-item.active .agent-count { background: rgba(109, 139, 255, 0.22); color: var(--brand); }

/* hover 行操作按钮 */
.row-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.18s var(--ease-out);
  flex: none;
}
.agent-item:hover .row-actions,
.session-item:hover .row-actions { opacity: 1; }
.row-btn {
  border: none;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.row-btn:hover { background: rgba(109, 139, 255, 0.15); color: var(--brand); }
.row-btn.danger:hover { background: var(--danger-soft); color: var(--danger); }

/* 会话行内重命名 */
.rename-input {
  flex: 1;
  min-width: 0;
  border: 1px solid rgba(109, 139, 255, 0.5);
  border-radius: 6px;
  background: var(--bg-input);
  color: var(--text);
  font-size: 12px;
  font-family: inherit;
  padding: 2px 6px;
  outline: none;
  box-shadow: 0 0 0 3px rgba(109, 139, 255, 0.12);
}

/* Session list */
.session-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  color: var(--text-dim);
  transition: all 0.22s var(--ease-out);
  border: 1px solid transparent;
  flex: none;
}
.session-item:hover {
  background: var(--bg-card-hover);
  color: var(--text);
  transform: translateX(2px);
}
.session-item.active {
  background: var(--grad-brand-soft);
  color: var(--text);
  border-color: rgba(109, 139, 255, 0.25);
}
.session-icon { flex: none; opacity: 0.7; }
.session-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty-hint { color: var(--text-faint); font-size: 12px; padding: 6px 10px; }

/* 管理导航 */
.nav-list { display: flex; flex-direction: column; gap: 3px; }
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  color: var(--text-dim);
  transition: all 0.22s var(--ease-out);
  border: 1px solid transparent;
}
.nav-item:hover { background: var(--bg-card-hover); color: var(--text); transform: translateX(2px); }
.nav-item.active {
  background: var(--grad-brand-soft);
  color: var(--text);
  border-color: rgba(109, 139, 255, 0.28);
}
.nav-icon { font-size: 14px; }
.nav-label { font-weight: 500; }

/* Footer */
.footer {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 8px 0;
  border-top: 1px solid var(--border);
  flex: none;
  font-size: 12px;
  color: var(--text-faint);
}
.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 8px rgba(52, 211, 153, 0.6);
}
.status-dot.streaming { background: var(--running); box-shadow: 0 0 8px rgba(251, 191, 36, 0.7); animation: pulse 1.1s infinite; }
.status-text { flex: 1; }
.mcp-badge {
  font-size: 10px;
  background: rgba(255, 255, 255, 0.07);
  color: var(--text-dim);
  padding: 2px 8px;
  border-radius: 999px;
}
.key-btn {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s var(--ease-out);
}
.key-btn:hover { background: var(--bg-card-hover); color: var(--text); transform: scale(1.06); }
.key-btn.configured { border-color: rgba(52, 211, 153, 0.4); color: var(--success); }
</style>
