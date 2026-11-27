import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BarChart, HorizontalBars, LineChart } from '../charts'

/**
 * The diagrams of the statistics (`specs/12-stats.md` §12.10, ADR-0049
 * decision 3): the axis of a diagram carries round numbers only, and a gap
 * without a value breaks the line instead of drawing a line over a value the
 * answer does not have.
 */
const series = [
  {
    label: 'Reaktionszeit',
    values: [1, 2, null, 4],
    stroke: 'stroke-sky-400',
    fill: 'fill-sky-400',
    swatch: 'bg-sky-400',
  },
]

/** The texts of the diagram: the axis, the dates and the tooltips. */
function textsOf(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('text')).map((node) => node.textContent ?? '')
}

describe('the diagrams of the statistics', () => {
  it('shows a round scale on the axis', () => {
    const { container } = render(
      <LineChart
        ariaLabel="Verlauf"
        formatValue={(value) => String(value)}
        labels={['10.03.', '11.03.', '12.03.', '13.03.']}
        series={series}
      />,
    )

    // The largest value is 4: the axis runs from 0 to 4 in steps of one.
    const axis = textsOf(container).filter((text) => /^[0-9]+$/.test(text))

    expect(axis).toEqual(['0', '1', '2', '3', '4'])
  })

  it('rounds the scale of the axis up to the next round step', () => {
    const { container } = render(
      <BarChart
        ariaLabel="Meldungen"
        formatValue={(value) => String(value)}
        labels={['10.03.', '11.03.']}
        values={[5, 2]}
      />,
    )

    // The largest value is 5: the axis runs from 0 to 5 in steps of one.
    const axis = textsOf(container).filter((text) => /^[0-9]+$/.test(text))

    expect(axis).toEqual(['0', '1', '2', '3', '4', '5'])
  })

  it('names itself for a screen reader and shows the value in the tooltip', () => {
    const { container } = render(
      <LineChart
        ariaLabel="Verlauf der Reaktionszeit"
        formatValue={(value) => `${value} min`}
        labels={['10.03.', '11.03.', '12.03.', '13.03.']}
        series={series}
      />,
    )

    const titles = Array.from(container.querySelectorAll('title')).map(
      (node) => node.textContent ?? '',
    )

    expect(titles).toContain('10.03.: Reaktionszeit 1 min')
    // The bucket without a sample has no value and no point.
    expect(titles).toHaveLength(3)
  })

  it('names the values of every diagram in a list below it, outside the hover (WP-M36-07)', () => {
    const line = render(
      <LineChart
        ariaLabel="Verlauf"
        formatValue={(value) => `${value} min`}
        labels={['10.03.', '11.03.', '12.03.', '13.03.']}
        series={series}
      />,
    )

    // A gap without a value is no entry: three of the four buckets carry a value.
    const lineValues = line.container.querySelector('[data-testid="chart-values"]')

    expect(lineValues?.querySelectorAll('li')).toHaveLength(3)
    expect(lineValues?.textContent).toContain('10.03.: Reaktionszeit 1 min')
    expect(lineValues?.textContent).toContain('13.03.: Reaktionszeit 4 min')
    expect(lineValues?.textContent).not.toContain('12.03.')
    line.unmount()

    const bars = render(
      <BarChart
        ariaLabel="Meldungen"
        formatValue={(value) => String(value)}
        labels={['Mo', 'Di']}
        values={[5, 7]}
      />,
    )

    expect(
      Array.from(bars.container.querySelectorAll('[data-testid="chart-values"] li')).map(
        (item) => item.textContent,
      ),
    ).toEqual(['Mo: 5', 'Di: 7'])
    bars.unmount()

    const ranking = render(
      <HorizontalBars
        ariaLabel="Rangliste"
        formatValue={(value) => String(value)}
        rows={[
          { key: 'a', label: 'Rathaus', value: 9 },
          { key: 'b', label: 'Schule', value: 4, title: 'Schule Nord' },
        ]}
      />,
    )

    expect(
      Array.from(ranking.container.querySelectorAll('[data-testid="chart-values"] li')).map(
        (item) => item.textContent,
      ),
    ).toEqual(['Rathaus: 9', 'Schule Nord: 4'])
  })
})
