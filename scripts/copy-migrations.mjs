import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const src = join(root, 'apps', 'api', 'src', 'db', 'migrations')
const dst = join(root, 'apps', 'api', 'dist', 'db', 'migrations')

mkdirSync(dst, { recursive: true })

for (const name of readdirSync(src)) {
  const from = join(src, name)
  const to = join(dst, name)
  if (statSync(from).isFile() && name.endsWith('.sql')) {
    copyFileSync(from, to)
  }
}

console.log(`copied migration SQL files from ${src} to ${dst}`)
