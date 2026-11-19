import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { i18n } from '../../i18n'
import { TransitionCreatePage } from '../transition-create-page'

const listMarker = 'Übergangsliste'

const transitionList = {
  transitions: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      fromStatus: 'NEW',
      toStatus: 'IN_REVIEW',
      eventKey: 'review_started',
      condition: null,
      active: true,
    },
  ],
}

function meResponse(permissions: string[]) {
  return {
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'admin@example.com',
      locale: 'de',
      roles: ['admin'],
      permissions,
    },
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
        <MemoryRouter initialEntries={['/admin/transitions/new']}>
          <Routes>
            <Route path="/admin/transitions/new" element={<TransitionCreatePage />} />
            <Route path="/admin/transitions" element={<p>{listMarker}</p>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TransitionCreatePage', () => {
  it('shows the form of a new step on its own page', async () => {
    stubRoutes({ '/v1/me': meResponse(['settings.read', 'settings.write']) })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Übergang anlegen' })).toBeTruthy()
    expect(screen.getByLabelText('From (status)')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Übergangverwaltung' })).toBeTruthy()
  })

  it('creates the step and returns to the table', async () => {
    const writes: Record<string, unknown>[] = []

    stubRoutes({
      '/v1/me': meResponse(['settings.read', 'settings.write']),
      '/v1/admin/transitions': (_url: string, init?: RequestInit) => {
        if (init?.method !== 'POST') {
          return Response.json(transitionList)
        }

        writes.push(JSON.parse(String(init.body)))

        return Response.json({
          id: '22222222-2222-4222-8222-222222222222',
          fromStatus: 'NEW',
          toStatus: 'IN_REVIEW',
          eventKey: 'review_started',
          condition: null,
          active: true,
        })
      },
    })
    renderPage()

    await screen.findByRole('heading', { name: 'Übergang anlegen' })

    fireEvent.change(screen.getByLabelText('From (status)'), { target: { value: 'NEW' } })
    fireEvent.change(screen.getByLabelText('To (status)'), { target: { value: 'IN_REVIEW' } })
    fireEvent.change(screen.getByLabelText('Event key'), { target: { value: 'review_started' } })
    fireEvent.submit(screen.getByTestId('transition-form'))

    await vi.waitFor(() =>
      expect(writes).toEqual([
        {
          fromStatus: 'NEW',
          toStatus: 'IN_REVIEW',
          eventKey: 'review_started',
          active: true,
        },
      ]),
    )

    expect(await screen.findByText(listMarker)).toBeTruthy()
  })

  it('a step that duplicates an existing one is refused (409 transition_duplicate)', async () => {
    stubRoutes({
      '/v1/me': meResponse(['settings.read', 'settings.write']),
      '/v1/admin/transitions': (_url: string, init?: RequestInit) => {
        if (init?.method !== 'POST') {
          return Response.json(transitionList)
        }

        return Response.json(
          {
            code: 'transition_duplicate',
            params: { fromStatus: 'NEW', eventKey: 'review_started' },
          },
          { status: 409 },
        )
      },
    })
    renderPage()

    await screen.findByRole('heading', { name: 'Übergang anlegen' })

    fireEvent.change(screen.getByLabelText('From (status)'), { target: { value: 'NEW' } })
    fireEvent.change(screen.getByLabelText('To (status)'), { target: { value: 'IN_REVIEW' } })
    fireEvent.change(screen.getByLabelText('Event key'), { target: { value: 'review_started' } })
    fireEvent.submit(screen.getByTestId('transition-form'))

    expect(
      await screen.findByText('A second step does already exist for that status and event key.'),
    ).toBeTruthy()
  })

  it('shows the read-only notice without settings.write', async () => {
    stubRoutes({ '/v1/me': meResponse(['settings.read']) })
    renderPage()

    expect(await screen.findByText(/Only readable/)).toBeTruthy()
  })
})
