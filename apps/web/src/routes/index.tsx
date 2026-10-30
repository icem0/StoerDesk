import { createBrowserRouter } from 'react-router-dom'

import { App } from '../App'
import { RolesPage } from '../admin/roles-page'
import { UsersPage } from '../admin/users-page'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
  },
  {
    path: '/admin/users',
    element: <UsersPage />,
  },
  {
    path: '/admin/roles',
    element: <RolesPage />,
  },
])
