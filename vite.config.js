import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { Buffer } from 'node:buffer'
import { createReadStream, existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  handleAiCrawlImagesRequest,
  handleAiDesignRequest,
  handleAiOrganizeAssetsRequest,
  handleAiTagAssetsRequest,
} from './server/ai-agent.mjs'
import { loadAssets, saveAssets, deleteAssetImages } from './server/data-store.mjs'
import { handleAssetUpload } from './server/upload-store.mjs'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))

  return {
    plugins: [react(), aiAgentApi()],
    server: {
      allowedHosts: [
        '.loca.lt',
        '.trycloudflare.com',
        '.serveousercontent.com',
      ],
    },
  }
})

// Known seed asset IDs — these come from src/data/constants.js
// and should never be saved to the user data file.
const SEED_ASSET_IDS = new Set([
  'asset-machine-demo', 'asset-exhibition',
  'asset-pattern-library', 'asset-gene-map',
  'asset-embroidered-panel', 'asset-botanical',
  'mz-butterfly-bag', 'bird-flower-panel',
  'geometric-border', 'sachet-flower',
])

function aiAgentApi() {
  return {
    name: 'zhenyun-ai-agent-api',
    configureServer(server) {
      // Serve uploaded files from data/uploads/
      const UPLOAD_DIR = path.resolve(process.cwd(), 'data', 'uploads')
      server.middlewares.use('/uploads', async (req, res) => {
        const filename = path.basename(req.url || '')
        if (!filename) { res.statusCode = 404; res.end(); return }
        const filePath = path.join(UPLOAD_DIR, filename)
        if (existsSync(filePath)) {
          const ext = path.extname(filename).toLowerCase()
          const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
            '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
            '.avif': 'image/avif', '.bmp': 'image/bmp' }[ext] || 'application/octet-stream'
          res.statusCode = 200
          res.setHeader('Content-Type', mime)
          res.setHeader('Cache-Control', 'public, max-age=86400')
          createReadStream(filePath).pipe(res)
        } else {
          res.statusCode = 404
          res.end()
        }
      })

      server.middlewares.use('/api/ai/design', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        try {
          const body = await readJsonBody(req)
          const result = await handleAiDesignRequest(body)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result))
        } catch (error) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: error.message || 'AI agent request failed' }))
        }
      })
      server.middlewares.use('/api/ai/crawl-images', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        try {
          const body = await readJsonBody(req)
          const result = await handleAiCrawlImagesRequest(body)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result))
        } catch (error) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: error.message || 'AI crawl request failed' }))
        }
      })
      server.middlewares.use('/api/ai/organize-assets', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        try {
          const body = await readJsonBody(req)
          const result = await handleAiOrganizeAssetsRequest(body)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result))
        } catch (error) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: error.message || 'AI organize request failed' }))
        }
      })
      server.middlewares.use('/api/ai/tag-assets', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }
        try {
          const body = await readJsonBody(req)
          const result = await handleAiTagAssetsRequest(body)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result))
        } catch (error) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: error.message || 'AI tag request failed' }))
        }
      })
      server.middlewares.use('/api/ai/image-proxy', async (req, res) => {
        try {
          const requestUrl = new URL(req.url || '', 'http://127.0.0.1')
          const target = requestUrl.searchParams.get('url') || ''
          if (!/^https?:\/\//i.test(target)) {
            redirectToFallbackImage(res)
            return
          }

          const upstream = await fetchWithTimeout(
            target,
            {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
                Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
              },
            },
            3500,
          )
          if (!upstream.ok) {
            redirectToFallbackImage(res)
            return
          }

          const contentType = upstream.headers.get('content-type') || 'image/jpeg'
          const arrayBuffer = await upstream.arrayBuffer()
          res.statusCode = 200
          res.setHeader('Content-Type', contentType)
          res.setHeader('Cache-Control', 'public, max-age=86400')
          res.end(Buffer.from(arrayBuffer))
        } catch {
          redirectToFallbackImage(res)
        }
      })

      // --- Asset Persistence API ---

      const corsHeaders = (req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.end()
          return
        }
        next()
      }

      // GET /api/assets — return user assets (frontend merges with seed data)
      server.middlewares.use('/api/assets', async (req, res, next) => {
        if (req.method === 'GET') {
          try {
            const userAssets = await loadAssets()
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ assets: userAssets }))
          } catch (error) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: error.message || 'Failed to load assets' }))
          }
        } else {
          next()
        }
      })

      // DELETE /api/assets — remove assets and their uploaded images
      server.middlewares.use('/api/assets', async (req, res) => {
        if (req.method === 'DELETE') {
          try {
            const body = await readJsonBody(req)
            const idsToDelete = Array.isArray(body.ids) ? body.ids : []
            if (!idsToDelete.length) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'No ids provided' }))
              return
            }
            const current = await loadAssets()
            const toDelete = current.filter((a) => idsToDelete.includes(a.id))
            const remaining = current.filter((a) => !idsToDelete.includes(a.id))
            await saveAssets(remaining)
            await deleteAssetImages(toDelete)
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: true, deleted: toDelete.length }))
          } catch (error) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: error.message || 'Failed to delete assets' }))
          }
        } else {
          res.writeHead(404)
          res.end()
        }
      })

            // POST /api/assets/sync — receive full asset list, filter seed, persist
      server.middlewares.use('/api/assets/sync', async (req, res) => {
        corsHeaders(req, res, async () => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end('Method not allowed')
            return
          }
          try {
            const body = await readJsonBody(req)
            const fullList = Array.isArray(body.assets) ? body.assets : []
            // Only persist user-created assets (non-seed)
            const userAssets = fullList.filter((a) => !SEED_ASSET_IDS.has(a.id))
            await saveAssets(userAssets)
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: true }))
          } catch (error) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: error.message || 'Failed to sync assets' }))
          }
        })
      })

      // POST /api/assets/upload — save one local image and return a public URL
      server.middlewares.use('/api/assets/upload', async (req, res) => {
        corsHeaders(req, res, async () => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end('Method not allowed')
            return
          }
          try {
            const uploaded = await handleAssetUpload(req)
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: true, file: uploaded }))
          } catch (error) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: error.message || 'Failed to upload asset' }))
          }
        })
      })

      // POST /api/assets/reset — clear all user data
      server.middlewares.use('/api/assets/reset', async (req, res) => {
        corsHeaders(req, res, async () => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end('Method not allowed')
            return
          }
          try {
            await saveAssets([])
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: true }))
          } catch (error) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: error.message || 'Failed to reset assets' }))
          }
        })
      })
    },
  }
}

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

function redirectToFallbackImage(res) {
  res.statusCode = 302
  res.setHeader('Location', '/media/hero-pattern-detail.jpg')
  res.end()
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}
