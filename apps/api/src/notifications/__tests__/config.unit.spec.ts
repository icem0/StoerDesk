import type { Database } from '../../db/client'
import { loadEnv } from '../../config/env'
import {
  channelFingerprint,
  readChannelConfiguration,
  readEffectiveChannel,
  readEmailChannelConfiguration,
  type ChannelConfiguration,
} from '../config'
import { notificationChannelVerifications } from '../../db/schema'
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
interface VerificationRow {
  kind: string
  fingerprint: string
  verifiedAt: Date | null
}

function fakeDatabase(
  rows: ChannelRow[],
  verifications: VerificationRow[] = [],
): Db {
  return {
    select: (_: unknown) => ({
      from: (table: unknown) =>
        table === notificationChannelVerifications ? verifications : rows,
    }),
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

/**
 * The fake of the single row of `readEffectiveChannel`: the service reads the
 * row of one kind, so the fake hands it the rows it would answer.
 */
function singleRowDatabase(rows: ChannelRow[]): Db {
  return {
    select: () => ({
      from: () => {
        const chain = {
          where: () => chain,
          limit: () => chain,
          then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
            Promise.resolve(rows).then(resolve, reject),
        }

        return chain
      },
    }),
  } as unknown as Db
}

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
      verified: false,
      token: '',
    })
  })

  it('carries the access token of the row for the send (WP-M14-51, ADR-0022)', async () => {
    const env = loadEnv({ NTFY_TOKEN: 'tk_env' })

    const configurations = await readChannelConfiguration(
      fakeDatabase([
        {
          kind: 'ntfy',
          enabled: true,
          label: 'Office ntfy',
          config: { url: 'https://row.mock', topic: 'row-topic' },
          secret: 'tk_row',
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
      secretSet: true,
      verified: false,
      token: 'tk_row',
    })

    const withoutRow = await readChannelConfiguration(
      fakeDatabase([]),
      loadEnv({ NTFY_URL: 'https://env.mock', NTFY_TOPIC: 'env-topic', NTFY_TOKEN: 'tk_env' }),
    )

    expect(
      withoutRow.find((configuration) => configuration.kind === 'ntfy')?.token,
    ).toBe('tk_env')
    expect(
      withoutRow.find((configuration) => configuration.kind === 'ntfy')?.config,
    ).not.toHaveProperty('token')
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
      verified: true,
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
      verified: true,
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
      verified: true,
    })
  })

  it('counts an ntfy target as verified only with a matching proof (WP-M14-47)', async () => {
    const config = { url: 'https://row.mock', topic: 'row-topic' }
    const row: ChannelRow = {
      kind: 'ntfy',
      enabled: true,
      label: 'Office ntfy',
      config,
      secret: '',
    }
    const env = loadEnv({})

    const unverified = await readChannelConfiguration(fakeDatabase([row]), env)
    expect(unverified.find((configuration) => configuration.kind === 'ntfy')?.verified).toBe(false)

    const verified = await readChannelConfiguration(
      fakeDatabase(
        [row],
        [
          {
            kind: 'ntfy',
            fingerprint: channelFingerprint('ntfy', config),
            verifiedAt: new Date(),
          },
        ],
      ),
      env,
    )
    expect(verified.find((configuration) => configuration.kind === 'ntfy')?.verified).toBe(true)

    const changed = await readChannelConfiguration(
      fakeDatabase(
        [row],
        [
          {
            kind: 'ntfy',
            fingerprint: channelFingerprint('ntfy', {
              url: 'https://old.mock',
              topic: 'row-topic',
            }),
            verifiedAt: new Date(),
          },
        ],
      ),
      env,
    )
    expect(changed.find((configuration) => configuration.kind === 'ntfy')?.verified).toBe(false)
  })
})

