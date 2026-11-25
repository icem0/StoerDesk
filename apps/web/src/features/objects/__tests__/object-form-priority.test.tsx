import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../../i18n'
import { ObjectCreatePage } from '../object-create-page'
import { ObjectEditPage } from '../object-edit-page'

/**
 * The object form carries the priority of the object (ADR-0029,
 * `specs/08-objects-api.md` §9.1, WP-M14-134f): the select shows the stored
 * deviation, "Standard" means the object follows the standard of the instance.
 * The fields of the form are filled when the answer of the query arrives.
 */

function objectSummary(priorityOverride: string | null) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    objectNo: 'EXT-1',
    name: 'Werk Nord',
    street: 'Hauptstraße',
    houseNumber: '7',
    postalCode: '12345',
    city: 'Musterstadt',
    contactName: null,
    contactPhone: null,
    contactEmail: null,
    externalId: null,
    externalType: null,
    active: true,
    notes: null,
    qrToken: null,
    priority: priorityOverride ?? 'normal',
    priorityOverride,
  }
}

function renderEdit(priorityOverride: string | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(objectSummary(priorityOverride))),
  )

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/objects/EXT-1/edit']}>
          <Routes>
            <Route path="/objects/:objectNo/edit" element={<ObjectEditPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

function prioritySelect(): HTMLSelectElement {
  // The page carries a second select — the customer of the trained people of
  // the object (WP-M31-05) — so the priority is named.
  return screen.getByRole('combobox', { name: 'Priorität' }) as HTMLSelectElement
}

/** The input below the label — the labels of the form carry no `for`. */
function field(label: string): HTMLInputElement {
  const element = screen.getByText(label)

  return element.parentElement?.querySelector('input') as HTMLInputElement
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ObjectEditPage', () => {
  it('fills the fields with the answer of the query', async () => {
    renderEdit(null)

    await waitFor(() => expect(screen.getByDisplayValue('Werk Nord')).toBeTruthy())
    expect(screen.getByDisplayValue('Hauptstraße')).toBeTruthy()
  })

  it('shows the standard for an object without a deviation', async () => {
    renderEdit(null)

    await waitFor(() => expect(screen.getByDisplayValue('Werk Nord')).toBeTruthy())
    expect(prioritySelect().value).toBe('standard')
  })

  it('shows the deviation of an object', async () => {
    renderEdit('critical')

    await waitFor(() => expect(screen.getByDisplayValue('Werk Nord')).toBeTruthy())
    expect(prioritySelect().value).toBe('critical')
  })
})

describe('ObjectCreatePage', () => {
  it('writes the priority of the new object', async () => {
    const calls: { url: string; body: unknown }[] = []

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({
          url,
          body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
        })

        return Response.json({})
      }),
    )

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={client}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter initialEntries={['/objects/new']}>
            <Routes>
              <Route path="/objects/new" element={<ObjectCreatePage />} />
            </Routes>
          </MemoryRouter>
        </I18nextProvider>
      </QueryClientProvider>,
    )

    fireEvent.change(field('Objektnummer'), { target: { value: 'EXT-2' } })
    fireEvent.change(field('Name'), { target: { value: 'Werk Süd' } })
    fireEvent.change(prioritySelect(), { target: { value: 'critical' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(calls.length).toBe(1))
    expect(calls[0]?.body).toMatchObject({
      objectNo: 'EXT-2',
      name: 'Werk Süd',
      priority: 'critical',
    })
  })

  it('writes no deviation for a new object that follows the standard', async () => {
    const calls: { url: string; body: unknown }[] = []

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({
          url,
          body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
        })

        return Response.json({})
      }),
    )

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={client}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter initialEntries={['/objects/new']}>
            <Routes>
              <Route path="/objects/new" element={<ObjectCreatePage />} />
            </Routes>
          </MemoryRouter>
        </I18nextProvider>
      </QueryClientProvider>,
    )

    fireEvent.change(field('Objektnummer'), { target: { value: 'EXT-3' } })
    fireEvent.change(field('Name'), { target: { value: 'Werk Ost' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(calls.length).toBe(1))
    expect(calls[0]?.body).toMatchObject({ objectNo: 'EXT-3', priority: null })
  })
})
