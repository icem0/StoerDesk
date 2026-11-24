/**
 * The diagrams of the statistics (`specs/12-stats.md` §12.10, ADR-0049
 * decision 3, ADR-0012 decision 6).
 *
 * The diagrams are inline SVG: the web carries no chart dependency, and the
 * answer of the API is drawn as it is — the browser never aggregates
 * (`PLAN.md` §13). Every diagram names itself for a screen reader, carries
 * the value of a point in the tooltip and shows the values in the text of the
 * page.
 */

/** One series of a diagram: the values of the points, a gap without a value. */
export type ChartSeries = {
  /** The name of the series — the legend and the tooltip carry it. */
  label: string
  /** The values of the series; `null` is a bucket without a sample. */
  values: (number | null)[]
  /** The tailwind class of the line. */
  stroke: string
  /** The tailwind class of the points. */
  fill: string
  /** The tailwind class of the legend. */
  swatch: string
}

/** The geometry of the diagram; the view box is fixed, the page scales it. */
const WIDTH = 640
const HEIGHT = 200
const PADDING = { top: 10, right: 10, bottom: 30, left: 46 }

const PLOT_WIDTH = WIDTH - PADDING.left - PADDING.right
const PLOT_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom

/**
 * The step of the y-axis: the smallest round step (1, 2, 2.5 or 5 times a
 * power of ten) that carries the value in the given number of steps. The axis
 * therefore shows round numbers only — 0, 2, 4, 6 and not 0, 2, 3, 5.
 */
function niceStep(value: number): number {
  if (value <= 0) {
    return 1
  }

  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalized = value / magnitude

  for (const factor of [1, 2, 2.5, 5, 10]) {
    if (normalized <= factor) {
      return factor * magnitude
    }
  }

  return 10 * magnitude
}

/**
 * The scale of the y-axis: the round step of the gridlines and the upper
 * bound of the axis.
 *
 * The number of the steps varies — three, four or five — and the scale with
 * the smallest headroom wins: the axis of a value of five runs from 0 to 5 in
 * steps of one, the axis of a value of ninety from 0 to 90 in steps of thirty.
 */
function axisScale(maxValue: number): { ceiling: number; step: number; lines: number } {
  let best: { ceiling: number; step: number; lines: number } | null = null

  for (const divisions of [3, 4, 5]) {
    const step = niceStep(maxValue / divisions)
    const ceiling = step * divisions

    if (ceiling < maxValue) {
      continue
    }

    if (
      best === null ||
      ceiling - maxValue < best.ceiling - maxValue ||
      (ceiling === best.ceiling && divisions > best.lines - 1)
    ) {
      best = { ceiling, step, lines: divisions + 1 }
    }
  }

  return best ?? { ceiling: 1, step: 1, lines: 4 }
}

/** The x position of a point; the points are spread over the whole width. */
function xAt(index: number, count: number): number {
  if (count <= 1) {
    return PADDING.left + PLOT_WIDTH / 2
  }

  return PADDING.left + (index / (count - 1)) * PLOT_WIDTH
}

/** The y position of a value; the axis runs from zero to the ceiling. */
function yAt(value: number, ceiling: number): number {
  return PADDING.top + PLOT_HEIGHT - (value / ceiling) * PLOT_HEIGHT
}

/**
 * The segments of one series: a gap without a sample breaks the line into
 * segments, so the diagram never draws a line over a value it does not have.
 */
function segmentsOf(values: (number | null)[]): { index: number; value: number }[][] {
  const segments: { index: number; value: number }[][] = []
  let current: { index: number; value: number }[] = []

  values.forEach((value, index) => {
    if (value === null) {
      if (current.length > 0) {
        segments.push(current)
        current = []
      }

      return
    }

    current.push({ index, value })
  })

  if (current.length > 0) {
    segments.push(current)
  }

  return segments
}

/**
 * A diagram of one or two series over the buckets of the range.
 *
 * The y-axis carries the scale (`0` and the round maximum), the x-axis the
 * date of every n-th bucket, and the legend the name of every series. A
 * series without any value draws no line.
 */
export function LineChart(props: {
  /** The label of every point on the x-axis. */
  labels: string[]
  series: ChartSeries[]
  /** The name of the diagram for a screen reader. */
  ariaLabel: string
  /** The value of a point as text — the tooltip and the axis carry it. */
  formatValue: (value: number) => string
}) {
  const { labels, series, ariaLabel, formatValue } = props
  const count = labels.length

  const values = series.flatMap((entry) => entry.values.filter((value) => value !== null))
  const { ceiling, step: axisStep, lines: axisLines } = axisScale(Math.max(1, ...values))
  const step = Math.max(1, Math.ceil(count / 6))

  return (
    <svg
      aria-label={ariaLabel}
      className="h-48 w-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
    >
      {Array.from({ length: axisLines }, (_, line) => {
        const value = axisStep * line
        const y = yAt(value, ceiling)

        return (
          <g key={`grid-${line}`}>
            <line
              className="stroke-slate-700"
              strokeWidth="1"
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={y}
              y2={y}
            />
            <text
              className="fill-slate-500 text-[10px]"
              textAnchor="end"
              x={PADDING.left - 6}
              y={y + 3}
            >
              {formatValue(Math.round(value))}
            </text>
          </g>
        )
      })}

      {series.map((entry) => (
        <g key={entry.label}>
          {segmentsOf(entry.values).map((segment, index) => (
            <polyline
              className={`${entry.stroke} fill-none`}
              key={`${entry.label}-${index}`}
              points={segment
                .map((point) => `${xAt(point.index, count)},${yAt(point.value, ceiling)}`)
                .join(' ')}
              strokeWidth="2"
            />
          ))}
          {entry.values.map((value, index) =>
            value === null ? null : (
              <circle
                className={entry.fill}
                cx={xAt(index, count)}
                cy={yAt(value, ceiling)}
                key={`${entry.label}-${index}`}
                r="3"
              >
                <title>{`${labels[index] ?? ''}: ${entry.label} ${formatValue(value)}`}</title>
              </circle>
            ),
          )}
        </g>
      ))}

      {labels.map((label, index) =>
        index % step === 0 || index === count - 1 ? (
          <text
            className="fill-slate-500 text-[10px]"
            key={`x-${index}`}
            textAnchor="middle"
            x={xAt(index, count)}
            y={HEIGHT - 10}
          >
            {label}
          </text>
        ) : null,
      )}
    </svg>
  )
}

