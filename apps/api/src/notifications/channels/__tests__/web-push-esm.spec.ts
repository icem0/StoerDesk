import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The web push in the runtime of the production (WP-M14-176).
 *
 * `web-push` is a CommonJS package. Node's ESM loader exposes a named export
 * of a CommonJS module only when its lexer can read the property statically —
 * `sendNotification` is a call expression in the `module.exports` of the
 * library, so it is reachable only through the **default** export. The built
 * API runs as an ES module (`esbuild --format=esm`, Node ESM), and a namespace
 * import left `sendNotification` undefined there: every send died with a
 * `TypeError` before the request and was reported as the unreachable push
 * service.
 *
 * Vitest cannot see this: its module runner resolves the CommonJS package
 * differently and hands the named export out. The test therefore runs the
 * adapter in a **child process under Node** — the same loader the API image
 * uses — and proves that a request really leaves the adapter.
 */
describe('the web push in the runtime of the production', () => {
  const repoRoot = resolve(import.meta.dirname, '../../../../../')
  const adapter = resolve(import.meta.dirname, '../web-push.ts')

  /**
   * Runs the adapter in a child process under Node and answers what the send
   * produced: the code and the message of the failure, or `delivered`.
   */
  const runAdapter = (): { delivered: boolean; code?: string; message?: string } => {
    const directory = mkdtempSync(join(tmpdir(), 'stoerdesk-web-push-'))
    const driver = join(directory, 'driver.mts')

    writeFileSync(
      driver,
      `import { createECDH } from 'node:crypto'
import { createServer } from 'node:net'
import { sendWebPushNotification } from ${JSON.stringify(adapter)}

const curve = createECDH('prime256v1')
curve.generateKeys()

const vapidKeys = {
  publicKey: curve.getPublicKey().toString('base64url'),
  privateKey: curve.getPrivateKey().toString('base64url'),
  subject: 'mailto:admin@example.org',
}

// A server that takes the connection and drops it: the request has to be
// attempted, and the reset of the connection is the answer the adapter has to
// name. The port stays bound while the send runs — a released port could be
// taken by another test in the same run.
const server = createServer((socket) => socket.destroy())
await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()))
const port = (server.address() as { port: number }).port

try {
  await sendWebPushNotification(
    vapidKeys,
    { title: 'ST-0001', body: 'test' },
    '',
    [
      {
        endpoint: \`https://127.0.0.1:\${port}/push\`,
        p256dh: vapidKeys.publicKey,
        auth: 'AAAAAAAAAAAAAAAAAAAAAA',
      },
    ],
  )
  console.log(JSON.stringify({ delivered: true }))
} catch (error) {
  const failure = error as { code?: string; message?: string }
  console.log(JSON.stringify({ delivered: false, code: failure.code, message: failure.message }))
} finally {
  server.close()
}
`,
      'utf8',
    )

    const output = execFileSync(process.execPath, ['--import', 'tsx', driver], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 60_000,
    })

    return JSON.parse(output.trim().split('\n').at(-1) ?? '{}') as {
      delivered: boolean
      code?: string
      message?: string
    }
  }

  it('sends the request to the push service (WP-M14-176)', () => {
    const result = runAdapter()

    expect(result.delivered).toBe(false)
    // The reset of the connection is named — the request left the adapter.
    expect(result.code).toBe('push_unreachable')
    expect(result.message).toBe('The push service did not answer: ECONNRESET')
  }, 70_000)
})
