import type { ServerLocale } from '../i18n/t.js'

/**
 * Localized BMA standard texts of the report form
 * (`specs/02-data-model.md` §4.5, `PLAN.md` §3). Seed data and standard texts
 * are localized resources — never German literals in API code.
 *
 * The nine texts were drafted in the reviewed data model slice; the demo seed
 * inserts them once and never overwrites edits made in the admin UI.
 */
export const STANDARD_TEXT_KEYS = [
  'bma.total_outage',
  'bma.malfunction_display',
  'bma.false_alarm',
  'bma.smoke_detector_fault',
  'bma.manual_callpoint_fault',
  'bma.power_supply_fault',
  'bma.line_fault',
  'bma.transmission_fault',
  'bma.ups_time_overdue',
] as const

export type StandardTextKey = (typeof STANDARD_TEXT_KEYS)[number]

export type StandardText = {
  key: StandardTextKey
  text: string
}

export type StandardTextLocale = ServerLocale

export const STANDARD_TEXTS: Record<StandardTextLocale, StandardText[]> = {
  de: [
    { key: 'bma.total_outage', text: 'Brandmeldeanlage fällt komplett aus' },
    { key: 'bma.malfunction_display', text: 'Störungsmeldung an der Brandmelderzentrale' },
    { key: 'bma.false_alarm', text: 'Falschalarm ohne erkennbaren Grund' },
    { key: 'bma.smoke_detector_fault', text: 'Rauchmelder defekt oder verschmutzt' },
    { key: 'bma.manual_callpoint_fault', text: 'Handdruckmelder defekt' },
    { key: 'bma.power_supply_fault', text: 'Störung der Stromversorgung / Batterie' },
    { key: 'bma.line_fault', text: 'Leitungsstörung / Linie gestört' },
    { key: 'bma.transmission_fault', text: 'Störung der Alarmübertragung' },
    { key: 'bma.ups_time_overdue', text: 'Aufschaltzeit überschritten' },
  ],
  en: [
    { key: 'bma.total_outage', text: 'Fire alarm system completely out of service' },
    { key: 'bma.malfunction_display', text: 'Fault indication on the alarm control panel' },
    { key: 'bma.false_alarm', text: 'False alarm without identifiable cause' },
    { key: 'bma.smoke_detector_fault', text: 'Smoke detector defective or soiled' },
    { key: 'bma.manual_callpoint_fault', text: 'Manual call point defective' },
    { key: 'bma.power_supply_fault', text: 'Power supply or battery fault' },
    { key: 'bma.line_fault', text: 'Line/circuit fault' },
    { key: 'bma.transmission_fault', text: 'Transmission to the emergency services fails' },
    { key: 'bma.ups_time_overdue', text: 'Delay before alarm transmission exceeded' },
  ],
}
