import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import type { FastifyInstance } from 'fastify'
import type { OpenAPIV3 } from 'openapi-types'
import fp from 'fastify-plugin'
import { z } from 'zod'
import {
  apiKeySummarySchema,
  createApiKeyRequestSchema,
  createApiKeyResponseSchema,
  createObjectRequestSchema,
  internalCreateTicketRequestSchema,
  objectListResponseSchema,
  objectNoSchema,
  objectSummarySchema,
  ticketListItemSchema,
  updateApiKeyRequestSchema,
  updateObjectRequestSchema,
} from '@stoerdesk/shared'

/**
 * OpenAPI document of the external surface (`specs/08-objects-api.md` §9.5,
 * ADR-0013, WP-M10-06). The published document covers API keys, objects and
 * tickets only; office-internal routes stay out. It is generated from the
 * shared Zod contracts and served public and data-free.
 */

const externalObjectUpsertSchema = createObjectRequestSchema.omit({ objectNo: true })
const externalObjectBulkSchema = z.object({
  items: z.array(createObjectRequestSchema).min(1).max(500),
})

const externalTicketCreateSchema = internalCreateTicketRequestSchema
  .omit({ objectId: true })
  .extend({ objectNo: objectNoSchema })

const workOrderSchema = z.object({
  type: z.string().trim().min(1).max(80),
  number: z.string().trim().min(1).max(120),
})

function schemaOf(value: z.ZodType, io: 'input' | 'output'): Record<string, unknown> {
  return z.toJSONSchema(value, { target: 'openapi-3.1', io }) as Record<string, unknown>
}

function response(description: string, schema?: Record<string, unknown> | string) {
  return {
    description,
    content: {
      ...(schema === undefined
        ? {}
        : { 'application/json': { schema: typeof schema === 'string' ? { $ref: schema } : schema } }),
    },
  }
}

function jsonBody(ref: string) {
  return {
    required: true,
    content: { 'application/json': { schema: { $ref: ref } } },
  }
}

const parameter = (name: string, location: 'path' | 'query', schema: Record<string, unknown>) => ({
  name,
  in: location,
  required: location === 'path',
  ...(location === 'query' ? { required: false } : {}),
  schema,
})

const bearer = [{ bearerAuth: [] }]

