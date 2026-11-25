import { type ReactNode } from 'react'

/**
 * The hull of a settings and administration page (WP-M29-06, specs/13-ui.md
 * §14.11): the page renders its content into the `<main>` of the shell, so
 * every internal page carries exactly one landmark. The shell brings the
 * padding, the colour and the width of the frame; the page brings its heading,
 * its back link and its content.
 */
export function AdminLayout({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}): ReactNode {
  return <div className={`flex flex-col ${className ?? ''}`}>{children}</div>
}
