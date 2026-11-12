import { expect, test } from '@playwright/test'
import type { ObjectSummary } from '@stoerdesk/shared'
import type { Page } from '@playwright/test'

/**
 * Phase-4 exit-criterion E2E: complete ticket workflow with audit trail
 * (`PLAN.md` §16 phase 4; `PLAN.md` §7 rules 2–10; WP-M2-15 … WP-M2-19d).
 *
 * The database is prepared by `scripts/e2e-check.mjs`: a throwaway database,
 * migrated and seeded with the bootstrap administrator. The object and the
 * internal ticket are created through the running stack (`POST /api/v1/objects`,
 * `POST /api/v1/tickets` with the session cookie), so the ticket number is the one
 * the API really generated — no fixture token and no direct write into the
 * throwaway database.
 *
 * The test drives every workflow transition through the ticket detail UI where no
   request body is needed (review, assign, accept, close) and calls the API directly
   for the two transitions that require a payload (work order set: type + number;
   acknowledge: result). After each transition it asserts the status badge and the
   append-only `ticket_events` history, ending at `CLOSED` with the full event chain.
 *
 * The expectations are spelled out per locale, like `report-flow.spec.ts`: reading
 * them from the JSON files would only compare the bundle with itself.
 */

const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@e2e.invalid'
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'e2e-only-admin-password-1'

/**
 * The bootstrap seed leaves `given_name` empty and derives the family name from
 * the e-mail local part (`seed-base.ts`). The history renders exactly that name
 * (WP-M5-14/WP-M5-15), so the expectation follows an `E2E_ADMIN_EMAIL` override.
 */
function seededFamilyName(email: string): string {
  const [localPart] = email.split('@')
  const letters = (localPart ?? '').replaceAll(/[^\p{L}]/gu, '')
  const [first, ...rest] = letters

  if (first === undefined) {
    return ''
  }

  return `${first.toUpperCase()}${rest.join('').toLowerCase()}`
}

const adminActorName = seededFamilyName(adminEmail)

const ui = {
  de: {
    loginTitle: 'Anmeldung',
    loginSubmit: 'Anmelden',
    settings: 'Einstellungen',
    signedInAs: `Angemeldet als ${adminEmail}`,
    createTitle: 'Neue Störung melden',
    createSubmit: 'Meldung erstellen',
    objectLabel: 'Objekt',
    titleLabel: 'Titel',
    submit: 'Meldung erstellen',
    history: 'Verlauf',
    status: {
      NEW: 'Neu',
      IN_REVIEW: 'In Prüfung',
      WORK_ORDER_CREATED: 'Auftrag angelegt',
      ASSIGNED: 'Zugewiesen',
      ACCEPTED: 'Angenommen',
      ACKNOWLEDGED: 'Rückmeldung erfolgt',
      CLOSED: 'Abgeschlossen',
    },
    action: {
      review: 'In Prüfung setzen',
      assign: 'Zuweisen',
      accept: 'Annehmen',
      close: 'Schließen',
    },
    confirm: 'Bestätigen',
    event: {
      created: 'Meldung eingegangen',
      review_started: 'In Prüfung gesetzt',
      work_order_set: 'Auftrag angelegt',
      assigned: 'Zugewiesen',
      accepted: 'Auftrag angenommen',
      acknowledged: 'Störung bearbeitet',
      closed: 'Vorgang abgeschlossen',
    },
    actorName: adminActorName,
  },
  en: {
    loginTitle: 'Sign in',
    loginSubmit: 'Sign in',
    settings: 'Settings',
    signedInAs: `Signed in as ${adminEmail}`,
    createTitle: 'Report a malfunction',
    createSubmit: 'Create report',
    objectLabel: 'Object',
    titleLabel: 'Title',
    submit: 'Create report',
    history: 'History',
    status: {
      NEW: 'New',
      IN_REVIEW: 'In review',
      WORK_ORDER_CREATED: 'Work order created',
      ASSIGNED: 'Assigned',
      ACCEPTED: 'Accepted',
      ACKNOWLEDGED: 'Acknowledged',
      CLOSED: 'Closed',
    },
    action: {
      review: 'Set in review',
      assign: 'Assign',
      accept: 'Accept',
      close: 'Close',
    },
    confirm: 'Confirm',
    event: {
      created: 'Report received',
      review_started: 'Set in review',
      work_order_set: 'Work order created',
      assigned: 'Assigned',
      accepted: 'Work order accepted',
      acknowledged: 'Malfunction handled',
      closed: 'Ticket closed',
    },
    actorName: adminActorName,
  },
} as const

test.use({ viewport: { width: 1280, height: 800 } })

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
    data: {
      objectNo,
      name,
      systems: [{ type: 'BMA', label: 'E2E BMA' }],
    },
  })

  expect(response.status()).toBe(201)

  return (await response.json()) as ObjectSummary
}

async function createInternalTicket(page: Page, objectId: string): Promise<string> {
  const response = await page.context().request.post('/api/v1/tickets', {
    data: {
      objectId,
      title: 'E2E workflow ticket',
      description: 'Full workflow test ticket',
      priority: 'normal',
    },
  })

  expect(response.status()).toBe(201)

  const body = await response.json()
  return body.ticketNo as string
}

async function setWorkOrder(page: Page, ticketNo: string): Promise<void> {
  const response = await page.context().request.post(`/api/v1/tickets/${ticketNo}/work-order`, {
    data: { type: 'AA', number: '12345' },
  })

  expect(response.status()).toBe(200)
}

