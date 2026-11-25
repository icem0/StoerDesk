import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { AdminLayout } from '../admin-layout'

/**
 * The pages that carry the hull (WP-M29-06 … WP-M29-08): a page of the
 * settings or of the administration renders into the `<main>` of the shell, so
 * it brings no landmark of its own.
 */
const PAGES = [
  'apps/web/src/admin/users-page.tsx',
  'apps/web/src/admin/user-create-page.tsx',
  'apps/web/src/admin/roles-page.tsx',
  'apps/web/src/admin/role-create-page.tsx',
  'apps/web/src/admin/groups-page.tsx',
  'apps/web/src/admin/group-create-page.tsx',
  'apps/web/src/admin/status-page.tsx',
  'apps/web/src/admin/status-create-page.tsx',
  'apps/web/src/admin/text-templates-page.tsx',
  'apps/web/src/admin/text-template-create-page.tsx',
  'apps/web/src/admin/detected-errors-page.tsx',
  'apps/web/src/admin/detected-error-create-page.tsx',
  'apps/web/src/admin/escalation-stage-create-page.tsx',
  'apps/web/src/admin/oncall-page.tsx',
  'apps/web/src/admin/oncall-pool-create-page.tsx',
  'apps/web/src/admin/bma-sync-page.tsx',
  'apps/web/src/admin/email-page.tsx',
  'apps/web/src/settings/branding-page.tsx',
  'apps/web/src/settings/my-settings-page.tsx',
  'apps/web/src/settings/notifications-page.tsx',
  'apps/web/src/settings/sticker-template-page.tsx',
  'apps/web/src/features/oncall/my-shifts-page.tsx',
  'apps/web/src/features/notifications/inbox-page.tsx',
  'apps/web/src/features/notifications/web-push-help-page.tsx',
]

describe('AdminLayout', () => {
  it('carries the content of the page and brings no landmark of its own', () => {
    // The heading comes from a variable: a literal text in the markup is a
    // user-facing text and needs an i18n key (`specs/00-conventions.md` §0.1).
    const heading = 'Benutzerverwaltung'
    const { container } = render(
      <main>
        <AdminLayout>
          <h1>{heading}</h1>
        </AdminLayout>
      </main>,
    )

    expect(screen.getByRole('heading', { name: 'Benutzerverwaltung' })).toBeTruthy()
    expect(container.querySelectorAll('main')).toHaveLength(1)
    expect(container.querySelector('main > div')).not.toBeNull()
  })

  it.each(PAGES)('%s brings no landmark of its own', (page) => {
    const source = readFileSync(resolve(process.cwd(), page), 'utf8')

    expect(source).toContain('<AdminLayout')
    expect(source).not.toContain('<main')
  })
})
