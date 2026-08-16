<template>
  <transition name="modal">
    <div class="confirm-mask" v-if="visible" @click.self="cancel()">
      <div class="confirm-dialog">
        <div class="confirm-icon">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3L2 20h20L12 3z" />
            <path d="M12 10v4M12 17h.01" />
          </svg>
        </div>
        <h3 class="confirm-title">{{ title }}</h3>
        <p class="confirm-message">{{ message }}</p>
        <div class="confirm-actions">
          <button class="ghost-btn" @click="cancel()">取消</button>
          <button class="danger-btn" @click="confirm()">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <path d="M3 4h10M6.5 4V2.5h3V4M5 4l.5 9.5h5L11 4" />
            </svg>
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script lang="ts">
import Vue from 'vue'

export default Vue.extend({
  name: 'ConfirmDialog',
  props: {
    visible: { type: Boolean, default: false },
    title: { type: String, default: '确认操作' },
    message: { type: String, default: '' },
    confirmText: { type: String, default: '删除' },
  },
  methods: {
    confirm() {
      this.$emit('confirm')
    },
    cancel() {
      this.$emit('cancel')
    },
  },
})
</script>

<style scoped>
.confirm-mask {
  position: fixed;
  inset: 0;
  background: rgba(5, 8, 15, 0.6);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}
.confirm-dialog {
  width: 360px;
  background: rgba(17, 21, 32, 0.95);
  border: 1px solid var(--border-strong);
  border-radius: 18px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  padding: 26px 24px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  animation: scaleIn 0.24s var(--ease-spring);
  text-align: center;
}
.confirm-icon {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--danger-soft);
  color: var(--danger);
  margin-bottom: 4px;
  animation: glowPulse 2s infinite;
}
.confirm-title { font-size: 16px; font-weight: 700; }
.confirm-message { font-size: 13px; color: var(--text-dim); line-height: 1.6; }
.confirm-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
  width: 100%;
}
.ghost-btn, .danger-btn {
  flex: 1;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-dim);
  padding: 9px 16px;
  border-radius: 11px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  transition: all 0.22s var(--ease-out);
}
.ghost-btn:hover { background: var(--bg-card-hover); color: var(--text); }
.danger-btn {
  border-color: rgba(248, 113, 113, 0.4);
  background: var(--danger-soft);
  color: var(--danger);
}
.danger-btn:hover { background: rgba(248, 113, 113, 0.22); transform: translateY(-1px); }
.danger-btn:active { transform: scale(0.97); }
</style>
