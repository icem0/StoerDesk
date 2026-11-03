import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { outboxAvailable, queuedReports } from '../lib/outbox'
import { appVersion } from '../lib/version'
import { UpdateHostUpdate } from './update-host-update'

/**
 * Clean PWA update control (`specs/18-self-update.md` §18.2, WP-M2-44).
 *
 * Stage 1 is deliberately client-only: it checks whether a waiting service
 * worker exists, activates it through `SKIP_WAITING` and can clear the PWA
 * caches. No host command, no update token and no forced reload while the Dexie
 * outbox still carries a queued or sending report.
 *
 * The host update of stage 2 lives in its own section
 * (`update-host-update.tsx`): it is a server action of the administration and
 * needs the permission `system.update`.
 */

type UpdateState = 'idle' | 'checking' | 'available' | 'current' | 'unavailable'

async function hasPendingReports(): Promise<boolean> {
  if (!outboxAvailable()) {
    return false
  }

  try {
    const reports = await queuedReports()

    return reports.some((report) => report.status === 'queued' || report.status === 'sending')
  } catch {
    return false
  }
}

export function UpdatePage() {
  const { t } = useTranslation('settings')
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | undefined>()
  const [updateState, setUpdateState] = useState<UpdateState>(() =>
    typeof navigator === 'undefined' || !navigator.serviceWorker ? 'unavailable' : 'idle',
  )
  const [clearing, setClearing] = useState(false)
  const [swVersion, setSwVersion] = useState<string | null>(null)
  const reloadOnControllerChange = useRef(false)

  const outbox = useQuery({
    queryKey: ['outbox', 'pending'],
    queryFn: hasPendingReports,
    refetchInterval: 5000,
    retry: false,
  })
  const blocked = outbox.data === true

  useEffect(() => {
    const container = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker

    if (!container) {
      return
    }

    let disposed = false

    void container.getRegistration().then((value) => {
      if (!disposed) {
        setRegistration(value ?? undefined)
      }
    })

    const onControllerChange = () => {
      if (!reloadOnControllerChange.current) {
        return
      }

      reloadOnControllerChange.current = false
      window.location.reload()
    }

    container.addEventListener('controllerchange', onControllerChange)

    return () => {
      disposed = true
      container.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  useEffect(() => {
    const active = registration?.active

    if (!active) {
      return
    }

    const channel = new MessageChannel()
    channel.port1.onmessage = (event) => {
      if (typeof event.data === 'string') {
        setSwVersion(event.data)
      }
    }
    active.postMessage('GET_VERSION', [channel.port2])

    return () => channel.port1.close()
  }, [registration?.active])

  const currentRegistration = useCallback(async () => {
    if (registration !== undefined) {
      return registration
    }

    if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
      return undefined
    }

    const value = (await navigator.serviceWorker.getRegistration()) ?? undefined
    setRegistration(value)

    return value
  }, [registration])

  const checkUpdate = useCallback(async () => {
    setUpdateState('checking')

    const reg = await currentRegistration()

    if (!reg) {
      setUpdateState('unavailable')

      return
    }

    try {
      const updated = await reg.update()
      const waiting = updated.waiting ?? reg.waiting

      setUpdateState(waiting ? 'available' : 'current')
    } catch {
      setUpdateState('unavailable')
    }
  }, [currentRegistration])

  const reloadNow = useCallback(() => {
    const waiting = registration?.waiting

    if (!waiting) {
      window.location.reload()

      return
    }

    reloadOnControllerChange.current = true
    waiting.postMessage('SKIP_WAITING')
  }, [registration])

  const clearCaches = useCallback(async () => {
    setClearing(true)

    if (!registration) {
      window.location.reload()

      return
    }

    const active = registration.active

    if (!active) {
      await registration.unregister()
      window.location.reload()

      return
    }

    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
      void registration.unregister().finally(() => {
        window.location.reload()
      })
    }
    active.postMessage('CLEAR_CACHES', [channel.port2])
  }, [registration])

  return (
    <section className="flex flex-col gap-4">
      <div>
        <Link
          className="text-sm text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          to="/admin"
        >
          {t('admin.back')}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">{t('admin.update.title')}</h1>
        <p className="text-sm text-slate-400">{t('admin.update.hint')}</p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-400">{t('admin.update.currentVersion')}</dt>
            <dd className="mt-1 font-mono">{appVersion}</dd>
          </div>
          <div>
            <dt className="text-slate-400">{t('admin.update.swVersion')}</dt>
            <dd className="mt-1 font-mono">{swVersion ?? t('admin.update.noServiceWorker')}</dd>
          </div>
        </dl>
      </div>

      {blocked ? (
        <p
          role="alert"
          className="rounded border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-200"
        >
          {t('admin.update.outboxBlocked')}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
          type="button"
          disabled={blocked || updateState === 'checking'}
          onClick={() => void checkUpdate()}
        >
          {updateState === 'checking' ? t('admin.update.checking') : t('admin.update.checkUpdate')}
        </button>
        {updateState === 'available' ? (
          <button
            className="rounded bg-emerald-700 px-4 py-2 font-medium text-white disabled:opacity-50"
            type="button"
            disabled={blocked}
            onClick={reloadNow}
          >
            {t('admin.update.reload')}
          </button>
        ) : null}
        <button
          className="rounded bg-slate-700 px-4 py-2 font-medium text-white disabled:opacity-50"
          type="button"
          disabled={blocked || clearing}
          onClick={() => void clearCaches()}
        >
          {clearing ? t('admin.update.clearing') : t('admin.update.clearCache')}
        </button>
      </div>

      {updateState === 'available' ? (
        <p role="status" className="text-sm text-emerald-300">
          {t('admin.update.updateAvailable')}
        </p>
      ) : null}
      {updateState === 'current' ? (
        <p className="text-sm text-slate-400">{t('admin.update.noUpdate')}</p>
      ) : null}
      {updateState === 'unavailable' ? (
        <p role="alert" className="text-sm text-amber-300">
          {t('admin.update.unavailable')}
        </p>
      ) : null}

      <UpdateHostUpdate />
    </section>
  )
}
