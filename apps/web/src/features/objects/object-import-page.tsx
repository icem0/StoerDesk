import { useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { usePermission } from '../../auth/usePermission'
import { ApiError, apiFetch } from '../../lib/api'
import {
  OBJECT_IMPORT_HEADER_TARGETS,
  OBJECT_IMPORT_TARGETS,
  type ObjectImportApplied,
  type ObjectImportMapping,
  type ObjectImportPreview,
  type ObjectImportRequest,
  type ObjectImportResult,
  type ObjectImportRowError,
  type ObjectImportTarget,
} from '@stoerdesk/shared'
import type { TFunction } from 'i18next'

/**
 * CSV import page (`specs/08-objects-api.md` §9.4, WP-M10-14).
 *
 * The browser reads the spreadsheet file and posts its text as JSON, so no multipart
 * parser and no server-side upload directory exist (WP-M10-12, WP-M10-13). The header
 * of the file is shown next to the target it resolves to — the submitted mapping first,
 * otherwise the German aliases of §9.4 — and every column has a mapping control whose
 * value is sent as `mapping`. The preview table carries line, object number, action,
 * changed fields and the `{ code, params }` row error of every row, the summary counts
 * the four actions and the commit action adds the `applied` counters the database got.
 * Without `object.import` the page stays read-only: the file never leaves the browser
 * and the notice says why.
 */

const jsonHeaders = { 'content-type': 'application/json' }

const handledErrorCodes: string[] = ['fileRead', 'forbidden', 'invalid_request', 'object_no_taken', 'session_invalid']

function errorKey(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'fileRead'
  }

  const code = error.code ?? 'unknown'

  return handledErrorCodes.includes(code) ? code : 'unknown'
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

/** Header cells of the file; the delimiter rule of `parseObjectCsv` stays mirrored here. */
function headerLabels(csv: string): string[] {
  const text = csv.replace(/^\uFEFF/, '')
  const newline = text.search(/[\r\n]/)
  const headerLine = newline === -1 ? text : text.slice(0, newline)
  const commas = [...headerLine].filter((char) => char === ',').length
  const semicolons = [...headerLine].filter((char) => char === ';').length
  const delimiter = semicolons > commas ? ';' : ','

  return headerLine.split(delimiter).map((label) => label.trim())
}

/** The field a row error names; unknown paths are shown as they came in. */
function fieldLabel(t: TFunction<'object'>, field: string): string {
  return (OBJECT_IMPORT_TARGETS as readonly string[]).includes(field)
    ? t(`create.fields.${field}`)
    : field
}

function rowErrorText(t: TFunction<'object'>, errors: ObjectImportRowError[]): string {
  const fields = errors.flatMap((entry) => {
    const raw = entry.params.fields

    return Array.isArray(raw) ? raw.map(String) : []
  })

  return fields.length === 0
    ? t('import.rowErrorsUnknown')
    : t('import.rowErrors', { fields: fields.map((field) => fieldLabel(t, field)).join(', ') })
}

export function ObjectImportPage() {
  const { t } = useTranslation('object')
  const mayImport = usePermission('object.import')

  const [csv, setCsv] = useState('')
  const [mapping, setMapping] = useState<ObjectImportMapping>({})
  const [preview, setPreview] = useState<ObjectImportPreview | null>(null)
  const [applied, setApplied] = useState<ObjectImportApplied | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const columns = headerLabels(csv)
  const rows = preview === null ? [] : preview.rows
  const summary = preview === null ? null : preview.summary

  function submittedMapping(): ObjectImportMapping | undefined {
    return Object.keys(mapping).length === 0 ? undefined : mapping
  }

  function resolvedTarget(label: string): ObjectImportTarget | null {
    const key = label.trim().toLowerCase()

    for (const [submitted, target] of Object.entries(mapping)) {
      if (submitted.trim().toLowerCase() === key) {
        return target
      }
    }

    return OBJECT_IMPORT_HEADER_TARGETS[key] ?? null
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    setError(null)

    if (file === undefined) {
      setCsv('')
      setMapping({})

      return
    }

    void readAsText(file).then(
      (text) => {
        setCsv(text)
        setMapping({})
      },
      () => setError(t('import.errors.fileRead')),
    )
  }

  async function handlePreview() {
    setError(null)
    setBusy(true)
    setPreview(null)
    setApplied(null)

    try {
      setPreview(
        await apiFetch<ObjectImportPreview>('/v1/objects/import/preview', {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({ csv, mapping: submittedMapping() } satisfies ObjectImportRequest),
        }),
      )
    } catch (caught) {
      setError(`import.errors.${errorKey(caught)}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleCommit() {
    setError(null)
    setBusy(true)

    try {
      const result = await apiFetch<ObjectImportResult>('/v1/objects/import', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ csv, mapping: submittedMapping() } satisfies ObjectImportRequest),
      })
      setPreview({ rows: result.rows, summary: result.summary })
      setApplied(result.applied)
    } catch (caught) {
      setError(`import.errors.${errorKey(caught)}`)
    } finally {
      setBusy(false)
    }
  }

  function chooseColumn(label: string, choice: string) {
    const next = { ...mapping }
    delete next[label]

    if ((OBJECT_IMPORT_TARGETS as readonly string[]).includes(choice)) {
      next[label] = choice as ObjectImportTarget
    }

    setMapping(next)
  }

  return (
    <section className="flex flex-col gap-4">
      <Link
        className="inline-flex min-h-11 items-center self-start rounded bg-slate-800 px-3 text-sm hover:bg-slate-700"
        to="/objects"
      >
        {t('import.back')}
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">{t('import.title')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('import.hint')}</p>
      </div>

      {error !== null ? <p className="text-sm text-rose-400" role="alert">{t(error)}</p> : null}

      {!mayImport ? (
        <p className="rounded-lg bg-slate-800/60 px-3 py-2 text-sm text-amber-300" role="note">
          {t('import.readOnly')}
        </p>
      ) : null}

      <label className="flex flex-col gap-1 text-sm">
        {t('import.fileLabel')}
        <input
          accept="text/csv,text/plain"
          className="rounded bg-slate-900 p-2 text-slate-100"
          data-testid="csv-file"
          disabled={!mayImport}
          onChange={handleFile}
          type="file"
        />
      </label>
      <p className="text-xs text-slate-400">{t('import.fileHint')}</p>

      {columns.length === 0 ? null : (
        <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <h2 className="text-lg font-semibold">{t('import.mapTitle')}</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-3">
            {columns.map((label) => (
              <li key={label}>
                <label className="flex flex-col gap-1 text-sm">
                  {label}
                  <select
                    data-testid="csv-map"
                    onChange={(event) => chooseColumn(label, event.target.value)}
                    value={mapping[label] ?? ''}
                  >
                    <option value="">{t('import.mapAuto')}</option>
                    {OBJECT_IMPORT_TARGETS.map((target) => (
                      <option key={target} value={target}>
                        {t(`create.fields.${target}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs text-slate-400">
                  {resolvedTarget(label) === null
                    ? t('import.mapUnmapped')
                    : t(`create.fields.${resolvedTarget(label)}`)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex gap-2">
        <button
          className="min-h-11 rounded-lg bg-sky-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
          disabled={!mayImport || busy || csv === ''}
          onClick={handlePreview}
          type="button"
        >
          {t('import.preview')}
        </button>
        <button
          className="min-h-11 rounded-lg bg-emerald-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50"
          disabled={!mayImport || busy || preview === null}
          onClick={handleCommit}
          type="button"
        >
          {t('import.commit')}
        </button>
      </div>

      {busy ? <p className="text-sm text-slate-400">{t('import.working')}</p> : null}

      {rows.length === 0 ? null : (
        <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <h2 className="text-lg font-semibold">{t('import.previewTitle')}</h2>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-700">
                  {[
                    t('import.columns.line'),
                    t('import.columns.objectNo'),
                    t('import.columns.action'),
                    t('import.columns.changed'),
                    t('import.columns.errors'),
                  ].map((heading) => (
                    <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.line}>
                    <td className="p-3 text-sm font-mono text-slate-300">{row.line}</td>
                    <td className="p-3 text-sm font-mono text-slate-200">{row.objectNo}</td>
                    <td className="p-3 text-sm">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                          row.action === 'error'
                            ? 'bg-rose-900/30 text-rose-300'
                            : row.action === 'new'
                              ? 'bg-emerald-900/30 text-emerald-300'
                              : 'bg-slate-700/40 text-slate-300'
                        }`}
                      >
                        {t(`import.actions.${row.action}`)}
                      </span>
                    </td>
                    <td className="p-3 text-sm text-slate-300">
                      {row.changed.map((target) => t(`create.fields.${target}`)).join(', ')}
                    </td>
                    <td className="p-3 text-sm text-rose-300">
                      {rowErrorText(t, row.errors)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {summary === null ? null : (
        <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <h2 className="text-lg font-semibold">{t('import.summaryTitle')}</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-4">
            {(
              [
                [t('import.summary.new'), summary.new],
                [t('import.summary.changed'), summary.changed],
                [t('import.summary.unchanged'), summary.unchanged],
                [t('import.summary.error'), summary.error],
              ] as Array<[string, number]>
            ).map(([label, count]) => (
              <li className="flex items-center gap-2" key={label}>
                {label}: {count}
              </li>
            ))}
          </ul>
        </section>
      )}

      {applied === null ? null : (
        <section className="rounded-xl border border-emerald-700 bg-emerald-950/40 p-4">
          <h2 className="text-lg font-semibold text-emerald-200">{t('import.appliedTitle')}</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-4">
            {(
              [
                [t('import.applied.created'), applied.created],
                [t('import.applied.updated'), applied.updated],
                [t('import.applied.unchanged'), applied.unchanged],
                [t('import.applied.failed'), applied.failed],
              ] as Array<[string, number]>
            ).map(([label, count]) => (
              <li className="flex items-center gap-2" key={label}>
                {label}: {count}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  )
}
