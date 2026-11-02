import { expect, test } from '@playwright/test'
import type { ObjectSummary } from '@stoerdesk/shared'
import type { Page } from '@playwright/test'

/**
 * Phase 2 exit-criterion smoke E2E (`PLAN.md` §16, WP-M2-10).
 *
 * The database is prepared by `scripts/e2e-check.mjs`: a throwaway database, migrated
 * and seeded with the bootstrap administrator. The object under test is created through
 * the running stack (`POST /api/v1/objects` with the session cookie), so the QR token is
 * the one the API really generated — no fixture token and no direct database write.
 *
 * The test proves the full public flow: QR report form → confirmation → status page,
 * in both `de` and `en`.
 */

// Throwaway values of a database that is dropped after the run — never a real account.
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@e2e.invalid'
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'e2e-only-admin-password-1'

const ui = {
  de: {
    loginTitle: 'Anmeldung',
    loginSubmit: 'Anmelden',
    settings: 'Einstellungen',
    signedInAs: `Angemeldet als ${adminEmail}`,
    reportTitle: 'Störung melden',
    faultChip: 'Rauchmelder defekt oder verschmutzt',
    textLabel: 'Was ist zu sehen?',
    phoneLabel: 'Telefon',
    emergencyNotice: 'Bei Brand oder Gefahr: Notruf 112. Dieses Formular ersetzt keinen Notruf.',
    submit: 'Störung melden',
    doneTitle: 'Meldung eingegangen',
    ticketNoPrefix: 'Vorgangsnummer:',
    statusLink: 'Status dieser Meldung ansehen',
    statusTitle: 'Status der Meldung',
    statusNew: 'Neu',
    reportedAtLabel: 'Gemeldet am:',
    deadlineLabel: 'Rückmeldung bis:',
    timeline: 'Verlauf',
    eventCreated: 'Meldung eingegangen',
  },
  en: {
    loginTitle: 'Sign in',
    loginSubmit: 'Sign in',
    settings: 'Settings',
    signedInAs: `Signed in as ${adminEmail}`,
    reportTitle: 'Report a malfunction',
    faultChip: 'Smoke detector defective or soiled',
    textLabel: 'What can be seen?',
    phoneLabel: 'Phone',
    emergencyNotice: 'For fire or danger: emergency call 112. This form is never an emergency call.',
    submit: 'Report malfunction',
    doneTitle: 'Report received',
    ticketNoPrefix: 'Reference number:',
    statusLink: 'View the status of this report',
    statusTitle: 'Report status',
    statusNew: 'New',
    reportedAtLabel: 'Reported on:',
    deadlineLabel: 'Feedback by:',
    timeline: 'History',
    eventCreated: 'Report received',
  },
} as const

/** Mobile-first per `PLAN.md` §14: the public form is driven on a phone viewport. */
test.use({ viewport: { width: 375, height: 667 } })

/**
 * The stored language preference is read by `apps/web/src/i18n/index.ts` before i18next
 * initialises, so it has to be in `localStorage` before the first script of the app runs.
 */
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

/** Creates the object through the running stack; the response carries the real QR token. */
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

for (const language of ['de', 'en'] as const) {
  test(`QR report creates a ticket and shows the status page (${language.toUpperCase()})`, async ({
    page,
  }) => {
    const texts = ui[language]
    // The two tests share one throwaway database, so each locale gets its own object.
    const objectNo = `E2E_M2_10_${language.toUpperCase()}`
    const objectName = `E2E M2 10 ${language.toUpperCase()} object`

    await openInLanguage(page, language)
    await signIn(page, language)

    const object = await createObject(page, objectNo, objectName)
    const token = object.qrToken

    if (token === null) {
      throw new Error('the created object carries no QR token')
    }

    // Public report form: object header, system, the 112 notice.
    await page.goto(`/m/${token}`)
    await expect(page.getByRole('heading', { level: 1, name: objectName })).toBeVisible()
    await expect(page.getByText(objectNo)).toBeVisible()
    await expect(page.getByText(texts.emergencyNotice)).toBeVisible()

    // Fault chip, free text and the required phone contact (§7.2).
    await page.getByRole('button', { name: texts.faultChip }).click()
    await page.locator('textarea[name="text"]').fill('E2E phase 2 smoke test report')
    await page.locator('input[name="contactPhone"]').fill('0000000')

    await page.getByRole('button', { name: texts.submit }).click()

    // Confirmation with the generated ticket number and the status link.
    await expect(page.getByRole('heading', { level: 1, name: texts.doneTitle })).toBeVisible()
    await expect(page.getByTestId('report-ticket-no')).toContainText(texts.ticketNoPrefix)
    await expect(page.getByTestId('report-ticket-no')).toContainText(/ST-\d{4}-\d{4,}/)

    const statusLink = page.getByTestId('report-status-link')
    await expect(statusLink).toHaveAttribute('href', /^\/s\/[A-Za-z0-9_-]{22}$/)
    const statusHref = await statusLink.getAttribute('href')
    if (statusHref === null) {
      throw new Error('the confirmation page carries no status link')
    }

    // Follow the status link — the reporter has no session, so `/s/:token` is public.
    await page.goto(statusHref)

    await expect(page.getByRole('heading', { level: 2, name: texts.statusTitle })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toContainText(texts.ticketNoPrefix)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/ST-\d{4}-\d{4,}/)
    await expect(page.getByTestId('status-badge')).toHaveText(texts.statusNew)
    await expect(page.getByText(texts.reportedAtLabel)).toBeVisible()
    await expect(page.getByText(texts.deadlineLabel)).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: texts.timeline })).toBeVisible()
    await expect(page.getByText(texts.eventCreated)).toBeVisible()
  })
}
