<template>
  <div id="app" class="app">
    <Sidebar :view="view" @new-agent="openCreate()" @edit-agent="openEdit" @open-key="keyModal = true" @navigate="view = $event" />
    <MainPane :view="view" @navigate="view = $event" />
    <AgentConfigModal :visible="modalVisible" :editing-agent="editingAgent" @close="modalVisible = false" />
    <ApiKeyModal :visible="keyModal" @close="keyModal = false" />
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import { useMainStore } from './store'
import Sidebar from './components/Sidebar.vue'
import MainPane from './components/MainPane.vue'
import AgentConfigModal from './components/AgentConfigModal.vue'
import ApiKeyModal from './components/ApiKeyModal.vue'
import type { Agent } from './types'

export default Vue.extend({
  name: 'App',
  components: { Sidebar, MainPane, AgentConfigModal, ApiKeyModal },
  data() {
    return {
      view: 'chat' as 'chat' | 'trajectory' | 'skills' | 'tools',
      modalVisible: false,
      keyModal: false,
      editingAgent: null as Agent | null,
    }
  },
  async mounted() {
    const store = useMainStore()
    try {
      await store.init()
    } catch (e) {
      store.error = `初始化失败: ${(e as Error).message}（请确认后端已启动）`
    }
  },
  methods: {
    openCreate() {
      this.editingAgent = null
      this.modalVisible = true
    },
    openEdit(agent: Agent) {
      this.editingAgent = agent
      this.modalVisible = true
    },
  },
})
</script>
