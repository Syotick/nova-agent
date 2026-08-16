<template>
  <div class="manager">
    <div class="manager-head">
      <div class="manager-title">
        <span class="manager-icon">🧰</span>
        <div>
          <h3>工具浏览</h3>
          <p>工具是"手"——Agent 能执行的原子动作。由 MCP Server 提供，无需自己写代码。</p>
        </div>
      </div>
      <button class="primary-btn" @click="refresh">↻ 刷新</button>
    </div>

    <!-- 按 MCP server 分组 -->
    <div v-for="group in groups" :key="group.serverId" class="tool-group">
      <div class="group-head">
        <span class="group-dot" :class="group.online ? 'online' : 'offline'"></span>
        <span class="group-name">{{ group.serverName }}</span>
        <span class="group-id">{{ group.serverId }}</span>
        <span class="group-count">{{ group.tools.length }} 个工具</span>
      </div>

      <div class="tool-grid">
        <div v-for="tool in group.tools" :key="tool.name" class="tool-card">
          <div class="tool-head">
            <span class="tool-icon">⚙️</span>
            <span class="tool-name">{{ tool.name }}</span>
          </div>
          <p class="tool-desc">{{ tool.description || '（无描述）' }}</p>
          <div class="tool-schema">
            <div class="schema-label" @click="toggleSchema(tool.name)">
              参数 Schema
              <span class="chevron" :class="{ open: expandedSchemas.has(tool.name) }">▸</span>
            </div>
            <pre v-if="expandedSchemas.has(tool.name)" class="schema-json">{{ pretty(tool.inputSchema) }}</pre>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!groups.length" class="empty-state">
      <p>没有可用的工具 —— 在 mcp-servers/ 添加一个 MCP server 配置</p>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import { api } from '../api'
import type { ToolInfo } from '../types'

interface ToolGroup {
  serverId: string
  serverName: string
  online: boolean
  tools: ToolInfo[]
}

export default Vue.extend({
  name: 'ToolManager',
  data() {
    return {
      tools: [] as ToolInfo[],
      expandedSchemas: new Set<string>(),
      loading: false,
    }
  },
  computed: {
    groups(): ToolGroup[] {
      const map = new Map<string, ToolGroup>()
      for (const t of this.tools) {
        let g = map.get(t.serverId)
        if (!g) {
          g = { serverId: t.serverId, serverName: t.serverName, online: true, tools: [] }
          map.set(t.serverId, g)
        }
        g.tools.push(t)
      }
      return [...map.values()]
    },
  },
  async mounted() {
    await this.refresh()
  },
  methods: {
    async refresh() {
      this.loading = true
      try {
        this.tools = await api.listTools()
      } catch (e) {
        console.error('list tools failed', e)
      }
      this.loading = false
    },
    toggleSchema(name: string) {
      const next = new Set(this.expandedSchemas)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      this.expandedSchemas = next
    },
    pretty(v: unknown): string {
      try {
        return JSON.stringify(v, null, 2)
      } catch {
        return String(v)
      }
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

.tool-group { display: flex; flex-direction: column; gap: 12px; animation: fadeInUp 0.3s var(--ease-out); }
.group-head { display: flex; align-items: center; gap: 10px; padding: 0 4px; }
.group-dot { width: 9px; height: 9px; border-radius: 50%; }
.group-dot.online { background: var(--success); box-shadow: 0 0 8px rgba(52, 211, 153, 0.6); }
.group-dot.offline { background: var(--danger); }
.group-name { font-weight: 700; font-size: 15px; }
.group-id { font-size: 11px; color: var(--text-faint); font-family: var(--font-mono); }
.group-count { margin-left: auto; font-size: 11px; color: var(--text-dim); background: rgba(255, 255, 255, 0.07); padding: 2px 10px; border-radius: 999px; }

.tool-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.tool-card {
  background: var(--glass);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: all 0.22s var(--ease-out);
}
.tool-card:hover { background: var(--bg-card-hover); border-color: var(--border-strong); transform: translateY(-1px); }
.tool-head { display: flex; align-items: center; gap: 8px; }
.tool-icon { font-size: 13px; }
.tool-name { font-weight: 700; font-size: 13px; font-family: var(--font-mono); color: var(--brand); }
.tool-desc { font-size: 12px; color: var(--text-dim); line-height: 1.55; }
.tool-schema { border-top: 1px solid var(--border); padding-top: 8px; }
.schema-label {
  font-size: 11px; font-weight: 600;
  color: var(--text-faint);
  cursor: pointer;
  display: flex; align-items: center; gap: 6px;
  user-select: none;
  transition: color 0.15s;
}
.schema-label:hover { color: var(--brand); }
.chevron { display: inline-block; transition: transform 0.2s var(--ease-spring); }
.chevron.open { transform: rotate(90deg); }
.schema-json {
  font-family: var(--font-mono);
  font-size: 11px;
  background: rgba(11, 14, 21, 0.6);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
  margin-top: 8px;
  max-height: 220px;
  overflow: auto;
  color: #a5b4fc;
  line-height: 1.55;
  animation: fadeIn 0.2s;
}
.empty-state {
  display: flex; align-items: center; justify-content: center;
  padding: 60px;
  color: var(--text-faint);
  border: 1px dashed var(--border-strong);
  border-radius: 16px;
  font-size: 13px;
}
</style>