export function buildOpenApiDocument(): OpenAPIV3.Document {
  return {
    openapi: '3.1.0',
    info: {
      title: 'StörDesk API',
      version: '1.0.0',
      description:
        'External REST API. Authenticate with `Authorization: Bearer sk_...` and the scope of the operation.',
    },
    servers: [{ url: '/api/v1' }],
    security: bearer,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'API key' },
      },
      schemas: {
        ApiKeySummary: schemaOf(apiKeySummarySchema, 'output'),
        CreateApiKeyRequest: schemaOf(createApiKeyRequestSchema, 'input'),
        CreateApiKeyResponse: schemaOf(createApiKeyResponseSchema, 'output'),
        UpdateApiKeyRequest: schemaOf(updateApiKeyRequestSchema, 'input'),
        ApiKeyListResponse: {
          type: 'object',
          required: ['keys'],
          properties: { keys: { type: 'array', items: { $ref: '#/components/schemas/ApiKeySummary' } } },
        },
        Error: {
          type: 'object',
          required: ['code', 'params'],
          properties: {
            code: { type: 'string' },
            params: { type: 'object', additionalProperties: true },
          },
        },
        ObjectSummary: schemaOf(objectSummarySchema, 'output'),
        ObjectListResponse: schemaOf(objectListResponseSchema, 'output'),
        ObjectUpsertRequest: schemaOf(externalObjectUpsertSchema, 'input'),
        ObjectBulkRequest: schemaOf(externalObjectBulkSchema, 'input'),
        ObjectUpdateRequest: schemaOf(updateObjectRequestSchema, 'input'),
        TicketListItem: schemaOf(ticketListItemSchema, 'output'),
        TicketListResponse: {
          type: 'object',
          required: ['tickets'],
          properties: {
            tickets: { type: 'array', items: { $ref: '#/components/schemas/TicketListItem' } },
          },
        },
        TicketCreateRequest: schemaOf(externalTicketCreateSchema, 'input'),
        WorkOrderRequest: schemaOf(workOrderSchema, 'input'),
      },
    },
    paths: {
      '/api-keys': {
        get: {
          tags: ['API keys'],
          summary: 'List API keys',
          security: bearer,
          responses: {
            200: response('Key list without token or hash.', '#/components/schemas/ApiKeyListResponse'),
            401: response('Invalid key.', '#/components/schemas/Error'),
            403: response('Missing permission.', '#/components/schemas/Error'),
          },
        },
        post: {
          tags: ['API keys'],
          summary: 'Create an API key',
          description: 'The plaintext token is answered only here.',
          security: bearer,
          requestBody: jsonBody('#/components/schemas/CreateApiKeyRequest'),
          responses: {
            201: response('Created key and its one-time token.', '#/components/schemas/CreateApiKeyResponse'),
            400: response('Invalid request.', '#/components/schemas/Error'),
            401: response('Invalid key.', '#/components/schemas/Error'),
            403: response('Missing permission.', '#/components/schemas/Error'),
          },
        },
      },
      '/api-keys/{id}': {
        patch: {
          tags: ['API keys'],
          summary: 'Update name, scopes or expiry',
          security: bearer,
          parameters: [parameter('id', 'path', { type: 'string', format: 'uuid' })],
          requestBody: jsonBody('#/components/schemas/UpdateApiKeyRequest'),
          responses: {
            200: response('Updated key.', '#/components/schemas/ApiKeySummary'),
            404: response('Unknown key.', '#/components/schemas/Error'),
          },
        },
        delete: {
          tags: ['API keys'],
          summary: 'Revoke a key',
          security: bearer,
          parameters: [parameter('id', 'path', { type: 'string', format: 'uuid' })],
          responses: {
            204: { description: 'Revoked.' },
            404: response('Unknown key.', '#/components/schemas/Error'),
          },
        },
      },
      '/objects': {
        get: {
          tags: ['Objects'],
          summary: 'List objects, optionally changed since a timestamp',
          security: bearer,
          'x-required-scope': 'objects:read',
          parameters: [
            parameter('updated_since', 'query', { type: 'string', format: 'date-time' }),
            parameter('active', 'query', { type: 'string', enum: ['true', 'false', 'all'] }),
            parameter('limit', 'query', { type: 'integer', minimum: 1, maximum: 1000, default: 500 }),
          ],
          responses: {
            200: response('Objects ordered by updatedAt.', '#/components/schemas/ObjectListResponse'),
            400: response('Invalid query.', '#/components/schemas/Error'),
            401: response('Invalid key.', '#/components/schemas/Error'),
            403: response('Missing scope.', '#/components/schemas/Error'),
          },
        },
      },
      '/objects/{objectNo}': {
        get: {
          tags: ['Objects'],
          summary: 'Read one object',
          security: bearer,
          'x-required-scope': 'objects:read',
          parameters: [parameter('objectNo', 'path', { type: 'string' })],
          responses: {
            200: response('Object summary.', '#/components/schemas/ObjectSummary'),
            404: response('Unknown object.', '#/components/schemas/Error'),
          },
        },
        put: {
          tags: ['Objects'],
          summary: 'Upsert an object by object number',
          security: bearer,
          'x-required-scope': 'objects:write',
          parameters: [parameter('objectNo', 'path', { type: 'string' })],
          requestBody: jsonBody('#/components/schemas/ObjectUpsertRequest'),
          responses: {
            200: response('Updated object.', '#/components/schemas/ObjectSummary'),
            201: response('Created object.', '#/components/schemas/ObjectSummary'),
            422: response('Invalid fields.', '#/components/schemas/Error'),
          },
        },
        delete: {
          tags: ['Objects'],
          summary: 'Soft delete an object',
          security: bearer,
          'x-required-scope': 'objects:write',
          parameters: [parameter('objectNo', 'path', { type: 'string' })],
          responses: {
            204: { description: 'Deactivated.' },
            404: response('Unknown object.', '#/components/schemas/Error'),
          },
        },
      },
      '/objects/bulk': {
        post: {
          tags: ['Objects'],
          summary: 'Upsert up to 500 objects',
          security: bearer,
          'x-required-scope': 'objects:write',
          requestBody: jsonBody('#/components/schemas/ObjectBulkRequest'),
          responses: {
            200: { description: 'One result per item.' },
            422: response('Invalid fields.', '#/components/schemas/Error'),
          },
        },
      },
      '/tickets': {
        get: {
          tags: ['Tickets'],
          summary: 'List tickets, optionally changed since a timestamp',
          security: bearer,
          'x-required-scope': 'tickets:read',
          parameters: [
            parameter('updated_since', 'query', { type: 'string', format: 'date-time' }),
            parameter('status', 'query', { type: 'string' }),
            parameter('objectNo', 'query', { type: 'string' }),
            parameter('limit', 'query', { type: 'integer', minimum: 1, maximum: 1000, default: 500 }),
          ],
          responses: {
            200: response('Tickets ordered by updatedAt.', '#/components/schemas/TicketListResponse'),
            400: response('Invalid query.', '#/components/schemas/Error'),
            403: response('Missing scope.', '#/components/schemas/Error'),
          },
        },
        post: {
          tags: ['Tickets'],
          summary: 'Create a ticket from an external system',
          description: "The ticket is recorded with source = 'api'.",
          security: bearer,
          'x-required-scope': 'tickets:write',
          requestBody: jsonBody('#/components/schemas/TicketCreateRequest'),
          responses: {
            201: response('Created ticket.'),
            404: response('Unknown object number.', '#/components/schemas/Error'),
            422: response('Invalid fields.', '#/components/schemas/Error'),
          },
        },
      },
      '/tickets/{ticketNo}/work-order': {
        patch: {
          tags: ['Tickets'],
          summary: 'Set the work order of a ticket',
          security: bearer,
          'x-required-scope': 'tickets:write',
          parameters: [parameter('ticketNo', 'path', { type: 'string' })],
          requestBody: jsonBody('#/components/schemas/WorkOrderRequest'),
          responses: {
            200: { description: 'Work order recorded.' },
            404: response('Unknown ticket.', '#/components/schemas/Error'),
            409: response('Invalid transition.', '#/components/schemas/Error'),
          },
        },
      },
    },
  } as OpenAPIV3.Document
}

export const openApiPlugin = fp(
  async (app: FastifyInstance) => {
    await app.register(swagger, {
      mode: 'static',
      specification: { document: buildOpenApiDocument() },
    })
    await app.register(swaggerUi, {
      routePrefix: '/api/docs',
      staticCSP: true,
    })
  },
  { name: 'stoerdesk-openapi' },
)
