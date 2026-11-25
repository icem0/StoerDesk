import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { usePermission } from '../auth/usePermission'
import { apiFetch } from '../lib/api'
import { type ChannelConfigurationListResponse } from '@stoerdesk/shared'
import { ChannelCard } from './channel-form-parts'

/**
 * Die Seite eines Kanals (`/admin/channels/:kind`, WP-M29-05): sie lädt die
 * Konfiguration aller Kanäle und rendert das Formular des angefragten Kanals
 * (`ChannelCard` aus channel-form-parts.tsx). Ein unbekannter Kanal bleibt
 * ohne Formular und nennt sich nicht gefunden.
 */
export function ChannelPage() {
  const { t } = useTranslation('settings')
  const { kind } = useParams<{ kind: string }>()
  const mayRead = usePermission('notification.read')
  const mayWrite = usePermission('notification.write')

  const query = useQuery({
    queryKey: ['channels'],
    queryFn: () => apiFetch<ChannelConfigurationListResponse>('/v1/admin/channels'),
    enabled: mayRead,
    retry: false,
  })

  const channel = query.data?.channels.find((channel) => channel.kind === kind)

  if (!channel) {
    return (
      <section className="mt-6 flex flex-col gap-6">
        <h1 className="text-xl font-semibold">{t('admin.channels.channelNotFound')}</h1>
        <p className="text-sm text-slate-400">{t('admin.channels.channelNotFoundHint')}</p>
      </section>
    )
  }

  return (
    <section className="mt-6 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{channel.label}</h1>
      <p className="mt-1 text-sm text-slate-400">{channel.kind}</p>
      <ChannelCard channel={channel} mayWrite={mayWrite} showTitle={false} />
    </section>
  )
}
