import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'

import { i18n } from '../../i18n'
import { AppVersion } from '../app-version'

describe('AppVersion', () => {
  it('renders the label and the injected build version', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <AppVersion version="v1.2.3" />
      </I18nextProvider>,
    )

    expect(screen.getByText('Version')).toBeTruthy()
    expect(screen.getByText('v1.2.3')).toBeTruthy()
  })
})
