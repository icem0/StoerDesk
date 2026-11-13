import type { Database } from '../client'
import { ticketStatuses } from '../schema'

/**
 * Bootstrap of the configurable ticket statuses (WP-M14-35).
 *
 * The nine statuses of the current workflow are inserted the first time the API
 * starts. An existing row is never overwritten: the seed only fills what is
 * missing, so an administrator keeps the statuses of the installation.
 *
 * `is_terminal` marks a status after which a ticket leaves the workflow
 * (`CLOSED`, `CANCELLED`). The colors are Tailwind color classes used by the
 * status badge in the UI.
 */

export type TicketStatusSeedResult = {
  status: 'created' | 'existing'
  statuses: number
}

type Db = Database['database']

const DEFAULT_STATUSES: readonly {
  key: string
  names: Record<string, string>
  color: string
  position: number
  active: boolean
  isTerminal: boolean
}[] = [
  {
    key: 'NEW',
    names: { de: 'Neu', en: 'New' },
    color: '#6b7280',
    position: 1,
    active: true,
    isTerminal: false,
  },
  {
    key: 'IN_REVIEW',
    names: { de: 'In Prüfung', en: 'In Review' },
    color: '#d97706',
    position: 2,
    active: true,
    isTerminal: false,
  },
  {
    key: 'WORK_ORDER_CREATED',
    names: { de: 'Auftrag angelegt', en: 'Work order created' },
    color: '#2563eb',
    position: 3,
    active: true,
    isTerminal: false,
  },
  {
    key: 'OFFERED',
    names: { de: 'Angeboten', en: 'Offered' },
    color: '#7c3aed',
    position: 4,
    active: true,
    isTerminal: false,
  },
  {
    key: 'ASSIGNED',
    names: { de: 'Zugewiesen', en: 'Assigned' },
    color: '#4338ca',
    position: 5,
    active: true,
    isTerminal: false,
  },
  {
    key: 'ACCEPTED',
    names: { de: 'Angenommen', en: 'Accepted' },
    color: '#16a34a',
    position: 6,
    active: true,
    isTerminal: false,
  },
  {
    key: 'ACKNOWLEDGED',
    names: { de: 'Quittiert', en: 'Acknowledged' },
    color: '#0d9488',
    position: 7,
    active: true,
    isTerminal: false,
  },
  {
    key: 'CLOSED',
    names: { de: 'Geschlossen', en: 'Closed' },
    color: '#9ca3af',
    position: 8,
    active: true,
    isTerminal: true,
  },
  {
    key: 'CANCELLED',
    names: { de: 'Storniert', en: 'Cancelled' },
    color: '#f43f5e',
    position: 9,
    active: true,
    isTerminal: true,
  },
]

export async function seedTicketStatuses(database: Db): Promise<TicketStatusSeedResult> {
  return database.transaction(async (tx) => {
    const txDb = tx as unknown as Db
    let statuses = 0

    for (const [position, status] of DEFAULT_STATUSES.entries()) {
      const inserted = await txDb
        .insert(ticketStatuses)
        .values({
          key: status.key,
          names: status.names,
          color: status.color,
          position: status.position ?? position + 1,
          active: status.active,
          isTerminal: status.isTerminal,
        })
        .onConflictDoNothing({ target: ticketStatuses.key })
        .returning({ key: ticketStatuses.key })

      statuses += inserted.length
    }

    return {
      status: statuses === 0 ? 'existing' : 'created',
      statuses,
    }
  })
}

const invokedDirectly =
  process.argv[1]?.endsWith('seed-statuses.ts') === true ||
  process.argv[1]?.endsWith('seed-statuses.js') === true

if (invokedDirectly) {
  const { createDatabase } = await import('../client')
  const { client, database } = createDatabase()

  try {
    const result = await seedTicketStatuses(database)
    process.stdout.write(`${JSON.stringify({ seed: 'statuses', status: result.status })}\n`)
  } finally {
    await client.end()
  }
}
