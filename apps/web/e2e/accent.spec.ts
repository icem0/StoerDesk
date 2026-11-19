import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * The accent colour of the instance (ADR-0036, WP-M16-07): the colour the
 * administration saved under „Darstellung“ paints the frame of the interface.
 *
 * The test drives a real browser against the real stack: it saves a colour
 * through the API of the branding, reloads the shell and reads the computed
 * values. It is the regression test for the defect of WP-M16-03 — the classes
 * `*-accent-*` existed in the markup, but Tailwind had never generated the
 * utilities for them, so the menu kept its blue.
 */
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@e2e.invalid'
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'e2e-only-admin-password-1'

async function signIn(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('input[name="email"]').fill(adminEmail)
  await page.locator('input[name="password"]').fill(adminPassword)
  await page.getByRole('button', { name: 'Anmelden' }).click()

  // The settings page is reachable only with a session, so it proves the login.
  await page.getByRole('link', { name: 'Einstellungen' }).click()
  await expect(page.getByText(/Angemeldet als/)).toBeVisible()
}

test('the accent colour of the instance paints the header menu', async ({ page }) => {
  await signIn(page)

  const saved = await page.context().request.put('/api/v1/settings/branding', {
    data: {
      companyName: 'Beispiel GmbH',
      titleEnabled: false,
      logo: '',
      internalCommentColor: '#7f1d1d',
      accentColor: '#ff0000',
    },
  })
  expect(saved.ok()).toBeTruthy()

  await page.goto('/tickets')
  await expect(page.getByRole('link', { name: 'Tickets' })).toHaveAttribute(
    'aria-current',
    'page',
  )

  const painted = await page.evaluate(() => {
    const shell = document.querySelector('[class*="theme-"]') as HTMLElement | null
    const active = document.querySelector('nav a[aria-current="page"]') as HTMLElement | null
    const idle = document.querySelector(
      'nav a:not([aria-current="page"])',
    ) as HTMLElement | null

    if (shell === null || active === null || idle === null) {
      return null
    }

    const style = getComputedStyle(shell)

    return {
      accent: style.getPropertyValue('--brand-accent').trim(),
      ramp: style.getPropertyValue('--accent-500').trim(),
      activeColor: getComputedStyle(active).color,
      idleColor: getComputedStyle(idle).color,
    }
  })

  expect(painted).not.toBeNull()

  // The saved colour reaches the shell and the ramp is derived from it — the
  // steps of the ramp are mixes of the accent, so the mix names the accent.
  expect(painted?.accent).toBe('#ff0000')
  expect(painted?.ramp).toContain('#ff0000')

  // The active entry of the menu wears the accent, the other one keeps the text
  // colour of the interface — the utility exists and paints.
  expect(painted?.activeColor).not.toBe(painted?.idleColor)
})
