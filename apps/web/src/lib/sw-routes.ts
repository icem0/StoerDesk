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
