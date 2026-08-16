<template>
  <div class="manager">
    <div class="manager-head">
      <div class="manager-title">
        <span class="manager-icon">⏱️</span>
        <div>
          <h3>定时任务</h3>
          <p>让 Agent 按 cron 定时执行任务（如每 5 分钟盯盘、每日生成日报）。任务在专用会话中运行，上下文连续。</p>
        </div>
      </div>
      <button class="primary-btn" @click="openCreate()">＋ 新建任务</button>
    </div>

    <!-- 任务列表 -->
    <div class="task-list">
      <div v-for="task in tasks" :key="task.id" class="task-card">
        <div class="task-card-head">
          <span class="task-dot" :class="{ off: !task.enabled }"></span>
          <span class="task-name">{{ task.name }}</span>
          <span class="task-cron mono">{{ task.cron }}</span>
          <span class="task-agent" :title="'Agent: ' + agentName(task.agentId)">
            {{ agentName(task.agentId) }}
          </span>
        </div>
        <p v-if="task.prompt" class="task-prompt">{{ task.prompt }}</p>
        <div class="task-meta">
          <span>运行 {{ task.runCount }} 次</span>
          <span v-if="task.lastRunAt">上次：{{ fmtTime(task.lastRunAt) }}</span>
          <span v-if="task.lastResult">结果：{{ task.lastResult.slice(0, 80) }}{{ task.lastResult.length > 80 ? '…' : '' }}</span>
        </div>
        <div class="task-card-foot">
          <button class="ghost-btn sm" @click="toggle(task)">
            {{ task.enabled ? '暂停' : '启用' }}
          </button>
          <button class="ghost-btn sm" @click="runNow(task)" :disabled="runningId === task.id">
            {{ runningId === task.id ? '执行中…' : '立即执行' }}
          </button>
          <button class="ghost-btn sm" @click="openEdit(task)">编辑</button>
          <button class="danger-btn sm" @click="remove(task)">删除</button>
        </div>
      </div>
      <div v-if="!tasks.length" class="empty-state">
        <p>还没有定时任务，点「新建任务」创建第一个</p>
        <p class="empty-hint">示例：<code class="mono">0 */5 * * *</code> = 每 5 分钟；<code class="mono">0 23 * * *</code> = 每天 23:00</p>
      </div>
    </div>

    <!-- 编辑器弹窗 -->
    <transition name="modal">
      <div class="modal-mask" v-if="editorVisible" @click.self="editorVisible = false">
        <div class="modal">
          <div class="modal-head">
            <div class="modal-title">
              <span class="modal-icon">{{ editingId ? '✎' : '＋' }}</span>
              <h3>{{ editingId ? '编辑任务' : '新建任务' }}</h3>
            </div>
            <button class="close-btn" @click="editorVisible = false">✕</button>
          </div>
          <div class="modal-body">
            <label class="field">
              <span class="field-label">任务名称</span>
              <input v-model="form.name" placeholder="如：每5分钟盯盘" />
            </label>
            <label class="field">
              <span class="field-label">执行 Agent</span>
              <select v-model="form.agentId">
                <option v-for="a in store.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">Cron 表达式（5 段：分 时 日 月 周）</span>
              <input v-model="form.cron" class="mono" placeholder="如：0 */5 * * *" />
              <span class="field-hint">* 每分钟｜0 */5 * * * 每5分钟｜0 9 * * 1-5 工作日9点｜0 23 * * * 每天23点</span>
            </label>
            <label class="field">
              <span class="field-label">任务指令（告诉 Agent 做什么，可选）</span>
              <textarea v-model="form.prompt" rows="4" placeholder="如：检查当前持仓的行情，如有异常波动请总结原因并给出建议"></textarea>
            </label>
            <div v-if="formError" class="form-error">{{ formError }}</div>
          </div>
          <div class="modal-foot">
            <button class="ghost-btn" @click="editorVisible = false">取消</button>
            <button class="primary-btn" @click="save()" :disabled="!form.name.trim() || !form.agentId || !form.cron.trim()">
              {{ editingId ? '保存' : '创建' }}
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 确认弹窗 -->
    <ConfirmDialog
      :visible="confirmVisible"
      :title="confirmTitle"
      :message="confirmMessage"
      :confirm-text="confirmText"
      @confirm="doConfirm()"
      @cancel="confirmVisible = false"
    />
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import { useMainStore } from '../store'
import { api } from '../api'
import ConfirmDialog from './ConfirmDialog.vue'
import type { Task } from '../types'

