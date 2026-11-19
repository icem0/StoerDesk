import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'

import { i18n } from '../../i18n'
import { TransitionPage } from '../transition-page'

const firstId = '11111111-1111-4111-8111-111111111111'
const secondId = '22222222-2222-4222-8222-222222222222'
const thirdId = '33333333-3333-4333-8333-333333333333'

const transitionList = {
  transitions: [
    {
      id: firstId,
      fromStatus: 'NEW',
      toStatus: 'IN_REVIEW',
      eventKey: 'review_started',
      condition: null,
      active: true,
    },
    {
      id: secondId,
      fromStatus: 'IN_REVIEW',
      toStatus: 'WORK_ORDER_CREATED',
      eventKey: 'work_order_set',
      condition: null,
      active: true,
    },
    {
      id: thirdId,
      fromStatus: 'NEW',
      toStatus: 'CANCELLED',
      eventKey: 'cancelled',
      condition: null,
      active: false,
    },
  ],
}

const adminId = '11111111-1111-4a11-8a11-111111111111'

function meResponse(permissions: string[]) {
  return {
    user: { id: adminId, email: 'admin@example.com', locale: 'de', roles: ['admin'], permissions },
  }
}

function stubRoutes(routes: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      for (const [path, payload] of Object.entries(routes)) {
        if (!url.includes(path)) {
          continue
        }

        if (typeof payload === 'function') {
          return payload(url, init)
        }

        return payload instanceof Response ? payload : Response.json(payload)
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    }),
  )
}

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/admin/transitions']}>
          <TransitionPage />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

async function click(element: unknown) {
  await vi.waitFor(() => void (element as HTMLElement)?.click())
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TransitionPage', () => {
  it('renders the transition table for a session with settings.read', async () => {
    stubRoutes({ '/v1/me': meResponse(['settings.read']), '/v1/admin/transitions': transitionList })
    renderPage()

    expect(await screen.findByText(firstId)).toBeTruthy()
    expect(screen.getByText('review_started')).toBeTruthy()
    expect(screen.getAllByText('IN_REVIEW')).toHaveLength(2)
    expect(screen.getByText('Übergangverwaltung')).toBeTruthy()
    expect(screen.getByText('inactive')).toBeTruthy()
    expect(screen.queryByText('Anlegen')).toBeNull()
  })

  it('offers create, edit and delete controls with settings.write', async () => {
    stubRoutes({
      '/v1/me': meResponse(['settings.read', 'settings.write']),
      '/v1/admin/transitions': transitionList,
    })
    renderPage()

    expect(await screen.findByText(firstId)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Übergang anlegen' })).toBeTruthy()
    expect(screen.getAllByText('Bearbeiten')).toHaveLength(3)
    expect(screen.getAllByText('Lösch')).toHaveLength(3)
  })

  it('shows the session notice when /me answers 401', async () => {
    stubRoutes({
      '/v1/me': Response.json({ code: 'session_invalid', params: {} }, { status: 401 }),
    })
    renderPage()

    expect(await screen.findByText(/requires a valid login/)).toBeTruthy()
  })

  it('shows the forbidden notice without settings.read', async () => {
    stubRoutes({ '/v1/me': meResponse(['user.read']) })
    renderPage()

    expect(await screen.findByText('No permission for the transition administration.')).toBeTruthy()
  })

  it('the empty workflow stays visible (ADR-0025)', async () => {
    stubRoutes({
      '/v1/me': meResponse(['settings.read']),
      '/v1/admin/transitions': { transitions: [] },
    })
    renderPage()

    expect(await screen.findByText(/The workflow has no steps:/)).toBeTruthy()
  })

  it('a rejected delete names its code (404 transition_not_found)', async () => {
    stubRoutes({
      '/v1/me': meResponse(['settings.read', 'settings.write']),
      [`/v1/admin/transitions/${firstId}`]: Response.json(
        { code: 'transition_not_found', params: { id: firstId } },
        { status: 404 },
      ),
      '/v1/admin/transitions': transitionList,
    })
    renderPage()

    await screen.findByText(firstId)
    await click(screen.getAllByText('Lösch')[0])

    expect(await screen.findByText('Permanently remove the step NEW with the event key review_started?')).toBeTruthy()

    const confirm = screen.getByRole('button', { name: 'Entfernen' })
    await click(confirm)

    expect(await screen.findByText('Step not found.')).toBeTruthy()
  })

})
