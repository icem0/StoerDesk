import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'

import { i18n } from '../../../i18n'
import { ReportFormPage } from '../report-form-page'
import { STANDARD_TEXTS } from '@stoerdesk/shared'
import type { PublicOpenTicket, PublicReport, QrResolveResponse } from '@stoerdesk/shared'

// The Altcha widget is a web component of a third-party package — the unit test
// drives its `verified` event instead of solving a proof of work in jsdom.
vi.mock('altcha', () => ({}))
vi.mock('altcha/i18n/de', () => ({}))
vi.mock('altcha/i18n/en', () => ({}))

/**
 * Fixtures of the public report path (`specs/06-report-form.md` §7.2/§7.3): the QR resolve
 * answer of WP-M2-02 and the create answer of WP-M2-04b. The scanned token is a **retired**
 * one, so the body of the submit has to carry the current token of the resolve answer.
 */
const SCANNED_TOKEN = 'Zx8Q_-3vLm2pQ7tYw4KdBe'
const CURRENT_TOKEN = 'Ab3dEf6gHij2pQr7tYw4Kd'
const SYSTEM_ID = '22222222-2222-4222-8222-222222222222'
const NOTICE = 'Bei Brand oder Gefahr: Notruf 112. Dieses Formular ersetzt keinen Notruf.'

/** The challenge of the API (WP-M2-07b) in the `altcha-lib` v1 format. */
const CHALLENGE = {
  algorithm: 'SHA-256',
  challenge: 'a1b2c3d4e5f6',
  salt: 'salt123?expires=1800000000&',
  signature: 'signature456',
  maxnumber: 10000,
}

/** The solved proof of work of the widget: base64 of the flat v1 payload. */
const SOLVED = {
  algorithm: 'SHA-256',
  challenge: 'a1b2c3d4e5f6',
  salt: 'salt123?expires=1800000000&',
  signature: 'signature456',
  number: 42,
  took: 12,
}

const RESOLVE: QrResolveResponse = {
  token: CURRENT_TOKEN,
  redirected: true,
  object: {
    objectNo: '12345_01',
    name: 'Rathaus',
    street: 'Bahnhofstrasse',
    houseNumber: '12',
    postalCode: '12345',
    city: 'Beispielstadt',
    systems: [{ id: SYSTEM_ID, type: 'BMA', label: 'BMA Mitte' }],
  },
}

const REPORT: PublicReport = {
  ticketId: '33333333-3333-4333-8333-333333333333',
  ticketNo: 'ST-2026-0042',
  status: 'NEW',
  statusToken: 'Qr7tYw4KdBe3vLm2pQ7tYw',
  reportedAt: '2026-10-31T09:00:00.000Z',
  receivedAt: '2026-10-31T09:00:01.000Z',
  deadlineAt: '2026-11-03T09:00:00.000Z',
  clockSkewed: false,
  photoCount: 0,
}

/** An open ticket of the object — the duplicate hint of §7.8 shows it. */
const OPEN_TICKET: PublicOpenTicket = {
  ticketId: '44444444-4444-4444-8444-444444444444',
  ticketNo: 'ST-2026-0041',
  status: 'ASSIGNED',
  reportedAt: '2026-10-30T07:30:00.000Z',
}

function stubPublicApi(
  createStatus = 201,
  createBody: unknown = REPORT,
  openTickets: PublicOpenTicket[] = [],
) {
  const bodies: Record<string, unknown>[] = []

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)

      if (path.includes('/public/qr/')) {
        return Response.json(RESOLVE)
      }

      // The live fault catalog of §7.9 — the form asks the server for the
      // active templates of the current locale.
      if (path.includes('/public/text-templates')) {
        const locale = path.includes('locale=en') ? 'en' : 'de'

        return Response.json({
          templates: STANDARD_TEXTS[locale].map((entry) => ({
            key: entry.key,
            text: entry.text,
          })),
        })
      }

      // The duplicate hint of §7.8.1 — the open tickets of the object.
      if (path.includes('/public/tickets/open')) {
        return Response.json({ tickets: openTickets })
      }

      if (path.includes('/public/tickets')) {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)

        return Response.json(createBody, { status: createStatus })
      }

      throw new Error(`unexpected request ${path}`)
    }),
  )

  return bodies
}

