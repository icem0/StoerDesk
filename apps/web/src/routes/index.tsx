import { createBrowserRouter } from 'react-router-dom'

import { App } from '../App'
import { AdminHomePage } from '../admin/admin-home-page'
import { BmaSyncPage } from '../admin/bma-sync-page'
import { BrandingPage } from '../settings/branding-page'
import { RolesPage } from '../admin/roles-page'
import { TextTemplatesPage } from '../admin/text-templates-page'
import { UpdatePage } from '../admin/update-page'
import { UsersPage } from '../admin/users-page'
import { RequireSession } from '../auth/require-session'
import { StartPage } from '../features/dashboard/start-page'
import { StickerPage } from '../features/objects/sticker-page'
import { ObjectListPage } from '../features/objects/object-list-page'
import { ObjectCreatePage } from '../features/objects/object-create-page'
import { ObjectEditPage } from '../features/objects/object-edit-page'
import { InternalCreatePage } from '../features/tickets/internal-create-page'
import { TicketListPage } from '../features/tickets/ticket-list-page'
import { TicketDetailPage } from '../features/tickets/ticket-detail-page'
import { ReportFormPage } from '../features/tickets/report-form-page'
import { StatusPage } from '../features/tickets/status-page'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        path: '/',
        element: (
          <RequireSession>
            <StartPage />
          </RequireSession>
        ),
      },
      {
        path: '/admin',
        element: (
          <RequireSession>
            <AdminHomePage />
          </RequireSession>
        ),
      },
      {
        path: '/admin/users',
        element: (
          <RequireSession>
            <UsersPage />
          </RequireSession>
        ),
      },
      {
        path: '/admin/roles',
        element: (
          <RequireSession>
            <RolesPage />
          </RequireSession>
        ),
      },
      {
        path: '/admin/bma-sync',
        element: (
          <RequireSession>
            <BmaSyncPage />
          </RequireSession>
        ),
      },
      {
        path: '/admin/text-templates',
        element: (
          <RequireSession>
            <TextTemplatesPage />
          </RequireSession>
        ),
      },
      {
        path: '/admin/update',
        element: (
          <RequireSession>
            <UpdatePage />
          </RequireSession>
        ),
      },
      {
        path: '/admin/branding',
        element: (
          <RequireSession>
            <BrandingPage />
          </RequireSession>
        ),
      },
      {
        path: '/objects/stickers',
        element: (
          <RequireSession>
            <StickerPage />
          </RequireSession>
        ),
      },
      {
        path: '/objects',
        element: (
          <RequireSession>
            <ObjectListPage />
          </RequireSession>
        ),
      },
      {
        path: '/objects/create',
        element: (
          <RequireSession>
            <ObjectCreatePage />
          </RequireSession>
        ),
      },
      {
        path: '/objects/:objectNo/edit',
        element: (
          <RequireSession>
            <ObjectEditPage />
          </RequireSession>
        ),
      },
      {
        path: '/tickets/create',
        element: (
          <RequireSession>
            <InternalCreatePage />
          </RequireSession>
        ),
      },
      {
        path: '/tickets',
        element: (
          <RequireSession>
            <TicketListPage />
          </RequireSession>
        ),
      },
      {
        path: '/tickets/:ticketNo',
        element: (
          <RequireSession>
            <TicketDetailPage />
          </RequireSession>
        ),
      },
    ],
  },
  // A QR reporter has no session: `/m/:token` is deliberately outside the `App` shell, so
  // it never renders the login form of `Shell` (WP-M2-05, specs/06-report-form.md §7.2).
  {
    path: '/m/:token',
    element: <ReportFormPage />,
  },
  // The status link of the confirmation page is public as well: a reporter has no
  // session, so `/s/:token` stays outside the `Shell` (WP-M2-06b, PLAN §10).
  {
    path: '/s/:token',
    element: <StatusPage />,
  },
])
