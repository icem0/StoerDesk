import { cpSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const src = join(root, 'apps', 'api', 'src', 'db', 'migrations')
const dst = join(root, 'apps', 'api', 'dist', 'db', 'migrations')

cpSync(src, dst, { recursive: true })

console.log(`copied migration files from ${src} to ${dst}`)
