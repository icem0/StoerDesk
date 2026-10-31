import { createBrowserRouter } from 'react-router-dom'

import { App } from '../App'
import { RolesPage } from '../admin/roles-page'
import { UsersPage } from '../admin/users-page'
import { RequireSession } from '../auth/require-session'
import { StickerPage } from '../features/objects/sticker-page'

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
    ],
  },
])
