import { expect, test } from '@playwright/test'
import type { ObjectSummary } from '@stoerdesk/shared'
import type { Page } from '@playwright/test'

/**
 * Phase 5 exit criterion E2E (`PLAN.md` §16 phase 5; `specs/09-offline.md` §9.6):
 * internal actions written offline are queued locally, replayed exactly once when
 * the connection returns, and conflicts stay visible until the user discards them.
 *
 * The database is prepared by `scripts/e2e-check.mjs`: a throwaway database,
 * migrated and seeded with the bootstrap administrator. The object and the ticket
 * are created through the running stack, so every status badge is rendered by the
 * real UI, never by a fixture.
 */

const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@e2e.invalid'
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'e2e-only-admin-password-1'

const ui = {
  de: {
    loginTitle: 'Anmeldung',
    loginSubmit: 'Anmelden',
    settings: 'Einstellungen',
    signedInAs: `Angemeldet als ${adminEmail}`,
    cancel: 'Stornieren',
    status: {
      ACCEPTED: 'Angenommen',
      ACKNOWLEDGED: 'Rückmeldung erfolgt',
      CANCELLED: 'Storniert',
    },
    // The internal detail page renders the localized event label.
    event: {
      acknowledged: 'Störung bearbeitet',
    },
    offlineQueued: 'Nicht versendet – wird automatisch nachgesendet (1 ausstehend).',
    offlineTitle: 'Nicht versendete Aktionen',
    confirm: 'Bestätigen',
  },
  en: {
    loginTitle: 'Sign in',
    loginSubmit: 'Sign in',
    settings: 'Settings',
    signedInAs: `Signed in as ${adminEmail}`,
    cancel: 'Cancel',
    status: {
      ACCEPTED: 'Accepted',
      ACKNOWLEDGED: 'Acknowledged',
      CANCELLED: 'Cancelled',
    },
    // The internal detail page renders the localized event label.
    event: {
      acknowledged: 'Malfunction handled',
    },
    offlineQueued: 'Not sent – will be sent automatically when you are back online (1 pending).',
    offlineTitle: 'Unsent actions',
    confirm: 'Confirm',
  },
} as const

test.use({ viewport: { width: 1280, height: 800 } })

/**
 * The status badge and the history rows of the internal detail page. Both carry the
 * same words (`status.values.*` and `status.events.*`), so every expectation is
 * scoped to its own element instead of searching the whole page.
 */
function statusBadge(page: Page) {
  return page.getByTestId('ticket-status-badge')
}

function history(page: Page) {
  return page.getByTestId('ticket-history')
}

async function openInLanguage(page: Page, language: 'de' | 'en'): Promise<void> {
  await page.addInitScript(
    (lng: string) => window.localStorage.setItem('i18nextLng', lng),
    language,
  )
  await page.goto('/')
}

async function signIn(page: Page, language: 'de' | 'en'): Promise<void> {
  const texts = ui[language]

  await expect(page.getByRole('heading', { level: 2, name: texts.loginTitle })).toBeVisible()

  await page.locator('input[name="email"]').fill(adminEmail)
  await page.locator('input[name="password"]').fill(adminPassword)
  await page.getByRole('button', { name: texts.loginSubmit }).click()

  await page.getByRole('link', { name: texts.settings }).click()
  await expect(page.getByText(texts.signedInAs)).toBeVisible()
}

async function createObject(page: Page, objectNo: string, name: string): Promise<ObjectSummary> {
  const response = await page.context().request.post('/api/v1/objects', {
    data: { objectNo, name, systems: [{ type: 'BMA', label: 'E2E BMA' }] },
  })

  expect(response.status()).toBe(201)

  return (await response.json()) as ObjectSummary
}

async function createInternalTicket(page: Page, objectId: string): Promise<string> {
  const response = await page.context().request.post('/api/v1/tickets', {
    data: {
      objectId,
      title: 'E2E phase-5 ticket',
      description: 'Offline acknowledge test ticket',
      priority: 'normal',
    },
  })

  expect(response.status()).toBe(201)

  const body = await response.json()
  return body.ticketNo as string
}

async function transition(page: Page, ticketNo: string, segment: string): Promise<void> {
  const response = await page.context().request.post(
    `/api/v1/tickets/${ticketNo}/${segment}`,
  )

  expect(response.status()).toBe(200)
}

