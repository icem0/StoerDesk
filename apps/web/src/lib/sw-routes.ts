import { apiBaseUrl } from './api'

/**
 * Route predicate of the offline report queue (`specs/09-offline.md` §9.4).
 *
 * The web app talks to the API through an API base (`/api` by default), so the
 * public report POST arrives as `/api/v1/public/tickets`. Matching the bare
 * `/v1/...` segment would leave the background-sync queue dead for every build
 * with a base URL.
 */
export function isPublicReportPath(pathname: string): boolean {
  return pathname.endsWith('/v1/public/tickets')
}

/**
 * Matches the GET reads of the ticket list and a ticket detail that internal
 * users may read offline (`specs/09-offline.md` §9.6).
 *
 * Matches `<api-base>/v1/tickets` (list) and
 * `<api-base>/v1/tickets/<ticketNo>` (detail with a single path segment). Action
 * paths such as `<api-base>/v1/tickets/<no>/accept`, `…/claim` and `…/comments`,
 * and the public report and status paths, do not match.
 */
export function isInternalTicketRead(pathname: string): boolean {
  const prefix = `${apiBaseUrl}/v1/tickets`
  if (pathname === prefix) return true
  const detail = new RegExp(`^${escapeRegExp(prefix)}/[^/]+$`)
  return detail.test(pathname)
}

/**
 * Matches a write to a ticket: `POST <api-base>/v1/tickets/<ticketNo>/<action>`
 * — the internal comment, acknowledge, decline and workflow routes. The public
 * comment route `<api-base>/v1/public/tickets/<ticketNo>/comments`, the ticket
 * reads and the ticket list do not match.
 */
export function isInternalTicketWrite(pathname: string): boolean {
  const prefix = `${apiBaseUrl}/v1/tickets`
  const write = new RegExp(`^${escapeRegExp(prefix)}/[^/]+/[^/]+$`)
  return write.test(pathname)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
