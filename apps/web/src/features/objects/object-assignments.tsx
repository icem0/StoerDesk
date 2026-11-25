import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ObjectAssignment, UserSummary } from '@stoerdesk/shared'

import { ApiError, apiFetch } from '../../lib/api'

/**
 * The trained people of an object (`specs/19-customer-portal.md` §19.2,
 * ADR-0053): the customers the operator has instructed for this installation.
 *
 * The list is read over `GET /api/v1/objects/:objectNo/assignments`, the write
 * over the same routes — the administration is the only one that may assign.
 */

interface AssignmentsAnswer {
  assignments: ObjectAssignment[]
}

interface UsersAnswer {
  users: UserSummary[]
}

/** The name of a customer — the family name first, as the office writes it. */
function nameOf(user: Pick<UserSummary, 'givenName' | 'familyName'>): string {
  const name = `${user.familyName} ${user.givenName}`.trim()

  return name === '' ? user.givenName : name
}

export function ObjectAssignments({ objectNo }: { objectNo: string }) {
  const { t } = useTranslation('object')
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState('')
  const [error, setError] = useState<string | null>(null)

  const assignmentsQuery = useQuery({
    queryKey: ['objects', 'assignments', objectNo],
    queryFn: () => apiFetch<AssignmentsAnswer>(`/v1/objects/${objectNo}/assignments`),
    retry: false,
  })

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<UsersAnswer>('/v1/users'),
    retry: false,
  })

  const customers = (usersQuery.data?.users ?? []).filter((user) =>
    user.roleKeys.includes('customer'),
  )

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['objects', 'assignments', objectNo] })
  }

  const addMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch<unknown>(`/v1/objects/${objectNo}/assignments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId }),
      }),
    onSuccess: () => {
      setSelected('')
      setError(null)
      invalidate()
    },
    onError: (known: unknown) => {
      setError(known instanceof ApiError ? (known.code ?? 'internal_error') : 'internal_error')
    },
  })

  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch<unknown>(`/v1/objects/${objectNo}/assignments/${userId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (known: unknown) => {
      setError(known instanceof ApiError ? (known.code ?? 'internal_error') : 'internal_error')
    },
  })

  const assignments = assignmentsQuery.data?.assignments ?? []

  return (
    <section className="mt-8 rounded-lg border border-slate-200 p-4">
      <h2 className="text-base font-semibold">{t('assignments.title')}</h2>
      <p className="mt-1 text-sm text-slate-600">{t('assignments.hint')}</p>

      {assignmentsQuery.isError ? (
        <p className="mt-3 text-sm text-slate-600">{t('assignments.loading')}</p>
      ) : null}

      <ul className="mt-3 flex flex-col gap-2">
        {assignments.map((assignment) => (
          <li key={assignment.userId} className="flex items-center justify-between gap-3">
            <span className="text-sm">
              {`${assignment.familyName} ${assignment.givenName}`.trim()}
            </span>
            <button
              type="button"
              className="rounded border border-slate-300 px-2 py-1 text-sm"
              onClick={() => removeMutation.mutate(assignment.userId)}
            >
              {t('assignments.remove')}
            </button>
          </li>
        ))}
        {assignments.length === 0 && !assignmentsQuery.isError ? (
          <li className="text-sm text-slate-600">{t('assignments.empty')}</li>
        ) : null}
      </ul>

      <div className="mt-3 flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          {t('assignments.add')}
          <select
            className="rounded border border-slate-300 px-2 py-1"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            <option value="">{t('assignments.choose')}</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {`${nameOf(customer)} (${customer.email})`}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="rounded bg-slate-800 px-3 py-1 text-sm text-white disabled:opacity-50"
          disabled={selected === '' || addMutation.isPending}
          onClick={() => addMutation.mutate(selected)}
        >
          {t('assignments.addButton')}
        </button>
      </div>

      {error !== null ? (
        <p className="mt-2 text-sm text-red-700">{t(`assignments.errors.${error}`)}</p>
      ) : null}
    </section>
  )
}
