import { useState, type ComponentProps } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../../i18n'
import { PhotoError } from '../image-compress'
import { PhotoUpload } from '../photo-upload'

/**
 * Fixtures of the photo uploader (`specs/06-report-form.md` §7.4, WP-M2-05b). jsdom has
 * no canvas, so the compressor is injected; the real canvas path runs in WP-M2-05c.
 */
const DATA_URL = 'data:image/jpeg;base64,AAAA'

type Compress = NonNullable<ComponentProps<typeof PhotoUpload>['compress']>

function compressed(dataUrl: string = DATA_URL) {
  return { dataUrl, width: 10, height: 10, sizeBytes: 3 }
}

function file(name: string) {
  return new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: 'image/jpeg' })
}

function Harness({ compress }: { compress: Compress }) {
  const [photos, setPhotos] = useState<string[]>([])

  return (
    <PhotoUpload
      compress={compress}
      photos={photos}
      onAdd={(photo) => setPhotos((current) => [...current, photo])}
      onRemove={(index) => setPhotos((current) => current.filter((_, at) => at !== index))}
    />
  )
}

function renderUploader(compress: Compress) {
  return render(
    <I18nextProvider i18n={i18n}>
      <Harness compress={compress} />
    </I18nextProvider>,
  )
}

function selectFiles(...files: File[]) {
  fireEvent.change(screen.getByTestId('photo-input'), { target: { files } })
}

afterEach(() => {
  void i18n.changeLanguage('de')
})

describe('PhotoUpload', () => {
  it('compresses accepted photos and shows a preview with its byte size', async () => {
    const compress = vi.fn(async () => compressed())
    renderUploader(compress)

    selectFiles(file('a.jpg'), file('b.jpg'))

    await waitFor(() => expect(screen.getAllByTestId('photo-preview')).toHaveLength(2))
    expect(compress).toHaveBeenCalledTimes(2)
    expect(screen.getAllByText('3 Bytes')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Foto entfernen' })).toHaveLength(2)
  })

  it('refuses a seventh photo with the limit notice and adds nothing', async () => {
    const compress = vi.fn(async () => compressed())
    renderUploader(compress)

    selectFiles(file('1.jpg'), file('2.jpg'), file('3.jpg'))
    await waitFor(() => expect(screen.getAllByTestId('photo-preview')).toHaveLength(3))

    selectFiles(file('4.jpg'), file('5.jpg'), file('6.jpg'))
    await waitFor(() => expect(screen.getAllByTestId('photo-preview')).toHaveLength(6))

    selectFiles(file('7.jpg'))

    expect(await screen.findByText('Es sind höchstens sechs Fotos möglich.')).toBeTruthy()
    expect(screen.getAllByTestId('photo-preview')).toHaveLength(6)
    expect(compress).toHaveBeenCalledTimes(6)
  })

  it('removes a photo again', async () => {
    const compress = vi.fn(async () => compressed())
    renderUploader(compress)

    selectFiles(file('a.jpg'), file('b.jpg'))
    await waitFor(() => expect(screen.getAllByTestId('photo-preview')).toHaveLength(2))

    fireEvent.click(screen.getAllByRole('button', { name: 'Foto entfernen' })[0] as HTMLElement)

    expect(screen.getAllByTestId('photo-preview')).toHaveLength(1)
  })

  it('leaves the list untouched when the compressor fails', async () => {
    let calls = 0
    const compress = vi.fn(async () => {
      calls += 1

      if (calls === 2) {
        throw new PhotoError('photo_type_unsupported')
      }

      return compressed()
    })
    renderUploader(compress)

    selectFiles(file('ok.jpg'))
    await waitFor(() => expect(screen.getAllByTestId('photo-preview')).toHaveLength(1))

    selectFiles(file('broken.heic'))

    expect(
      await screen.findByText(
        'Dieses Fotoformat wird nicht unterstützt. Bitte ein JPEG- oder PNG-Foto auswählen.',
      ),
    ).toBeTruthy()
    expect(screen.getAllByTestId('photo-preview')).toHaveLength(1)
  })
})
