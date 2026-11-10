import Fastify from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { openApiPlugin } from '../openapi'

/**
 * The published document covers the external surface only (`specs/08-objects-api.md`
 * §9.5, WP-M10-06): bearer security, object and ticket paths, no office route.
 */

describe('OpenAPI document', () => {
  const app = Fastify()

  beforeAll(async () => {
    await app.register(openApiPlugin)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('serves the JSON document with bearer auth and the external paths', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/docs/json' })

    expect(response.statusCode).toBe(200)

    const document = response.json<{
      openapi: string
      components: { securitySchemes: Record<string, { type: string; scheme: string }> }
      paths: Record<string, unknown>
    }>()

    expect(document.openapi).toMatch(/^3\.1/)
    expect(document.components.securitySchemes.bearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'API key',
    })
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/objects',
        '/objects/{objectNo}',
        '/objects/bulk',
        '/tickets',
        '/tickets/{ticketNo}/work-order',
        '/api-keys',
      ]),
    )
  })

  it('serves the documentation UI without data', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/docs' })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toMatch(/text\/html/)
  })
})
