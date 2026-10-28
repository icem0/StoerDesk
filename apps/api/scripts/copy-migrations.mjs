import { cpSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(apiRoot, 'src/db/migrations')
const target = resolve(apiRoot, 'dist/db/migrations')

mkdirSync(dirname(target), { recursive: true })
cpSync(source, target, { recursive: true })
