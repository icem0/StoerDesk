import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import type { CreateUserRequest, UserSummary } from '@stoerdesk/shared'

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

const emptyValues: UserFormValues = {
  email: '',
  password: '',
  givenName: '',
  familyName: '',
  locale: 'de',
  theme: 'auto',
  active: true,
  roleKeys: [],
}

/**
 * The own page of the new user (WP-M14-158): the form does not lie below the
 * list of the users any more, the list offers a button that opens this page.
 */
export function UserCreatePage() {
  const { t } = useTranslation('settings')
  const me = useMe()
  const canWrite = usePermission('user.write')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [values, setValues] = useState<UserFormValues>(emptyValues)

  const roles = useRoles(canWrite)

  const mutation = useMutation({
    mutationFn: (body: CreateUserRequest) =>
      apiFetch<UserSummary>('/v1/users', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] })
      navigate('/admin/users')
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

  if (!canWrite) {
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
        className="text-sm text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        to="/admin/users"
      >
        {t('admin.users.title')}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{t('admin.users.createTitle')}</h1>
      <form
        className="mt-4 flex max-w-xl flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          mutation.mutate(values)
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          {t('admin.users.fields.email')}
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            type="email"
            required
            value={values.email}
            onChange={(event) => setValues({ ...values, email: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('admin.users.fields.givenName')}
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            type="text"
            maxLength={64}
            value={values.givenName}
            onChange={(event) =>
              setValues({ ...values, givenName: event.target.value.trim() })
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('admin.users.fields.familyName')}
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            type="text"
            maxLength={64}
            value={values.familyName}
            onChange={(event) =>
              setValues({ ...values, familyName: event.target.value.trim() })
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('admin.users.fields.password')}
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            type="password"
            required
            minLength={12}
            value={values.password}
            onChange={(event) => setValues({ ...values, password: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('admin.users.fields.locale')}
          <select
            className="rounded bg-slate-900 p-2 text-slate-100"
            value={values.locale}
            onChange={(event) =>
              setValues({ ...values, locale: event.target.value as UserLocale })
            }
          >
            <option value="de">{t('admin.users.locales.de')}</option>
            <option value="en">{t('admin.users.locales.en')}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('admin.users.fields.theme')}
          <select
            className="rounded bg-slate-900 p-2 text-slate-100"
            name="theme"
            value={values.theme}
            onChange={(event) =>
              setValues({ ...values, theme: event.target.value as UserTheme })
            }
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
        <button
          className="self-start rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
          type="submit"
          disabled={mutation.isPending}
        >
          {t('admin.users.create')}
        </button>
      </form>
    </main>
  )
}
