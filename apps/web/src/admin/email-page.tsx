import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import type {
  ChannelConfigurationListResponse,
  ChannelTestResponse,
  NotificationDeliveryListResponse,
} from '@stoerdesk/shared'
import { ApiError, apiFetch } from '../lib/api'
import { usePermission } from '../auth/usePermission'
import { AdminLayout } from '../components/admin-layout'

/**
 * The mailbox of the instance (`specs/10-notifications.md` §11.5a, §11.12,
 * ADR-0046): the administration of the e-mail channel.
 *
 * The page holds the SMTP connection, the sender with its display name, the
 * templates of the messages, the test mail to an address and the log of the
 * last deliveries. The configuration lives in the row of the channel — the
 * row wins over the environment (§11.2) — and the page reads and writes it
 * over the channel administration of §11.11.
 *
 * The body of every mail is HTML with the ticket link (§11.5); the templates
 * are plain texts with the placeholders of §11.5a, the server renders them.
 */

const jsonHeaders = { 'content-type': 'application/json' }

interface MailConfig {
  host: string
  port: string
  secure: string
  user: string
  from: string
  displayName: string
  templates: {
    ticket: string
    readiness: string
    test: string
    registration: string
    passwordReset: string
    customerTicket: string
  }
}

/** The empty configuration of the mailbox. */
const emptyConfig: MailConfig = {
  host: '',
  port: '587',
  secure: 'false',
  user: '',
  from: '',
  displayName: '',
  templates: {
    ticket: '',
    readiness: '',
    test: '',
    registration: '',
    passwordReset: '',
    customerTicket: '',
  },
}

/** The configuration of the e-mail channel out of the answer of the channels. */
function configOf(channels: ChannelConfigurationListResponse['channels']): MailConfig {
  const channel = channels.find((entry) => entry.kind === 'email')

  if (channel === undefined) {
    return emptyConfig
  }

  return {
    host: channel.config.host ?? '',
    port: channel.config.port ?? '587',
    secure: channel.config.secure ?? 'false',
    user: channel.config.user ?? '',
    from: channel.config.from ?? '',
    displayName: channel.config.displayName ?? '',
    templates: {
      ticket: channel.config.templateTicket ?? '',
      readiness: channel.config.templateReadiness ?? '',
      test: channel.config.templateTest ?? '',
      registration: channel.config.templateRegistration ?? '',
      passwordReset: channel.config.templatePasswordReset ?? '',
      customerTicket: channel.config.templateCustomerTicket ?? '',
    },
  }
}

