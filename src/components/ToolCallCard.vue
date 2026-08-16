<template>
  <div class="tool-card" :class="call.status" @click="expanded = !expanded">
    <!-- 折叠态头部 -->
    <div class="card-head">
      <span class="status-dot" :class="call.status"></span>
      <span class="tool-icon">
        <svg v-if="call.status === 'running'" class="spin" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <path d="M8 2a6 6 0 1 1-6 6" />
        </svg>
        <svg v-else-if="call.status === 'success'" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 8.5l3.5 3.5L13 4.5" />
        </svg>
        <svg v-else viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </span>
      <span class="tool-name">{{ call.name }}</span>
      <span class="tool-status" :class="call.status">
        {{ call.status === 'running' ? '运行中' : call.status === 'success' ? '完成' : '失败' }}
      </span>
      <span class="duration" v-if="call.durationMs > 0">{{ fmtDuration(call.durationMs) }}</span>
      <span class="expand-arrow" :class="{ open: expanded }">
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </span>
    </div>

    <!-- 展开详情 -->
    <div class="card-body" v-show="expanded">
      <div class="field">
        <div class="field-label">输入</div>
        <pre class="json">{{ pretty(call.input) }}</pre>
      </div>
      <div class="field">
        <div class="field-label">输出</div>
        <pre class="output">{{ call.output || (call.status === 'running' ? '…' : '') }}</pre>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import type { ToolCallRecord } from '../types'

export default Vue.extend({
  name: 'ToolCallCard',
  props: {
    call: { type: Object as () => ToolCallRecord, required: true },
  },
  data() {
    return { expanded: false }
  },
  methods: {
    pretty(v: unknown): string {
      try {
        return JSON.stringify(v, null, 2)
      } catch {
        return String(v)
      }
    },
    fmtDuration(ms: number): string {
      return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
    },
  },
})
</script>

<style scoped>
.tool-card {
  margin-top: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  overflow: hidden;
  transition: all 0.25s var(--ease-out);
}
.tool-card:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: var(--border-strong);
  transform: translateY(-1px);
}

/* 状态左边框 */
.tool-card.running { border-left: 3px solid var(--running); box-shadow: inset 0 0 20px rgba(251, 191, 36, 0.04); }
.tool-card.success { border-left: 3px solid var(--success); }
.tool-card.error { border-left: 3px solid var(--danger); }

.card-head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 13px;
  font-size: 13px;
}
.status-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.status-dot.running { background: var(--running); box-shadow: 0 0 8px rgba(251, 191, 36, 0.8); animation: pulse 1.1s infinite; }
.status-dot.success { background: var(--success); box-shadow: 0 0 6px rgba(52, 211, 153, 0.5); }
.status-dot.error { background: var(--danger); box-shadow: 0 0 6px rgba(248, 113, 113, 0.5); }
.tool-icon { display: flex; align-items: center; color: var(--text-dim); }
.tool-icon .spin { color: var(--running); animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.tool-name {
  font-weight: 600;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text);
}
.tool-status { font-size: 11px; padding: 1px 8px; border-radius: 999px; font-weight: 500; }
.tool-status.running { color: var(--running); background: var(--running-soft); }
.tool-status.success { color: var(--success); background: var(--success-soft); }
.tool-status.error { color: var(--danger); background: var(--danger-soft); }
.duration { margin-left: auto; color: var(--text-faint); font-size: 11px; font-family: var(--font-mono); }
.expand-arrow { color: var(--text-faint); display: flex; transition: transform 0.25s var(--ease-spring); }
.expand-arrow.open { transform: rotate(180deg); }

.card-body {
  padding: 2px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  animation: fadeIn 0.2s;
}
.field-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-faint);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 5px;
}
.json {
  font-family: var(--font-mono);
  font-size: 12px;
  background: rgba(11, 14, 21, 0.6);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
  overflow-x: auto;
  max-height: 200px;
  overflow-y: auto;
  color: #a5b4fc;
  line-height: 1.55;
}
.output {
  font-family: var(--font-mono);
  font-size: 12px;
  background: rgba(11, 14, 21, 0.6);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 240px;
  overflow-y: auto;
  color: #d1d5db;
  line-height: 1.55;
}
</style>
