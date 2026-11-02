import { createBrowserRouter } from 'react-router-dom'

import { App } from '../App'
import { RolesPage } from '../admin/roles-page'
import { UsersPage } from '../admin/users-page'
import { RequireSession } from '../auth/require-session'
import { StickerPage } from '../features/objects/sticker-page'
import { ObjectListPage } from '../features/objects/object-list-page'
import { ReportFormPage } from '../features/tickets/report-form-page'
import { StatusPage } from '../features/tickets/status-page'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
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
