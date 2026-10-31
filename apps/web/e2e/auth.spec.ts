import { expect, test } from '@playwright/test'
import type { MeResponse } from '@stoerdesk/shared'
import type { Page } from '@playwright/test'

/**
 * Smoke E2E of WP-M1-12 — the phase 1 exit criterion "login as admin works"
 * (`PLAN.md` §16). The database is prepared by `scripts/e2e-check.mjs`: a throwaway
 * database, migrated and seeded with the bootstrap administrator, so the credentials
 * below are throwaway values of a database that is dropped after the run — never a real
 * account and never PII.
 */
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@e2e.invalid'
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'e2e-only-admin-password-1'

/**
 * Rendered text of the de/en locale files. The expectations are spelled out on purpose:
 * reading them from the JSON files would only compare the bundle with itself, while this
 * proves that `de` really renders German and `en` really renders English.
 */
const ui = {
  de: {
    loginTitle: 'Anmeldung',
    submit: 'Anmelden',
    signedInAs: `Angemeldet als ${adminEmail}`,
    usersLink: 'Benutzerverwaltung',
    usersTitle: 'Benutzerverwaltung',
    active: 'aktiv',
  },
  en: {
    loginTitle: 'Sign in',
    submit: 'Sign in',
    signedInAs: `Signed in as ${adminEmail}`,
    usersLink: 'User administration',
    usersTitle: 'User management',
    active: 'active',
  },
} as const

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

  // WP-M1-15: the build version is part of the global shell, so it is already visible
  // before the login — not only after it.
  await expect(page.getByTestId('app-version')).toBeVisible()

  await page.locator('input[name="email"]').fill(adminEmail)
  await page.locator('input[name="password"]').fill(adminPassword)
  await page.getByRole('button', { name: texts.submit }).click()

  await expect(page.getByText(texts.signedInAs)).toBeVisible()
}

for (const language of ['de', 'en'] as const) {
  test(`login as admin works and shows the user administration (${language.toUpperCase()})`, async ({
    page,
  }) => {
    const texts = ui[language]

    await openInLanguage(page, language)
    await signIn(page, language)

    // The session cookie of the browser context also authenticates this direct call:
    // role and permissions are the server answer, not something the UI derived.
    const me = await page.context().request.get('/api/v1/me')
    expect(me.ok()).toBeTruthy()

    const body = (await me.json()) as MeResponse
    expect(body.user.email).toBe(adminEmail)
    expect(body.user.roles).toContain('admin')
    expect(body.user.permissions).toContain('user.read')

    await page.getByRole('link', { name: texts.usersLink }).click()

    await expect(page).toHaveURL(/\/admin\/users$/)
    await expect(page.getByRole('heading', { level: 1, name: texts.usersTitle })).toBeVisible()

    // The seeded administrator appears with its role key and its active state — the table
    // cells come from `GET /api/v1/users`, so the guard and the read path work over the
    // session cookie.
    const row = page.getByRole('row').filter({ hasText: adminEmail })
    await expect(row).toContainText('admin')
    await expect(row).toContainText(texts.active)
  })
}
