import { expect, test } from '@playwright/test'
import type { ObjectSummary } from '@stoerdesk/shared'
import type { Page } from '@playwright/test'

/**
 * Public report form smoke E2E (`specs/06-report-form.md` §7.1–§7.4, WP-M2-05c).
 *
 * The database is prepared by `scripts/e2e-check.mjs`: a throwaway database, migrated
 * and seeded with the bootstrap administrator. The object under test is created through
 * the running stack (`POST /api/v1/objects` with the session cookie), so the QR token is
 * the one the API really generated (WP-M2-02) — no fixture token and no direct write into
 * the throwaway database.
 *
 * The expectations are spelled out on purpose, like `auth.spec.ts`: reading them from the
 * JSON files would only compare the bundle with itself, while this proves that `de` really
 * renders German and `en` really renders English on the public page.
 */

// Throwaway values of a database that is dropped after the run — never a real account.
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@e2e.invalid'
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'e2e-only-admin-password-1'

/** A valid 1×1 JPEG; the canvas of WP-M2-05b re-encodes it before the upload. */
const onePixelJpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIy' +
    'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIA' +
    'AhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQA' +
    'AAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3' +
    'ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWm' +
    'p6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEA' +
    'AwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSEx' +
    'BhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElK' +
    'U1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3' +
    'uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iii' +
    'gD//2Q==',
  'base64',
)

/**
 * Rendered text of the de/en locale files of the public page. The fault chip is one of the
 * localized `STANDARD_TEXTS` of `packages/shared/src/seed/standard-texts.ts`.
 */
const ui = {
  de: {
    loginTitle: 'Anmeldung',
    loginSubmit: 'Anmelden',
    settings: 'Einstellungen',
    signedInAs: `Angemeldet als ${adminEmail}`,
    reportTitle: 'Störung melden',
    system: 'Betroffene Anlage',
    faultChip: 'Leitungsunterbrechung',
    textLabel: 'Was ist zu sehen?',
    photoLabel: 'Fotos',
    phoneLabel: 'Telefon',
    emergencyNotice: 'Bei Brand oder Gefahr: Notruf 112. Dieses Formular ersetzt keinen Notruf.',
    submit: 'Störung melden',
    doneTitle: 'Meldung eingegangen',
    ticketNoPrefix: 'Vorgangsnummer:',
    statusLink: 'Status dieser Meldung ansehen',
    photoCount: 'Fotos: 1',
  },
  en: {
    loginTitle: 'Sign in',
    loginSubmit: 'Sign in',
    settings: 'Settings',
    signedInAs: `Signed in as ${adminEmail}`,
    reportTitle: 'Report a malfunction',
    system: 'Affected system',
    faultChip: 'Line interruption',
    textLabel: 'What can be seen?',
    photoLabel: 'Photos',
    phoneLabel: 'Phone',
    emergencyNotice: 'For fire or danger: emergency call 112. This form is never an emergency call.',
    submit: 'Report malfunction',
    doneTitle: 'Report received',
    ticketNoPrefix: 'Reference number:',
    statusLink: 'View the status of this report',
    photoCount: 'Photos: 1',
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
  test(`report a malfunction through the QR form (${language.toUpperCase()})`, async ({
    page,
  }) => {
    const texts = ui[language]
    // The two tests share one throwaway database, so each locale gets its own object.
    const objectNo = `E2E_M2_05_${language.toUpperCase()}`
    const objectName = `E2E M2 05 ${language.toUpperCase()} object`
    const withPhoto = language === 'de'

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
    await expect(page.getByText(texts.emergencyNotice)).toBeVisible()
    await expect(page.locator('select[name="system"]')).toHaveValue(system.id)

    // Fault chip, free text and the required phone contact (§7.2).
    await page.getByRole('button', { name: texts.faultChip }).click()
    await page.locator('textarea[name="text"]').fill('E2E smoke test report')
    await page.locator('input[name="contactPhone"]').fill('0000000')

    if (withPhoto) {
      // A real canvas must compress the bytes and the server must accept their magic
      // bytes (WP-M2-04c) — the proof that the WP-M2-05b path works in a browser.
      await page.getByTestId('photo-input').setInputFiles({
        name: 'e2e-photo.jpg',
        mimeType: 'image/jpeg',
        buffer: onePixelJpeg,
      })

      await expect(page.getByTestId('photo-preview')).toHaveCount(1)
    }

    await page.getByRole('button', { name: texts.submit }).click()

    // §7.3.2: confirmation with the generated ticket number and the status link.
    await expect(page.getByRole('heading', { level: 1, name: texts.doneTitle })).toBeVisible()
    await expect(page.getByTestId('report-ticket-no')).toContainText(texts.ticketNoPrefix)
    await expect(page.getByTestId('report-ticket-no')).toContainText(/ST-\d{4}-\d{4,}/)
    await expect(page.getByTestId('report-status-link')).toHaveAttribute(
      'href',
      /^\/s\/[A-Za-z0-9_-]{22}$/,
    )

    if (withPhoto) {
      await expect(page.getByText(texts.photoCount)).toBeVisible()
    }
  })
}
