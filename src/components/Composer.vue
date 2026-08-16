<template>
  <div class="composer-wrap">
    <div class="composer" :class="{ focused: focused, streaming: store.streaming }">
      <textarea
        ref="ta"
        v-model="draft"
        class="composer-input"
        :placeholder="store.streaming ? '正在回复…' : '输入消息，Enter 发送，Shift+Enter 换行'"
        :disabled="store.streaming"
        @focus="focused = true"
        @blur="focused = false"
        @keydown.enter.exact.prevent="send()"
      ></textarea>
      <div class="composer-actions">
        <span class="hint" v-if="!store.streaming && draft">Enter 发送 · Shift+Enter 换行</span>
        <button v-if="!store.streaming" class="send-btn" @click="send()" :disabled="!draft.trim()">
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 8l10-5-3 10-2.5-3.5L3 8z" />
          </svg>
          发送
        </button>
        <button v-else class="stop-btn" @click="store.cancelStream()">
          <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor">
            <rect x="4" y="4" width="8" height="8" rx="1.5" />
          </svg>
          停止
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import { useMainStore } from '../store'

export default Vue.extend({
  name: 'Composer',
  data() {
    return { draft: '', focused: false }
  },
  computed: {
    store() {
      return useMainStore()
    },
  },
  methods: {
    send() {
      const text = this.draft.trim()
      if (!text || this.store.streaming) return
      this.store.send(text)
      this.draft = ''
      this.$nextTick(() => {
        const ta = this.$refs.ta as HTMLTextAreaElement | undefined
        if (ta) ta.style.height = 'auto'
      })
    },
  },
})
</script>

<style scoped>
.composer-wrap {
  flex: none;
  padding: 10px 24px 22px;
  max-width: 860px;
  margin: 0 auto;
  width: 100%;
}
.composer {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px 12px;
  background: var(--glass);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  backdrop-filter: blur(var(--blur));
  -webkit-backdrop-filter: blur(var(--blur));
  transition: all 0.3s var(--ease-out);
  box-shadow: var(--shadow-sm);
}
.composer.focused {
  border-color: rgba(109, 139, 255, 0.45);
  box-shadow: var(--shadow-glow);
  transform: translateY(-1px);
}
.composer.streaming {
  border-color: rgba(109, 139, 255, 0.4);
  box-shadow: 0 0 0 1px rgba(109, 139, 255, 0.2), 0 8px 40px rgba(77, 107, 254, 0.18);
}
.composer-input {
  width: 100%;
  min-height: 44px;
  max-height: 180px;
  resize: vertical;
  border: none;
  background: transparent;
  padding: 6px 4px;
  font-size: 14px;
  font-family: inherit;
  line-height: 1.6;
  color: var(--text);
  outline: none;
}
.composer-input::placeholder { color: var(--text-faint); }
.composer-input:disabled { cursor: not-allowed; }
.composer-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
.hint { font-size: 11px; color: var(--text-faint); margin-right: auto; animation: fadeIn 0.2s; }

.send-btn {
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 20px;
  border-radius: 11px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: var(--grad-brand);
  box-shadow: 0 3px 16px rgba(77, 107, 254, 0.35);
  transition: all 0.25s var(--ease-spring);
}
.send-btn:hover:not(:disabled) { transform: translateY(-1px) scale(1.03); box-shadow: 0 6px 24px rgba(77, 107, 254, 0.5); }
.send-btn:active:not(:disabled) { transform: scale(0.97); }
.send-btn:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }

.stop-btn {
  border: 1px solid rgba(248, 113, 113, 0.4);
  background: var(--danger-soft);
  color: var(--danger);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 20px;
  border-radius: 11px;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.25s var(--ease-out);
  animation: fadeIn 0.25s;
}
.stop-btn:hover { background: rgba(248, 113, 113, 0.22); transform: scale(1.03); }
</style>
