import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { EscalationConfig, EscalationStageConfig } from '@stoerdesk/shared'

import { usePermission } from '../auth/usePermission'
import { apiFetch } from '../lib/api'
import { AddStageForm } from './escalation-page'

/**
 * The own page of the new escalation stage (WP-M14-169): the form does not
 * lie below the list of the stages of the chain any more, the list offers a
 * button that opens this page. The server keeps the chain as a whole, so the
 * page reads the chain and writes it back with the new stage.
 */

const jsonHeaders = { 'content-type': 'application/json' }

export function EscalationStageCreatePage() {
  const { t } = useTranslation('settings')
  const canWrite = usePermission('settings.write')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const config = useQuery({
    queryKey: ['escalation-config'],
    queryFn: () => apiFetch<EscalationConfig>('/v1/escalation/config'),
    retry: false,
  })

  const save = useMutation({
    mutationFn: (stages: EscalationStageConfig[]) =>
      apiFetch<unknown>('/v1/escalation/stages', {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify({ stages }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['escalation-config'] })
      navigate('/admin/escalation')
    },
  })

  if (!canWrite) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.escalation.readOnly')}
      </p>
    )
  }

  if (config.isPending) {
    return <p className="text-slate-400">{t('admin.escalation.loading')}</p>
  }

  if (config.isError) {
    return (
      <p role="alert" className="text-sm text-rose-400">
        {t('admin.escalation.errors.unknown')}
      </p>
    )
  }

  const stages = config.data?.stages ?? []

  return (
    <main className="min-h-dvh bg-slate-950 p-6 text-slate-100">
      <Link
        className="text-sm text-accent-300 underline-offset-2 hover:text-accent-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        to="/admin/escalation"
      >
        {t('admin.escalation.title')}
      </Link>
      {save.isError ? (
        <p role="alert" className="mt-2 text-sm text-rose-400">
          {t('admin.escalation.errors.stageChainInvalid')}
        </p>
      ) : null}
      <AddStageForm stages={stages} onAdd={(stage) => void save.mutate([...stages, stage])} />
    </main>
  )
}
