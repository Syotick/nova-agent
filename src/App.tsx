import { useEffect, useState } from 'react'
import { useMainStore } from './store'
import Sidebar from './components/Sidebar'
import MainPane from './components/MainPane'
import AgentConfigModal from './components/AgentConfigModal'
import type { Agent } from './types'

export type View = 'chat' | 'trajectory' | 'skills' | 'tasks' | 'tools' | 'models' | 'memories' | 'mcps'

export default function App() {
  const init = useMainStore((s) => s.init)
  const [view, setView] = useState<View>('chat')
  const [modalVisible, setModalVisible] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)

  useEffect(() => {
    init().catch((e: Error) => {
      useMainStore.setState({ error: `初始化失败: ${e.message}（请确认后端已启动）` })
    })
  }, [init])

  const openCreate = () => { setEditingAgent(null); setModalVisible(true) }
  const openEdit = (agent: Agent) => { setEditingAgent(agent); setModalVisible(true) }
  const navigate = (v: string) => setView(v as View)

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar
        view={view}
        onNewAgent={openCreate}
        onEditAgent={openEdit}
        onNavigate={navigate}
      />
      <MainPane view={view} onNavigate={navigate} />
      <AgentConfigModal visible={modalVisible} editingAgent={editingAgent} onClose={() => setModalVisible(false)} />
    </div>
  )
}
