import serverDe from './server.de.json'
import serverEn from './server.en.json'

export type ServerLocale = 'de' | 'en'

export type TranslationParams = Record<string, string | number>

const resources: Record<ServerLocale, Record<string, unknown>> = {
  de: serverDe as Record<string, unknown>,
  en: serverEn as Record<string, unknown>,
}

function resolveKey(bundle: Record<string, unknown>, key: string): string | undefined {
  const value = key
    .split('.')
    .reduce<unknown>(
      (current, part) =>
        current && typeof current === 'object'
          ? (current as Record<string, unknown>)[part]
          : undefined,
      bundle,
    )

  return typeof value === 'string' ? value : undefined
}

export function t(locale: string, key: string, params?: TranslationParams): string {
  const bundle = resources[locale as ServerLocale] ?? resources.de
  const template = resolveKey(bundle, key)

  if (template === undefined) {
    return key
  }

  if (!params) {
    return template
  }

  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    const replacement = params[name]
    return replacement === undefined ? match : String(replacement)
  })
}
