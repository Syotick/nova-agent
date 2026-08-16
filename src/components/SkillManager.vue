<template>
  <div class="manager">
    <div class="manager-head">
      <div class="manager-title">
        <span class="manager-icon">📚</span>
        <div>
          <h3>技能管理</h3>
          <p>技能是"操作手册"——告诉 Agent 一类任务该怎么做。添加技能不用写代码。</p>
        </div>
      </div>
      <button class="primary-btn" @click="openCreate()">＋ 新建技能</button>
    </div>

    <!-- 技能列表 -->
    <div class="skill-grid">
      <div v-for="skill in store.skills" :key="skill.id" class="skill-card">
        <div class="skill-card-head">
          <span class="skill-badge">📖</span>
          <span class="skill-name">{{ skill.name }}</span>
          <span class="skill-id">/{{ skill.id }}</span>
        </div>
        <p class="skill-desc">{{ skill.description || '（无描述）' }}</p>
        <div v-if="skill.whenToUse" class="skill-when">
          <span class="when-label">使用时机</span>
          <span>{{ skill.whenToUse }}</span>
        </div>
        <div class="skill-card-foot">
          <button class="ghost-btn sm" @click="openEdit(skill)">编辑</button>
          <button class="danger-btn sm" @click="remove(skill)">删除</button>
        </div>
      </div>
      <div v-if="!store.skills.length" class="empty-state">
        <p>还没有技能，点「新建技能」创建第一个</p>
      </div>
    </div>

    <!-- 编辑器弹窗 -->
    <transition name="modal">
      <div class="modal-mask" v-if="editorVisible" @click.self="editorVisible = false">
        <div class="modal">
          <div class="modal-head">
            <div class="modal-title">
              <span class="modal-icon">{{ editingId ? '✎' : '＋' }}</span>
              <h3>{{ editingId ? '编辑技能' : '新建技能' }}</h3>
            </div>
            <button class="close-btn" @click="editorVisible = false">✕</button>
          </div>
          <div class="modal-body">
            <label class="field">
              <span class="field-label">技能名称</span>
              <input v-model="form.name" placeholder="如：代码审查" />
            </label>
            <label class="field">
              <span class="field-label">简介（一句话说明它教什么）</span>
              <input v-model="form.description" placeholder="如：教你如何审查代码质量" />
            </label>
            <label class="field">
              <span class="field-label">使用时机（可选）</span>
              <input v-model="form.whenToUse" placeholder="如：用户要求审查代码时" />
            </label>
            <label class="field">
              <span class="field-label">技能内容（操作步骤 / 指导 / 清单）</span>
              <textarea v-model="form.content" rows="10" placeholder="例如：&#10;1. 先读取文件了解结构&#10;2. 检查命名、错误处理、安全性&#10;3. 给出具体修改建议"></textarea>
            </label>
          </div>
          <div class="modal-foot">
            <button class="ghost-btn" @click="editorVisible = false">取消</button>
            <button class="primary-btn" @click="save()" :disabled="!form.name.trim()">
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
import type { SkillMeta } from '../types'

