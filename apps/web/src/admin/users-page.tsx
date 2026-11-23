import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type {
  GroupListResponse,
  GroupMemberListResponse,
  ResetPasswordResponse,
  UserListResponse,
  UserSummary,
} from '@stoerdesk/shared'

import { useMe, usePermission } from '../auth/usePermission'
import { apiFetch } from '../lib/api'
import {
  RoleCheckboxes,
  errorMessage,
  jsonHeaders,
  useRoles,
  type UserFormValues,
  type UserLocale,
  type UserTheme,
} from './user-form-parts'

function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<UserListResponse>('/v1/users'),
    retry: false,
  })
}

/**
 * The group names of every user (WP-M4-15c). Membership is only readable from
 * the group side, so the query reads the groups and then the member list of
 * every group and turns the rows into a map `userId -> group names`.
 */
function useMemberships() {
  return useQuery({
    queryKey: ['memberships'],
    queryFn: async () => {
      const groups = await apiFetch<GroupListResponse>('/v1/groups')
      const memberLists = await Promise.all(
        groups.groups.map(async (group) => ({
          name: group.name,
          response: await apiFetch<GroupMemberListResponse>(`/v1/groups/${group.id}/members`),
        })),
      )

      const memberships: Record<string, string[]> = {}

      for (const group of memberLists) {
        for (const member of group.response.members) {
          memberships[member.userId] = [...(memberships[member.userId] ?? []), group.name]
        }
      }

      for (const names of Object.values(memberships)) {
        names.sort((left, right) => left.localeCompare(right))
      }

      return memberships
    },
    retry: false,
  })
}

/**
 * The panel of the one-time password (`specs/01-rbac.md` §3.9, ADR-0031): the
 * server answers the plaintext once, so the administration copies it into the
 * clipboard and hands it over. The colleague replaces it with a password of
 * their own at the first login.
 */
function TemporaryPasswordPanel(props: {
  email: string
  password: string
  onClose: () => void
}) {
  const { t } = useTranslation('settings')
  const [copied, setCopied] = useState(false)

  return (
    <section className="mt-4 rounded border border-emerald-700 bg-emerald-950/40 p-4">
      <h2 className="text-lg font-semibold text-emerald-200">
        {t('admin.users.resetPassword.title')}
      </h2>
      <p className="mt-1 text-sm text-emerald-100/80">
        {t('admin.users.resetPassword.hint', { email: props.email })}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded bg-slate-950 p-2 text-sm text-slate-100">
          {props.password}
        </code>
        <button
          className="min-h-11 rounded border border-emerald-600 px-3 text-sm text-emerald-100 hover:bg-emerald-900/40"
          onClick={() => {
            void navigator.clipboard.writeText(props.password).then(() => setCopied(true))
          }}
          type="button"
        >
          {copied ? t('admin.users.resetPassword.copied') : t('admin.users.resetPassword.copy')}
        </button>
        <button
          className="min-h-11 rounded border border-emerald-800 px-3 text-sm text-emerald-200 hover:bg-emerald-900/40"
          onClick={props.onClose}
          type="button"
        >
          {t('admin.users.resetPassword.close')}
        </button>
      </div>
    </section>
  )
}

