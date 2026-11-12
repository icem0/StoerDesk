import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { TFunction } from 'i18next'
import type {
  CreateGroupRequest,
  GroupListResponse,
  GroupSummary,
} from '@stoerdesk/shared'

import { useMe, usePermission } from '../auth/usePermission'
import { ApiError, apiFetch } from '../lib/api'

interface GroupFormValues {
  name: string
}

const handledErrorCodes = [
  'session_invalid',
  'forbidden',
  'invalid_request',
  'group_not_found',
  'group_name_taken',
  'group_in_use',
] as const

const jsonHeaders = { 'content-type': 'application/json' }

function errorMessage(t: TFunction<'settings'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`admin.groups.errors.${code}`)
}

function useGroups() {
  return useQuery({
    queryKey: ['groups'],
    queryFn: () => apiFetch<GroupListResponse>('/v1/groups'),
    retry: false,
  })
}

function toggleName(values: GroupFormValues, name: string): GroupFormValues {
  return { ...values, name }
}

function CreateGroupForm() {
  const { t } = useTranslation('settings')
  const queryClient = useQueryClient()
  const [values, setValues] = useState<GroupFormValues>({ name: '' })

  const mutation = useMutation({
    mutationFn: (body: CreateGroupRequest) =>
      apiFetch<GroupSummary>('/v1/groups', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] })
      setValues({ name: '' })
    },
  })

  return (
    <form
      className="mt-6 flex flex-col gap-3 border-t border-slate-800 pt-4"
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate({ name: values.name })
      }}
    >
      <h2 className="text-lg font-semibold">{t('admin.groups.createTitle')}</h2>
      <label className="flex flex-col gap-1 text-sm">
        {t('admin.groups.fields.name')}
        <input
          className="rounded bg-slate-900 p-2 text-slate-100"
          type="text"
          required
          maxLength={120}
          value={values.name}
          onChange={(event) => setValues(toggleName(values, event.target.value))}
        />
      </label>
      {mutation.isError ? (
        <p role="alert" className="text-sm text-red-400">
          {errorMessage(t, mutation.error)}
        </p>
      ) : null}
      <button
        className="self-start rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
        type="submit"
        disabled={mutation.isPending}
      >
        {t('admin.groups.create')}
      </button>
    </form>
  )
}

function EditGroupForm({ group }: { group: GroupSummary }) {
  const { t } = useTranslation('settings')
  const queryClient = useQueryClient()
  const [values, setValues] = useState<GroupFormValues>({ name: group.name })

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<GroupSummary>(`/v1/groups/${group.id}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ name: values.name }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
  })

  const deletion = useMutation({
    mutationFn: () => apiFetch(`/v1/groups/${group.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
  })

  return (
    <form
      className="mt-4 flex flex-col gap-3 rounded border border-slate-700 bg-slate-900 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate()
      }}
    >
      <h2 className="text-lg font-semibold">{t('admin.groups.editTitle', { name: group.name })}</h2>
      <label className="flex flex-col gap-1 text-sm">
        {t('admin.groups.fields.name')}
        <input
          className="rounded bg-slate-950 p-2 text-slate-100"
          type="text"
          required
          maxLength={120}
          value={values.name}
          onChange={(event) => setValues(toggleName(values, event.target.value))}
        />
      </label>
      {mutation.isError || deletion.isError ? (
        <p role="alert" className="text-sm text-red-400">
          {errorMessage(t, mutation.isError ? mutation.error : deletion.error)}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          className="rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
          type="submit"
          disabled={mutation.isPending}
        >
          {t('admin.groups.save')}
        </button>
        <button
          className="rounded border border-red-700 px-4 py-2 font-medium text-red-300 disabled:opacity-50"
          type="button"
          disabled={deletion.isPending}
          onClick={() => deletion.mutate()}
        >
          {t('admin.groups.delete')}
        </button>
      </div>
    </form>
  )
}

export function GroupsPage() {
  const { t } = useTranslation('settings')
  const me = useMe()
  const canRead = usePermission('user.read')
  const canWrite = usePermission('user.write')
  const [editingGroup, setEditingGroup] = useState<GroupSummary | null>(null)

  const groups = useGroups()

  if (me.isPending) {
    return <p>{t('admin.groups.loading')}</p>
  }

  if (me.isError) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.groups.sessionNotice')}
      </p>
    )
  }

  if (!canRead) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.groups.forbiddenNotice')}
      </p>
    )
  }

  return (
    <main className="min-h-dvh bg-slate-950 p-6 text-slate-100">
      <Link
        className="text-sm text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        to="/settings"
      >
        {t('admin.back')}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{t('admin.groups.title')}</h1>
      {groups.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errorMessage(t, groups.error)}
        </p>
      ) : null}
      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-700 text-slate-400">
            <th>{t('admin.groups.table.name')}</th>
            <th>{t('admin.groups.table.users')}</th>
            {canWrite ? <th>{t('admin.groups.table.actions')}</th> : null}
          </tr>
        </thead>
        <tbody>
          {(groups.data?.groups ?? []).map((group) => (
            <tr key={group.id} className="border-b border-slate-800">
              <td>{group.name}</td>
              <td>{group.userCount}</td>
              {canWrite ? (
                <td>
                  <button
                    className="rounded border border-slate-600 px-2 py-1 text-xs"
                    type="button"
                    onClick={() => setEditingGroup(editingGroup?.id === group.id ? null : group)}
                  >
                    {t('admin.groups.edit')}
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      {canWrite && editingGroup ? <EditGroupForm group={editingGroup} /> : null}
      {canWrite ? <CreateGroupForm /> : null}
    </main>
  )
}
