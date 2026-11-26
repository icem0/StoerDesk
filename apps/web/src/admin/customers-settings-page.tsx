import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Link } from 'react-router-dom'
import type { CustomerPortalSettings, UpdateCustomerPortalSettingsRequest } from '@stoerdesk/shared'

import { usePermission } from '../auth/usePermission'
import { ApiError, apiFetch } from '../lib/api'

/**
 * The switch of the customer portal (`specs/19-customer-portal.md` §19.13,
 * ADR-0062).
 *
 * The administration decides whether the instance has a customer portal at all
 * and whether a customer may register himself. Both switches are **off by
 * default** — an installation that does not want a customer portal keeps none.
 *
 * The registration needs a **cleanly set up mailbox**: the channel of the
 * instance must exist, be enabled, carry a host and a valid sender address and
 * a complete login. The switch of the registration stays disabled while the
 * mailbox is broken, and the server refuses it as well (`422 mail_not_ready`) —
 * a mailbox that cannot deliver cannot confirm an account.
 */

const jsonHeaders = { 'content-type': 'application/json' }
const handledErrorCodes = [
  'session_invalid',
  'forbidden',
  'invalid_request',
  'mail_not_ready',
] as const

function errorMessage(t: TFunction<'settings'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`admin.customers.errors.${code}`)
}

export function CustomersSettingsPage() {
  const { t } = useTranslation('settings')
  const mayRead = usePermission('settings.read')
  const mayWrite = usePermission('settings.write')
  const queryClient = useQueryClient()

  const [saved, setSaved] = useState(false)

  const query = useQuery({
    queryKey: ['customer-portal-settings'],
    queryFn: () => apiFetch<CustomerPortalSettings>('/v1/settings/customers'),
    enabled: mayRead,
    retry: false,
  })

  const mutation = useMutation({
    mutationFn: (body: UpdateCustomerPortalSettingsRequest) =>
      apiFetch<CustomerPortalSettings>('/v1/settings/customers', {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customer-portal-settings'] })
      void queryClient.invalidateQueries({ queryKey: ['customer', 'registration'] })
      setSaved(true)
    },
  })

  const settings = query.data
  const mailReady = settings?.mailReady === true

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{t('admin.customers.title')}</h1>
        <p className="text-sm text-slate-400">{t('admin.customers.hint')}</p>
      </div>

      <Link className="text-sm text-sky-300 underline" to="/settings">
        {t('admin.back')}
      </Link>

      {!mayWrite ? (
        <p className="rounded-lg bg-slate-800/60 px-3 py-2 text-sm text-slate-300">
          {t('admin.customers.readOnly')}
        </p>
      ) : null}

      {!mayRead ? (
        <p className="text-sm text-rose-400" role="alert">
          {t('admin.customers.errors.forbidden')}
        </p>
      ) : query.isPending ? (
        <p className="text-sm text-slate-400">{t('admin.customers.loading')}</p>
      ) : query.isError ? (
        <p className="text-sm text-rose-400" role="alert">
          {t('admin.customers.errors.unknown')}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              checked={settings?.portalEnabled === true}
              disabled={!mayWrite}
              type="checkbox"
              onChange={(event) => {
                setSaved(false)
                mutation.mutate({ portalEnabled: event.target.checked })
              }}
            />
            {t('admin.customers.portalEnabled')}
          </label>
          <p className="text-xs text-slate-400">{t('admin.customers.portalEnabledHint')}</p>

          <label className="flex items-center gap-2 text-sm">
            <input
              checked={settings?.registrationEnabled === true}
              disabled={!mayWrite || !mailReady}
              type="checkbox"
              onChange={(event) => {
                setSaved(false)
                mutation.mutate({ registrationEnabled: event.target.checked })
              }}
            />
            {t('admin.customers.registrationEnabled')}
          </label>
          <p className="text-xs text-slate-400">{t('admin.customers.registrationEnabledHint')}</p>

          <div className="rounded-lg border border-slate-700 p-3">
            <p className="text-sm">
              {mailReady ? t('admin.customers.mailReady') : t('admin.customers.mailNotReady')}
            </p>
            {!mailReady ? (
              <>
                <ul className="mt-2 flex flex-col gap-1 text-xs text-amber-300">
                  {(settings?.mailReasons ?? []).map((reason) => (
                    <li key={reason}>{t(`admin.customers.mailReasons.${reason}`)}</li>
                  ))}
                </ul>
                <Link className="text-sm text-sky-300 underline" to="/admin/email">
                  {t('admin.customers.mailboxLink')}
                </Link>
              </>
            ) : null}
          </div>

          {saved ? <p className="text-sm text-emerald-400">{t('admin.customers.saved')}</p> : null}

          {mutation.isError ? (
            <p className="text-sm text-rose-400" role="alert">
              {errorMessage(t, mutation.error)}
            </p>
          ) : null}
        </div>
      )}
    </section>
  )
}