function EditUserForm({ user, roleKeys }: { user: UserSummary; roleKeys: string[] }) {
  const { t } = useTranslation('settings')
  const queryClient = useQueryClient()
  const [values, setValues] = useState<UserFormValues>({
    email: user.email,
    password: '',
    givenName: user.givenName,
    familyName: user.familyName,
    locale: user.locale,
    theme: user.theme,
    active: user.active,
    roleKeys: user.roleKeys,
  })

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<UserSummary>(`/v1/users/${user.id}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({
          givenName: values.givenName,
          familyName: values.familyName,
          locale: values.locale,
          theme: values.theme,
          active: values.active,
          roleKeys: values.roleKeys,
          ...(values.password === '' ? {} : { password: values.password }),
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] })
      void queryClient.invalidateQueries({ queryKey: ['memberships'] })
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
      <h2 className="text-lg font-semibold">{t('admin.users.editTitle')}</h2>
      <label className="flex flex-col gap-1 text-sm">
        {t('admin.users.fields.passwordNew')}
        <input
          className="rounded bg-slate-950 p-2 text-slate-100"
          type="password"
          minLength={12}
          value={values.password}
          onChange={(event) => setValues({ ...values, password: event.target.value })}
        />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t('admin.users.fields.givenName')}
            <input
              className="rounded bg-slate-950 p-2 text-slate-100"
              type="text"
              maxLength={64}
              value={values.givenName}
              onChange={(event) =>
                setValues({ ...values, givenName: event.target.value.trim() })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t('admin.users.fields.familyName')}
            <input
              className="rounded bg-slate-950 p-2 text-slate-100"
              type="text"
              maxLength={64}
              value={values.familyName}
              onChange={(event) =>
                setValues({ ...values, familyName: event.target.value.trim() })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t('admin.users.fields.locale')}
            <select
              className="rounded bg-slate-950 p-2 text-slate-100"
          value={values.locale}
          onChange={(event) => setValues({ ...values, locale: event.target.value as UserLocale })}
        >
          <option value="de">{t('admin.users.locales.de')}</option>
          <option value="en">{t('admin.users.locales.en')}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('admin.users.fields.theme')}
        <select
          className="rounded bg-slate-950 p-2 text-slate-100"
          name="theme"
          value={values.theme}
          onChange={(event) =>
            setValues({ ...values, theme: event.target.value as UserTheme })}
        >
          <option value="auto">{t('admin.users.themeValues.auto')}</option>
          <option value="light">{t('admin.users.themeValues.light')}</option>
          <option value="dark">{t('admin.users.themeValues.dark')}</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.active}
          onChange={(event) => setValues({ ...values, active: event.target.checked })}
        />
        {t('admin.users.fields.activeLabel')}
      </label>
      <RoleCheckboxes
        selected={values.roleKeys}
        roleKeys={roleKeys}
        onToggle={(key) =>
          setValues({
            ...values,
            roleKeys: values.roleKeys.includes(key)
              ? values.roleKeys.filter((entry) => entry !== key)
              : [...values.roleKeys, key],
          })
        }
      />
      {mutation.isError ? (
        <p role="alert" className="text-sm text-red-400">
          {errorMessage(t, mutation.error)}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          className="rounded bg-accent-600 px-4 py-2 font-medium text-white hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50"
          type="submit"
          disabled={mutation.isPending}
        >
          {t('admin.users.save')}
        </button>
      </div>
    </form>
  )
}

export function UsersPage() {
  const { t } = useTranslation('settings')
  const me = useMe()
  const canRead = usePermission('user.read')
  const canWrite = usePermission('user.write')
  const queryClient = useQueryClient()
  const [editingUser, setEditingUser] = useState<UserSummary | null>(null)
  const [temporaryPassword, setTemporaryPassword] = useState<{
    email: string
    password: string
  } | null>(null)

  const users = useUsers()
  const memberships = useMemberships()
  const roles = useRoles(canWrite)

  const resetPassword = useMutation({
    mutationFn: (user: UserSummary) =>
      apiFetch<ResetPasswordResponse>(`/v1/users/${user.id}/password`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({}),
      }),
    onSuccess: (answer, user) => {
      setTemporaryPassword({ email: user.email, password: answer.temporaryPassword })
      void queryClient.invalidateQueries({ queryKey: ['users'] })
      void queryClient.invalidateQueries({ queryKey: ['memberships'] })
    },
  })

  if (me.isPending) {
    return <p>{t('admin.users.loading')}</p>
  }

  if (me.isError) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.users.sessionNotice')}
      </p>
    )
  }

  if (!canRead) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.users.forbiddenNotice')}
      </p>
    )
  }

  const roleKeys = roles.data?.roles.map((role) => role.key) ?? []

  return (
    <main className="min-h-dvh bg-slate-950 p-6 text-slate-100">
      <Link
        className="text-sm text-accent-300 underline-offset-2 hover:text-accent-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        to="/settings"
      >
        {t('admin.back')}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{t('admin.users.title')}</h1>
      {canWrite ? (
        <Link
          className="mt-4 inline-block rounded bg-accent-600 px-4 py-2 font-medium text-white hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
          to="/admin/users/new"
        >
          {t('admin.users.createTitle')}
        </Link>
      ) : null}
      {users.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errorMessage(t, users.error)}
        </p>
      ) : null}
      {resetPassword.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errorMessage(t, resetPassword.error)}
        </p>
      ) : null}
      {temporaryPassword ? (
        <TemporaryPasswordPanel
          email={temporaryPassword.email}
          password={temporaryPassword.password}
          onClose={() => setTemporaryPassword(null)}
        />
      ) : null}
      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-700 text-slate-400">
            <th>{t('admin.users.table.email')}</th>
            <th>{t('admin.users.table.name')}</th>
            <th>{t('admin.users.table.locale')}</th>
            <th>{t('admin.users.table.active')}</th>
            <th>{t('admin.users.table.roles')}</th>
            <th>{t('admin.users.table.groups')}</th>
            {canWrite ? <th>{t('admin.users.table.actions')}</th> : null}
          </tr>
        </thead>
        <tbody>
          {(users.data?.users ?? []).map((user) => (
            <tr key={user.id} className="border-b border-slate-800">
              <td>
                {user.email}
                {user.mustChangePassword ? (
                  <span className="ml-2 rounded bg-amber-900/60 px-2 py-0.5 text-xs text-amber-200">
                    {t('admin.users.resetPassword.badge')}
                  </span>
                ) : null}
              </td>
              <td>
                {user.givenName} {user.familyName}
              </td>
              <td>{t(`admin.users.locales.${user.locale}`)}</td>
              <td>{user.active ? t('admin.users.active') : t('admin.users.inactive')}</td>
              <td>{user.roleKeys.join(', ')}</td>
              <td>{(memberships.data?.[user.id] ?? []).join(', ')}</td>
              {canWrite ? (
                <td>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded border border-slate-600 px-2 py-1 text-xs"
                      type="button"
                      onClick={() => setEditingUser(editingUser?.id === user.id ? null : user)}
                    >
                      {t('admin.users.edit')}
                    </button>
                    <button
                      className="rounded border border-slate-600 px-2 py-1 text-xs"
                      type="button"
                      disabled={resetPassword.isPending}
                      onClick={() => {
                        if (
                          !window.confirm(
                            t('admin.users.resetPassword.confirm', { email: user.email }),
                          )
                        ) {
                          return
                        }

                        resetPassword.mutate(user)
                      }}
                    >
                      {t('admin.users.resetPassword.action')}
                    </button>
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      {canWrite && editingUser ? <EditUserForm user={editingUser} roleKeys={roleKeys} /> : null}
    </main>
  )
}
