import { describe, expect, it } from 'vitest'

import {
  CUSTOMER_TOKEN_PURPOSES,
  customerObjectSchema,
  customerRegisterRequestSchema,
  customerSetPasswordRequestSchema,
  customerTicketDetailSchema,
  customerTicketSummarySchema,
  customerTokenSchema,
  objectAssignmentRequestSchema,
} from '../schemas/customer.js'
import { internalCreateTicketRequestSchema, publicReportRequestSchema } from '../schemas/ticket.js'

describe('the contracts of the customer portal', () => {
  it('accepts a token of 43 base64url characters and refuses a shorter one', () => {
    const token = 'a'.repeat(43)

    expect(customerTokenSchema.safeParse(token).success).toBe(true)
    expect(customerTokenSchema.safeParse('a'.repeat(42)).success).toBe(false)
    expect(customerTokenSchema.safeParse(`${'a'.repeat(42)}+`).success).toBe(false)
  })

  it('names the two purposes of a token', () => {
    expect(CUSTOMER_TOKEN_PURPOSES).toEqual(['registration', 'password_reset'])
  })

  it('normalizes the address of the registration and keeps the name', () => {
    const parsed = customerRegisterRequestSchema.parse({
      email: '  Kunde@Beispiel.ORG ',
      givenName: 'Erika',
      familyName: 'Mustermann',
    })

    expect(parsed.email).toBe('kunde@beispiel.org')
    expect(parsed.givenName).toBe('Erika')
    expect(parsed.familyName).toBe('Mustermann')
  })

  it('refuses an address that is no address', () => {
    expect(customerRegisterRequestSchema.safeParse({ email: 'not-an-address' }).success).toBe(false)
  })

  it('asks for a password of at least twelve characters', () => {
    expect(customerSetPasswordRequestSchema.safeParse({ password: 'a'.repeat(11) }).success).toBe(
      false,
    )
    expect(customerSetPasswordRequestSchema.safeParse({ password: 'a'.repeat(12) }).success).toBe(
      true,
    )
  })

  it('names the trained person of an object by his user id', () => {
    const userId = '11111111-1111-4111-8111-111111111111'

    expect(objectAssignmentRequestSchema.parse({ userId }).userId).toBe(userId)
    expect(objectAssignmentRequestSchema.safeParse({ userId: 'nope' }).success).toBe(false)
  })

  it('reads the three new fields of the public report', () => {
    const parsed = publicReportRequestSchema.parse({
      qrToken: 'a'.repeat(22),
      clientUuid: '11111111-1111-4111-8111-111111111111',
      text: 'Der Rauchmelder piept',
      contact: { name: undefined, phone: '000' },
      trainedPersonConfirmed: true,
      emailNotifications: true,
      register: { email: 'kunde@beispiel.org' },
    })

    expect(parsed.trainedPersonConfirmed).toBe(true)
    expect(parsed.emailNotifications).toBe(true)
    expect(parsed.register?.email).toBe('kunde@beispiel.org')
  })

  it('reads the customer of the internal creation', () => {
    const parsed = internalCreateTicketRequestSchema.parse({
      objectId: '11111111-1111-4111-8111-111111111111',
      customerUserId: '22222222-2222-4222-8222-222222222222',
    })

    expect(parsed.customerUserId).toBe('22222222-2222-4222-8222-222222222222')
  })

  it('answers the tickets of the portal without the data of the office', () => {
    const summary = customerTicketSummarySchema.parse({
      ticketNo: 'ST-0001',
      title: 'Der Rauchmelder piept',
      objectName: 'Melder EG',
      priority: 'normal',
      status: 'IN_REVIEW',
      reportedAt: '2026-11-25T08:00:00.000Z',
      updatedAt: '2026-11-25T09:00:00.000Z',
    })

    expect(summary.ticketNo).toBe('ST-0001')
    expect(Object.keys(summary)).not.toContain('assignedUserId')
    expect(Object.keys(summary)).not.toContain('reporterEmail')

    const detail = customerTicketDetailSchema.parse({
      ...summary,
      description: 'Piept seit dem Morgen',
      events: [{ kind: 'event', at: '2026-11-25T09:00:00.000Z', text: 'In Prüfung' }],
    })

    expect(detail.events).toHaveLength(1)
    expect(Object.keys(detail)).not.toContain('internalComment')
  })

  it('answers the objects of the customer without the contact of the operator', () => {
    const object = customerObjectSchema.parse({
      objectNo: 'A-1',
      name: 'Melder EG',
      street: 'Hauptstraße 1',
      city: 'Musterstadt',
    })

    expect(Object.keys(object)).not.toContain('contactName')
    expect(Object.keys(object)).not.toContain('contactEmail')
  })
})
