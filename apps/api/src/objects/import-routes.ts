import fp from 'fastify-plugin'
import { z } from 'zod'
import {
  objectImportRequestSchema,
  PERMISSIONS,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { applyObjectImport, previewObjectImport } from './import'

/**
 * CSV import routes (`specs/08-objects-api.md` §9.4, WP-M10-13).
 *
 * Office-internal: both routes need a session with `object.import`, no bearer
 * scope reaches them (§9.5 keeps the external surface separate). A malformed
 * request body answers `400 invalid_request` with the field paths of the failed
 * schema — an unknown mapping target is reported with the header label it was
 * submitted for. The service answers an empty file, a duplicate header or an
 * over-limit document with the same code and the field `csv`, and the commit
 * route answers a taken `object_no` with `422 object_no_taken`; all of them
 * leave the database untouched. `preview` writes nothing, the commit route
 * applies the valid rows and adds its `applied` counters to the preview shape.
 */

type Db = Database['database']

function fieldPaths(error: z.ZodError) {
  return [...new Set(error.issues.map((issue) => issue.path.join('.')))]
}

function invalidRequest(fields: string[]) {
  return { code: 'invalid_request', params: { fields } }
}

export type ObjectImportRouteOptions = {
  database: Db
}

export const objectImportRoutes = fp<ObjectImportRouteOptions>(
  async (app, { database }) => {
    const guard = requirePermission(database, PERMISSIONS.object.import)

    app.post(
      '/api/v1/objects/import/preview',
      { preHandler: guard },
      async (request, reply) => {
        const parsed = objectImportRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply.code(400).send(invalidRequest(fieldPaths(parsed.error)))
        }

        return await previewObjectImport(database, parsed.data)
      },
    )

    app.post(
      '/api/v1/objects/import',
      { preHandler: guard },
      async (request, reply) => {
        const parsed = objectImportRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply.code(400).send(invalidRequest(fieldPaths(parsed.error)))
        }

        return await applyObjectImport(database, parsed.data)
      },
    )
  },
  { name: 'stoerdesk-object-import' },
)
