import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type {
  GroupListResponse,
  GroupMember,
  GroupMemberListResponse,
  GroupMembership,
  GroupSummary,
  UserListResponse,
} from '@stoerdesk/shared'

import { useMe, usePermission } from '../auth/usePermission'
import { ApiError, apiFetch } from '../lib/api'
import { errorMessage, jsonHeaders } from './group-form-parts'

interface GroupFormValues {
  name: string
}

const memberErrorCodes = [
  'user_not_found',
  'membership_exists',
  'membership_not_found',
] as const

function memberErrorMessage(t: TFunction<'settings'>, error: unknown): string {
  if (
    error instanceof ApiError &&
    error.code !== undefined &&
    (memberErrorCodes as readonly string[]).includes(error.code)
  ) {
    return t(`admin.groups.errors.${error.code}`)
  }

  return errorMessage(t, error)
}

function displayName(user: GroupMember | { givenName: string; familyName: string; email: string }) {
  const name = `${user.givenName} ${user.familyName}`.trim()

  return name === '' ? user.email : name
}

function useGroups() {
  return useQuery({
    queryKey: ['groups'],
    queryFn: () => apiFetch<GroupListResponse>('/v1/groups'),
    retry: false,
  })
}

function useMemberList(groupId: string) {
  return useQuery({
    queryKey: ['groups', groupId, 'members'],
    queryFn: () => apiFetch<GroupMemberListResponse>(`/v1/groups/${groupId}/members`),
    retry: false,
  })
}

function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<UserListResponse>('/v1/users'),
    retry: false,
  })
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
          onChange={(event) => setValues({ ...values, name: event.target.value })}
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

function MemberPanel({ group }: { group: GroupSummary }) {
  const { t } = useTranslation('settings')
  const queryClient = useQueryClient()
  const members = useMemberList(group.id)
  const users = useUsers()
  const [selected, setSelected] = useState<string[]>([])

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['groups'] })
    void queryClient.invalidateQueries({ queryKey: ['groups', group.id, 'members'] })
  }

  const addition = useMutation({
    mutationFn: async (userIds: string[]) => {
      for (const userId of userIds) {
        await apiFetch<GroupMembership>(`/v1/groups/${group.id}/members`, {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({ userId }),
        })
      }
    },
    onSuccess: () => {
      setSelected([])
      invalidate()
    },
  })

  const removal = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/v1/groups/${group.id}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })

  const memberIds = new Set((members.data?.members ?? []).map((member) => member.userId))
  const candidates = (users.data?.users ?? []).filter((user) => !memberIds.has(user.id))
  const error = addition.error ?? removal.error ?? members.error ?? users.error

  return (
    <section className="mt-4 flex flex-col gap-3 rounded border border-slate-700 bg-slate-900 p-4">
      <h2 className="text-lg font-semibold">
        {t('admin.groups.members.title', { name: group.name })}
      </h2>
      {members.isPending ? <p>{t('admin.groups.members.loading')}</p> : null}
      {members.data !== undefined ? (
        <>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th>{t('admin.groups.members.name')}</th>
                <th>{t('admin.groups.members.email')}</th>
                <th>{t('admin.groups.members.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {members.data.members.map((member) => (
                <tr key={member.userId} className="border-b border-slate-800">
                  <td>{displayName(member)}</td>
                  <td>{member.email}</td>
                  <td>
                    <button
                      className="rounded border border-red-700 px-2 py-1 text-xs text-red-300 disabled:opacity-50"
                      type="button"
                      disabled={removal.isPending}
                      onClick={() => removal.mutate(member.userId)}
                    >
                      {t('admin.groups.members.remove')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {members.data.members.length === 0 ? <p>{t('admin.groups.members.empty')}</p> : null}
        </>
      ) : null}
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          addition.mutate(selected)
        }}
      >
        <h3 className="font-medium">{t('admin.groups.members.addTitle')}</h3>
        {candidates.length === 0 ? (
          <p className="text-sm text-slate-400">{t('admin.groups.members.noCandidates')}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {candidates.map((user) => (
              <li key={user.id}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    value={user.id}
                    checked={selected.includes(user.id)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, user.id]
                          : current.filter((id) => id !== user.id),
                      )
                    }
                  />
                  {displayName(user)}
                </label>
              </li>
            ))}
          </ul>
        )}
        {error ? (
          <p role="alert" className="text-sm text-red-400">
            {memberErrorMessage(t, error)}
          </p>
        ) : null}
        <button
          className="self-start rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
          type="submit"
          disabled={selected.length === 0 || addition.isPending}
        >
          {t('admin.groups.members.add')}
        </button>
      </form>
    </section>
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
      {canWrite ? (
        <Link
          className="mt-4 inline-block rounded bg-sky-700 px-4 py-2 font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          to="/admin/groups/new"
        >
          {t('admin.groups.createTitle')}
        </Link>
      ) : null}
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
      {canWrite && editingGroup ? (
        <>
          <EditGroupForm group={editingGroup} />
          <MemberPanel group={editingGroup} />
        </>
      ) : null}
    </main>
  )
}
