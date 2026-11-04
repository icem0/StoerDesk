import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { i18n } from '../../i18n'
import { RouteErrorPage } from '../route-error-page'

/**
 * The error element of the router replaces the shell, so it is tested with a
 * route that fails on its own (WP-M3-13).
 */
function renderFailingRoute() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <div />,
        errorElement: <RouteErrorPage />,
        loader: () => {
          throw new Error('the loader fails')
        },
      },
    ],
    { initialEntries: ['/'] },
  )

  return render(
    <I18nextProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  )
}

describe('RouteErrorPage', () => {
  it('replaces the developer page of React Router', async () => {
    renderFailingRoute()

    expect(await screen.findByText('Unerwarteter Fehler')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Zur Startseite' })).toBeTruthy()
    expect(screen.queryByText(/Unexpected Application Error/)).toBeNull()
  })
})
