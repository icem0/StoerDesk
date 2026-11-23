import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { GroupListResponse, OnCallPool } from '@stoerdesk/shared'

import { useMe, usePermission } from '../auth/usePermission'
import { apiFetch } from '../lib/api'

/**
 * The own page of the new readiness pool (WP-M14-168): the form does not lie
 * below the list of the pools any more, the list offers a button that opens
 * this page.
 */

const jsonHeaders = { 'content-type': 'application/json' }

export function OncallPoolCreatePage() {
  const { t } = useTranslation('oncall')
  const me = useMe()
  const mayAdmin = usePermission('oncall.admin')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [groupId, setGroupId] = useState('')

  const groups = useQuery({
    queryKey: ['groups'],
    queryFn: () => apiFetch<GroupListResponse>('/v1/groups'),
    retry: false,
    enabled: mayAdmin,
  })

  const create = useMutation({
    mutationFn: () =>
      apiFetch<OnCallPool>('/v1/oncall/pools', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ name, groupId: groupId === '' ? null : groupId }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['oncall', 'pools'] })
      void queryClient.invalidateQueries({ queryKey: ['oncall', 'settings'] })
      navigate('/admin/oncall')
    },
  })

  if (me.isPending) {
    return <p>{t('admin.loading')}</p>
  }

  if (me.isError) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.sessionNotice')}
      </p>
    )
  }

  if (!mayAdmin) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.forbiddenNotice')}
      </p>
    )
  }

  return (
    <main className="min-h-dvh bg-slate-950 p-6 text-slate-100">
      <Link
        className="text-sm text-accent-300 underline-offset-2 hover:text-accent-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        to="/admin/oncall"
      >
        {t('admin.pools.title')}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{t('admin.pools.createTitle')}</h1>
      <form
        className="mt-4 flex max-w-xl flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          create.mutate()
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          {t('admin.pools.name')}
          <input
            className="rounded bg-slate-950 p-2 text-slate-100"
            maxLength={100}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('admin.pools.group')}
          <select
            className="rounded bg-slate-950 p-2 text-slate-100"
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
          >
            <option value="">{t('admin.pools.noGroup')}</option>
            {(groups.data?.groups ?? []).map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="rounded bg-accent-600 px-4 py-2 font-medium text-white hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50"
          type="submit"
          disabled={create.isPending || name.trim() === ''}
        >
          {t('admin.pools.create')}
        </button>
      </form>
    </main>
  )
}
