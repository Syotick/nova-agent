// Read-only inspection of the DSH GUI panel state (headless Edge).
import { chromium } from 'playwright'

const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--disable-gpu'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.on('console', (msg) => {
  const text = msg.text()
  if (text.includes('aionui') || text.includes('panel') || text.includes('error') || text.includes('Error')) {
    console.log(`[console.${msg.type()}] ${text.slice(0, 500)}`)
  }
})
page.on('pageerror', (err) => console.log(`[pageerror] ${String(err).slice(0, 500)}`))

await page.goto('http://127.0.0.1:8000/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(6000)

const report = await page.evaluate(() => {
  const out = {}
  out.frame = !!document.querySelector('[data-dsh-frame], [class*="sidebarCol"]')
  const frame = document.querySelector('[class*="sidebarCol"]')?.parentElement
  out.frameTag = frame ? frame.tagName : null
  out.frameGrid = frame ? frame.style.gridTemplateColumns : null
  out.previewCol = !!document.querySelector('[data-aionui-preview-col]')
  out.explorerCol = !!document.querySelector('[data-aionui-explorer-col]')
  out.nativeHeader = !!document.querySelector('.aionui-preview-native-header')
  out.floatingBtn = !!document.querySelector('.aionui-floating-expand')
  out.previewColCount = document.querySelectorAll('[data-aionui-preview-col]').length
  out.explorerColCount = document.querySelectorAll('[data-aionui-explorer-col]').length
  const pcol = document.querySelector('[data-aionui-preview-col]')
  if (pcol) {
    out.previewColHtml = pcol.innerHTML.slice(0, 600)
    out.previewColChildren = Array.from(pcol.children).map((c) => c.className || c.tagName)
  }
  const ecol = document.querySelector('[data-aionui-explorer-col]')
  if (ecol) {
    out.explorerColHtml = ecol.innerHTML.slice(0, 400)
    out.explorerColChildren = Array.from(ecol.children).map((c) => c.className || c.tagName)
  }
  out.toolbars = document.querySelectorAll('[class*="toolbar"]').length
  out.toolbarBtnTexts = Array.from(document.querySelectorAll('button')).map((b) => (b.textContent || '').trim()).filter((t) => t.length > 0 && t.length < 30).slice(0, 40)
  out.bodyClasses = document.body.className
  out.sidebarTexts = Array.from(document.querySelectorAll('[class*="sidebar"] span, [class*="sidebar"] button')).map((e) => (e.textContent || '').trim()).filter((t) => t && t.length < 40).slice(0, 30)
  return out
})
console.log(JSON.stringify(report, null, 2))
await page.screenshot({ path: 'D:/Data/deepseekharness_project/my-agent/panel-inspect.png' })
await browser.close()
