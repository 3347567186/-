import { readdirSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const serverDir = path.resolve('server')
const files = readdirSync(serverDir)
  .filter((name) => name.endsWith('.mjs'))
  .map((name) => path.join(serverDir, name))

let failed = false
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' })
  if (result.status !== 0) failed = true
}

if (failed) process.exit(1)
console.log(`Checked ${files.length} server module(s).`)
