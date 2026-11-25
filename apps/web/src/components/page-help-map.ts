/**
 * The map of the pages and their explanation (`specs/13-ui.md` §14.13,
 * ADR-0060).
 *
 * Every guarded page carries **one** ⓘ in the shell: the panel names what the
 * page is for and what the user does there. The map below binds the route to
 * the key of its explanation; the longest route wins, so `/admin/users/new`
 * inherits the explanation of `/admin/users`.
 *
 * A page that explains itself carries **no** ⓘ — its own prose is the
 * explanation: the setup guide of the web push and the overview of the own
 * channels name their subject on the page itself.
 */

export interface PageHelpEntry {
  /** The route — the longest match wins. */
  path: string
  /** The key of the explanation in the namespace `help`. */
  key: string
}

export const pageHelpEntries: PageHelpEntry[] = [
  { path: '/tickets/create', key: 'page.ticketsCreate' },
  { path: '/tickets', key: 'page.tickets' },
  { path: '/stats', key: 'page.stats' },
  { path: '/oncall', key: 'page.oncall' },
  { path: '/notifications', key: 'page.notifications' },
  { path: '/settings/me', key: 'page.settingsMe' },
  { path: '/settings', key: 'page.settings' },
  { path: '/objects/stickers', key: 'page.stickers' },
  { path: '/objects/create', key: 'page.objectCreate' },
  { path: '/objects/import', key: 'page.objectImport' },
  { path: '/objects', key: 'page.objects' },
  { path: '/admin/users', key: 'page.adminUsers' },
  { path: '/admin/roles', key: 'page.adminRoles' },
  { path: '/admin/groups', key: 'page.adminGroups' },
  { path: '/admin/api-keys', key: 'page.adminApiKeys' },
  { path: '/admin/email', key: 'page.adminEmail' },
  { path: '/admin/channels', key: 'page.adminChannels' },
  { path: '/admin/delivery', key: 'page.adminDelivery' },
  { path: '/admin/statuses', key: 'page.adminStatuses' },
  { path: '/admin/webhooks', key: 'page.adminWebhooks' },
  { path: '/admin/bma-sync', key: 'page.adminBmaSync' },
  { path: '/admin/deadlines', key: 'page.adminDeadlines' },
  { path: '/admin/escalation', key: 'page.adminEscalation' },
  { path: '/admin/defaults', key: 'page.adminDefaults' },
  { path: '/admin/detected-errors', key: 'page.adminDetectedErrors' },
  { path: '/admin/oncall', key: 'page.adminOncall' },
  { path: '/admin/text-templates', key: 'page.adminTextTemplates' },
  { path: '/admin/branding', key: 'page.adminBranding' },
  { path: '/admin/sticker-template', key: 'page.adminStickerTemplate' },
  { path: '/admin/dashboard', key: 'page.adminDashboard' },
  { path: '/admin/update', key: 'page.adminUpdate' },
]

/** The pages that explain themselves — they carry no ⓘ (ADR-0060). */
export const selfExplainedPaths = ['/help/web-push', '/settings/notifications']

function matches(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`)
}

/** The explanation of the page with that address — `null` when the page explains itself. */
export function pageHelpKey(pathname: string): string | null {
  if (selfExplainedPaths.some((path) => matches(pathname, path))) {
    return null
  }

  const entry = pageHelpEntries
    .filter((candidate) => matches(pathname, candidate.path))
    .sort((left, right) => right.path.length - left.path.length)[0]

  return entry?.key ?? null
}
