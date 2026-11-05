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
    back: 'Zurück zur Liste',
    actions: 'Aktionen',
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
    event: {
      created: 'Meldung eingegangen',
      review_started: 'In Prüfung gesetzt',
      work_order_set: 'Auftrag angelegt',
      assigned: 'Zugewiesen',
      accepted: 'Auftrag angenommen',
      acknowledged: 'Störung bearbeitet',
      closed: 'Vorgang abgeschlossen',
    },
    actorKind: {
      user: 'Nutzer',
      system: 'System',
      public: 'Öffentlich',
    },
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
    back: 'Back to list',
    actions: 'Actions',
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
    event: {
      created: 'Report received',
      review_started: 'Set in review',
      work_order_set: 'Work order created',
      assigned: 'Assigned',
      accepted: 'Work order accepted',
      acknowledged: 'Malfunction handled',
      closed: 'Ticket closed',
    },
    actorKind: {
      user: 'User',
      system: 'System',
      public: 'Public',
    },
  },
} as const

test.use({ viewport: { width: 1280, height: 800 } })

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
 * The workflow buttons live behind the "Actions" toggle of the detail page
 * (`WP-M2-19d`); after a successful action the panel closes again, so every
 * step opens it first.
 */
async function performAction(
  page: Page,
  texts: Pick<(typeof ui)['de'], 'actions'> | Pick<(typeof ui)['en'], 'actions'>,
  buttonName: string,
): Promise<void> {
  await page.getByRole('button', { name: texts.actions }).click()
  await page.getByRole('button', { name: buttonName }).click()
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

    // Expect NEW status and the created event in the history.
    await expect(page.getByRole('heading', { level: 1 })).toContainText(ticketNo)
    await expect(statusBadge(page)).toHaveText(statusText(language, 'NEW'))
    await expect(history(page).getByText(texts.event.created)).toBeVisible()

    // 1. Review: NEW → IN_REVIEW (UI button, no body).
    await performAction(page, texts, texts.action.review)
    await expect(statusBadge(page)).toHaveText(statusText(language, 'IN_REVIEW'))
    await expect(history(page).getByText(texts.event.review_started)).toBeVisible()

    // 2. Work order: IN_REVIEW → WORK_ORDER_CREATED (API, needs { type, number }).
    await setWorkOrder(page, ticketNo)
    await page.reload()
    await expect(statusBadge(page)).toHaveText(statusText(language, 'WORK_ORDER_CREATED'))
    await expect(history(page).getByText(texts.event.work_order_set)).toBeVisible()

    // 3. Assign: WORK_ORDER_CREATED → ASSIGNED (UI button, no body).
    await performAction(page, texts, texts.action.assign)
    await expect(statusBadge(page)).toHaveText(statusText(language, 'ASSIGNED'))
    await expect(history(page).getByText(texts.event.assigned)).toBeVisible()

    // 4. Accept: ASSIGNED → ACCEPTED (UI button, no body).
    await performAction(page, texts, texts.action.accept)
    await expect(statusBadge(page)).toHaveText(statusText(language, 'ACCEPTED'))
    await expect(history(page).getByText(texts.event.accepted)).toBeVisible()

    // 5. Acknowledge: ACCEPTED → ACKNOWLEDGED (API, needs { result }).
    await acknowledgeTicket(page, ticketNo)
    await page.reload()
    await expect(statusBadge(page)).toHaveText(statusText(language, 'ACKNOWLEDGED'))
    await expect(history(page).getByText(texts.event.acknowledged)).toBeVisible()

    // 6. Close: ACKNOWLEDGED → CLOSED (UI button, no body).
    await performAction(page, texts, texts.action.close)
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
    // Every internal transition writes its event with actor kind `user`, so the
    // localized actor label must appear in the history rows instead of the raw key.
    await expect(history(page).locator('.text-xs.text-slate-400')).toContainText(
      texts.actorKind.user,
    )
  })
}
