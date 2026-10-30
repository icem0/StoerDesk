import { Outlet, createBrowserRouter } from 'react-router-dom'

import { App } from '../App'
import { RolesPage } from '../admin/roles-page'
import { UsersPage } from '../admin/users-page'
import { RequireSession } from '../auth/require-session'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
  },
  {
    // WP-M1-09e: the admin routes share one session guard, the pages themselves stay
    // unchanged. `RequireSession` only shortens the path to the same 401/403 the server
    // guard already answers (`specs/01-rbac.md` §3.2).
    element: (
      <RequireSession>
        <Outlet />
      </RequireSession>
    ),
    children: [
      {
        path: '/admin/users',
        element: <UsersPage />,
      },
      {
        path: '/admin/roles',
        element: <RolesPage />,
      },
    ],
  },
])
