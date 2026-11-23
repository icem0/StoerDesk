/**
 * The name of an entry in the language of the interface (`specs/13-ui.md` §14.8,
 * ADR-0043).
 *
 * The administration shows one name per row: the name of the language the
 * interface is set to. The machine key is the fallback, so a row is never
 * nameless. The helpers of this module answer the name and the record of the
 * languages of an entry — the API answers the texts as it does today (a pair
 * `de`/`en` or a record of locales), the web composes the record out of it.
 */

/** The name of the entry in the given language, the fallback `de` and then the key. */
export function localizedName(
  names: Record<string, string>,
  locale: string,
  fallback: string,
): string {
  const name = names[locale] ?? names.de

  return name !== undefined && name.trim() !== '' ? name : fallback
}

/**
 * The record of the languages of an entry out of the flat answer of the API
 * (`nameDe`/`nameEn`, `labelDe`/`labelEn`). An empty text is no language.
 */
export function languageRecord(
  entries: Record<string, string | undefined>,
): Record<string, string> {
  const record: Record<string, string> = {}

  for (const [locale, text] of Object.entries(entries)) {
    if (text !== undefined && text.trim() !== '') {
      record[locale] = text
    }
  }

  return record
}

/** The languages of an entry, `de` first, the rest in alphabetical order. */
export function languagesOf(names: Record<string, string>): string[] {
  return Object.keys(names).sort((left, right) => {
    if (left === right) {
      return 0
    }

    if (left === 'de') {
      return -1
    }

    if (right === 'de') {
      return 1
    }

    return left.localeCompare(right)
  })
}
