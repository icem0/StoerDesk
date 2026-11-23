import { describe, expect, it } from 'vitest'

import { pwaIcons } from '../pwa-manifest'

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/** The icon assets live in `apps/web/public`, whether the package or the
 * repository root runs the test. */
function iconAsset(src: string): string {
  expect(src).toMatch(/^\/[\w.-]+\.png$/)

  const packageRoot = existsSync(join(process.cwd(), 'apps/web'))
    ? join(process.cwd(), 'apps/web')
    : process.cwd()

  return join(packageRoot, 'public', src.slice(1))
}

/** The width and height of the `IHDR` chunk of a PNG file. */
function pngSize(asset: string): [number, number] {
  const bytes = readFileSync(asset)

  expect(bytes.slice(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  )
  expect(bytes.toString('ascii', 12, 16)).toBe('IHDR')

  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
}

describe('pwaIcons', () => {  it('names a 192 px and a 512 px PNG icon', () => {
    const sizes = pwaIcons.map((icon) => icon.sizes)

    expect(sizes).toEqual(['192x192', '512x512'])
    expect(pwaIcons.every((icon) => icon.type === 'image/png')).toBe(true)
  })

  it('the icon files really are square PNGs of the declared size', () => {
    for (const icon of pwaIcons) {
      const [width, height] = pngSize(iconAsset(icon.src))
      const declared = Number(icon.sizes.slice(0, icon.sizes.indexOf('x')))

      expect(width).toBe(declared)
      expect(height).toBe(declared)
    }
  })

  it('the app icon of the header stays a separate asset', () => {
    expect(pwaIcons.some((icon) => icon.src === '/logo.png')).toBe(false)
  })
})

describe('the nginx config of the web image', () => {
  /** The template lives beside the package, whether the package or the
   * repository root runs the test. */
  function nginxTemplate(): string {
    const packageRoot = existsSync(join(process.cwd(), 'apps/web'))
      ? join(process.cwd(), 'apps/web')
      : process.cwd()

    return readFileSync(join(packageRoot, 'nginx-pwa.conf.template'), 'utf8')
  }

  it('serves the manifest as application/manifest+json', () => {
    const template = nginxTemplate()

    expect(template).toContain('location = /manifest.webmanifest')
    expect(template).toContain('application/manifest+json')
  })

  it('never serves the shell of the app from a stale cache', () => {
    const template = nginxTemplate()

    expect(template).toMatch(/location = \/index\.html \{[^}]*Cache-Control "no-cache"/s)
  })
})
