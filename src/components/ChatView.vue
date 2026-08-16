<template>
  <div class="chat-view">
    <!-- 消息区（flex:1）：有会话显示消息，无会话显示引导占位 -->
    <div class="chat-area">
      <template v-if="store.currentSession">
        <!-- 压缩横幅：有摘要显示历史摘要；消息多时提示可手动压缩 -->
        <div v-if="store.currentSession.summary || canCompact" class="compact-banner">
          <svg class="compact-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 2v12M2 8h12" />
            <path d="M5 5l3 3 3-3M5 11l3-3 3 3" opacity="0" />
          </svg>
          <template v-if="store.currentSession.summary">
            <span class="compact-label">已压缩</span>
            <span class="compact-summary" :title="store.currentSession.summary">
              {{ store.currentSession.summary }}
            </span>
          </template>
          <template v-else>
            <span class="compact-label">会话较长（{{ store.currentSession.messages.length }} 条消息）</span>
            <button class="compact-btn" :disabled="store.compacting" @click="doCompact()">
              {{ store.compacting ? '压缩中…' : '压缩上下文' }}
            </button>
          </template>
        </div>
        <MessageList />
        <div v-if="store.error" class="error-bar">
          <span class="error-dot"></span>
          {{ store.error }}
        </div>
      </template>

      <div v-else class="no-session">
        <div class="hero-orb"></div>
        <div class="hero-logo">
          <svg viewBox="0 0 48 48" width="52" height="52" fill="none">
            <defs>
              <linearGradient id="heroGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#8b7bff" />
                <stop offset="0.5" stop-color="#4d6bfe" />
                <stop offset="1" stop-color="#38bdf8" />
              </linearGradient>
            </defs>
            <path d="M24 4C14 4 6 12 6 22c0 8.8 6.8 16 15.2 16.8L24 44l2.8-5.2C35.2 38 42 30.8 42 22c0-10-8-18-18-18zm-7 17a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm14 0a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" fill="url(#heroGrad)" />
          </svg>
        </div>
        <h2 class="hero-title">直接对话</h2>
        <p class="hero-sub">在下方输入消息，即可开始 —— 不需要先新建会话</p>
      </div>
    </div>

    <!-- 输入框：永远在底部（无论有没有会话） -->
    <Composer />
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import { useMainStore } from '../store'
import MessageList from './MessageList.vue'
import Composer from './Composer.vue'

export default Vue.extend({
  name: 'ChatView',
  components: { MessageList, Composer },
  data() {
    return {}
  },
  computed: {
    store() {
      return useMainStore()
    },
    // 超过 40 条消息可手动压缩（与后端阈值一致）
    canCompact(): boolean {
      const s = this.store.currentSession
      return !!s && s.messages.length > 40 && !s.summary
    },
  },
  methods: {
    async doCompact() {
      const res = await this.store.compactSession()
      if (res && res.skipped) {
        // 长度不足时忽略
      }
    },
  },
})
</script>

<style scoped>
.chat-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

/* 消息区：占满剩余空间，输入框固定底部 */
.chat-area {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* Hero 占位（无会话时显示在消息区） */
.no-session {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  position: relative;
  overflow: hidden;
  padding-bottom: 40px;
}
.hero-orb {
  position: absolute;
  width: 380px;
  height: 380px;
  border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, rgba(139, 123, 255, 0.15), rgba(77, 107, 254, 0.07) 45%, transparent 70%);
  filter: blur(20px);
  animation: pulse 5s ease-in-out infinite;
}
.hero-logo {
  position: relative;
  animation: float 4s ease-in-out infinite;
  filter: drop-shadow(0 8px 30px rgba(77, 107, 254, 0.35));
}
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
.hero-title { position: relative; font-size: 20px; font-weight: 700; }
.hero-sub { position: relative; color: var(--text-dim); font-size: 13px; }

/* Error */
.error-bar {
  margin: 8px 24px;
  padding: 10px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--danger-soft);
  color: var(--danger);
  border: 1px solid rgba(248, 113, 113, 0.3);
  border-radius: var(--radius-sm);
  font-size: 13px;
  animation: fadeIn 0.25s;
}
.error-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--danger); box-shadow: 0 0 8px rgba(248, 113, 113, 0.7); }

/* 压缩横幅 */
.compact-banner {
  flex: none;
  margin: 10px 24px 0;
  padding: 8px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(109, 139, 255, 0.08);
  border: 1px solid rgba(109, 139, 255, 0.22);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--text-dim);
  animation: fadeIn 0.25s;
}
.compact-icon { flex: none; color: var(--brand); }
.compact-label { flex: none; font-weight: 600; color: var(--brand); white-space: nowrap; }
.compact-summary {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: help;
}
.compact-btn {
  flex: none;
  border: 1px solid rgba(109, 139, 255, 0.4);
  background: var(--grad-brand-soft);
  color: var(--brand);
  font-size: 12px;
  font-family: inherit;
  padding: 4px 12px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.2s var(--ease-out);
}
.compact-btn:hover:not(:disabled) { filter: brightness(1.15); transform: translateY(-1px); }
.compact-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