export default Vue.extend({
  name: 'SkillManager',
  components: { ConfirmDialog },
  data() {
    return {
      store: useMainStore(),
      editorVisible: false,
      editingId: '' as string,
      form: { name: '', description: '', whenToUse: '', content: '' },
      confirmVisible: false,
      confirmTitle: '',
      confirmMessage: '',
      confirmText: '删除',
      pendingConfirm: null as null | (() => void),
    }
  },
  methods: {
    openCreate() {
      this.editingId = ''
      this.form = { name: '', description: '', whenToUse: '', content: '' }
      this.editorVisible = true
    },
    openEdit(skill: SkillMeta) {
      this.editingId = skill.id
      this.form = {
        name: skill.name,
        description: skill.description,
        whenToUse: skill.whenToUse ?? '',
        content: skill.content,
      }
      this.editorVisible = true
    },
    async save() {
      if (this.editingId) {
        await api.updateSkill(this.editingId, this.form)
      } else {
        await api.createSkill(this.form)
      }
      // 刷新技能列表
      this.store.skills = await api.listSkills()
      this.editorVisible = false
    },
    async remove(skill: SkillMeta) {
      // 弹窗确认后删除
      this.confirmTitle = '删除技能'
      this.confirmMessage = `确定删除技能「${skill.name}」？使用该技能的 Agent 会自动移除它。`
      this.confirmText = '删除'
      this.pendingConfirm = async () => {
        await api.deleteSkill(skill.id)
        // 从所有 agent 的勾选里移除
        for (const agent of this.store.agents) {
          if (agent.skillIds.includes(skill.id)) {
            await api.updateAgent(agent.id, { skillIds: agent.skillIds.filter((id) => id !== skill.id) })
          }
        }
        this.store.skills = await api.listSkills()
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
.manager { height: 100%; display: flex; flex-direction: column; padding: 24px; gap: 18px; overflow-y: auto; }
.manager-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.manager-title { display: flex; gap: 12px; }
.manager-icon {
  width: 40px; height: 40px; flex: none;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px;
  background: var(--grad-brand-soft);
  border-radius: 12px;
}
.manager-title h3 { font-size: 17px; font-weight: 700; }
.manager-title p { font-size: 12px; color: var(--text-dim); margin-top: 3px; max-width: 480px; line-height: 1.5; }

.primary-btn {
  border: none; cursor: pointer;
  display: flex; align-items: center; gap: 7px;
  padding: 9px 18px; border-radius: 11px;
  font-size: 13px; font-weight: 600; color: #fff;
  background: var(--grad-brand);
  box-shadow: 0 3px 16px rgba(77, 107, 254, 0.35);
  transition: all 0.25s var(--ease-spring);
  flex: none;
}
.primary-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(77, 107, 254, 0.5); }
.primary-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.skill-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
.skill-card {
  background: var(--glass);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: all 0.25s var(--ease-out);
  animation: fadeInUp 0.3s var(--ease-out);
}
.skill-card:hover { background: var(--bg-card-hover); border-color: var(--border-strong); transform: translateY(-2px); box-shadow: var(--shadow); }
.skill-card-head { display: flex; align-items: center; gap: 8px; }
.skill-badge { font-size: 15px; }
.skill-name { font-weight: 700; font-size: 14px; }
.skill-id { margin-left: auto; font-size: 11px; color: var(--text-faint); font-family: var(--font-mono); }
.skill-desc { font-size: 12px; color: var(--text-dim); line-height: 1.55; flex: 1; }
.skill-when { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-dim); }
.when-label { font-size: 10px; font-weight: 600; color: var(--brand); background: rgba(109, 139, 255, 0.12); padding: 1px 7px; border-radius: 999px; flex: none; }
.skill-card-foot { display: flex; gap: 8px; padding-top: 4px; }
.ghost-btn, .danger-btn {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-dim);
  padding: 6px 14px;
  border-radius: 9px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s var(--ease-out);
}
.ghost-btn:hover { background: var(--bg-card-hover); color: var(--text); }
.danger-btn { border-color: rgba(248, 113, 113, 0.3); color: var(--danger); }
.danger-btn:hover { background: var(--danger-soft); }
.empty-state {
  grid-column: 1 / -1;
  display: flex; align-items: center; justify-content: center;
  padding: 60px;
  color: var(--text-faint);
  border: 1px dashed var(--border-strong);
  border-radius: 16px;
}

/* 弹窗 */
.modal-mask {
  position: fixed; inset: 0;
  background: rgba(5, 8, 15, 0.6);
  backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.modal {
  width: 560px; max-height: 84vh;
  display: flex; flex-direction: column;
  background: rgba(17, 21, 32, 0.92);
  border: 1px solid var(--border-strong);
  border-radius: 20px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(24px);
  animation: scaleIn 0.24s var(--ease-spring);
  overflow: hidden;
}
.modal-head { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid var(--border); }
.modal-title { display: flex; align-items: center; gap: 10px; }
.modal-icon {
  width: 30px; height: 30px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 9px; background: var(--grad-brand-soft);
  color: var(--brand); font-size: 15px; font-weight: 700;
}
.modal-head h3 { font-size: 16px; font-weight: 700; }
.close-btn { border: none; background: transparent; cursor: pointer; font-size: 14px; color: var(--text-faint); width: 28px; height: 28px; border-radius: 8px; transition: all 0.2s; }
.close-btn:hover { background: var(--bg-card-hover); color: var(--text); }
.modal-body { padding: 18px 22px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 11px; font-weight: 600; color: var(--text-faint); letter-spacing: 0.08em; text-transform: uppercase; }
.field input, .field textarea {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 9px 12px;
  font-size: 13px;
  font-family: inherit;
  background: var(--bg-input);
  color: var(--text);
  outline: none;
  transition: all 0.2s var(--ease-out);
  resize: vertical;
}
.field input:focus, .field textarea:focus {
  border-color: rgba(109, 139, 255, 0.5);
  box-shadow: 0 0 0 3px rgba(109, 139, 255, 0.12);
}
.field input::placeholder, .field textarea::placeholder { color: var(--text-faint); }
.modal-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 22px; border-top: 1px solid var(--border); background: rgba(255, 255, 255, 0.02); }
</style>
