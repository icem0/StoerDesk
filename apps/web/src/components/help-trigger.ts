/**
 * The one look of an info symbol beside a heading or a label (`specs/13-ui.md`
 * §14.13, ADR-0060). Every ⓘ of the interface wears this class, so the symbols
 * stand the same way on every page: inline in the line of the thing they explain,
 * never as a block of their own.
 */
export const helpTriggerClass =
  'flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400'
