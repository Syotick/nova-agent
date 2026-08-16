<template>
  <transition name="modal">
    <div class="modal-mask" v-if="visible" @click.self="$emit('close')" @keydown.esc="$emit('close')">
      <div class="modal">
        <div class="modal-head">
          <div class="modal-title">
            <span class="modal-icon">{{ editing ? '✎' : '＋' }}</span>
            <h3>{{ editing ? '编辑 Agent' : '新建 Agent' }}</h3>
          </div>
          <button class="close-btn" @click="$emit('close')">✕</button>
        </div>

        <div class="modal-body">
          <div class="field-row">
            <label class="field grow">
              <span class="field-label">名称</span>
              <input v-model="form.name" placeholder="如：浏览器助手" />
            </label>
            <label class="field color-field">
              <span class="field-label">颜色</span>
              <input type="color" v-model="form.color" class="color-input" />
            </label>
          </div>

          <label class="field">
            <span class="field-label">模型</span>
            <select v-model="form.model">
              <option value="deepseek-v4-flash">deepseek-v4-flash（快速，默认）</option>
              <option value="deepseek-v4-pro">deepseek-v4-pro（更强推理）</option>
            </select>
          </label>

          <label class="field">
            <span class="field-label">系统提示词（persona）</span>
            <textarea v-model="form.persona" rows="4" placeholder="定义这个 Agent 的身份与行为…"></textarea>
          </label>

          <!-- 工具 -->
          <div class="field">
            <span class="field-label">工具（MCP Servers）</span>
            <div class="check-grid">
              <label
                v-for="srv in store.mcpServers"
                :key="srv.id"
                class="check-item"
                :class="{ checked: form.mcpServerIds.includes(srv.id) }"
              >
                <input type="checkbox" :value="srv.id" v-model="form.mcpServerIds" />
                <span class="check-icon">
                  <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 8.5l3.5 3.5L13 4.5" />
                  </svg>
                </span>
                <span class="check-name">{{ srv.name }}</span>
              </label>
              <span v-if="!store.mcpServers.length" class="empty-hint">无 MCP server 配置</span>
            </div>
          </div>

          <!-- 技能 -->
          <div class="field">
            <div class="field-head">
              <span class="field-label">技能（Skills）</span>
              <span class="field-count">{{ form.skillIds.length }} 已选</span>
            </div>
            <input
              v-model="skillSearch"
              class="search-input"
              placeholder="搜索技能…"
            />
            <div class="check-grid skill-grid">
              <label
                v-for="skill in filteredSkills"
                :key="skill.id"
                class="check-item"
                :class="{ checked: form.skillIds.includes(skill.id) }"
                :title="skill.description"
              >
                <input type="checkbox" :value="skill.id" v-model="form.skillIds" />
                <span class="check-icon">
                  <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 8.5l3.5 3.5L13 4.5" />
                  </svg>
                </span>
                <span class="check-name">{{ skill.name }}</span>
              </label>
              <span v-if="!filteredSkills.length" class="empty-hint">
                {{ store.skills.length ? '没有匹配的技能' : '无技能配置' }}
              </span>
            </div>
          </div>
        </div>

        <div class="modal-foot">
          <button class="ghost-btn" @click="$emit('close')">取消</button>
          <button class="primary-btn" @click="save()">
            {{ editing ? '保存' : '创建' }}
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script lang="ts">
import Vue from 'vue'
import { useMainStore } from '../store'
import type { Agent } from '../types'

const PALETTE = ['#8b7bff', '#4d6bfe', '#38bdf8', '#34d399', '#fbbf24', '#f87171']

