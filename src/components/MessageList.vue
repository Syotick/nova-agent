<template>
  <div class="message-list" ref="list">
    <transition-group name="msg" tag="div" class="msgs">
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="msg-row"
        :class="msg.role"
      >
        <div class="msg-avatar" v-if="msg.role === 'assistant'">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
            <defs>
              <linearGradient id="msgAvaGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#8b7bff" />
                <stop offset="1" stop-color="#38bdf8" />
              </linearGradient>
            </defs>
            <path d="M12 2C7 2 3 6 3 11c0 4.4 3.4 8 7.6 8.4L12 22l1.4-2.6C17.6 19 21 15.4 21 11c0-5-4-9-9-9z" fill="url(#msgAvaGrad)" />
          </svg>
        </div>
        <div class="msg-bubble" :class="msg.role">
          <div class="msg-content markdown-body" v-html="renderMarkdown(msg.content)"></div>
          <ToolCallCard v-for="tc in msg.toolCalls" :key="tc.id" :call="tc" />
        </div>
      </div>
    </transition-group>

    <!-- 流式中的临时消息：独立居中容器，与 .msgs 同一约束 -->
    <div v-if="store.streaming || store.currentText || store.currentToolCalls.length" class="msgs streaming-msgs">
      <div class="msg-row assistant streaming-row">
        <div class="msg-avatar">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
            <path d="M12 2C7 2 3 6 3 11c0 4.4 3.4 8 7.6 8.4L12 22l1.4-2.6C17.6 19 21 15.4 21 11c0-5-4-9-9-9z" fill="url(#streamGrad)" />
            <defs><linearGradient id="streamGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b7bff" /><stop offset="1" stop-color="#38bdf8" /></linearGradient></defs>
          </svg>
        </div>
        <div class="msg-bubble assistant streaming-bubble">
          <div class="msg-content markdown-body" v-html="streamHtml"></div>
          <ToolCallCard v-for="tc in store.currentToolCalls" :key="'s' + tc.id" :call="tc" />
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import { useMainStore } from '../store'
import ToolCallCard from './ToolCallCard.vue'
import { renderMarkdown, renderStreaming } from '../markdown'

export default Vue.extend({
  name: 'MessageList',
  components: { ToolCallCard },
  data() {
    return {}
  },
  computed: {
    store() {
      return useMainStore()
    },
    messages() {
      return this.store.currentSession?.messages ?? []
    },
    streamHtml(): string {
      if (this.store.currentText) {
        // 流式文本：转义 + 渲染，光标用 CSS 伪元素
        return renderStreaming(this.store.currentText)
      }
      // 思考中动画
      return '<span class="thinking">思考中</span><span class="thinking-dots"><i></i><i></i><i></i></span>'
    },
    renderMarkdown() {
      return renderMarkdown
    },
  },
  watch: {
    'store.currentText'() {
      this.scrollBottom()
    },
    'store.currentSessionId'() {
      this.$nextTick(this.scrollBottom)
    },
    messages: {
      deep: true,
      handler() {
        this.$nextTick(this.scrollBottom)
      },
    },
  },
  methods: {
    scrollBottom() {
      const el = this.$refs.list as HTMLElement | undefined
      if (el) el.scrollTop = el.scrollHeight
    },
  },
})
</script>

<style scoped>
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 28px 24px;
  min-height: 0;
  scroll-behavior: smooth;
}
.msgs { display: flex; flex-direction: column; gap: 16px; max-width: 860px; margin: 0 auto; }
.streaming-msgs { animation: fadeInUp 0.25s var(--ease-out); }

.msg-row { display: flex; gap: 12px; }
.msg-row.user { justify-content: flex-end; }
.msg-row.assistant { justify-content: flex-start; }

/* 助手头像 */
.msg-avatar {
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  margin-top: 2px;
}

/* 气泡 */
.msg-bubble {
  max-width: 82%;
  padding: 12px 16px;
  border-radius: 16px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 14px;
}

/* 用户：渐变 */
.msg-row.user .msg-bubble {
  background: var(--grad-brand);
  color: #fff;
  border-bottom-right-radius: 6px;
  box-shadow: 0 4px 20px rgba(77, 107, 254, 0.28);
}

/* 助手：玻璃 */
.msg-row.assistant .msg-bubble {
  background: var(--glass);
  border: 1px solid var(--border);
  border-bottom-left-radius: 6px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* 流式 */
.streaming-bubble { border-color: rgba(109, 139, 255, 0.35) !important; box-shadow: var(--shadow-glow); }
.thinking { color: var(--text-dim); font-size: 13px; }
.thinking-dots { display: inline-flex; gap: 3px; margin-left: 6px; vertical-align: middle; }
.thinking-dots i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--brand);
  animation: bounceDot 1.2s infinite;
}
.thinking-dots i:nth-child(2) { animation-delay: 0.15s; }
.thinking-dots i:nth-child(3) { animation-delay: 0.3s; }
@keyframes bounceDot {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-4px); opacity: 1; }
}
</style>
