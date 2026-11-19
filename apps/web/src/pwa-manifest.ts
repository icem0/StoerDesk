/**
 * The icons of the PWA web manifest (WP-M14-157).
 *
 * A browser only offers an install of the app when the manifest names a 192 px
 * and a 512 px PNG icon; one small icon with `sizes: "any"` keeps the app
 * uninstallable and the browser stays silent (`specs/09-offline.md` §9.4). The
 * two files are the logo of `docs/material/logo.png` centred on a square canvas
 * of its own background colour, so the icon keeps its contrast and survives a
 * round or maskable crop.
 */
export interface IconResource {
  src: string
  sizes: string
  type: string
}

export const pwaIcons: IconResource[] = [
  { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
  { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
]