describe('readEffectiveChannel (the effective configuration with its secret, §11.2)', () => {
  it('lets the row of the administration win over the environment (WP-M24-21)', async () => {
    const env = loadEnv({
      NTFY_URL: 'https://env.mock',
      NTFY_TOPIC: 'env-topic',
      NTFY_TOKEN: 'tk_env',
    })

    const effective = await readEffectiveChannel(
      singleRowDatabase([
        row('ntfy', {
          config: { url: 'https://row.mock', topic: 'row-topic' },
          secret: 'tk_row',
        }),
      ]),
      env,
      'ntfy',
    )

    expect(effective.config.url).toBe('https://row.mock')
    expect(effective.config.topic).toBe('row-topic')
    expect(effective.secret).toBe('tk_row')
  })

  it('falls back to the environment for a kind without a row', async () => {
    const effective = await readEffectiveChannel(
      singleRowDatabase([]),
      loadEnv({ TELEGRAM_BOT_TOKEN: 'tk_env', TELEGRAM_CHAT_ID: '@env' }),
      'telegram',
    )

    expect(effective.config.chatId).toBe('@env')
    expect(effective.secret).toBe('tk_env')
  })

  it('lets an empty value of the row fall back to the environment', async () => {
    const effective = await readEffectiveChannel(
      singleRowDatabase([row('email', { config: { host: '', from: 'from@row' } })]),
      loadEnv({ SMTP_HOST: 'smtp.env', SMTP_FROM: 'from@env' }),
      'email',
    )

    expect(effective.config.host).toBe('smtp.env')
    expect(effective.config.from).toBe('from@row')
  })

  it('configures WhatsApp Web only through its row (ADR-0020)', async () => {
    const effective = await readEffectiveChannel(
      singleRowDatabase([
        row('whatsapp', {
          config: { baseUrl: 'https://bridge.mock' },
          secret: 'bridge-bearer',
        }),
      ]),
      loadEnv({ WHATSAPP_BRIDGE_URL: 'https://env.mock', WHATSAPP_BRIDGE_TOKEN: 'env-bearer' }),
      'whatsapp',
    )

    expect(effective.config.baseUrl).toBe('https://bridge.mock')
    expect(effective.secret).toBe('bridge-bearer')
  })
})

describe('readEmailChannelConfiguration (the mailbox of the administration, §11.2, WP-M41-01)', () => {
  it('counts a mailbox of the administration without any SMTP key of the environment', async () => {
    const email = await readEmailChannelConfiguration(
      fakeDatabase([
        row('email', {
          config: { host: 'smtp.office365.com', port: '587', from: 'office@example.invalid' },
          secret: 'app-password',
        }),
      ]),
      loadEnv({}),
    )

    expect(email.config.host).toBe('smtp.office365.com')
    expect(email.config.from).toBe('office@example.invalid')
    expect(email.secret).toBe('app-password')
    expect(email.enabled).toBe(true)
    expect(email.usable).toBe(true)
  })

  it('lets the row of the administration win over the environment', async () => {
    const email = await readEmailChannelConfiguration(
      fakeDatabase([
        row('email', {
          config: { host: 'smtp.office365.com', from: 'office@example.invalid' },
        }),
      ]),
      loadEnv({ SMTP_HOST: 'smtp.env', SMTP_FROM: 'from@env' }),
    )

    expect(email.config.host).toBe('smtp.office365.com')
    expect(email.config.from).toBe('office@example.invalid')
  })

  it('keeps the environment while the row of the administration carries no value', async () => {
    const email = await readEmailChannelConfiguration(
      fakeDatabase([row('email')]),
      loadEnv({ SMTP_HOST: 'smtp.env', SMTP_FROM: 'from@env' }),
    )

    expect(email.config.host).toBe('smtp.env')
    expect(email.config.from).toBe('from@env')
    expect(email.enabled).toBe(true)
  })

  it('is not enabled while the administration switched the channel off', async () => {
    const email = await readEmailChannelConfiguration(
      fakeDatabase([
        row('email', {
          enabled: false,
          config: { host: 'smtp.office365.com', from: 'office@example.invalid' },
        }),
      ]),
      loadEnv({}),
    )

    expect(email.usable).toBe(true)
    expect(email.enabled).toBe(false)
  })

  it('cannot send without a host and a sender', async () => {
    const email = await readEmailChannelConfiguration(
      fakeDatabase([row('email', { config: { from: 'office@example.invalid' } })]),
      loadEnv({}),
    )

    expect(email.usable).toBe(false)
    expect(email.enabled).toBe(false)
  })
})
