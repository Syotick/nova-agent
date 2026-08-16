// Markdown 渲染：markdown-it + highlight.js
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'

const md = new MarkdownIt({
  html: false,            // 不渲染原始 HTML（防 XSS）
  linkify: true,          // 自动识别 URL
  breaks: true,           // 单换行转 <br>（聊天场景友好）
  highlight(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code data-lang="${md.utils.escapeHtml(lang)}">${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`
      } catch {
        // 忽略高亮失败
      }
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`
  },
})

// 流式渲染：增量文本可能是不完整的 markdown，先转义再渲染以保持安全
export function renderMarkdown(text: string): string {
  return md.render(typeof text === 'string' ? text : String(text ?? ''))
}

// 流式中间状态：转义 HTML 防止注入，但不完整标记保持原样，尾部附打字光标
export function renderStreaming(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return md.render(escaped) + '<span class="cursor"></span>'
}
