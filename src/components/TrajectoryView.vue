<template>
  <div class="trajectory">
    <div v-if="!events.length" class="empty">
      <div class="empty-orb"></div>
      <p>还没有轨迹数据。发一条消息触发工具调用，这里会展示每一步的输入 / 输出 / 耗时。</p>
    </div>

    <div v-else class="traj-body">
      <!-- 时间线 -->
      <div class="timeline">
        <div v-for="(ev, i) in events" :key="i" class="timeline-item" @click="selected = ev">
          <div class="tl-marker" :class="ev.kind">
            <span class="dot" :class="[ev.kind, ev.status]"></span>
            <span class="tl-line" v-if="i < events.length - 1"></span>
          </div>
          <div class="tl-content" :class="{ selected: selected === ev }">
            <div class="tl-title">
              <span v-if="ev.kind === 'turn'" class="tag turn">轮次</span>
              <span v-else-if="ev.kind === 'user'" class="tag user">用户</span>
              <span v-else-if="ev.kind === 'assistant'" class="tag assistant">助手</span>
              <span v-else class="tag tool">工具</span>
              <span class="tl-name">{{ ev.name }}</span>
              <span class="tl-meta" v-if="ev.durationMs != null">{{ fmtDuration(ev.durationMs) }}</span>
            </div>
            <div class="tl-preview" v-if="ev.preview">{{ ev.preview }}</div>
          </div>
        </div>
      </div>

      <!-- Inspector -->
      <div class="inspector" v-if="selected">
        <div class="inspector-head">
          <span class="tag" :class="selected.kind">{{ selected.kind }}</span>
          <span class="inspector-title">{{ selected.name }}</span>
          <button class="close-btn" @click="selected = null">✕</button>
        </div>
        <div class="inspector-body">
          <div v-if="selected.durationMs != null" class="kv">
            <span class="k">耗时</span>
            <span class="v">{{ fmtDuration(selected.durationMs) }}</span>
          </div>
          <div v-if="selected.tokens" class="kv">
            <span class="k">Token</span>
            <span class="v">{{ selected.tokens.input }} in / {{ selected.tokens.output }} out</span>
          </div>
          <div class="block" v-if="selected.input !== undefined">
            <div class="block-title">输入</div>
            <pre>{{ pretty(selected.input) }}</pre>
          </div>
          <div class="block" v-if="selected.output">
            <div class="block-title">输出</div>
            <pre>{{ selected.output }}</pre>
          </div>
          <div class="block" v-if="selected.content">
            <div class="block-title">内容</div>
            <pre>{{ selected.content }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import { useMainStore } from '../store'
import type { Message, ToolCallRecord } from '../types'

interface TrajEvent {
  kind: 'turn' | 'user' | 'assistant' | 'tool'
  name: string
  preview?: string
  status?: 'success' | 'error' | 'running'
  durationMs?: number
  tokens?: { input: number; output: number }
  input?: unknown
  output?: string
  content?: string
}

export default Vue.extend({
  name: 'TrajectoryView',
  data() {
    return { selected: null as TrajEvent | null }
  },
  computed: {
    store() {
      return useMainStore()
    },
    events(): TrajEvent[] {
      const messages: Message[] = this.store.currentSession?.messages ?? []
      const evs: TrajEvent[] = []
      for (let i = 0; i < messages.length; i++) {
        const m = messages[i]
        evs.push({
          kind: m.role === 'user' ? 'user' : 'assistant',
          name: m.role === 'user' ? '用户消息' : '助手回复',
          preview: m.content.slice(0, 60),
          content: m.content,
          tokens: m.tokens,
        })
        if (m.role === 'assistant' && m.toolCalls) {
          for (const tc of m.toolCalls) {
            evs.push(this.toolEvent(tc))
          }
        }
      }
      return evs
    },
  },
  methods: {
    toolEvent(tc: ToolCallRecord): TrajEvent {
      return {
        kind: 'tool',
        name: tc.name,
        preview: this.pretty(tc.input).slice(0, 60),
        status: tc.status,
        durationMs: tc.durationMs,
        input: tc.input,
        output: tc.output,
      }
    },
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
.trajectory { height: 100%; display: flex; flex-direction: column; }
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: var(--text-dim);
  padding: 40px;
  text-align: center;
  position: relative;
  overflow: hidden;
}
.empty-orb {
  position: absolute;
  width: 320px;
  height: 320px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(139, 123, 255, 0.12), transparent 65%);
  filter: blur(16px);
}
.empty p { position: relative; max-width: 380px; font-size: 13px; }

.traj-body { flex: 1; display: flex; min-height: 0; }

/* 时间线 */
.timeline {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
}
.timeline-item { display: flex; gap: 14px; cursor: pointer; }
.tl-marker { display: flex; flex-direction: column; align-items: center; padding-top: 8px; }
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: none;
  position: relative;
  z-index: 1;
}
.dot.success { background: var(--success); box-shadow: 0 0 8px rgba(52, 211, 153, 0.6); }
.dot.error { background: var(--danger); box-shadow: 0 0 8px rgba(248, 113, 113, 0.6); }
.dot.running { background: var(--running); box-shadow: 0 0 8px rgba(251, 191, 36, 0.7); animation: pulse 1.1s infinite; }
.dot.user, .dot.assistant, .dot.turn { background: var(--grad-brand); box-shadow: 0 0 8px rgba(109, 139, 255, 0.5); }
.tl-line {
  width: 2px;
  flex: 1;
  min-height: 20px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.04));
  margin: 2px 0;
}

.tl-content {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  margin-bottom: 4px;
  border-radius: var(--radius-sm);
  transition: all 0.2s var(--ease-out);
  border: 1px solid transparent;
}
.tl-content:hover { background: var(--bg-card-hover); }
.tl-content.selected {
  background: var(--grad-brand-soft);
  border-color: rgba(109, 139, 255, 0.3);
}
.tl-title { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.tag {
  font-size: 10px;
  padding: 1px 7px;
  border-radius: 6px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.tag.turn { background: rgba(139, 123, 255, 0.18); color: #a5b4fc; }
.tag.user { background: rgba(56, 189, 248, 0.16); color: #7dd3fc; }
.tag.assistant { background: rgba(52, 211, 153, 0.15); color: #6ee7b7; }
.tag.tool { background: rgba(251, 191, 36, 0.16); color: #fcd34d; }
.tl-name { font-weight: 600; }
.tl-meta { margin-left: auto; color: var(--text-faint); font-size: 11px; font-family: var(--font-mono); }
.tl-preview {
  color: var(--text-faint);
  font-size: 12px;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 480px;
}

/* Inspector */
.inspector {
  width: 400px;
  flex: none;
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  background: rgba(11, 14, 21, 0.5);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  animation: fadeIn 0.25s;
}
.inspector-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}
.inspector-title { font-weight: 600; font-size: 13px; flex: 1; font-family: var(--font-mono); }
.close-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-faint);
  width: 26px;
  height: 26px;
  border-radius: 7px;
  transition: all 0.2s;
}
.close-btn:hover { background: var(--bg-card-hover); color: var(--text); }
.inspector-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.kv { display: flex; gap: 10px; font-size: 13px; }
.k { color: var(--text-faint); min-width: 50px; }
.v { font-weight: 600; font-family: var(--font-mono); font-size: 12px; }
.block-title { font-size: 10px; font-weight: 600; color: var(--text-faint); letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 6px; }
.block pre {
  font-family: var(--font-mono);
  font-size: 12px;
  background: rgba(11, 14, 21, 0.6);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow-y: auto;
  color: #d1d5db;
  line-height: 1.55;
}
</style>
