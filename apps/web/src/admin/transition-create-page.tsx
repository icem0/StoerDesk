import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TicketTransition } from '@stoerdesk/shared'

import { useMe, usePermission } from '../auth/usePermission'
import { apiFetch } from '../lib/api'
import { TransitionForm, errorMessage, type TransitionWriteBody } from './transition-page'

/**
 * The own page of the new workflow step (WP-M14-167): the form does not lie
 * below the table of the steps any more, the table offers a button that opens
 * this page.
 */

const jsonHeaders = { 'content-type': 'application/json' }

export function TransitionCreatePage() {
  const { t } = useTranslation('settings')
  const me = useMe()
  const canWrite = usePermission('settings.write')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [saved, setSaved] = useState(false)

  const mutation = useMutation({
    mutationFn: (body: TransitionWriteBody) =>
      apiFetch<TicketTransition>('/v1/admin/transitions', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ticket-transitions'] })
      setSaved(true)
      navigate('/admin/transitions')
    },
  })

  if (me.isPending) {
    return <p>{t('admin.transition.loading')}</p>
  }

  if (me.isError) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.transition.sessionNotice')}
      </p>
    )
  }

  if (!canWrite) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.transition.readOnly')}
      </p>
    )
  }

  return (
    <main className="min-h-dvh bg-slate-950 p-6 text-slate-100">
      <Link
        className="text-sm text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        to="/admin/transitions"
      >
        {t('admin.transition.title')}
      </Link>
      {saved ? <p className="mt-2 text-sm text-emerald-300">{t('admin.transition.saved')}</p> : null}
      {mutation.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errorMessage(t, mutation.error)}
        </p>
      ) : null}
      <TransitionForm
        transition={null}
        canWrite
        onSave={(body) => void mutation.mutate(body)}
      />
    </main>
  )
}
