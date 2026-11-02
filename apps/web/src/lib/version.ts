declare const __APP_VERSION__: string | undefined

/**
 * Version shown in the web shell. `vite.config.ts` injects the application version
 * at build time (the tracked `VERSION` file, a CI override or the nearest tag); it
 * is not the frontend stack version. Outside a Vite build the fallback is `dev`.
 */
export const appVersion: string =
  typeof __APP_VERSION__ === 'string' && __APP_VERSION__.trim() !== ''
    ? __APP_VERSION__.trim()
    : 'dev'
