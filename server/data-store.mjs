import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.resolve(import.meta.dirname, 'data')
const DATA_FILE = path.join(DATA_DIR, 'assets.json')

// Serialized write queue to prevent concurrent write conflicts
let writeQueue = Promise.resolve()

async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true })
  }
}

/**
 * Load user assets from the JSON file.
 * Returns an empty array if the file does not exist or is corrupted.
 */
export async function loadAssets() {
  try {
    if (!existsSync(DATA_FILE)) {
      return []
    }
    const raw = await readFile(DATA_FILE, 'utf8')
    const data = JSON.parse(raw)
    return Array.isArray(data) ? sanitizeAssets(data) : []
  } catch {
    // File corrupted — reset to empty
    return []
  }
}

/**
 * Save user assets to the JSON file.
 * @param {Array} assets - array of asset objects to persist
 */
export async function saveAssets(assets) {
  const task = async () => {
    await ensureDataDir()
    await writeFile(DATA_FILE, JSON.stringify(sanitizeAssets(assets), null, 2), 'utf8')
  }
  // Chain writes to avoid concurrent file corruption
  writeQueue = writeQueue.then(task).catch(task)
  return writeQueue
}


import { unlink } from 'node:fs/promises'

/**
 * Delete uploaded image files associated with the given assets.
 * @param {Array} assets - assets whose images should be cleaned up
 */
export async function deleteAssetImages(assets) {
  for (const asset of (assets || [])) {
    const image = String(asset?.image || '')
    // Only clean up local uploads, not /media/ or external URLs
    if (!image.startsWith('/uploads/') && !image.startsWith('uploads/')) continue
    try {
      const filename = image.replace(/^\/?uploads\//, '')
      if (!filename || filename.includes('..')) continue
      const filePath = path.join(DATA_DIR, 'uploads', filename)
      try { await unlink(filePath) } catch { /* already deleted or never existed */ }
    } catch { /* skip */ }
  }
}
function sanitizeAssets(assets) {
  return (assets || []).filter((asset) => {
    const image = String(asset?.image || '')
    return !image.startsWith('data:image/')
  })
}
