import { describe, expect, it } from 'vitest'

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * WP-M40-01: a double tap on the screen of a phone zooms the page into the
 * touched place — the report form and the ticket list jump away from the
 * finger that touched them.
 *
 * The rule of `styles.css` (`touch-action: manipulation`) forbids that zoom
 * and keeps the pinch zoom — the zoom of the page is never switched off
 * (§14.2, WCAG 1.4.4). The viewport of `index.html` must not carry
 * `user-scalable=no` or a `maximum-scale` below 1 for the same reason.
 */

/** The sources of the web live beside the package, whether the package or the
 *  repository root runs the test. */
function webRoot(): string {
  return existsSync(join(process.cwd(), 'apps/web')) ? join(process.cwd(), 'apps/web') : process.cwd()
}

function stylesheet(): string {
  return readFileSync(join(webRoot(), 'src/styles.css'), 'utf8')
}

function viewport(): string {
  const html = readFileSync(join(webRoot(), 'index.html'), 'utf8')

  return /<meta\s+name="viewport"[^>]*>/.exec(html)?.[0] ?? ''
}

describe('the zoom of the page', () => {
  it('forbids the zoom of a double tap', () => {
    expect(stylesheet()).toMatch(/touch-action:\s*manipulation/)
  })

  it('keeps the zoom of the pinch gesture', () => {
    // `manipulation` allows panning and pinch zoom — only the double tap is
    // forbidden. A rule that switched the zoom off entirely would break the
    // reader who needs a bigger type.
    expect(stylesheet()).not.toMatch(/touch-action:\s*(none|pan-x|pan-y)\s*;/)
  })

  it('never switches the zoom of the page off in the viewport', () => {
    const meta = viewport()

    expect(meta).not.toMatch(/user-scalable\s*=\s*no/i)
    expect(meta).not.toMatch(/maximum-scale\s*=\s*(0|0\.\d+|1(?!\.)|1\s)/i)
  })
})
