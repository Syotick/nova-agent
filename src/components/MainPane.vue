<template>
  <div class="main-pane">
    <header class="header" v-if="isChatView">
      <div class="header-left">
        <span class="agent-avatar" :style="{ '--accent': currentAgent?.color || '#6d8bff' }">
          {{ (currentAgent?.name || '?').charAt(0) }}
        </span>
        <div class="header-info">
          <span class="agent-name">{{ currentAgent?.name || '未选择 Agent' }}</span>
          <span class="agent-model">{{ currentAgent?.model || '' }}</span>
        </div>
      </div>
    </header>

    <header class="header" v-else>
      <div class="header-left">
        <span class="manager-tag">{{ view === 'skills' ? '📚' : view === 'tasks' ? '⏱️' : '🧰' }}</span>
        <div class="header-info">
          <span class="agent-name">{{ view === 'skills' ? '技能管理' : view === 'tasks' ? '定时任务' : '工具浏览' }}</span>
          <span class="agent-model">{{ view === 'skills' ? 'Skills' : view === 'tasks' ? 'Tasks' : 'Tools' }}</span>
        </div>
      </div>
    </header>

    <main class="pane-body">
      <transition name="view-fade" mode="out-in">
        <ChatView v-if="view === 'chat'" key="chat" />
        <TrajectoryView v-else-if="view === 'trajectory'" key="traj" />
        <SkillManager v-else-if="view === 'skills'" key="skills" />
        <TaskManager v-else-if="view === 'tasks'" key="tasks" />
        <ToolManager v-else key="tools" />
      </transition>
    </main>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import { useMainStore } from '../store'
import ChatView from './ChatView.vue'
import TrajectoryView from './TrajectoryView.vue'
import SkillManager from './SkillManager.vue'
import TaskManager from './TaskManager.vue'
import ToolManager from './ToolManager.vue'

export default Vue.extend({
  name: 'MainPane',
  components: { ChatView, TrajectoryView, SkillManager, TaskManager, ToolManager },
  props: {
    view: { type: String, default: 'chat' },
  },
  computed: {
    store() {
      return useMainStore()
    },
    currentAgent() {
      return this.store.currentAgent
    },
    isChatView(): boolean {
      return this.view === 'chat' || this.view === 'trajectory'
    },
  },
})
</script>

<style scoped>
.main-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
}

/* Header */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
  padding: 0 24px;
  border-bottom: 1px solid var(--border);
  background: rgba(11, 14, 21, 0.5);
  backdrop-filter: blur(var(--blur));
  -webkit-backdrop-filter: blur(var(--blur));
  flex: none;
  z-index: 5;
}
.header-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
.agent-avatar {
  width: 34px;
  height: 34px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  background: var(--grad-brand);
  box-shadow: 0 2px 14px rgba(77, 107, 254, 0.3);
}
.manager-tag { font-size: 20px; }
.header-info { display: flex; flex-direction: column; line-height: 1.25; }
.agent-name { font-weight: 600; font-size: 15px; }
.agent-model {
  font-size: 11px;
  color: var(--text-faint);
  font-family: var(--font-mono);
  letter-spacing: 0.02em;
}

/* Tab switch（胶囊切换） */
.tab-switch {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  border-radius: 12px;
}
.tab-btn {
  border: none;
  background: transparent;
  color: var(--text-dim);
  font-size: 13px;
  padding: 6px 14px;
  border-radius: 9px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.25s var(--ease-out);
  font-weight: 500;
}
.tab-btn:hover { color: var(--text); background: rgba(255, 255, 255, 0.06); }
.tab-btn.active {
  background: var(--grad-brand);
  color: #fff;
  box-shadow: 0 2px 14px rgba(77, 107, 254, 0.35);
}
.back-btn {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-dim);
  padding: 7px 16px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.22s var(--ease-out);
}
.back-btn:hover { background: var(--bg-card-hover); color: var(--text); }

.pane-body {
  flex: 1;
  min-height: 0;
  height: 100%;
  position: relative;
  overflow: hidden;
}
</style>
