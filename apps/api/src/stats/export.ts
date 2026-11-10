import type { Compliance, Declines } from './compliance'
import type { Frequency } from './frequency'
import type { TopObject } from './objects'
import type { ReactionTimes } from './reaction-times'

/** The five result sections of the statistics export (`specs/12-stats.md` §12.9). */
export type StatisticsSections = {
  reactionTimes: ReactionTimes
  frequency: Frequency
  objects: TopObject[]
  compliance: Compliance
  declines: Declines
}

/** The fixed, machine-readable header of `specs/12-stats.md` §12.9. */
const HEADER = 'section;metric;bucket;key;value'

/** Quotes a field only when it contains a separator, a quote or a line break. */
function encodeField(value: string): string {
  if (/[;"\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }

  return value
}

function row(
  section: string,
  metric: string,
  bucket: string,
  key: string,
  value: string,
): string {
  return [section, metric, bucket, key, value].map(encodeField).join(';')
}

type BucketUnit = 'day' | 'week' | 'month'

/**
 * Serializes the five statistics sections into semicolon-separated UTF-8 rows
 * (`specs/12-stats.md` §12.9, WP-M9-13).
 *
 * The rows are yielded one line at a time, so the route streams them instead of
 * building the whole file as one large string. `bucket` is the frequency unit
 * and empty outside the `frequency` section.
 */
export function* toStatisticsCsv(
  sections: StatisticsSections,
  bucket: BucketUnit = 'day',
): Generator<string> {
  yield `${HEADER}\n`

  const phases: [string, ReactionTimes['review']][] = [
    ['review', sections.reactionTimes.review],
    ['firstResponse', sections.reactionTimes.firstResponse],
    ['acknowledge', sections.reactionTimes.acknowledge],
  ]

  for (const [phase, data] of phases) {
    yield `${row('reactionTimes', 'count', '', phase, String(data.count))}\n`
    yield `${row('reactionTimes', 'medianMinutes', '', phase, String(data.medianMinutes))}\n`
    yield `${row('reactionTimes', 'averageMinutes', '', phase, String(data.averageMinutes))}\n`
    yield `${row('reactionTimes', 'p90Minutes', '', phase, String(data.p90Minutes))}\n`
  }

  yield `${row('reactionTimes', 'pausedTickets', '', '', String(sections.reactionTimes.pausedTickets))}\n`
  yield `${row('reactionTimes', 'pauseMinutes', '', '', String(sections.reactionTimes.pauseMinutes))}\n`

  for (const point of sections.frequency.series) {
    yield `${row('frequency', 'series', bucket, point.bucketStart, String(point.total))}\n`
  }

  for (const entry of sections.frequency.bySystemType) {
    yield `${row('frequency', 'bySystemType', bucket, entry.key, String(entry.count))}\n`
  }

  for (const entry of sections.frequency.byFaultTemplate) {
    yield `${row('frequency', 'byFaultTemplate', bucket, entry.key, String(entry.count))}\n`
  }

  for (const entry of sections.frequency.bySource) {
    yield `${row('frequency', 'bySource', bucket, entry.key, String(entry.count))}\n`
  }

  for (const object of sections.objects) {
    yield `${row('objects', 'count', '', object.objectNo, String(object.count))}\n`
    yield `${row('objects', 'conspicuous', '', object.objectNo, String(object.conspicuous))}\n`
    yield `${row('objects', 'objectName', '', object.objectNo, object.objectName)}\n`
  }

  yield `${row('compliance', 'acknowledged', '', '', String(sections.compliance.acknowledged))}\n`
  yield `${row('compliance', 'onTime', '', '', String(sections.compliance.onTime))}\n`
  yield `${row('compliance', 'late', '', '', String(sections.compliance.late))}\n`
  yield `${row('compliance', 'openOverdue', '', '', String(sections.compliance.openOverdue))}\n`
  yield `${row(
    'compliance',
    'onTimeRate',
    '',
    '',
    sections.compliance.onTimeRate === null ? '' : String(sections.compliance.onTimeRate),
  )}\n`

  yield `${row(
    'declines',
    'declineRate',
    '',
    '',
    sections.declines.declineRate === null ? '' : String(sections.declines.declineRate),
  )}\n`

  for (const reason of sections.declines.topReasons) {
    yield `${row('declines', 'topReason', '', reason.reason, String(reason.count))}\n`
  }
}
