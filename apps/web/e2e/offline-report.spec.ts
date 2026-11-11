import { expect, test } from '@playwright/test'
import type { ObjectSummary } from '@stoerdesk/shared'
import type { Page } from '@playwright/test'

/**
 * Offline report E2E (`specs/09-offline.md`, WP-M2-09b / PLAN.md §10).
 *
 * The database is prepared by `scripts/e2e-check.mjs`: a throwaway database, migrated
 * and seeded with the bootstrap administrator. The object under test is created through
 * the running stack (`POST /api/v1/objects` with the session cookie), so the QR token is
 * the one the API really generated.
 *
 * The test drives the public form on a phone viewport, goes offline, submits (the report
 * lands in the Dexie outbox and is not sent), goes back online and asserts that exactly
 * one ticket exists — never zero, never a duplicate.
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
    faultChip: 'Störung Melder',
    textLabel: 'Was ist zu sehen?',
    phoneLabel: 'Telefon',
    emergencyNotice: 'Bei Brand oder Gefahr: Notruf 112. Dieses Formular ersetzt keinen Notruf.',
    submit: 'Störung melden',
    offlineBadge: '1 wartet',
    doneTitle: 'Meldung eingegangen',
  },
  en: {
    loginTitle: 'Sign in',
    loginSubmit: 'Sign in',
    settings: 'Settings',
    signedInAs: `Signed in as ${adminEmail}`,
    reportTitle: 'Report a malfunction',
    faultChip: 'Detector fault',
    textLabel: 'What can be seen?',
    phoneLabel: 'Phone',
    emergencyNotice: 'For fire or danger: emergency call 112. This form is never an emergency call.',
    submit: 'Report malfunction',
    offlineBadge: '1 waiting',
    doneTitle: 'Report received',
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

  await page.getByRole('link', { name: texts.settings }).click()
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

/** Open tickets of the object of the current QR token (public, no session needed). */
async function openTicketsCount(page: Page, qrToken: string): Promise<number> {
  const response = await page.context().request.get(`/api/v1/public/tickets/open`, {
    params: { qrToken },
  })

  expect(response.status()).toBe(200)

  const body = (await response.json()) as { tickets: unknown[] }

  return body.tickets.length
}

for (const language of ['de', 'en'] as const) {
  test(`offline report is sent exactly once when back online (${language.toUpperCase()})`, async ({
    page,
  }) => {
    const texts = ui[language]
    // The two tests share one throwaway database, so each locale gets its own object.
    const objectNo = `E2E_M2_09_${language.toUpperCase()}`
    const objectName = `E2E M2 09 ${language.toUpperCase()} object`

    await openInLanguage(page, language)
    await signIn(page, language)

    const object = await createObject(page, objectNo, objectName)
    const token = object.qrToken

    if (token === null) {
      throw new Error('the created object carries no QR token')
    }

    await page.goto(`/m/${token}`)

    await expect(page.getByRole('heading', { level: 1, name: objectName })).toBeVisible()
    await expect(page.getByText(objectNo)).toBeVisible()
    await expect(page.getByText(texts.emergencyNotice)).toBeVisible()

    // §7.2: a fault chip plus the required phone contact.
    await page.getByRole('button', { name: texts.faultChip }).click()
    await page.locator('textarea[name="text"]').fill('E2E offline smoke test report')
    await page.locator('input[name="contactPhone"]').fill('0000000')

    // Go offline: the send must not reach the server, the report is parked in the outbox.
    await page.context().setOffline(true)

    await page.getByRole('button', { name: texts.submit }).click()

    // The badge proves the report was persisted locally instead of being sent.
    await expect(page.getByText(texts.offlineBadge)).toBeVisible()

    // While offline no ticket may exist yet.
    await expect(async () => {
      const count = await openTicketsCount(page, token)
      expect(count).toBe(0)
    }).toPass({ timeout: 5000 })

    // Back online: the `online` listener replays the outbox automatically.
    await page.context().setOffline(false)

    await expect(async () => {
      const count = await openTicketsCount(page, token)
      expect(count).toBe(1)
    }).toPass({ timeout: 15000 })

    // Confirmation is not required for this test — exactly one ticket is the contract.
    const count = await openTicketsCount(page, token)
    expect(count).toBe(1)
  })
}
