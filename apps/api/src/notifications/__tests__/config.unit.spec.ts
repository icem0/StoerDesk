import type { Database } from '../../db/client'
import { loadEnv } from '../../config/env'
import { readChannelConfiguration, type ChannelConfiguration } from '../config'
import { describe, expect, it } from 'vitest'

type Db = Database['database']

/** One row of `notification_channels` as the select of the service reads it. */
interface ChannelRow {
  kind: string
  enabled: boolean
  label: string
  config: Record<string, string>
  secret: string
}

/**
 * No PostgreSQL is involved: the service only reads the channel table, so the
 * unit test hands it the rows a table would answer and asserts the precedence
 * of `specs/10-notifications.md` §11.2.
 */
function fakeDatabase(rows: ChannelRow[]): Db {
  return {
    select: (_: unknown) => ({ from: (_: unknown) => rows }),
  } as unknown as Db
}

const row = (kind: string, values: Partial<ChannelRow> = {}): ChannelRow => ({
  kind,
  enabled: true,
  label: '',
  config: {},
  secret: '',
  ...values,
})

const enabledOf = (configurations: ChannelConfiguration[]): string[] =>
  configurations
    .filter((configuration) => configuration.enabled)
    .map((configuration) => configuration.kind)

describe('readChannelConfiguration (channel configuration in the database, §11.2)', () => {
  it('lets a row win over the environment', async () => {
    const env = loadEnv({ NTFY_URL: 'https://env.mock', NTFY_TOPIC: 'env-topic' })

    const configurations = await readChannelConfiguration(
      fakeDatabase([
        {
          kind: 'ntfy',
          enabled: true,
          label: 'Office ntfy',
          config: { url: 'https://row.mock', topic: 'row-topic' },
          secret: '',
        },
      ]),
      env,
    )

    const ntfy = configurations.find((configuration) => configuration.kind === 'ntfy')

    expect(ntfy).toEqual({
      kind: 'ntfy',
      enabled: true,
      label: 'Office ntfy',
      config: { url: 'https://row.mock', topic: 'row-topic' },
      secretSet: false,
    })
  })

  it('falls back to the environment for a kind without a row', async () => {
    const env = loadEnv({
      MATRIX_HOMESERVER: 'https://matrix.mock',
      MATRIX_ROOM_ID: '!room:mock',
      MATRIX_ACCESS_TOKEN: 'mock-token',
    })

    const configurations = await readChannelConfiguration(
      fakeDatabase([row('signal', { config: { cliUrl: 'https://signal.mock' } })]),
      env,
    )

    const matrix = configurations.find(
      (configuration) => configuration.kind === 'matrix',
    )

    expect(matrix).toEqual({
      kind: 'matrix',
      enabled: true,
      label: 'matrix',
      config: { homeserver: 'https://matrix.mock', roomId: '!room:mock' },
      secretSet: true,
    })
  })

  it('does not configure a disabled channel', async () => {
    const env = loadEnv({
      TELEGRAM_BOT_TOKEN: 'mock-token',
      TELEGRAM_CHAT_ID: '@mock',
    })

    const configurations = await readChannelConfiguration(
      fakeDatabase([row('telegram', { enabled: false })]),
      env,
    )

    expect(enabledOf(configurations)).toEqual([])

    const telegram = configurations.find(
      (configuration) => configuration.kind === 'telegram',
    )

    expect(telegram).toEqual({
      kind: 'telegram',
      enabled: false,
      label: 'telegram',
      config: { chatId: '@mock' },
      secretSet: true,
    })
  })

  it('requires a usable configuration even when a row exists', async () => {
    const configurations = await readChannelConfiguration(
      fakeDatabase([row('telegram', { config: { chatId: '@incomplete' } })]),
      loadEnv({}),
    )

    expect(enabledOf(configurations)).toEqual([])
  })

  it('configures WhatsApp Web only through its row (ADR-0020)', async () => {
    const configurations = await readChannelConfiguration(
      fakeDatabase([
        {
          kind: 'whatsapp',
          enabled: true,
          label: 'Office bridge',
          config: { baseUrl: 'https://bridge.mock' },
          secret: 'bridge-bearer',
        },
      ]),
      loadEnv({}),
    )

    expect(enabledOf(configurations)).toEqual(['whatsapp'])

    const whatsapp = configurations.find(
      (configuration) => configuration.kind === 'whatsapp',
    )

    expect(whatsapp).toEqual({
      kind: 'whatsapp',
      enabled: true,
      label: 'Office bridge',
      config: { baseUrl: 'https://bridge.mock' },
      secretSet: true,
    })
  })
})