export function EmailPage() {
  const { t } = useTranslation('common')
  const { t: st } = useTranslation('settings')
  const queryClient = useQueryClient()
  const mayRead = usePermission('notification.read')
  const mayWrite = usePermission('notification.write')

  const channels = useQuery({
    queryKey: ['admin-channels'],
    queryFn: () => apiFetch<ChannelConfigurationListResponse>('/v1/admin/channels'),
    retry: false,
    enabled: mayRead,
  })

  /** The log of the last deliveries of the mailbox (ADR-0046, §11.8). */
  const deliveries = useQuery({
    queryKey: ['mailDeliveries'],
    queryFn: () =>
      apiFetch<NotificationDeliveryListResponse>(
        '/v1/admin/notifications/deliveries?channel=email',
      ),
    enabled: mayRead,
    retry: false,
  })

  const [values, setValues] = useState<MailConfig | null>(null)
  const [testAddress, setTestAddress] = useState('')

  const config = values ?? configOf(channels.data?.channels ?? [])

  const save = useMutation({
    mutationFn: (config: MailConfig) =>
      apiFetch<{ kind: string }>('/v1/admin/channels/email', {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({
          enabled: true,
          config: {
            host: config.host,
            port: config.port,
            secure: config.secure,
            user: config.user,
            from: config.from,
            displayName: config.displayName,
            templateTicket: config.templates.ticket,
            templateReadiness: config.templates.readiness,
            templateTest: config.templates.test,
            templateRegistration: config.templates.registration,
            templatePasswordReset: config.templates.passwordReset,
            templateCustomerTicket: config.templates.customerTicket,
          },
        }),
      }),
    onSuccess: () => {
      setValues(null)
      void queryClient.invalidateQueries({ queryKey: ['admin-channels'] })
    },
  })

  const sendTest = useMutation({
    mutationFn: (address: string) =>
      apiFetch<ChannelTestResponse>('/v1/admin/channels/email/test', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ address }),
      }),
  })

  function update(field: keyof MailConfig, value: string): void {
    setValues({ ...config, [field]: value })
  }

  function updateTemplate(field: keyof MailConfig['templates'], value: string): void {
    setValues({ ...config, templates: { ...config.templates, [field]: value } })
  }

  return (
    <AdminLayout>
      <Link
        className="mt-6 inline-block rounded bg-slate-800 px-3 py-2 text-sm transition-colors hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        to="/settings"
      >
        {t('branding.back')}
      </Link>

      <div className="mt-2 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{st('admin.email.title')}</h1>
        <p className="text-sm text-slate-400">{st('admin.email.hint')}</p>
        <Link
          className="mt-1 inline-block text-xs text-sky-300 underline hover:text-sky-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          to="/admin/channels"
        >
          {st('admin.email.channelsLink')}
        </Link>
      </div>

      {!mayRead ? (
        <p className="mt-6 text-sm text-amber-400">{st('admin.email.forbidden')}</p>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          <section className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
            <h2 className="text-lg font-semibold">{st('admin.email.connection')}</h2>

            <label className="flex flex-col gap-1 text-sm" htmlFor="email-host">
              {st('admin.channels.fields.host')}
              <input
                className="rounded bg-slate-950 p-2"
                disabled={!mayWrite}
                id="email-host"
                onChange={(event) => update('host', event.target.value)}
                value={config.host}
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1 text-sm" htmlFor="email-port">
                {st('admin.channels.fields.port')}
                <input
                  className="rounded bg-slate-950 p-2"
                  disabled={!mayWrite}
                  id="email-port"
                  onChange={(event) => update('port', event.target.value)}
                  value={config.port}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm" htmlFor="email-secure">
                {st('admin.channels.fields.secure')}
                <input
                  className="rounded bg-slate-950 p-2"
                  disabled={!mayWrite}
                  id="email-secure"
                  onChange={(event) => update('secure', event.target.value)}
                  value={config.secure}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm" htmlFor="email-user">
                {st('admin.channels.fields.user')}
                <input
                  className="rounded bg-slate-950 p-2"
                  disabled={!mayWrite}
                  id="email-user"
                  onChange={(event) => update('user', event.target.value)}
                  value={config.user}
                />
              </label>
            </div>

            <label className="flex flex-col gap-1 text-sm" htmlFor="email-password">
              {st('admin.channels.secret')}
              <input
                autoComplete="new-password"
                className="rounded bg-slate-950 p-2"
                disabled={!mayWrite}
                id="email-password"
                placeholder={st('admin.channels.secretUnset')}
                type="password"
              />
            </label>
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
            <h2 className="text-lg font-semibold">{st('admin.email.sender')}</h2>

            <label className="flex flex-col gap-1 text-sm" htmlFor="email-from">
              {st('admin.channels.fields.from')}
              <input
                className="rounded bg-slate-950 p-2"
                disabled={!mayWrite}
                id="email-from"
                onChange={(event) => update('from', event.target.value)}
                value={config.from}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm" htmlFor="email-display-name">
              {st('admin.email.displayName')}
              <input
                className="rounded bg-slate-950 p-2"
                disabled={!mayWrite}
                id="email-display-name"
                onChange={(event) => update('displayName', event.target.value)}
                value={config.displayName}
              />
            </label>
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
            <h2 className="text-lg font-semibold">{st('admin.email.templates')}</h2>
            <p className="text-sm text-slate-300">{st('admin.email.templatesHint')}</p>

            <button
              className="min-h-9 self-start rounded bg-slate-800 px-2 text-xs font-medium text-slate-300 hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-50"
              disabled={!mayWrite}
              onClick={() => updateTemplate('ticket', st('admin.email.standardTicket'))}
              type="button"
            >
              {st('admin.email.standardReset')}
            </button>

            <label className="flex flex-col gap-1 text-sm" htmlFor="email-template-ticket">
              {st('admin.email.templateTicket')}
              <textarea
                className="min-h-24 rounded bg-slate-950 p-2 font-mono text-xs"
                disabled={!mayWrite}
                id="email-template-ticket"
                onChange={(event) => updateTemplate('ticket', event.target.value)}
                value={config.templates.ticket}
              />
            </label>

            <button
              className="min-h-9 self-start rounded bg-slate-800 px-2 text-xs font-medium text-slate-300 hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-50"
              disabled={!mayWrite}
              onClick={() => updateTemplate('readiness', st('admin.email.standardReadiness'))}
              type="button"
            >
              {st('admin.email.standardReset')}
            </button>

            <label className="flex flex-col gap-1 text-sm" htmlFor="email-template-readiness">
              {st('admin.email.templateReadiness')}
              <textarea
                className="min-h-24 rounded bg-slate-950 p-2 font-mono text-xs"
                disabled={!mayWrite}
                id="email-template-readiness"
                onChange={(event) => updateTemplate('readiness', event.target.value)}
                value={config.templates.readiness}
              />
            </label>

            <button
              className="min-h-9 self-start rounded bg-slate-800 px-2 text-xs font-medium text-slate-300 hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-50"
              disabled={!mayWrite}
              onClick={() => updateTemplate('test', st('admin.email.standardTest'))}
              type="button"
            >
              {st('admin.email.standardReset')}
            </button>

            <label className="flex flex-col gap-1 text-sm" htmlFor="email-template-test">
              {st('admin.email.templateTest')}
              <textarea
                className="min-h-24 rounded bg-slate-950 p-2 font-mono text-xs"
                disabled={!mayWrite}
                id="email-template-test"
                onChange={(event) => updateTemplate('test', event.target.value)}
                value={config.templates.test}
              />
            </label>

            <button
              className="min-h-9 self-start rounded bg-slate-800 px-2 text-xs font-medium text-slate-300 hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-50"
              disabled={!mayWrite}
              onClick={() => updateTemplate('registration', st('admin.email.standardRegistration'))}
              type="button"
            >
              {st('admin.email.standardReset')}
            </button>

            <label className="flex flex-col gap-1 text-sm" htmlFor="email-template-registration">
              {st('admin.email.templateRegistration')}
              <textarea
                className="min-h-24 rounded bg-slate-950 p-2 font-mono text-xs"
                disabled={!mayWrite}
                id="email-template-registration"
                onChange={(event) => updateTemplate('registration', event.target.value)}
                value={config.templates.registration}
              />
            </label>

            <button
              className="min-h-9 self-start rounded bg-slate-800 px-2 text-xs font-medium text-slate-300 hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-50"
              disabled={!mayWrite}
              onClick={() => updateTemplate('passwordReset', st('admin.email.standardPasswordReset'))}
              type="button"
            >
              {st('admin.email.standardReset')}
            </button>

            <label className="flex flex-col gap-1 text-sm" htmlFor="email-template-password-reset">
              {st('admin.email.templatePasswordReset')}
              <textarea
                className="min-h-24 rounded bg-slate-950 p-2 font-mono text-xs"
                disabled={!mayWrite}
                id="email-template-password-reset"
                onChange={(event) => updateTemplate('passwordReset', event.target.value)}
                value={config.templates.passwordReset}
              />
            </label>

            <button
              className="min-h-9 self-start rounded bg-slate-800 px-2 text-xs font-medium text-slate-300 hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-50"
              disabled={!mayWrite}
              onClick={() => updateTemplate('customerTicket', st('admin.email.standardCustomerTicket'))}
              type="button"
            >
              {st('admin.email.standardReset')}
            </button>

            <label className="flex flex-col gap-1 text-sm" htmlFor="email-template-customer-ticket">
              {st('admin.email.templateCustomerTicket')}
              <textarea
                className="min-h-24 rounded bg-slate-950 p-2 font-mono text-xs"
                disabled={!mayWrite}
                id="email-template-customer-ticket"
                onChange={(event) => updateTemplate('customerTicket', event.target.value)}
                value={config.templates.customerTicket}
              />
            </label>
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
            <h2 className="text-lg font-semibold">{st('admin.email.test')}</h2>

            <label className="flex flex-col gap-1 text-sm" htmlFor="email-test-address">
              {st('admin.email.testAddress')}
              <input
                className="rounded bg-slate-950 p-2"
                disabled={!mayWrite}
                id="email-test-address"
                onChange={(event) => setTestAddress(event.target.value)}
                type="email"
                value={testAddress}
              />
            </label>

            <button
              className="min-h-11 self-start rounded bg-sky-700 px-4 font-medium text-white disabled:opacity-50"
              disabled={!mayWrite || sendTest.isPending || testAddress.trim() === ''}
              onClick={() => sendTest.mutate(testAddress.trim())}
              type="button"
            >
              {st('admin.channels.test')}
            </button>

            {sendTest.isSuccess ? (
              <p
                className={`text-sm ${sendTest.data?.delivered ? 'text-emerald-400' : 'text-rose-400'}`}
                role="status"
              >
                {sendTest.data?.delivered
                  ? st('admin.channels.testDelivered')
                  : st('admin.channels.testFailed', { reason: sendTest.data?.code ?? 'unknown' })}
              </p>
            ) : null}

            {sendTest.isError ? (
              <p className="text-sm text-rose-400" role="alert">
                {sendTest.error instanceof ApiError ? sendTest.error.code : 'unknown'}
              </p>
            ) : null}
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
            <h2 className="text-lg font-semibold">{st('admin.email.log')}</h2>

            {(deliveries.data?.deliveries ?? []).length === 0 ? (
              <p className="text-sm text-slate-400">{st('admin.email.logEmpty')}</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {(deliveries.data?.deliveries ?? []).map((delivery) => (
                  <li className="flex flex-wrap items-center gap-3" key={delivery.id}>
                    <span className="text-slate-400">
                      {new Date(delivery.sentAt).toLocaleString('de-DE')}
                    </span>
                    <span>{delivery.eventType}</span>
                    <span className="text-slate-400">{delivery.recipient}</span>
                    <span
                      className={delivery.state === 'SENT' ? 'text-emerald-400' : 'text-rose-400'}
                    >
                      {delivery.state}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="flex items-center gap-3">
            <button
              className="min-h-11 rounded bg-sky-700 px-4 font-medium text-white disabled:opacity-50"
              disabled={!mayWrite || save.isPending}
              onClick={() => save.mutate(config)}
              type="button"
            >
              {st('admin.email.save')}
            </button>

            {save.isSuccess ? (
              <p className="text-sm text-emerald-400">{st('admin.email.saved')}</p>
            ) : null}

            {save.isError ? (
              <p className="text-sm text-rose-400" role="alert">
                {st('admin.email.saveFailed')}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
