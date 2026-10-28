#!/usr/bin/env node
// Creates the Matrix notification bot and prints the values for the .env file.
//
//   docker compose --profile matrix up -d
//   npm run matrix:create-bot
//
// The script registers a user via the Synapse shared-secret API, creates a
// room for the notifications and prints MATRIX_ACCESS_TOKEN and
// MATRIX_ROOM_ID.

import { createHmac, randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function readEnvFile() {
  const path = join(repoRoot, '.env')

  if (!existsSync(path)) {
    return {}
  }

  const values = {}

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line)

    if (match !== null) {
      values[match[1]] = match[2]
    }
  }

  return values
}

function mac(secret, nonce, username, password, admin) {
  return createHmac('sha1', secret)
    .update(`${nonce}\u0000${username}\u0000${password}\u0000${admin ? 'admin' : 'notadmin'}`)
    .digest('hex')
}

async function main() {
  const env = readEnvFile()
  const homeserver = env.MATRIX_HOMESERVER ?? 'http://localhost:8008'
  const secret = env.SYNAPSE_REGISTRATION_SHARED_SECRET ?? ''
  const username = env.MATRIX_BOT_USERNAME ?? 'stoerdesk-bot'

  if (secret === '') {
    console.error('SYNAPSE_REGISTRATION_SHARED_SECRET is missing in .env')
    process.exit(1)
  }

  const nonceResponse = await fetch(`${homeserver}/_synapse/admin/v1/register`)

  if (!nonceResponse.ok) {
    console.error(`Cannot reach the Matrix homeserver at ${homeserver}`)
    process.exit(1)
  }

  const { nonce } = await nonceResponse.json()
  const password = env.MATRIX_BOT_PASSWORD ?? randomPassword()

  const registerResponse = await fetch(`${homeserver}/_synapse/admin/v1/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      nonce,
      username,
      password,
      admin: false,
      displayname: 'StörDesk',
      mac: mac(secret, nonce, username, password, false),
    }),
  })

  if (!registerResponse.ok) {
    console.error(
      `Registration failed: ${registerResponse.status} ${await registerResponse.text()}`,
    )
    process.exit(1)
  }

  const registration = await registerResponse.json()

  const roomResponse = await fetch(`${homeserver}/_matrix/client/v3/createRoom`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${registration.access_token}`,
    },
    body: JSON.stringify({ name: 'StörDesk Benachrichtigungen', preset: 'private_chat' }),
  })

  if (!roomResponse.ok) {
    console.error(`Room creation failed: ${roomResponse.status} ${await roomResponse.text()}`)
    process.exit(1)
  }

  const { room_id: roomId } = await roomResponse.json()

  console.log('Add these lines to your .env:')
  console.log('')
  console.log(`MATRIX_ACCESS_TOKEN=${registration.access_token}`)
  console.log(`MATRIX_ROOM_ID=${roomId}`)
  console.log('')
  console.log(`Bot user: ${registration.user_id} (password: ${password})`)
}

function randomPassword() {
  return randomBytes(16).toString('base64url')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
