import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import commonDe from './locales/de/common.json'
import commonEn from './locales/en/common.json'
import errorsDe from './locales/de/errors.json'
import errorsEn from './locales/en/errors.json'
import objectDe from './locales/de/object.json'
import objectEn from './locales/en/object.json'
import oncallDe from './locales/de/oncall.json'
import oncallEn from './locales/en/oncall.json'
import settingsDe from './locales/de/settings.json'
import settingsEn from './locales/en/settings.json'
import statsDe from './locales/de/stats.json'
import statsEn from './locales/en/stats.json'
import ticketDe from './locales/de/ticket.json'
import ticketEn from './locales/en/ticket.json'
import validationDe from './locales/de/validation.json'
import validationEn from './locales/en/validation.json'

export const namespaces = [
  'common',
  'errors',
  'validation',
  'ticket',
  'object',
  'oncall',
  'stats',
  'settings',
] as const

export type Namespace = (typeof namespaces)[number]

void i18n.use(initReactI18next).init({
  resources: {
    de: {
      common: commonDe,
      errors: errorsDe,
      validation: validationDe,
      ticket: ticketDe,
      object: objectDe,
      oncall: oncallDe,
      stats: statsDe,
      settings: settingsDe,
    },
    en: {
      common: commonEn,
      errors: errorsEn,
      validation: validationEn,
      ticket: ticketEn,
      object: objectEn,
      oncall: oncallEn,
      stats: statsEn,
      settings: settingsEn,
    },
  },
  lng: 'de',
  fallbackLng: 'de',
  supportedLngs: ['de', 'en'],
  defaultNS: 'common',
  ns: [...namespaces],
  interpolation: {
    escapeValue: false,
  },
})

export { i18n }
