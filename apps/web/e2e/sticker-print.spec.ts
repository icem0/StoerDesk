import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * Phase-27 exit criterion (ADR-0050, `specs/08-objects-api.md` §9.3,
 * WP-M27-06): the sheet of the stickers prints in the grid of the chosen sheet
 * and every label carries the 112 notice.
 *
 * The proof runs against the real web app and the real API: the label of the
 * sheet is measured in the browser (a millimetre is 96/25.4 CSS pixels), the
 * page rule of the sheet is read from the document, and the notice is read from
 * every label of the sheet.
 */

// Throwaway values of a database that is dropped after the run — never a real account.
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@e2e.invalid'
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'e2e-only-admin-password-1'

/** The pixels of a millimetre in CSS (96 dpi). */
const PX_PER_MM = 96 / 25.4

const ui = {
  de: {
    loginTitle: 'Anmeldung',
    loginSubmit: 'Anmelden',
    settings: 'Einstellungen',
    signedInAs: `Angemeldet als ${adminEmail}`,
    sheetLabel: 'Blatt',
    emergencyNotice: 'Bei Brand oder Gefahr: Notruf 112. Dieses Formular ersetzt keinen Notruf.',
  },
  en: {
    loginTitle: 'Sign in',
    loginSubmit: 'Sign in',
    settings: 'Settings',
    signedInAs: `Signed in as ${adminEmail}`,
    sheetLabel: 'Sheet',
    emergencyNotice: 'For fire or danger: emergency call 112. This form is never an emergency call.',
  },
} as const

test.use({ viewport: { width: 1280, height: 900 } })

async function signIn(page: Page, language: 'de' | 'en'): Promise<void> {
  const texts = ui[language]

  await expect(page.getByRole('heading', { level: 2, name: texts.loginTitle })).toBeVisible()

  await page.locator('input[name="email"]').fill(adminEmail)
  await page.locator('input[name="password"]').fill(adminPassword)
  await page.getByRole('button', { name: texts.loginSubmit }).click()

  // The shell (and with it the gear of the settings) appears after the login;
  // the settings page names the signed-in account — the session is set then.
  await expect(page.getByTestId('app-version')).toBeVisible()
  await page.getByRole('link', { name: texts.settings }).click()
  await expect(page.getByText(texts.signedInAs)).toBeVisible()
}

async function createObject(page: Page, objectNo: string, name: string): Promise<void> {
  const response = await page.context().request.post('/api/v1/objects', {
    data: { objectNo, name },
  })

  expect(response.status()).toBe(201)
}

for (const language of ['de', 'en'] as const) {
  test(`the sticker sheet prints in the grid of the chosen sheet (${language.toUpperCase()})`, async ({
    page,
  }) => {
    const texts = ui[language]

    await page.addInitScript(
      (lng: string) => window.localStorage.setItem('i18nextLng', lng),
      language,
    )
    await page.goto('/')
    await signIn(page, language)

    await createObject(page, `E2E_M27_06_${language.toUpperCase()}`, `E2E M27 06 ${language.toUpperCase()}`)

    await page.goto('/objects/stickers')

    const labels = page.locator('.sticker-label')
    await expect(labels.first()).toBeVisible()

    // Every label carries the 112 notice of `PLAN.md` §2.
    const count = await labels.count()

    for (let index = 0; index < count; index += 1) {
      await expect(labels.nth(index)).toContainText(texts.emergencyNotice)
    }

    // The sheet of the job decides the grid: the label of the sheet with 104
    // labels is 25,7 × 20,7 mm.
    await page.getByRole('combobox', { name: texts.sheetLabel }).selectOption('a4-104')

    const box = await labels.first().boundingBox()

    expect(box).not.toBeNull()
    expect(Math.abs((box?.width ?? 0) - 25.7 * PX_PER_MM)).toBeLessThan(1.5)
    expect(Math.abs((box?.height ?? 0) - 20.7 * PX_PER_MM)).toBeLessThan(1.5)

    // The sheet writes its own page rule.
    expect(await page.content()).toContain('@page { size: A4; margin: 0; }')
  })
}
