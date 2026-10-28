import { render, screen } from '@testing-library/react'
import i18n from 'i18next'
import { describe, expect, it } from 'vitest'

import { I18nextProvider, initReactI18next, useTranslation } from 'react-i18next'

import { i18n as appI18n } from '../index'

function TestTitle() {
  const { t } = useTranslation()

  return <p>{t('app.title')}</p>
}

describe('useTranslation', () => {
  it('renders translated text in a test component', async () => {
    const instance = i18n.createInstance()
    await instance.use(initReactI18next).init({
      resources: { de: { common: { app: { title: 'StörDesk' } } } },
      lng: 'de',
      fallbackLng: 'de',
      ns: ['common'],
      defaultNS: 'common',
    })

    render(
      <I18nextProvider i18n={instance}>
        <TestTitle />
      </I18nextProvider>,
    )

    expect(screen.getByText('StörDesk')).toBeTruthy()
  })

  it('resolves app resources through the configured instance', () => {
    render(
      <I18nextProvider i18n={appI18n}>
        <TestTitle />
      </I18nextProvider>,
    )

    expect(screen.getByText('StörDesk')).toBeTruthy()
    expect(appI18n.t('common:app.setupNotice').length).toBeGreaterThan(0)
  })
})
