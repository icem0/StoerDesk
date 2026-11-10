import { describe, expect, it } from 'vitest'

import {
  CSV_IMPORT_MAX_BYTES,
  CSV_IMPORT_MAX_ROWS,
  type ObjectImportMapping,
} from '@stoerdesk/shared'
import { parseObjectCsv, type ObjectCsvDocument } from '../import'

/**
 * The CSV reader and the header mapping of the object import
 * (`specs/08-objects-api.md` §9.4, WP-M10-12). Row classification, the write
 * path and the per-row errors need a database and live in the integration spec.
 */

function values(document: ObjectCsvDocument, row: number) {
  const entry = document.rows[row]

  return entry === undefined ? {} : entry.values
}

function rejected(csv: string, mapping?: ObjectImportMapping) {
  try {
    parseObjectCsv(csv, mapping)
  } catch (error) {
    expect((error as { code: string }).code).toBe('invalid_request')
    expect((error as { params: Record<string, unknown> }).params).toEqual({ fields: ['csv'] })

    return
  }

  throw new Error(`parseObjectCsv accepted the invalid document ${JSON.stringify(csv)}`)
}

describe('parseObjectCsv (WP-M10-12)', () => {
  it('reads comma-separated quoted fields', () => {
    const document = parseObjectCsv('objectNo,name\nA-1,"Pump, house"')

    expect(document.targets).toEqual(['objectNo', 'name'])
    expect(values(document, 0).name).toBe('Pump, house')
  })

  it('reads semicolon-separated records with CRLF and an embedded newline', () => {
    const document = parseObjectCsv('objektnummer;bezeichnung\r\nA-2;"line one\nline two"\r\n')

    expect(document.targets).toEqual(['objectNo', 'name'])
    expect(document.rows).toHaveLength(1)
    expect(document.rows[0]?.line).toBe(2)
    expect(values(document, 0).name).toBe('line one\nline two')
  })

  it('unescapes a doubled quote inside a quoted cell', () => {
    const document = parseObjectCsv('objectNo,name\nA-3,"He said ""hello"""')

    expect(values(document, 0).name).toBe('He said "hello"')
  })

  it('maps the German aliases of §9.4 case-insensitively', () => {
    const document = parseObjectCsv(
      'Objektnummer;BEZEICHNUNG;Strasse;Hausnummer;PLZ;Ort;Ansprechpartner;Telefon;Email;Notiz\n' +
        'A-4;Depot;Musterweg;7;10115;Berlin;Max;+49 1234;max@example.com;keep',
    )

    expect(document.targets).toEqual([
      'objectNo',
      'name',
      'street',
      'houseNumber',
      'postalCode',
      'city',
      'contactName',
      'contactPhone',
      'contactEmail',
      'notes',
    ])
    expect(values(document, 0).city).toBe('Berlin')
  })

  it('honours a submitted mapping and drops unknown columns', () => {
    const document = parseObjectCsv('nr;label;remark\nA-5;Depot five;free text', {
      nr: 'objectNo',
      label: 'name',
    })

    expect(document.targets).toEqual(['objectNo', 'name'])
    expect(values(document, 0).objectNo).toBe('A-5')
    expect(values(document, 0).remark).toBeUndefined()
  })

  it('answers an empty cell for a column the row does not carry', () => {
    const document = parseObjectCsv('objectNo,name,city\nA-6;Depot six')

    expect(values(document, 0).city).toBe('')
  })

  it('keeps rows without an object number or a name instead of skipping them', () => {
    const document = parseObjectCsv('objectNo,name\nA-7,\n,no number')

    expect(document.rows).toHaveLength(2)
    expect(values(document, 0).name).toBe('')
    expect(values(document, 1).objectNo).toBe('')
  })

  it('rejects an empty document with invalid_request on the field csv', () => {
    rejected('  \n')
  })

  it('rejects a duplicated header', () => {
    rejected('objectNo,name,name\nA-1,b,c')
  })

  it('rejects a mapping onto qrToken, which is no import field', () => {
    rejected('qr;name\nA-1,b', { qr: 'qrToken' } as unknown as ObjectImportMapping)
  })

  it('rejects more data rows than the limit allows', () => {
    rejected(`objectNo,name\n${'A-1,x\n'.repeat(CSV_IMPORT_MAX_ROWS + 1)}`)
  })

  it('accepts exactly the allowed number of data rows', () => {
    const document = parseObjectCsv(`objectNo,name\n${'A-1,x\n'.repeat(CSV_IMPORT_MAX_ROWS)}`)

    expect(document.rows).toHaveLength(CSV_IMPORT_MAX_ROWS)
    expect(document.rows[CSV_IMPORT_MAX_ROWS - 1]?.line).toBe(CSV_IMPORT_MAX_ROWS + 1)
  })

  it('rejects a document above the byte limit', () => {
    rejected(`objectNo,name\nA-1,${'x'.repeat(CSV_IMPORT_MAX_BYTES)}`)
  })
})
