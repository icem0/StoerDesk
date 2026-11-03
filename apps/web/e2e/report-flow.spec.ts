import { expect, test } from '@playwright/test'
import type { ObjectSummary } from '@stoerdesk/shared'
import type { Page } from '@playwright/test'

/**
 * Phase-2 exit-criterion E2E: public QR report creates a ticket and shows the
 * status page (`PLAN.md` §16 phase 2; `specs/06-report-form.md` §7.3.4;
 * WP-M2-10).
 *
 * The database is prepared by `scripts/e2e-check.mjs`: a throwaway database,
 * migrated and seeded with the bootstrap administrator. The object under test is
 * created through the running stack (`POST /api/v1/objects` with the session
 * cookie), so the QR token is the one the API really generated — no fixture
 * token and no direct write into the throwaway database.
 *
 * The expectations are spelled out per locale, like `report-form.spec.ts` and
 * `auth.spec.ts`: reading them from the JSON files would only compare the bundle
 * with itself, while this proves that `de` really renders German and `en`
 * really renders English on the public form and on the status page.
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
    faultChip: 'Leitungsunterbrechung',
    textLabel: 'Was ist zu sehen?',
    phoneLabel: 'Telefon',
    emergencyNotice: 'Bei Brand oder Gefahr: Notruf 112. Dieses Formular ersetzt keinen Notruf.',
    submit: 'Störung melden',
    doneTitle: 'Meldung eingegangen',
    ticketNoPrefix: 'Vorgangsnummer:',
    statusLink: 'Status dieser Meldung ansehen',
    status: {
      title: 'Status der Meldung',
      ticketNoLabel: 'Vorgangsnummer',
      deadlineLabel: 'Rückmeldung bis:',
      new: 'Neu',
    },
  },
  en: {
    loginTitle: 'Sign in',
    loginSubmit: 'Sign in',
    settings: 'Settings',
    signedInAs: `Signed in as ${adminEmail}`,
    reportTitle: 'Report a malfunction',
    faultChip: 'Line interruption',
    textLabel: 'What can be seen?',
    phoneLabel: 'Phone',
    emergencyNotice: 'For fire or danger: emergency call 112. This form is never an emergency call.',
    submit: 'Report malfunction',
    doneTitle: 'Report received',
    ticketNoPrefix: 'Reference number:',
    statusLink: 'View the status of this report',
    status: {
      title: 'Report status',
      ticketNoLabel: 'Reference number',
      deadlineLabel: 'Feedback by:',
      new: 'New',
    },
  },
} as const

/** Mobile-first per `PLAN.md` §14: the public form is driven on a phone viewport. */
test.use({ viewport: { width: 375, height: 667 } })

/**
 * The stored language preference is read by `apps/web/src/i18n/index.ts` before
 * i18next initialises, so it has to be in `localStorage` before the first script
 * of the app runs.
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

  // WP-M1-17: the signed-in account lives in the settings menu next to the version.
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
  test(`public QR report leads to the status page (${language.toUpperCase()})`, async ({
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

    const system = object.systems[0]

    if (system === undefined) {
      throw new Error('the created object carries no system')
    }

    await page.goto(`/m/${token}`)

    // §7.1/§7.2: object header, the single prefilled system and the 112 notice.
    await expect(page.getByRole('heading', { level: 1, name: objectName })).toBeVisible()
    await expect(page.getByText(objectNo)).toBeVisible()
    await expect(page.getByText(texts.emergencyNotice ?? '')).toBeVisible()
    await expect(page.locator('select[name="system"]')).toHaveValue(system.id)

    // Fault chip, free text and the required phone contact (§7.2).
    await page.getByRole('button', { name: texts.faultChip }).click()
    await page.locator('textarea[name="text"]').fill('E2E smoke test report')
    await page.locator('input[name="contactPhone"]').fill('0000000')

    await page.getByRole('button', { name: texts.submit }).click()

    // §7.3.2: confirmation with the generated ticket number and the status link.
    await expect(page.getByRole('heading', { level: 1, name: texts.doneTitle })).toBeVisible()
    await expect(page.getByTestId('report-ticket-no')).toContainText(texts.ticketNoPrefix)
    await expect(page.getByTestId('report-ticket-no')).toContainText(/ST-\d{4}-\d{4,}/)
    await expect(page.getByTestId('report-status-link')).toHaveAttribute(
      'href',
      /^\/s\/[A-Za-z0-9_-]{22}$/,
    )

    // §7.3.4: following the status link shows ticket number, status and deadline.
    await page.getByTestId('report-status-link').click()

    await expect(page.getByRole('heading', { level: 1 })).toContainText(/ST-\d{4}-\d{4,}/)
    await expect(page.getByTestId('status-badge')).toHaveText(texts.status.new)
    await expect(page.getByText(texts.status.deadlineLabel)).toBeVisible()
    await expect(page.locator('dd').last()).toContainText(/\d/)
  })
}
