import type { ServerLocale } from '../i18n/t.js'

/**
 * Bootstrap fault types of the report form
 * (`specs/02-data-model.md` §4.5, `PLAN.md` §3). Seed data and standard texts
 * are localized resources — never German literals in API code.
 *
 * The eight texts are the standard fault types requested for the bootstrap; the
 * demo seed inserts them once and never overwrites edits made in the admin UI.
 */
export const STANDARD_TEXT_KEYS = [
  'bma.line_interruption',
  'bma.fault_unknown',
  'bma.signal_device_fault',
  'bma.detector_fault',
  'bma.false_alarm',
  'bma.power_supply_fault',
  'bma.input_fault',
  'bma.battery_fault',
] as const

export type StandardTextKey = (typeof STANDARD_TEXT_KEYS)[number]

export type StandardText = {
  key: StandardTextKey
  text: string
}

export type StandardTextLocale = ServerLocale

export const STANDARD_TEXTS: Record<StandardTextLocale, StandardText[]> = {
  de: [
    { key: 'bma.line_interruption', text: 'Leitungsunterbrechung' },
    { key: 'bma.fault_unknown', text: 'Störung (Unbekannt)' },
    { key: 'bma.signal_device_fault', text: 'Störung Signalgeber' },
    { key: 'bma.detector_fault', text: 'Störung Melder' },
    { key: 'bma.false_alarm', text: 'Täuschungsalarm' },
    { key: 'bma.power_supply_fault', text: 'Störung Energieversorgung' },
    { key: 'bma.input_fault', text: 'Störung Eingang' },
    { key: 'bma.battery_fault', text: 'Störung Akku' },
  ],
  en: [
    { key: 'bma.line_interruption', text: 'Line interruption' },
    { key: 'bma.fault_unknown', text: 'Fault (unknown)' },
    { key: 'bma.signal_device_fault', text: 'Signal device fault' },
    { key: 'bma.detector_fault', text: 'Detector fault' },
    { key: 'bma.false_alarm', text: 'False alarm' },
    { key: 'bma.power_supply_fault', text: 'Power supply fault' },
    { key: 'bma.input_fault', text: 'Input fault' },
    { key: 'bma.battery_fault', text: 'Battery fault' },
  ],
}