async function acknowledgeTicket(page: Page, ticketNo: string): Promise<void> {
  const response = await page.context().request.post(`/api/v1/tickets/${ticketNo}/acknowledge`, {
    data: { result: 'fixed' },
  })

  expect(response.status()).toBe(200)
}

function statusText(language: 'de' | 'en', status: string): string {
  return ui[language].status[status as keyof (typeof ui)['de']['status']] ?? status
}

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

/**
 * The milestones of the workflow are reached through the stage selection of the
 * detail page (`WP-M13-09`, `specs/07-escalation.md` §7.10): choosing the stage
 * of the next milestone shows its "Bestätigen"/"Abbrechen" pair inline below
 * the selection, and confirming performs the transition. The select carries the
 * event of the milestone as its option value.
 */
async function performStage(
  page: Page,
  event: string,
  confirmLabel: string,
): Promise<void> {
  await page.getByTestId('ticket-escalation-stage').selectOption(event)
  await page.getByRole('button', { name: confirmLabel }).click()
}

/**
 * The actions that are no milestone (close, reopen, decline, delete) stay
 * buttons in the action section (`WP-M13-09`); a click renders the same
 * "Bestätigen"/"Abbrechen" pair inline.
 */
async function performButton(
  page: Page,
  actionLabel: string,
  confirmLabel: string,
): Promise<void> {
  await page.getByRole('button', { name: actionLabel }).click()
  await page.getByRole('button', { name: confirmLabel }).click()
}

for (const language of ['de', 'en'] as const) {
  test(`full ticket workflow with audit trail (${language.toUpperCase()})`, async ({
    page,
  }) => {
    const texts = ui[language]
    const objectNo = `E2E_M4_01_${language.toUpperCase()}`
    const objectName = `E2E M4 01 ${language.toUpperCase()} object`

    await page.addInitScript(
      (lng: string) => window.localStorage.setItem('i18nextLng', lng),
      language,
    )
    await page.goto('/')
    await signIn(page, language)

    const object = await createObject(page, objectNo, objectName)
    const ticketNo = await createInternalTicket(page, object.id)

    // Navigate to the ticket detail page.
    await page.goto(`/tickets/${ticketNo}`)
    await page.waitForLoadState('networkidle')

    // Expect NEW status and the created event in the history.
    await expect(page.getByRole('heading', { level: 1 })).toContainText(ticketNo)
    await expect(statusBadge(page)).toHaveText(statusText(language, 'NEW'))
    await expect(history(page).getByText(texts.event.created)).toBeVisible()

    // 1. Review: NEW → IN_REVIEW (stage selection, no body).
    await performStage(page, 'review_started', texts.confirm)
    await expect(statusBadge(page)).toHaveText(statusText(language, 'IN_REVIEW'))
    await expect(history(page).getByText(texts.event.review_started)).toBeVisible()

    // 2. Work order: IN_REVIEW → WORK_ORDER_CREATED (API, needs { type, number }).
    await setWorkOrder(page, ticketNo)
    await page.reload()
    await expect(statusBadge(page)).toHaveText(statusText(language, 'WORK_ORDER_CREATED'))
    await expect(history(page).getByText(texts.event.work_order_set)).toBeVisible()

    // 3. Assign: WORK_ORDER_CREATED → ASSIGNED (stage selection, no body).
    await performStage(page, 'assigned', texts.confirm)
    await expect(statusBadge(page)).toHaveText(statusText(language, 'ASSIGNED'))
    await expect(history(page).getByText(texts.event.assigned)).toBeVisible()

    // 4. Accept: ASSIGNED → ACCEPTED (stage selection, no body).
    await performStage(page, 'accepted', texts.confirm)
    await expect(statusBadge(page)).toHaveText(statusText(language, 'ACCEPTED'))
    await expect(history(page).getByText(texts.event.accepted)).toBeVisible()

    // 5. Acknowledge: ACCEPTED → ACKNOWLEDGED (API, needs { result }).
    await acknowledgeTicket(page, ticketNo)
    await page.reload()
    await expect(statusBadge(page)).toHaveText(statusText(language, 'ACKNOWLEDGED'))
    await expect(history(page).getByText(texts.event.acknowledged)).toBeVisible()

    // 6. Close: ACKNOWLEDGED → CLOSED (UI button, no body).
    await performButton(page, texts.action.close, texts.confirm)
    await expect(statusBadge(page)).toHaveText(statusText(language, 'CLOSED'))
    await expect(history(page).getByText(texts.event.closed)).toBeVisible()

    // Full audit trail: all seven events in order.
    const rows = history(page).locator('.text-sm.font-medium.text-slate-200')
    await expect(rows).toContainText([
      texts.event.created,
      texts.event.review_started,
      texts.event.work_order_set,
      texts.event.assigned,
      texts.event.accepted,
      texts.event.acknowledged,
      texts.event.closed,
    ])
    // Every internal transition (create, review, work order, assign, accept,
    // acknowledge, close) is written by the same signed-in administrator, so all
    // seven actor cells carry that user's full name. The seven cells share the
    // same classes, so a single text would resolve to seven elements (strict
    // mode violation): the expectation is an array, one text per element.
    const actorRows = history(page).locator('.text-xs.text-slate-400')
    await expect(actorRows).toHaveCount(7)
    await expect(actorRows).toContainText([
      texts.actorName,
      texts.actorName,
      texts.actorName,
      texts.actorName,
      texts.actorName,
      texts.actorName,
      texts.actorName,
    ])
    // The localized label replaced the raw key (`actorKind.<kind>`): none of it
    // survives in the rendered history.
    await expect(history(page)).not.toContainText('actorKind.')
  })
}
