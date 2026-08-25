/**
 * Production server for 针韵智绣
 * Serves built static files + API middleware (AI agent + asset persistence)
 */
import { createServer } from 'node:http'
import { createReadStream, readFileSync, existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Buffer } from 'node:buffer'
import {
  handleAiCrawlImagesRequest,
  handleAiDesignRequest,
  handleAiOrganizeAssetsRequest,
  handleAiTagAssetsRequest,
} from './ai-agent.mjs'
import { loadAssets, saveAssets, deleteAssetImages } from './data-store.mjs'

// Load .env file into process.env (critical: API keys live in .env)
import 'dotenv/config'
import { handleAssetUpload } from './upload-store.mjs'

const PORT = parseInt(process.env.PORT || '5184', 10)
const DIST_DIR = path.resolve(import.meta.dirname, '..', 'dist')
const PUBLIC_DIR = path.resolve(import.meta.dirname, '..', 'public')
const UPLOAD_DIR = path.resolve(import.meta.dirname, '..', 'data', 'uploads')

// MIME types
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

// Seed asset IDs (same as in constants.js)
const SEED_ASSET_IDS = new Set([
  'asset-machine-demo', 'asset-exhibition',
  'asset-pattern-library', 'asset-gene-map',
  'asset-embroidered-panel', 'asset-botanical',
  'mz-butterfly-bag', 'bird-flower-panel',
  'geometric-border', 'sachet-flower',
])

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('error', reject)
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch (error) {
        reject(error)
      }
    })
  })
}

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(data))
}

// Preload index.html
const INDEX_HTML = readFileSync(path.join(DIST_DIR, 'index.html'), 'utf8')

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost')
  const pathname = url.pathname

  // --- CORS preflight ---
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.statusCode = 204
    res.end()
    return
  }

  try {
    // --- API Routes ---

    // GET /api/assets
    if (req.method === 'GET' && pathname === '/api/assets') {
      const userAssets = await loadAssets()
      sendJson(res, 200, { assets: userAssets })
      return
    }

    // DELETE /api/assets — remove assets and their uploaded images
    if (req.method === 'DELETE' && pathname === '/api/assets') {
      try {
        const body = await readJsonBody(req)
        const idsToDelete = Array.isArray(body.ids) ? body.ids : []
        if (!idsToDelete.length) { sendJson(res, 400, { error: 'No ids provided' }); return }
        const current = await loadAssets()
        const toDelete = current.filter((a) => idsToDelete.includes(a.id))
        const remaining = current.filter((a) => !idsToDelete.includes(a.id))
        await saveAssets(remaining)
        await deleteAssetImages(toDelete)
        sendJson(res, 200, { success: true, deleted: toDelete.length })
      } catch (error) {
        sendJson(res, 500, { error: error.message || 'Failed to delete assets' })
      }
      return
    }

        // POST /api/assets/sync
    if (req.method === 'POST' && pathname === '/api/assets/sync') {
      const body = await readJsonBody(req)
      const fullList = Array.isArray(body.assets) ? body.assets : []
      const userAssets = fullList.filter((a) => !SEED_ASSET_IDS.has(a.id))
      await saveAssets(userAssets)
      sendJson(res, 200, { success: true })
      return
    }

    // POST /api/assets/upload
    if (req.method === 'POST' && pathname === '/api/assets/upload') {
      const uploaded = await handleAssetUpload(req)
      sendJson(res, 200, { success: true, file: uploaded })
      return
    }

    // POST /api/assets/reset
    if (req.method === 'POST' && pathname === '/api/assets/reset') {
      await saveAssets([])
      sendJson(res, 200, { success: true })
      return
    }

    // POST /api/ai/design
    if (req.method === 'POST' && pathname === '/api/ai/design') {
      const body = await readJsonBody(req)
      const result = await handleAiDesignRequest(body)
      sendJson(res, 200, result)
      return
    }

    // POST /api/ai/crawl-images
    if (req.method === 'POST' && pathname === '/api/ai/crawl-images') {
      const body = await readJsonBody(req)
      const result = await handleAiCrawlImagesRequest(body)
      sendJson(res, 200, result)
      return
    }

    // POST /api/ai/organize-assets
    if (req.method === 'POST' && pathname === '/api/ai/organize-assets') {
      const body = await readJsonBody(req)
      const result = await handleAiOrganizeAssetsRequest(body)
      sendJson(res, 200, result)
      return
    }

    // POST /api/ai/tag-assets
    if (req.method === 'POST' && pathname === '/api/ai/tag-assets') {
      const body = await readJsonBody(req)
      const result = await handleAiTagAssetsRequest(body)
      sendJson(res, 200, result)
      return
    }

    // GET /api/ai/image-proxy
    if (pathname === '/api/ai/image-proxy') {
      const target = url.searchParams.get('url') || ''
      if (!/^https?:\/\//i.test(target)) {
        res.writeHead(302, { Location: '/media/hero-pattern-detail.jpg' })
        res.end()
        return
      }
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 3500)
        const upstream = await fetch(target, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
            Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          },
          signal: controller.signal,
        })
        clearTimeout(timeout)
        if (!upstream.ok) throw new Error('Upstream not ok')
        const contentType = upstream.headers.get('content-type') || 'image/jpeg'
        const buffer = Buffer.from(await upstream.arrayBuffer())
        res.statusCode = 200
        res.setHeader('Content-Type', contentType)
        res.setHeader('Cache-Control', 'public, max-age=86400')
        res.end(buffer)
      } catch {
        res.writeHead(302, { Location: '/media/hero-pattern-detail.jpg' })
        res.end()
      }
      return
    }

    // --- Uploaded file serving (streaming) ---
    if (pathname.startsWith('/uploads/')) {
      const filename = path.basename(pathname)
      const diskPath = path.join(UPLOAD_DIR, filename)
      if (existsSync(diskPath)) {
        const ext = path.extname(filename).toLowerCase()
        res.statusCode = 200
        res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
        res.setHeader('Cache-Control', 'public, max-age=86400')
        const stream = createReadStream(diskPath)
        stream.on('error', () => { res.statusCode = 500; try { res.end() } catch {} })
        stream.pipe(res)
        return
      }
      res.statusCode = 404
      res.end()
      return
    }

    // --- Static file serving ---
    let filePath = pathname === '/' ? '/index.html' : pathname

    // Try dist folder first
    let diskPath = path.join(DIST_DIR, filePath)
    if (existsSync(diskPath)) {
      const ext = path.extname(diskPath).toLowerCase()
      const content = await readFile(diskPath)
      res.statusCode = 200
      res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
      if (filePath === '/index.html') {
        res.setHeader('Cache-Control', 'public, no-cache')
      } else {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      }
      res.end(content)
      return
    }

    // Try public folder
    diskPath = path.join(PUBLIC_DIR, filePath)
    if (existsSync(diskPath)) {
      const ext = path.extname(diskPath).toLowerCase()
      const content = await readFile(diskPath)
      res.statusCode = 200
      res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
      res.setHeader('Cache-Control', 'public, max-age=86400')
      res.end(content)
      return
    }

    // SPA fallback — always serve index.html for non-file routes
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html')
    res.end(INDEX_HTML)
  } catch (error) {
    console.error('Server error:', error)
    res.statusCode = 500
    res.setHeader('Content-Type', 'text/plain')
    res.end('Internal server error')
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}`)
  console.log(`Network: http://192.168.2.4:${PORT}`)
})
