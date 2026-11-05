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
    acknowledge: 'Quittieren',
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
    offlineConflict: 'Konflikt: invalid_transition – aktueller Status CANCELLED',
    offlineAction: {
      discard: 'Verwerfen',
    },
    confirm: 'Bestätigen',
  },
  en: {
    loginTitle: 'Sign in',
    loginSubmit: 'Sign in',
    settings: 'Settings',
    signedInAs: `Signed in as ${adminEmail}`,
    acknowledge: 'Acknowledge',
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
    offlineConflict: 'Conflict: invalid_transition – current status CANCELLED',
    offlineAction: {
      discard: 'Discard',
    },
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

  await page.getByRole('button', { name: texts.settings }).click()
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
    { data: { type: 'AA', number: '12345' } },
  )

  expect(response.status()).toBe(200)
}

async function cancelTicket(page: Page, ticketNo: string): Promise<void> {
  const response = await page.context().request.post(`/api/v1/tickets/${ticketNo}/cancel`, {
    data: { reason: 'E2E conflict test: cancelled while the acknowledge is queued offline' },
  })

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
  await transition(page, ticketNo, 'assign')
  await transition(page, ticketNo, 'accept')
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

    // Choose the acknowledge entry of the dropdown menu (WP-M4-07), go offline and
    // confirm it: the acknowledge cannot reach the server and is queued instead.
    const actions = page.locator('select[name="ticketAction"]')
    await expect(actions).toContainText(texts.acknowledge)

    await actions.selectOption('acknowledged')
    await page.context().setOffline(true)
    await page.locator('input[name="acknowledgeResult"]').fill('fixed')
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

  test(`conflicting offline write stays visible until discarded (${language.toUpperCase()})`, async ({
    page,
  }) => {
    const objectNo = `E2E_M5_08_CON_${language.toUpperCase()}`
    const objectName = `E2E M5 08 CON ${language.toUpperCase()} object`

    await openInLanguage(page, language)
    await signIn(page, language)

    const object = await createObject(page, objectNo, objectName)
    const ticketNo = await createInternalTicket(page, object.id)

    await driveToAccepted(page, ticketNo)
    await page.goto(`/tickets/${ticketNo}`)
    await expect(statusBadge(page)).toHaveText(texts.status.ACCEPTED)

    // Queue an acknowledge while offline: choose the dropdown entry first, so the
    // input fields of its confirmation panel exist, then confirm offline.
    const actions = page.locator('select[name="ticketAction"]')
    await expect(actions).toContainText(texts.acknowledge)

    await actions.selectOption('acknowledged')
    await page.context().setOffline(true)
    await page.locator('input[name="acknowledgeResult"]').fill('fixed')
    await page.getByRole('button', { name: texts.confirm }).click()

    // Cancel through the API while the page is offline: API requests leave the
    // browser context directly, so the cancel reaches the server.
    await cancelTicket(page, ticketNo)

    // Back online: the replay meets a CANCELLED ticket and answers 409.
    const replay = awaitAcknowledgeReplay(page, ticketNo)
    await page.context().setOffline(false)
    await replay

    const detail = awaitDetail(page, ticketNo)
    await page.reload()
    await detail

    // The badge precedes the conflict banner in the DOM, so the first match is
    // the status badge (the banner text itself contains the raw status too).
    await expect(statusBadge(page)).toHaveText(texts.status.CANCELLED)
    await expect(page.getByText(texts.offlineTitle)).toBeVisible()
    await expect(page.getByText(texts.offlineConflict)).toBeVisible()

    // Discard removes the conflict row; the ticket stays cancelled.
    await page.getByRole('button', { name: texts.offlineAction.discard }).click()
    await expect(page.getByText(texts.offlineTitle)).toBeHidden()
    await expect(statusBadge(page)).toHaveText(texts.status.CANCELLED)
  })
}