async function setWorkOrder(page: Page, ticketNo: string): Promise<void> {
  const response = await page.context().request.post(
    `/api/v1/tickets/${ticketNo}/work-order`,
    { data: { text: 'AA 4711' } },
  )

  expect(response.status()).toBe(200)
}

/** Wait until a replay of the acknowledge action reaches the server. */
function awaitAcknowledgeReplay(page: Page, ticketNo: string) {
  return page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/tickets/${ticketNo}/acknowledge`) &&
      response.request().method() === 'POST',
  )
}

/** Wait until the ticket detail is freshly served after a reload. */
function awaitDetail(page: Page, ticketNo: string) {
  return page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/tickets/${ticketNo}`) &&
      response.request().method() === 'GET',
  )
}

async function driveToAccepted(page: Page, ticketNo: string): Promise<void> {
  await transition(page, ticketNo, 'review')
  await setWorkOrder(page, ticketNo)
  await assignToSelf(page, ticketNo)
  await transition(page, ticketNo, 'accept')
}

/**
 * The assignment names its target (§7.14, ADR-0033): the signed-in admin is an
 * active technician, so the admin is the target of the assignment.
 */
async function assignToSelf(page: Page, ticketNo: string): Promise<void> {
  const me = await page.context().request.get('/api/v1/me')
  expect(me.status()).toBe(200)
  const body = (await me.json()) as { user: { id: string } }

  const response = await page.context().request.post(`/api/v1/tickets/${ticketNo}/assign`, {
    data: { target: { kind: 'user', id: body.user.id } },
  })

  expect(response.status()).toBe(200)
}

for (const language of ['de', 'en'] as const) {
  const texts = ui[language]

  test(`offline acknowledge replays into exactly one event (${language.toUpperCase()})`, async ({
    page,
  }) => {
    const objectNo = `E2E_M5_08_ACK_${language.toUpperCase()}`
    const objectName = `E2E M5 08 ACK ${language.toUpperCase()} object`

    await openInLanguage(page, language)
    await signIn(page, language)

    const object = await createObject(page, objectNo, objectName)
    const ticketNo = await createInternalTicket(page, object.id)

    // Drive to ACCEPTED through the API (WP-M4-01 pattern).
    await driveToAccepted(page, ticketNo)

    // Open the detail once online so the service worker caches it (WP-M5-07).
    await page.goto(`/tickets/${ticketNo}`)
    await expect(statusBadge(page)).toHaveText(texts.status.ACCEPTED)

    // The stage button of the escalation section (WP-M14-153) opens the
    // confirmation panel of the acknowledge; go offline and confirm it: the
    // acknowledge cannot reach the server and is queued instead.
    await page.getByTestId('ticket-stage-acknowledged').click()
    await page.context().setOffline(true)
    await page.locator('select[name="acknowledgeResult"]').selectOption('fixed')
    await page.getByRole('button', { name: texts.confirm }).click()

    // The queued notice proves the write was persisted locally instead of being sent.
    await expect(page.getByText(texts.offlineQueued)).toBeVisible()

    // While offline nothing reached the server: the ticket is still ACCEPTED.
    const serverWhileOffline = await page.context().request.get(
      `/api/v1/tickets/${ticketNo}`,
    )
    expect(
      (await serverWhileOffline.json()) as { ticket: { status: string } },
    ).toMatchObject({ ticket: { status: 'ACCEPTED' } })

    // Back online: the `online` listener replays the queued action. Wait for the
    // replay's answer so the conflict/outcome row is deterministic before reload.
    const replay = awaitAcknowledgeReplay(page, ticketNo)
    await page.context().setOffline(false)
    await replay

    const detail = awaitDetail(page, ticketNo)
    await page.reload()
    await detail

    await expect(statusBadge(page)).toHaveText(texts.status.ACKNOWLEDGED)
    await expect(history(page).getByText(texts.event.acknowledged)).toBeVisible()

    // Idempotency: exactly one acknowledged event even if the replay retried.
    await expect(history(page).getByText(texts.event.acknowledged)).toHaveCount(1)

    // The queue drained: no unsent-actions notice any more.
    await expect(page.getByText(texts.offlineTitle)).toBeHidden()
  })
}