export default Vue.extend({
  name: 'TaskManager',
  components: { ConfirmDialog },
  data() {
    return {
      tasks: [] as Task[],
      editorVisible: false,
      editingId: '',
      runningId: '',
      form: { name: '', agentId: '', cron: '', prompt: '' },
      formError: '',
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
  async created() {
    await this.load()
  },
  methods: {
    async load() {
      this.tasks = await api.listTasks()
    },
    agentName(agentId: string): string {
      return this.store.agents.find((a) => a.id === agentId)?.name ?? agentId.slice(0, 8)
    },
    fmtTime(ts: number): string {
      const d = new Date(ts)
      const p = (n: number) => String(n).padStart(2, '0')
      return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
    },
    openCreate() {
      this.editingId = ''
      this.form = { name: '', agentId: this.store.agents[0]?.id ?? '', cron: '', prompt: '' }
      this.formError = ''
      this.editorVisible = true
    },
    openEdit(task: Task) {
      this.editingId = task.id
      this.form = { name: task.name, agentId: task.agentId, cron: task.cron, prompt: task.prompt }
      this.formError = ''
      this.editorVisible = true
    },
    async save() {
      this.formError = ''
      try {
        if (this.editingId) {
          await api.updateTask(this.editingId, this.form)
        } else {
          await api.createTask(this.form)
        }
        this.editorVisible = false
        await this.load()
      } catch (err) {
        this.formError = (err as Error).message
      }
    },
    async toggle(task: Task) {
      await api.updateTask(task.id, { enabled: !task.enabled })
      await this.load()
    },
    async runNow(task: Task) {
      this.runningId = task.id
      try {
        await api.runTask(task.id)
        await this.load()
      } catch (err) {
        alert((err as Error).message)
      } finally {
        this.runningId = ''
      }
    },
    remove(task: Task) {
      this.confirmTitle = '删除任务'
      this.confirmMessage = `确定删除定时任务「${task.name}」？其执行历史不会保留。`
      this.confirmText = '删除'
      this.pendingConfirm = async () => {
        await api.deleteTask(task.id)
        await this.load()
      }
      this.confirmVisible = true
    },
    doConfirm() {
      const fn = this.pendingConfirm
      this.confirmVisible = false
      this.pendingConfirm = null
      if (fn) fn()
    },
  },
})
</script>

<style scoped>
.manager {
  height: 100%;
  overflow-y: auto;
  padding: 28px 32px;
}
.manager-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  max-width: 860px;
  margin: 0 auto 24px;
}
.manager-title { display: flex; gap: 14px; align-items: flex-start; }
.manager-icon {
  width: 42px; height: 42px; flex: none;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px;
  background: var(--grad-brand-soft);
  border-radius: 12px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.1);
}
.manager-title h3 { font-size: 17px; margin: 2px 0 4px; }
.manager-title p { color: var(--text-dim); font-size: 13px; line-height: 1.6; max-width: 560px; }

.task-list {
  max-width: 860px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.task-card {
  background: var(--glass);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  transition: border-color 0.2s;
}
.task-card:hover { border-color: rgba(109, 139, 255, 0.35); }
.task-card-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.task-dot {
  width: 8px; height: 8px; flex: none; border-radius: 50%;
  background: var(--success); box-shadow: 0 0 8px rgba(52, 211, 153, 0.6);
}
.task-dot.off { background: var(--text-faint); box-shadow: none; }
.task-name { font-weight: 600; font-size: 14px; }
.task-cron {
  font-size: 12px; color: var(--brand);
  background: rgba(109, 139, 255, 0.12);
  border-radius: 6px; padding: 2px 8px;
}
.task-agent { font-size: 12px; color: var(--text-dim); margin-left: auto; }
.task-prompt {
  margin: 8px 0 6px; font-size: 13px; color: var(--text);
  line-height: 1.55;
}
.task-meta {
  display: flex; gap: 14px; flex-wrap: wrap;
  font-size: 12px; color: var(--text-faint);
  margin-bottom: 10px;
}
.task-card-foot { display: flex; gap: 8px; }

.mono { font-family: 'Cascadia Code', Consolas, monospace; }
.empty-state {
  text-align: center; padding: 48px 20px;
  color: var(--text-dim); font-size: 14px;
  border: 1px dashed var(--border); border-radius: var(--radius);
}
.empty-hint { margin-top: 8px; font-size: 12px; color: var(--text-faint); }
.empty-hint code { color: var(--brand); background: rgba(109,139,255,0.1); padding: 1px 6px; border-radius: 4px; }

/* 弹窗（复用全局样式 + 微调） */
.form-error {
  margin-top: 10px; padding: 8px 12px;
  background: var(--danger-soft); color: var(--danger);
  border-radius: 8px; font-size: 12px;
}
.field-hint { font-size: 11px; color: var(--text-faint); margin-top: 4px; }
</style>
