import { Navigate } from 'react-router-dom'

import { useMe } from './auth/usePermission'
import { Shell } from './components/Shell'

/**
 * The frame of the internal application (`specs/19-customer-portal.md` §19.5,
 * ADR-0061).
 *
 * A user with the role `customer` belongs to the portal and not to the
 * internal application of the office: every internal address sends him into
 * his portal, whether he signs in there or follows a link of the office.
 */
export function App() {
  const me = useMe()
  const isCustomer = me.data?.user.roles.includes('customer') ?? false

  if (isCustomer) {
    return <Navigate replace to="/portal" />
  }

  return <Shell />
}
