import { cpSync } from 'node:fs'
import { join } from 'node:path'

const cwd = process.cwd()
// npm --workspace @stoerdesk/api runs from apps/api/, otherwise from repo root.
const root = cwd.includes('/apps/api') ? join(cwd, '..', '..') : cwd
const src = join(root, 'apps', 'api', 'src', 'db', 'migrations')
const dst = join(root, 'apps', 'api', 'dist', 'db', 'migrations')

cpSync(src, dst, { recursive: true })

console.log(`copied migration files from ${src} to ${dst}`)
