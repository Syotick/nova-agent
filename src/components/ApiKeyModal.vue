<template>
  <transition name="modal">
    <div class="modal-mask" v-if="visible" @click.self="$emit('close')">
      <div class="modal">
        <div class="modal-head">
          <div class="modal-title">
            <span class="modal-icon">🔑</span>
            <h3>API 配置</h3>
          </div>
          <button class="close-btn" @click="$emit('close')">✕</button>
        </div>
        <div class="modal-body">
          <div class="status-row" :class="{ ok: store.hasApiKey }">
            <span class="status-dot"></span>
            <span>
              {{ store.hasApiKey
                ? (store.apiKeySource === 'env' ? '已配置（来自环境变量 DEEPSEEK_API_KEY）' : '已配置（保存在 data/config.json）')
                : '未配置 API Key' }}
            </span>
          </div>

          <label class="field">
            <span class="field-label">DeepSeek API Key</span>
            <input
              v-model="keyInput"
              type="password"
              placeholder="sk-..."
              autocomplete="off"
            />
            <p class="hint">保存到本机 data/config.json（不会显示明文），或通过环境变量 DEEPSEEK_API_KEY 提供。</p>
          </label>
        </div>
        <div class="modal-foot">
          <button class="ghost-btn" @click="$emit('close')">取消</button>
          <button class="primary-btn" @click="save()" :disabled="!keyInput.trim()">保存 Key</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script lang="ts">
import Vue from 'vue'
import { useMainStore } from '../store'

export default Vue.extend({
  name: 'ApiKeyModal',
  props: {
    visible: { type: Boolean, default: false },
  },
  data() {
    return {
      keyInput: '',
    }
  },
  computed: {
    store() {
      return useMainStore()
    },
  },
  watch: {
    visible(v: boolean) {
      if (v) this.keyInput = ''
    },
  },
  methods: {
    async save() {
      await this.store.saveApiKey(this.keyInput.trim())
      this.keyInput = ''
      this.$emit('close')
    },
  },
})
</script>

<style scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(5, 8, 15, 0.6);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  width: 440px;
  background: rgba(17, 21, 32, 0.92);
  border: 1px solid var(--border-strong);
  border-radius: 20px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  animation: scaleIn 0.24s var(--ease-spring);
  overflow: hidden;
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px;
  border-bottom: 1px solid var(--border);
}
.modal-title { display: flex; align-items: center; gap: 10px; }
.modal-icon {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: var(--grad-brand-soft);
  font-size: 14px;
}
.modal-head h3 { font-size: 16px; font-weight: 700; }
.close-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-faint);
  width: 28px;
  height: 28px;
  border-radius: 8px;
  transition: all 0.2s;
}
.close-btn:hover { background: var(--bg-card-hover); color: var(--text); }
.modal-body { padding: 18px 22px; display: flex; flex-direction: column; gap: 16px; }

.status-row {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 13px;
  color: var(--text-dim);
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  background: var(--running-soft);
  border: 1px solid rgba(251, 191, 36, 0.25);
}
.status-row.ok { background: var(--success-soft); border-color: rgba(52, 211, 153, 0.25); color: var(--success); }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--running); box-shadow: 0 0 8px rgba(251, 191, 36, 0.7); }
.status-row.ok .status-dot { background: var(--success); box-shadow: 0 0 8px rgba(52, 211, 153, 0.7); }

.field { display: flex; flex-direction: column; gap: 7px; }
.field-label { font-size: 11px; font-weight: 600; color: var(--text-faint); letter-spacing: 0.08em; text-transform: uppercase; }
.field input {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 9px 12px;
  font-size: 13px;
  font-family: inherit;
  background: var(--bg-input);
  color: var(--text);
  outline: none;
  transition: all 0.2s var(--ease-out);
}
.field input:focus { border-color: rgba(109, 139, 255, 0.5); box-shadow: 0 0 0 3px rgba(109, 139, 255, 0.12); }
.hint { font-size: 12px; color: var(--text-faint); line-height: 1.55; }

.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 22px;
  border-top: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.02);
}
.ghost-btn {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-dim);
  padding: 9px 20px;
  border-radius: 11px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s var(--ease-out);
}
.ghost-btn:hover { background: var(--bg-card-hover); color: var(--text); }
.primary-btn {
  border: none;
  background: var(--grad-brand);
  color: #fff;
  padding: 9px 24px;
  border-radius: 11px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 3px 16px rgba(77, 107, 254, 0.35);
  transition: all 0.25s var(--ease-spring);
}
.primary-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(77, 107, 254, 0.5); }
.primary-btn:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
</style>
