import { useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'

import {
  dataUrlByteSize,
  PhotoError,
  compressImage,
  type CompressedPhoto,
  type CompressOptions,
} from './image-compress'

/**
 * Photo uploader of the public report form (`specs/06-report-form.md` §7.2/§7.4,
 * WP-M2-05b).
 *
 * The photos live as data URLs in the page state, so the submit body carries them
 * directly (§7.4). Every selected file is compressed through the canvas before it is
 * added; the server still caps the decoded bytes and verifies the magic bytes
 * (WP-M2-04c). The client rule of six photos is enforced before any compression, so a
 * seventh file never costs the reporter a decode.
 */

/** `PLAN.md` §10 and `specs/06-report-form.md` §7.4: at most six photos per report. */
export const MAX_REPORT_PHOTOS = 6

type Compressor = (file: Blob, options?: CompressOptions) => Promise<CompressedPhoto>

export type PhotoUploadProps = {
  photos: string[]
  onAdd: (photo: string) => void
  onRemove: (index: number) => void
  /** Injectable for tests: jsdom has no canvas, so the compressor is swapped out. */
  compress?: Compressor
}

export function PhotoUpload({ photos, onAdd, onRemove, compress = compressImage }: PhotoUploadProps) {
  const { t } = useTranslation('ticket')
  const [error, setError] = useState<string | undefined>(undefined)

  async function addFiles(files: File[] | null) {
    if (files === null || files.length === 0) {
      return
    }

    if (photos.length + files.length > MAX_REPORT_PHOTOS) {
      setError('report.validation.photoLimit')

      return
    }

    try {
      const dataUrls: string[] = []

      for (const file of files) {
        const compressed = await compress(file)
        dataUrls.push(compressed.dataUrl)
      }

      setError(undefined)

      for (const dataUrl of dataUrls) {
        onAdd(dataUrl)
      }
    } catch (caught) {
      // A failed decode or a 0 px bitmap is `photo_type_unsupported` (§7.4), and a
      // failing photo never leaves a half-added selection behind.
      const code = caught instanceof PhotoError ? caught.code : 'photo_type_unsupported'

      setError(`report.errors.${code}`)
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files === null ? null : [...event.target.files]

    // Reset before the async work, so selecting the same file again fires again.
    event.target.value = ''
    void addFiles(selected)
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{t('report.photos.label')}</legend>
      <p className="text-sm text-slate-400">{t('report.photos.hint', { max: MAX_REPORT_PHOTOS })}</p>
      <label className="min-h-11 inline-flex cursor-pointer items-center justify-center rounded border border-slate-700 bg-slate-900 px-4 text-sm text-slate-200">
        {t('report.photos.add')}
        <input
          accept="image/*"
          aria-label={t('report.photos.add')}
          className="sr-only"
          data-testid="photo-input"
          multiple
          type="file"
          onChange={handleChange}
        />
      </label>

      {photos.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {photos.map((photo, index) => (
            <li
              className="flex items-center gap-3 rounded border border-slate-800 bg-slate-900/50 p-2"
              data-testid="photo-preview"
              key={`${index}-${photo.slice(0, 24)}`}
            >
              <img
                alt={t('report.photos.previewAlt', { index: index + 1 })}
                className="h-16 w-16 rounded object-cover"
                src={photo}
              />
              <span className="flex-1 text-xs text-slate-400">
                {t('report.photos.size', { bytes: dataUrlByteSize(photo) })}
              </span>
              <button
                className="min-h-11 rounded border border-slate-700 px-3 text-sm text-slate-200"
                type="button"
                onClick={() => onRemove(index)}
              >
                {t('report.photos.remove')}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error !== undefined ? (
        <p className="text-sm text-amber-300" role="alert">
          {t(error)}
        </p>
      ) : null}
    </fieldset>
  )
}