export default Vue.extend({
  name: 'AgentConfigModal',
  props: {
    visible: { type: Boolean, default: false },
    editingAgent: { type: Object as () => Agent | null, default: null },
  },
  data() {
    return {
      form: this.blankForm(),
      skillSearch: '',
    }
  },
  computed: {
    editing(): boolean {
      return Boolean(this.editingAgent)
    },
    store() {
      return useMainStore()
    },
    filteredSkills() {
      const q = this.skillSearch.trim().toLowerCase()
      if (!q) return this.store.skills
      return this.store.skills.filter(
        (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
      )
    },
  },
  watch: {
    visible(v: boolean) {
      if (v) {
        this.skillSearch = ''
        if (this.editingAgent) {
          this.form = {
            name: this.editingAgent.name,
            model: this.editingAgent.model,
            persona: this.editingAgent.persona,
            mcpServerIds: [...this.editingAgent.mcpServerIds],
            skillIds: [...this.editingAgent.skillIds],
            color: this.editingAgent.color,
          }
        } else {
          this.form = this.blankForm()
        }
      }
    },
  },
  methods: {
    blankForm() {
      return {
        name: '',
        model: 'deepseek-v4-flash',
        persona: 'You are a helpful assistant. 用中文回答。',
        mcpServerIds: [] as string[],
        skillIds: [] as string[],
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      }
    },
    async save() {
      if (!this.form.name.trim()) {
        this.form.name = '未命名 Agent'
      }
      if (this.editingAgent) {
        await this.store.updateAgent(this.editingAgent.id, this.form)
      } else {
        await this.store.createAgent(this.form)
      }
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
  width: 560px;
  max-height: 84vh;
  display: flex;
  flex-direction: column;
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
  color: var(--brand);
  font-size: 15px;
  font-weight: 700;
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

.modal-body {
  padding: 18px 22px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.field-row { display: flex; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 7px; }
.field.grow { flex: 1; }
.color-field { width: 86px; }
.field-label { font-size: 11px; font-weight: 600; color: var(--text-faint); letter-spacing: 0.08em; text-transform: uppercase; }
.field input[type='text'], .field input:not([type]), .field select, .field textarea {
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
.field input:focus, .field input:not([type]):focus, .field select:focus, .field textarea:focus {
  border-color: rgba(109, 139, 255, 0.5);
  box-shadow: 0 0 0 3px rgba(109, 139, 255, 0.12);
}
.field input::placeholder, .field textarea::placeholder { color: var(--text-faint); }
select option { background: #141824; color: var(--text); }

/* 技能区：搜索 + 计数 + 限高滚动 */
.field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.field-count {
  font-size: 11px;
  color: var(--brand);
  background: rgba(109, 139, 255, 0.12);
  padding: 1px 8px;
  border-radius: 999px;
}
.search-input {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  font-size: 13px;
  font-family: inherit;
  background: var(--bg-input);
  color: var(--text);
  outline: none;
  transition: all 0.2s var(--ease-out);
}
.search-input:focus {
  border-color: rgba(109, 139, 255, 0.5);
  box-shadow: 0 0 0 3px rgba(109, 139, 255, 0.12);
}
.skill-grid {
  max-height: 220px;
  overflow-y: auto;
  padding: 2px;
}
.skill-grid::-webkit-scrollbar { width: 6px; }
.color-input {
  width: 100%;
  height: 36px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 3px;
  cursor: pointer;
  background: var(--bg-input);
  -webkit-appearance: none;
  appearance: none;
}
.color-input::-webkit-color-swatch-wrapper { padding: 2px; }
.color-input::-webkit-color-swatch { border: none; border-radius: 6px; }
.color-input::-moz-color-swatch { border: none; border-radius: 6px; }

/* 勾选 pill */
.check-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.check-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 13px;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.22s var(--ease-spring);
  color: var(--text-dim);
  background: transparent;
  user-select: none;
}
.check-item:hover { border-color: var(--border-strong); color: var(--text); transform: translateY(-1px); }
.check-item.checked {
  background: var(--grad-brand-soft);
  border-color: rgba(109, 139, 255, 0.45);
  color: var(--text);
  box-shadow: 0 2px 12px rgba(77, 107, 254, 0.15);
}
.check-item input { display: none; }
.check-icon {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  border: 1.5px solid var(--border-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  color: transparent;
  transition: all 0.2s var(--ease-spring);
}
.check-item.checked .check-icon {
  background: var(--grad-brand);
  border-color: transparent;
  color: #fff;
  transform: scale(1.08);
}
.check-name { font-weight: 500; }
.empty-hint { font-size: 12px; color: var(--text-faint); }

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
.primary-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(77, 107, 254, 0.5); }
.primary-btn:active { transform: scale(0.97); }
</style>
