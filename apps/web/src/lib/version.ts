declare const __APP_VERSION__: string | undefined

/**
 * Version shown in the web shell (WP-M1-15). `vite.config.ts` injects the value at
 * build time: the `VITE_APP_VERSION` build argument for images, otherwise the nearest
 * git tag. Outside a Vite build the safe fallback is `dev`.
 */
export const appVersion: string =
  typeof __APP_VERSION__ === 'string' && __APP_VERSION__.trim() !== ''
    ? __APP_VERSION__.trim()
    : 'dev'
