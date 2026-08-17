// 附件上传路由：文件存 <工作区>/uploads/（Agent 经 filesystem 工具可读）
// 工作区 = 设置页可配置（默认项目内 workspace/）；filesystem 用 {{workspace}} 占位符自动跟随，无需手动保持一致
import express from 'express'
import multer from 'multer'
import { mkdirSync, existsSync, createReadStream, statSync, rmSync, readdirSync } from 'node:fs'
import { join, resolve, extname } from 'node:path'
import type { Attachment } from '../types.js'
import { getWorkspacePath } from '../workspace.js'

export const uploadsRouter = express.Router()

// 实时取工作区：用户改配置后无需重启即生效
function getUploadDir(): string {
  const dir = join(getWorkspacePath(), 'uploads')
  mkdirSync(dir, { recursive: true })
  return dir
}

// 限制：单文件 50MB
const MAX_SIZE = 50 * 1024 * 1024

// 上传总量上限（防磁盘 DoS）：超过则拒绝新上传
const MAX_TOTAL_FILES = 500
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024 // 1GB

// Content-Type 白名单（按扩展名；危险类型一律强制 text/plain，杜绝 XSS 嗅探）
const MIME_WHITELIST: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}
// 明确禁用的危险类型：一律当纯文本返回（浏览器不会执行）
const DANGEROUS_EXT = ['.html', '.htm', '.js', '.mjs', '.cjs', '.css', '.xml', '.wasm', '.sh', '.bat', '.cmd', '.ps1', '.php', '.jsp', '.svgz']

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, getUploadDir()),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^\w\u4e00-\u9fa5.-]+/g, '_').slice(0, 80)
    cb(null, `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}-${safe}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
})

// 磁盘占用统计（防 DoS 用）
function diskUsage(): { count: number; bytes: number } {
  try {
    const dir = getUploadDir()
    const entries = readdirSync(dir)
    let bytes = 0
    for (const f of entries) {
      try { bytes += statSync(join(dir, f)).size } catch { /* 忽略 */ }
    }
    return { count: entries.length, bytes }
  } catch {
    return { count: 0, bytes: 0 }
  }
}

// 上传：POST /api/uploads  (multipart, field: file)
uploadsRouter.post('/', upload.single('file'), (req, res) => {
  const file = req.file
  if (!file) return res.status(400).json({ error: 'file (multipart field) required' })
  // 总量限制：超限立即删除并拒绝
  const usage = diskUsage()
  if (usage.count >= MAX_TOTAL_FILES || usage.bytes + file.size > MAX_TOTAL_BYTES) {
    rmSync(file.path, { force: true })
    return res.status(413).json({ error: `存储已达上限（最多 ${MAX_TOTAL_FILES} 个文件 / 1GB），请先清理旧附件` })
  }
  const att: Attachment = {
    id: `att_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: file.originalname,
    path: `uploads/${file.filename}`,
    size: file.size,
    mime: file.mimetype || 'application/octet-stream',
  }
  res.json(att)
})

// 下载/预览：GET /api/uploads/:filename
uploadsRouter.get('/:filename', (req, res) => {
  const filename = req.params.filename
  // 防目录穿越：只允许纯文件名
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return res.status(400).json({ error: 'invalid filename' })
  }
  const filePath = resolve(getUploadDir(), filename)
  if (!filePath.startsWith(getUploadDir()) || !existsSync(filePath)) {
    return res.status(404).json({ error: 'file not found' })
  }
  const st = statSync(filePath)
  const ext = extname(filename).toLowerCase()
  // 危险类型强制 text/plain；白名单外一律 octet-stream；并加 nosniff
  let contentType: string
  if (DANGEROUS_EXT.includes(ext)) {
    contentType = 'text/plain; charset=utf-8'
  } else {
    contentType = MIME_WHITELIST[ext] ?? 'application/octet-stream'
  }
  res.setHeader('Content-Type', contentType)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Length', st.size)
  res.setHeader('Cache-Control', 'public, max-age=86400')
  createReadStream(filePath).pipe(res)
})

// 删除附件：DELETE /api/uploads/:filename（防磁盘 DoS：允许清理）
uploadsRouter.delete('/:filename', (req, res) => {
  const filename = req.params.filename
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return res.status(400).json({ error: 'invalid filename' })
  }
  const filePath = resolve(getUploadDir(), filename)
  if (!filePath.startsWith(getUploadDir())) {
    return res.status(400).json({ error: 'invalid filename' })
  }
  if (!existsSync(filePath)) return res.status(404).json({ error: 'file not found' })
  rmSync(filePath, { force: true })
  res.json({ ok: true })
})

// 磁盘占用（供前端/调试）
uploadsRouter.get('/', (_req, res) => {
  res.json({ dir: getUploadDir(), ...diskUsage() })
})
