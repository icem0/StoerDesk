import { cp, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const workspace = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(workspace, 'src', 'db', 'migrations')
const target = join(workspace, 'dist', 'db', 'migrations')

await mkdir(dirname(target), { recursive: true })
await cp(source, target, { recursive: true })

console.log(`copied migrations to ${target}`)
