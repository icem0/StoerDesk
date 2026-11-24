import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import type { AlarmSettings, NotificationMute } from '@stoerdesk/shared'

import { apiFetch } from '../lib/api'
import { isAlarmToneEnabled, playAlarmTone, setAlarmToneEnabled } from '../lib/alarm-tone'

/**
 * The band of the alarm (`specs/10-notifications.md` §11.17, ADR-0048): it
 * stands on every internal page while unhandled messages exist, shines and
 * moves, and carries the two decisions of the user — **„1 Stunde stumm“**
 * (the sound only, the band keeps shining) and **„Ton aktivieren“** (the
 * gesture a browser needs before it may play a sound at all).
 *
 * The sound belongs to the installation: `GET /api/v1/notifications/alarm`
 * answers whether the installation alarms with a tone and how often the tone
 * comes again. The **interval governs the sound only** — the band is a state,
 * not a repetition.
 *
 * The silence of the user lives on the server (`GET`/`POST
 * /api/v1/notifications/mute`), so it follows the user and not the device.
 */
export function AlarmBanner() {
  const { t } = useTranslation('common')
  const queryClient = useQueryClient()
  const [toneUnlocked, setToneUnlocked] = useState(isAlarmToneEnabled)

  /**
   * The clock of the band: the silence has an end and the button names the
   * remaining minutes. The clock ticks so that the remaining time shrinks
   * while the page is open.
   */
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
    }, 30_000)

    return () => {
      clearInterval(timer)
    }
  }, [])

  /** The unhandled messages — the same query the bell of the menu reads. */
  const unread = useQuery({
    queryKey: ['notification-unread-count'],
    queryFn: () => apiFetch<{ count: number }>('/api/v1/notifications/messages/unread-count'),
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    retry: false,
  })

  /** The alarm of the installation: the sound and the interval of its repetition. */
  const alarm = useQuery({
    queryKey: ['notification-alarm'],
    queryFn: () => apiFetch<AlarmSettings>('/api/v1/notifications/alarm'),
    retry: false,
  })

  /** The silence of the user — the end of it, or `null` while the alarm is audible. */
  const mute = useQuery({
    queryKey: ['notification-mute'],
    queryFn: () => apiFetch<NotificationMute>('/api/v1/notifications/mute'),
    retry: false,
  })

  /** The user is silent for one hour — the sound only. */
  const muteForOneHour = useMutation({
    mutationFn: () =>
      apiFetch<NotificationMute>('/api/v1/notifications/mute', { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-mute'] })
    },
  })

  const count = unread.data?.count ?? 0
  const visible = count > 0
  const toneEnabled = alarm.data?.toneEnabled ?? false
  const repeatSeconds = alarm.data?.repeatSeconds ?? 60
  const mutedUntil = mute.data?.mutedUntil ?? null
  const muted = mutedUntil !== null && Date.parse(mutedUntil) > now

  /**
   * The sound: at once when the alarm appears and again every
   * `repeatSeconds` while the messages are unhandled. The band itself does not
   * repeat in that rhythm — it is a state, not a repetition (§11.17).
   */
  useEffect(() => {
    if (!visible || !toneEnabled || muted || !toneUnlocked) {
      return
    }

    playAlarmTone()

    const timer = setInterval(() => {
      playAlarmTone()
    }, repeatSeconds * 1000)

    return () => {
      clearInterval(timer)
    }
  }, [visible, toneEnabled, muted, toneUnlocked, repeatSeconds])

  /** The remaining minutes of the silence — the button names them. */
  const remainingMinutes = useMemo(() => {
    if (mutedUntil === null) {
      return 0
    }

    return Math.max(1, Math.ceil((Date.parse(mutedUntil) - now) / 60_000))
  }, [mutedUntil, now])

  if (!visible) {
    return null
  }

  return (
    <div
      aria-live="assertive"
      className="flex flex-col gap-2 border-b border-rose-500/60 bg-rose-950/70 px-4 py-3 text-rose-100 sm:px-6"
      data-testid="alarm-banner"
      role="alert"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 animate-pulse items-center justify-center rounded-full bg-rose-500/30 text-lg"
        >
          🔔
        </span>

        <span className="text-sm font-semibold">
          {t('alarm.banner.heading', { count })}
        </span>

        <Link
          className="text-sm text-rose-100 underline hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
          to="/notifications"
        >
          {t('alarm.banner.inbox')}
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {toneEnabled && !toneUnlocked ? (
          <button
            className="min-h-11 rounded bg-rose-500 px-4 text-sm font-medium text-slate-950 hover:bg-rose-400"
            onClick={() => {
              setAlarmToneEnabled(true)
              setToneUnlocked(true)
              playAlarmTone()
            }}
            type="button"
          >
            {t('alarm.banner.activate')}
          </button>
        ) : null}

        {toneEnabled && muted ? (
          <span className="text-sm text-rose-100/90">
            {t('alarm.banner.muted', { minutes: remainingMinutes })}
          </span>
        ) : null}

        {toneEnabled && !muted ? (
          <button
            className="min-h-11 rounded border border-rose-300/70 px-4 text-sm text-rose-50 hover:bg-rose-900/60"
            disabled={muteForOneHour.isPending}
            onClick={() => muteForOneHour.mutate()}
            type="button"
          >
            {t('alarm.banner.mute')}
          </button>
        ) : null}

        {!toneEnabled ? (
          <span className="text-sm text-rose-100/80">{t('alarm.banner.silent')}</span>
        ) : null}
      </div>
    </div>
  )
}
