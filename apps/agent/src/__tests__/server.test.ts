import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it } from 'vitest'

import { createAgentServer } from '../server.js'
import { UpdateRunner } from '../update-runner.js'

const token = 'a'.repeat(32)

const openServers: { close: () => void }[] = []

afterEach(() => {
  for (const server of openServers) {
    server.close()
  }

  openServers.length = 0
})

async function startServer(
  getLastRun: () => null = () => null,
  runCommand: () => Promise<{ code: number; stdout: string; stderr: string }> = async () => ({
    code: 0,
    stdout: '',
    stderr: '',
  }),
): Promise<string> {
  const runner = new UpdateRunner({
    checkoutPath: '/repo',
    projectDirectory: '/repo',
    composeFile: '/repo/docker-compose.yml',
    runCommand,
    restoreOwnership: false,
  })

  const server = createAgentServer({ runner, token, getLastRun })

  openServers.push(server)

  await new Promise<void>((resolve) => {
    server.listen(0, resolve)
  })

  const address = server.address() as AddressInfo

  return `http://127.0.0.1:${address.port}`
}

describe('agent server', () => {
  it('refuses a request without the bearer token', async () => {
    const url = await startServer()

    const response = await fetch(`${url}/status`)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ code: 'unauthorized' })
  })

  it('refuses a request with a wrong bearer token', async () => {
    const url = await startServer()

    const response = await fetch(`${url}/status`, {
      headers: { authorization: `Bearer ${'b'.repeat(32)}` },
    })

    expect(response.status).toBe(401)
  })

  it('answers the status of the agent', async () => {
    const url = await startServer()

    const response = await fetch(`${url}/status`, {
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.status).toBe(200)

    const body = (await response.json()) as {
      state: string
      lastRun: unknown
      checkout: { version: string | null }
    }

    expect(body.state).toBe('idle')
    expect(body.lastRun).toBeNull()
    expect(body.checkout.version).toBeNull()
  })

  it('starts a run and refuses a second one', async () => {
    const url = await startServer(
      () => null,
      () => new Promise(() => undefined),
    )

    const started = await fetch(`${url}/run`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(started.status).toBe(202)

    const body = (await started.json()) as { run: { status: string } }

    expect(body.run.status).toBe('RUNNING')

    const second = await fetch(`${url}/run`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(second.status).toBe(409)
    await expect(second.json()).resolves.toEqual({ code: 'update_already_running' })
  })

  it('answers the runs the agent knows', async () => {
    const url = await startServer()

    const response = await fetch(`${url}/runs`, {
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ runs: [] })
  })

  it('answers 404 for an unknown path', async () => {
    const url = await startServer()

    const response = await fetch(`${url}/shell`, {
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ code: 'not_found' })
  })
})
