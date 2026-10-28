import { describe, expect, it } from 'vitest'

import { databaseConnectionUrl, loadEnv } from '../env'

describe('databaseConnectionUrl', () => {
  it('uses DATABASE_URL when no host is configured', () => {
    const env = loadEnv({ DATABASE_URL: 'postgres://user:secret@localhost:5432/app' })

    expect(databaseConnectionUrl(env)).toBe('postgres://user:secret@localhost:5432/app')
  })

  it('builds the URL from the parts and encodes the credentials', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgres://ignored:ignored@localhost:5432/ignored',
      DATABASE_HOST: 'db',
      DATABASE_PORT: '5432',
      DATABASE_NAME: 'stoerdesk',
      DATABASE_USER: 'stoerdesk',
      DATABASE_PASSWORD: '50cKaJ5b#dbeO9QTB!SYxeTA8ELxOV',
    })

    const url = databaseConnectionUrl(env)

    expect(url).toBe('postgres://stoerdesk:50cKaJ5b%23dbeO9QTB%21SYxeTA8ELxOV@db:5432/stoerdesk')
    expect(() => new URL(url)).not.toThrow()
  })

  it('omits the password when it is empty', () => {
    const env = loadEnv({
      DATABASE_HOST: 'db',
      DATABASE_NAME: 'stoerdesk',
      DATABASE_USER: 'stoerdesk',
      DATABASE_PASSWORD: '',
    })

    expect(databaseConnectionUrl(env)).toBe('postgres://stoerdesk@db:5432/stoerdesk')
  })
})