function stubUnresolvedToken() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ code: 'qr_token_not_found', params: {} }, { status: 404 })),
  )
}

function renderForm(token: string = SCANNED_TOKEN) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[`/m/${token}`]}>
          <Routes>
            <Route path="/m/:token" element={<ReportFormPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

async function openForm(token?: string) {
  renderForm(token)
  await screen.findByRole('heading', { level: 1, name: 'Rathaus' })
}

function fillReport(faultLabel: string, description: string, phone: string) {
  fireEvent.click(screen.getByRole('button', { name: faultLabel }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Was ist zu sehen?' }), {
    target: { value: description },
  })
  fireEvent.change(screen.getByRole('textbox', { name: 'Telefon' }), { target: { value: phone } })
}

afterEach(() => {
  vi.unstubAllGlobals()
  void i18n.changeLanguage('de')
})

describe('ReportFormPage', () => {
  it('prefills the resolved object and offers the localized fault catalog', async () => {
    stubPublicApi()
    await openForm()

    expect(screen.getByText('12345_01')).toBeTruthy()
    expect(screen.getByText('Bahnhofstrasse 12, 12345 Beispielstadt')).toBeTruthy()
    // The object has exactly one system, so it is prefilled (§7.2).
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe(SYSTEM_ID)
    expect(screen.getByRole('option', { name: 'BMA Mitte (BMA)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Störung Melder' })).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(9)
    expect(screen.getByText(NOTICE)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Störung melden' })).toBeTruthy()
  })

  it('renders the English form when the stored language is en', async () => {
    stubPublicApi()
    await i18n.changeLanguage('en')
    await openForm()

    expect(screen.getByRole('heading', { level: 2, name: 'Report a malfunction' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Detector fault' })).toBeTruthy()
    expect(
      screen.getByText(
        'For fire or danger: emergency call 112. This form is never an emergency call.',
      ),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Report malfunction' })).toBeTruthy()
  })

  it('shows the client rules before any request is answered', async () => {
    const bodies = stubPublicApi()
    await openForm()

    fireEvent.click(screen.getByRole('button', { name: 'Störung melden' }))

    expect(
      await screen.findByText('Bitte eine Störungsart auswählen oder die Störung beschreiben.'),
    ).toBeTruthy()
    expect(
      screen.getByText('Bitte eine Telefonnummer oder eine E-Mail-Adresse angeben.'),
    ).toBeTruthy()
    expect(bodies).toHaveLength(0)

    fireEvent.change(screen.getByRole('textbox', { name: 'Was ist zu sehen?' }), {
      target: { value: 'Brandmeldezentrale zeigt Störung' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Störung melden' }))

    // The description rule is satisfied, the contact rule still blocks the request.
    await waitFor(() =>
      expect(
        screen.queryByText('Bitte eine Störungsart auswählen oder die Störung beschreiben.'),
      ).toBeNull(),
    )
    expect(
      screen.getByText('Bitte eine Telefonnummer oder eine E-Mail-Adresse angeben.'),
    ).toBeTruthy()
    expect(bodies).toHaveLength(0)
  })

  it('sends the current token, the catalog keys and one client uuid, then confirms', async () => {
    const bodies = stubPublicApi()
    await openForm()

    fillReport(
      'Störung Melder',
      'Rauchmelder im 2. Obergeschoss blinkt.',
      '030 123456',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Störung melden' }))

    const body = await waitFor(() => {
      expect(bodies).toHaveLength(1)

      return bodies[0] as Record<string, unknown>
    })

    // The scanned token was retired: the body carries the current one of §7.3.
    expect(body.qrToken).toBe(CURRENT_TOKEN)
    expect(body.clientUuid).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.text).toBe('Rauchmelder im 2. Obergeschoss blinkt.')
    expect(body.faultTemplateKeys).toEqual(['bma.detector_fault'])
    expect(body.systemId).toBe(SYSTEM_ID)
    expect(body.contact).toEqual({ name: '', phone: '030 123456', email: '' })
    expect(body.locale).toBe('de')
    expect(body.photos).toEqual([])
    expect(new Date(String(body.reportedAt)).getTime()).not.toBeNaN()

    expect(await screen.findByText('Vorgangsnummer: ST-2026-0042')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Status dieser Meldung ansehen' })
    expect(link.getAttribute('href')).toBe(`/s/${REPORT.statusToken}`)
  })

  it('answers a server error with its code text and keeps the client uuid over a retry', async () => {
    const bodies: Record<string, unknown>[] = []
    let attempts = 0

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)

        if (path.includes('/public/qr/')) {
          return Response.json(RESOLVE)
        }

        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
        attempts += 1

        // The prefilled system is stale in this run: the server answers `422` once (§7.3.2).
        return attempts === 1
          ? Response.json({ code: 'system_not_found', params: {} }, { status: 422 })
          : Response.json(REPORT, { status: 201 })
      }),
    )

    await openForm()
    fillReport('Leitungsunterbrechung', 'Leitung im Keller gestört.', '030 123456')
    fireEvent.click(screen.getByRole('button', { name: 'Störung melden' }))

    expect(
      await screen.findByText('Die gewählte Anlage gehört nicht zu diesem Objekt.'),
    ).toBeTruthy()
    await waitFor(() => expect(bodies).toHaveLength(1))

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Störung melden' }))

    await waitFor(() => expect(bodies).toHaveLength(2))
    expect(bodies[0]?.clientUuid).toBe(bodies[1]?.clientUuid)
    expect(bodies[1]?.faultTemplateKeys).toEqual(['bma.line_interruption'])
    expect(bodies[1]?.systemId).toBeUndefined()
    expect(await screen.findByText('Vorgangsnummer: ST-2026-0042')).toBeTruthy()
  })

  it('rejects an unknown token and an invalid token without reporting anything', async () => {
    stubUnresolvedToken()
    const unresolved = renderForm()

    expect(
      await screen.findByText(
        'Dieser QR-Code gehört zu keinem aktiven Objekt. Bitte erneut scannen oder die Objektnummer dem Meldebuch nennen.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Störung melden' })).toBeNull()
    unresolved.unmount()

    vi.unstubAllGlobals()
    const fetchStub = vi.fn()
    vi.stubGlobal('fetch', fetchStub)
    renderForm('short')

    expect(
      await screen.findByText(
        'Dieser QR-Code ist ungültig. Bitte den Aufkleber des Objekts scannen.',
      ),
    ).toBeTruthy()
    // Only the catalog of §7.9 may be read; no report is sent for an invalid token.
    expect(
      fetchStub.mock.calls.filter((call) => String(call[0]).includes('/public/tickets')),
    ).toHaveLength(0)
  })

  it('sends the hidden honeypot of §7.6 with every report', async () => {
    const bodies = stubPublicApi()
    await openForm()

    const honeypot = document.querySelector('input[name="website"]')

    expect(honeypot).toBeTruthy()
    // The honeypot is invisible for a human: no label, no tab stop.
    expect(honeypot?.getAttribute('aria-hidden')).toBe('true')
    expect(honeypot?.getAttribute('tabindex')).toBe('-1')
    expect(screen.queryByRole('textbox', { name: 'website' })).toBeNull()

    fillReport('Leitungsunterbrechung', 'Leitung im Keller gestört.', '030 123456')
    fireEvent.click(screen.getByRole('button', { name: 'Störung melden' }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]?.website).toBe('')
    expect(bodies[0]?.verification).toBeUndefined()
  })

  it('solves the captcha only when the server asks for it and resends the proof', async () => {
    const bodies: Record<string, unknown>[] = []
    let attempts = 0

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)

        if (path.includes('/public/qr/')) {
          return Response.json(RESOLVE)
        }

        if (path.includes('/public/altcha/challenge')) {
          return Response.json(CHALLENGE)
        }

        if (path.includes('/public/tickets')) {
          bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
          attempts += 1

          // The first attempt looks like spam (§7.6), the second one carries the proof.
          return attempts === 1
            ? Response.json({ code: 'captcha_required', params: {} }, { status: 400 })
            : Response.json(REPORT, { status: 201 })
        }

        throw new Error(`unexpected request ${path}`)
      }),
    )

    await openForm()
    fillReport('Leitungsunterbrechung', 'Leitung im Keller gestört.', '030 123456')
    fireEvent.click(screen.getByRole('button', { name: 'Störung melden' }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]?.verification).toBeUndefined()

    // Only now the widget appears — a normal report never sees a captcha.
    expect(
      await screen.findByText('Spam-Schutz: Bitte bestätigen, dass Sie kein Roboter sind.'),
    ).toBeTruthy()

    const widget = document.querySelector('altcha-widget')

    expect(widget).toBeTruthy()
    expect(widget?.getAttribute('challenge')).toBe(JSON.stringify(CHALLENGE))

    widget?.dispatchEvent(
      new CustomEvent('verified', { detail: { payload: btoa(JSON.stringify(SOLVED)) } }),
    )

    await waitFor(() => expect(bodies).toHaveLength(2))
    expect(bodies[1]?.verification).toEqual({
      algorithm: 'SHA-256',
      challenge: CHALLENGE.challenge,
      salt: CHALLENGE.salt,
      signature: CHALLENGE.signature,
      number: SOLVED.number,
    })
    expect(await screen.findByText('Vorgangsnummer: ST-2026-0042')).toBeTruthy()
  })

  it('shows no duplicate hint when the object has no open ticket', async () => {
    stubPublicApi()
    await openForm()

    await waitFor(() =>
      expect(
        vi
          .mocked(globalThis.fetch)
          .mock.calls.some((call) => String(call[0]).includes('/public/tickets/open')),
      ).toBe(true),
    )
    expect(screen.queryByTestId('duplicate-hint')).toBeNull()
  })

  it('shows the duplicate hint and adds the text to the open ticket', async () => {
    const comments: Record<string, unknown>[] = []

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)

        if (path.includes('/public/qr/')) {
          return Response.json(RESOLVE)
        }

        if (path.includes('/public/tickets/open')) {
          return Response.json({ tickets: [OPEN_TICKET] })
        }

        if (path.includes('/comments')) {
          comments.push(JSON.parse(String(init?.body)) as Record<string, unknown>)

          return Response.json(
            { ticketNo: OPEN_TICKET.ticketNo, at: '2026-11-02T09:00:00.000Z' },
            { status: 201 },
          )
        }

        throw new Error(`unexpected request ${path}`)
      }),
    )

    await openForm()

    expect(await screen.findByTestId('duplicate-hint')).toBeTruthy()
    expect(screen.getByText(/ST-2026-0041/)).toBeTruthy()
    // The hint is a notice — the send button of the form stays the way to report.
    expect(screen.getByRole('button', { name: 'Störung melden' })).toBeTruthy()

    fillReport(
      'Störung Melder',
      'Die Störung besteht weiterhin.',
      '030 123456',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ergänzen' }))

    await waitFor(() => expect(comments).toHaveLength(1))
    expect(comments[0]?.qrToken).toBe(CURRENT_TOKEN)
    expect(comments[0]?.text).toBe('Die Störung besteht weiterhin.')
    expect(comments[0]?.faultTemplateKeys).toEqual(['bma.detector_fault'])
    expect(comments[0]?.locale).toBe('de')

    expect(await screen.findByTestId('duplicate-comment-done')).toBeTruthy()
    expect(
      screen.getByText('Ihre Ergänzung wurde der Meldung ST-2026-0041 hinzugefügt.'),
    ).toBeTruthy()
  })

  it('reports anyway and links the open ticket as the parent', async () => {
    const bodies = stubPublicApi(201, REPORT, [OPEN_TICKET])

    await openForm()
    expect(await screen.findByTestId('duplicate-hint')).toBeTruthy()

    fillReport('Störung Melder', 'Zweite Meldung.', '030 123456')
    fireEvent.click(screen.getByRole('button', { name: 'Trotzdem neu melden' }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    // §7.8.3: the new report points at the open ticket of the object.
    expect(bodies[0]?.parentTicketId).toBe(OPEN_TICKET.ticketId)
    expect(await screen.findByText('Vorgangsnummer: ST-2026-0042')).toBeTruthy()
  })
})
