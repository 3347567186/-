import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const UPLOAD_DIR = path.resolve(import.meta.dirname, '..', 'data', 'uploads')
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024

const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'image/bmp': '.bmp',
  'image/svg+xml': '.svg',
  'image/tiff': '.tiff',
  'image/heic': '.heic',
  'image/heif': '.heif',
}

export async function handleAssetUpload(req) {
  const contentType = req.headers['content-type'] || ''
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1] || contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2]
  if (!boundary) throw new Error('缺少上传边界，请使用表单上传图片。')

  const body = await readLimitedBody(req, MAX_UPLOAD_BYTES)
  const file = parseMultipartFile(body, boundary)
  if (!file?.buffer?.length) throw new Error('没有读取到图片文件。')

  const ext = getSafeExtension(file.filename, file.contentType)
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const filename = `${id}${ext}`
  await mkdir(UPLOAD_DIR, { recursive: true })
  await writeFile(path.join(UPLOAD_DIR, filename), file.buffer)

  return {
    originalName: file.filename || filename,
    url: `/uploads/${filename}`,
    size: file.buffer.length,
    contentType: file.contentType,
  }
}

function readLimitedBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    req.on('data', (chunk) => {
      total += chunk.length
      if (total > limit) {
        reject(new Error('图片超过 30MB，已拒绝上传。'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('error', reject)
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

function parseMultipartFile(body, boundary) {
  const delimiter = Buffer.from(`--${boundary}`)
  let start = body.indexOf(delimiter)
  while (start !== -1) {
    const headerStart = start + delimiter.length + 2
    const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), headerStart)
    if (headerEnd === -1) break

    const headers = body.slice(headerStart, headerEnd).toString('utf8')
    const disposition = headers.match(/content-disposition:\s*([^\r\n]+)/i)?.[1] || ''
    const filename = disposition.match(/filename="([^"]*)"/i)?.[1] || ''
    const contentType = headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || 'application/octet-stream'
    const dataStart = headerEnd + 4
    const next = body.indexOf(delimiter, dataStart)
    if (next === -1) break

    if (filename) {
      const dataEnd = Math.max(dataStart, next - 2)
      return {
        filename: path.basename(filename),
        contentType,
        buffer: body.slice(dataStart, dataEnd),
      }
    }

    start = next
  }
  return null
}

function getSafeExtension(filename = '', contentType = '') {
  const ext = path.extname(filename).toLowerCase()
  if (/^\.[a-z0-9]{2,5}$/.test(ext)) return ext
  return MIME_EXT[contentType.toLowerCase()] || '.jpg'
}
