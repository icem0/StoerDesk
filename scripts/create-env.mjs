#!/usr/bin/env node
// Creates `.env` from `.env.example` with generated secrets.
//
//   npm run env:create            # create .env (refuses to overwrite)
//   npm run env:create -- --force # overwrite an existing .env
//
// The compose file never has to be edited afterwards: every value the stack
// needs is read from `.env`.

import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const templatePath = join(repoRoot, '.env.example')
const targetPath = join(repoRoot, '.env')

const force = process.argv.includes('--force')

/** Secrets that are generated instead of copied from the template. */
const generatedSecrets = {
  POSTGRES_PASSWORD: () => randomBytes(18).toString('base64url'),
  SESSION_SECRET: () => randomBytes(48).toString('base64url'),
  SEED_ADMIN_PASSWORD: () => randomBytes(12).toString('base64url'),
  SYNAPSE_REGISTRATION_SHARED_SECRET: () => randomBytes(32).toString('base64url'),
}

/** Values that are derived from other values. */
function derivedValues(secrets) {
  const url = (host) =>
    `postgres://${secrets.POSTGRES_USER}:${secrets.POSTGRES_PASSWORD}@${host}:5432/${secrets.POSTGRES_DB}`

  return {
    DATABASE_URL: url('localhost'),
    TEST_DATABASE_URL: url('localhost'),
  }
}

function parseValues(content) {
  const values = {}

  for (const line of content.split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line)

    if (match !== null) {
      values[match[1]] = match[2]
    }
  }

  return values
}

function main() {
  if (existsSync(targetPath) && !force) {
    console.error('.env already exists — use "npm run env:create -- --force" to overwrite')
    process.exit(1)
  }

  const template = readFileSync(templatePath, 'utf8')
  const templateValues = parseValues(template)

  const secrets = { ...templateValues }

  for (const [key, generate] of Object.entries(generatedSecrets)) {
    secrets[key] = generate()
  }

  Object.assign(secrets, derivedValues(secrets))

  const output = template
    .split('\n')
    .map((line) => {
      const match = /^([A-Z0-9_]+)=/.exec(line)

      if (match === null) {
        return line
      }

      const key = match[1]

      return secrets[key] === undefined ? line : `${key}=${secrets[key]}`
    })
    .join('\n')

  writeFileSync(targetPath, output, { mode: 0o600 })

  console.log('.env created with generated secrets')
  console.log('')
  console.log('Next steps:')
  console.log('  docker compose up -d --build')
  console.log('  docker compose logs -f api')
}

main()
