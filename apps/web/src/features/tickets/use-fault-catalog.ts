import { useQuery } from '@tanstack/react-query'
import {
  STANDARD_TEXTS,
  type PublicTextTemplateListResponse,
  type StandardTextLocale,
  type TextTemplateListResponse,
} from '@stoerdesk/shared'

import { apiFetch } from '../../lib/api'

/**
 * Fault catalog of the forms (`specs/06-report-form.md` §7.9, WP-M2-40e/40f).
 *
 * The public report form reads the active templates from the unauthenticated
 * catalog; the internal forms read the administration list so an archived key of
 * a historical ticket still resolves to its text. A successful empty answer is
 * respected (an admin may archive every template); only a failed request falls
 * back to the bundled seed list, so the offline report form still works.
 */

export type FaultCatalogEntry = {
  key: string
  text: string
  archived: boolean
}

function fallbackCatalog(locale: StandardTextLocale): FaultCatalogEntry[] {
  return STANDARD_TEXTS[locale].map((entry) => ({ ...entry, archived: false }))
}

export function usePublicFaultCatalog(locale: StandardTextLocale): FaultCatalogEntry[] {
  const query = useQuery({
    queryKey: ['fault-catalog', 'public', locale],
    queryFn: () =>
      apiFetch<PublicTextTemplateListResponse>(`/v1/public/text-templates?locale=${locale}`),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  if (query.data !== undefined) {
    return query.data.templates.map((entry) => ({ ...entry, archived: false }))
  }

  return fallbackCatalog(locale)
}

export function useFaultCatalog(locale: StandardTextLocale): FaultCatalogEntry[] {
  const query = useQuery({
    queryKey: ['fault-catalog', 'admin', locale],
    queryFn: () => apiFetch<TextTemplateListResponse>('/v1/text-templates'),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  if (query.data !== undefined) {
    return query.data.templates.map((template) => ({
      key: template.key,
      text: template.translations[locale],
      archived: template.archivedAt !== null,
    }))
  }

  return fallbackCatalog(locale)
}
