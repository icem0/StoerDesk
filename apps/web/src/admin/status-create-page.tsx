import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type {
  TicketStatusCreateRequest,
  TicketStatusResponse,
} from '@stoerdesk/shared'

import { useMe, usePermission } from '../auth/usePermission'
import { apiFetch } from '../lib/api'
import { StatusForm } from './status-form'
import { AdminLayout } from '../components/admin-layout'

/**
 * The own page of the new status (WP-M14-166): the form does not lie below
 * the table of the statuses any more, the table offers a button that opens
 * this page.
 */

const jsonHeaders = { 'content-type': 'application/json' }

export function StatusCreatePage() {
  const { t } = useTranslation('settings')
  const me = useMe()
  const canWrite = usePermission('settings.write')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [saved, setSaved] = useState(false)

  const mutation = useMutation({
    mutationFn: (body: TicketStatusCreateRequest) =>
      apiFetch<TicketStatusResponse>('/v1/admin/statuses', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ticket-statuses'] })
      setSaved(true)
      navigate('/admin/statuses')
    },
  })

  if (me.isPending) {
    return <p>{t('admin.status.loading')}</p>
  }

  if (me.isError) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.status.sessionNotice')}
      </p>
    )
  }

  if (!canWrite) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.status.readOnly')}
      </p>
    )
  }

  return (
    <AdminLayout>
      <Link
        className="text-sm text-accent-300 underline-offset-2 hover:text-accent-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        to="/admin/statuses"
      >
        {t('admin.status.title')}
      </Link>
      {saved ? <p className="mt-2 text-sm text-emerald-300">{t('admin.status.saved')}</p> : null}
      <StatusForm status={null} canWrite onSave={(body) => void mutation.mutate(body as TicketStatusCreateRequest)} />
    </AdminLayout>
  )
}