/**
 * The legend of a diagram: the name of every series with its colour. The
 * colour is never the only sign — the name carries it.
 */
export function ChartLegend(props: { series: ChartSeries[] }) {
  return (
    <ul className="mt-1 flex flex-wrap gap-4 text-xs text-slate-400">
      {props.series.map((entry) => (
        <li className="flex items-center gap-2" key={entry.label}>
          <span aria-hidden="true" className={`inline-block h-2 w-4 rounded ${entry.swatch}`} />
          {entry.label}
        </li>
      ))}
    </ul>
  )
}

/**
 * A diagram of the count of the tickets per bucket.
 *
 * The y-axis carries the scale (`0` and the round maximum), the x-axis the
 * date of every n-th bucket, and every bar the number of the tickets in its
 * tooltip. The bars share the width of the plot; a bucket without a ticket
 * draws no bar.
 */
export function BarChart(props: {
  /** The label of every bucket on the x-axis. */
  labels: string[]
  /** The number of the tickets per bucket. */
  values: number[]
  /** The name of the diagram for a screen reader. */
  ariaLabel: string
  /** The value of a bar as text. */
  formatValue: (value: number) => string
}) {
  const { labels, values, ariaLabel, formatValue } = props
  const count = labels.length
  const { ceiling, step: axisStep, lines: axisLines } = axisScale(Math.max(1, ...values))
  const step = Math.max(1, Math.ceil(count / 6))
  const slot = PLOT_WIDTH / Math.max(1, count)

  return (
    <svg
      aria-label={ariaLabel}
      className="h-48 w-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
    >
      {Array.from({ length: axisLines }, (_, line) => {
        const value = axisStep * line
        const y = yAt(value, ceiling)

        return (
          <g key={`grid-${line}`}>
            <line
              className="stroke-slate-700"
              strokeWidth="1"
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={y}
              y2={y}
            />
            <text
              className="fill-slate-500 text-[10px]"
              textAnchor="end"
              x={PADDING.left - 6}
              y={y + 3}
            >
              {formatValue(Math.round(value))}
            </text>
          </g>
        )
      })}

      {values.map((value, index) => {
        const height = (value / ceiling) * PLOT_HEIGHT

        return (
          <rect
            className="fill-sky-500"
            height={Math.max(value > 0 ? 2 : 0, height)}
            key={`bar-${index}`}
            width={Math.max(1, slot - 4)}
            x={PADDING.left + index * slot + 2}
            y={PADDING.top + PLOT_HEIGHT - height}
          >
            <title>{`${labels[index] ?? ''}: ${formatValue(value)}`}</title>
          </rect>
        )
      })}

      {labels.map((label, index) =>
        index % step === 0 || index === count - 1 ? (
          <text
            className="fill-slate-500 text-[10px]"
            key={`x-${index}`}
            textAnchor="middle"
            x={PADDING.left + index * slot + slot / 2}
            y={HEIGHT - 10}
          >
            {label}
          </text>
        ) : null,
      )}
    </svg>
  )
}

/**
 * A ranking of rows: the name of the row, a bar of its value and the value
 * itself at the end of the bar. The rows are sorted by the caller — the
 * browser never aggregates the answer (`PLAN.md` §13).
 */
export function HorizontalBars(props: {
  rows: { key: string; label: string; value: number; title?: string }[]
  /** The name of the diagram for a screen reader. */
  ariaLabel: string
  /** The value of a row as text. */
  formatValue: (value: number) => string
}) {
  const { rows, ariaLabel, formatValue } = props
  const height = Math.max(40, rows.length * 24 + 10)
  const labelWidth = 140
  const valueWidth = 48
  const track = WIDTH - labelWidth - valueWidth
  const max = Math.max(1, ...rows.map((row) => row.value))

  return (
    <svg
      aria-label={ariaLabel}
      className="w-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      viewBox={`0 0 ${WIDTH} ${height}`}
    >
      {rows.map((row, index) => {
        const y = index * 24 + 6
        const width = (row.value / max) * track

        return (
          <g key={row.key}>
            <text
              className="fill-slate-300 text-[11px]"
              textAnchor="start"
              x="0"
              y={y + 10}
            >
              {row.label}
            </text>
            <rect
              className="fill-sky-600"
              height="12"
              rx="2"
              width={Math.max(row.value > 0 ? 2 : 0, width)}
              x={labelWidth}
              y={y}
            >
              <title>{`${row.title ?? row.label}: ${formatValue(row.value)}`}</title>
            </rect>
            <text
              className="fill-slate-400 text-[11px]"
              textAnchor="end"
              x={WIDTH}
              y={y + 10}
            >
              {formatValue(row.value)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
