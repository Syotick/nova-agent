// 会话导出：Markdown（人读/分享）+ JSON（完整无损/迁移）。纯前端实现，零后端改动。
import type { Session, Message, ToolCallRecord } from '../types'

const APP_NAME = 'Nova Agent'

/** 本地时间格式化：2026-01-02 03:04 */
export function formatDateTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 文件名安全化：去掉路径/非法字符，空则给缺省名 */
export function safeFilename(title: string, fallback = '会话'): string {
  const clean = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim()
  return (clean || fallback).slice(0, 80)
}

/** 工具调用 → Markdown 折叠块（人读；输出过长截断，JSON 导出含完整内容） */
function toolCallToMarkdown(tc: ToolCallRecord): string {
  const statusIcon = tc.status === 'success' ? '✅' : tc.status === 'error' ? '❌' : '⏳'
  const dur = tc.durationMs != null ? ` · ${(tc.durationMs / 1000).toFixed(1)}s` : ''
  const lines = [
    '<details>',
    `<summary>${statusIcon} 工具：${tc.name}（${tc.status}${dur}）</summary>`,
    '',
    '**输入**',
    '',
    '```json',
    JSON.stringify(tc.input, null, 2),
    '```',
  ]
  if (tc.output) {
    const out = tc.output.length > 4000 ? `${tc.output.slice(0, 4000)}\n…（输出过长已截断，JSON 导出含完整内容）` : tc.output
    lines.push('', '**输出**', '', '```text', out, '```')
  }
  lines.push('', '</details>')
  return lines.join('\n')
}

/** 消息正文：优先时间线 segments（文本/工具交错），旧数据回退 content + toolCalls */
function messageBodyToMarkdown(m: Message): string {
  if (m.segments?.length) {
    return m.segments.map((seg) => (seg.kind === 'text' ? seg.text : toolCallToMarkdown(seg.call))).join('\n\n')
  }
  const parts: string[] = []
  if (m.content) parts.push(m.content)
  if (m.toolCalls?.length) parts.push(...m.toolCalls.map(toolCallToMarkdown))
  return parts.join('\n\n')
}

export function sessionToMarkdown(session: Session, agentName?: string): string {
  const lines: string[] = ['# ' + (session.title || '未命名会话'), '']
  lines.push(`- **应用**：${APP_NAME}`)
  lines.push(`- **创建**：${formatDateTime(session.createdAt)}`)
  if (session.updatedAt) lines.push(`- **更新**：${formatDateTime(session.updatedAt)}`)
  if (agentName) lines.push(`- **Agent**：${agentName}`)
  lines.push(`- **消息**：${session.messages.length} 条`)
  if (session.summary) lines.push('', `> **摘要**（自动压缩生成）：${session.summary}`)
  lines.push('', '---', '')
  const roleName = (r: string) => (r === 'user' ? '你' : agentName ?? 'AI')
  for (const m of session.messages) {
    lines.push(`## ${roleName(m.role)} · ${formatDateTime(m.createdAt)}`, '')
    lines.push(messageBodyToMarkdown(m) || '_（无内容）_', '')
  }
  return lines.join('\n') + '\n'
}

/** JSON 导出：完整无损（含工具调用/附件/token 统计/时间线分段） */
export function sessionToJson(session: Session, agentName?: string): string {
  return (
    JSON.stringify(
      {
        app: 'nova-agent',
        exportedAt: new Date().toISOString(),
        title: session.title,
        agentId: session.agentId,
        agentName: agentName ?? null,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        summary: session.summary ?? null,
        messages: session.messages,
      },
      null,
      2,
    ) + '\n'
  )
}

export function downloadText(filename: string, content: string, mime = 'text/markdown;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function downloadSessionMarkdown(session: Session, agentName?: string): void {
  downloadText(`${safeFilename(session.title)}.md`, sessionToMarkdown(session, agentName))
}

export function downloadSessionJson(session: Session, agentName?: string): void {
  downloadText(`${safeFilename(session.title)}.json`, sessionToJson(session, agentName), 'application/json;charset=utf-8')
}
