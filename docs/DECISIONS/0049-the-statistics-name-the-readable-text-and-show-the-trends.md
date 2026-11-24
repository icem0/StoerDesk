# ADR-0049: The statistics name the readable text and show the trends

- Status: accepted
- Date: 2026-11-24
- Stakeholders: office, manager, admin

## Context

The statistics page of phase 9 answers four read-only sections over the views
`stats_tickets`, `stats_ticket_faults` and `stats_ticket_detected_errors`. Three
problems showed up in the daily use of the page.

1. **A phase without a data source.** The answer of `GET /api/v1/stats/reaction-times`
   carries three phases: `review`, `firstResponse` and `acknowledge`. The middle
   one measures `tickets.first_response_at` — a column that migration `0006`
   added, but that no workflow event ever writes
   (`apps/api/src/tickets/workflow.ts` writes `review_started_at`,
   `accepted_at`, `acknowledged_at` and `closed_at`). The phase was therefore
   never a measurement: it answered a count of zero and empty durations, and
   the dashboard showed the same empty average as „Ø Zeit bis Rückmeldung“.
2. **Machine keys instead of names.** The four groupings of the frequency
   section answer the machine key (`bma.detector_fault`, `BMA`,
   `TEMP_SENSOR`) and the column heading calls it „Schlüssel“. The readable
   texts exist already: the fault templates carry their translation in
   `text_template_translations`, the detected errors in
   `detected_errors.label_de` / `label_en`, and the system types are a fixed
   list of the administration.
3. **One diagram without a scale.** The frequency series is drawn as an inline
   SVG of bars without an axis, without a scale and without a value; there is
   no diagram of the reaction times over the time and none of the processing
   time, so a trend cannot be read at all.

## Decision

1. **A column that no workflow writes is not a phase.** The phase
   `firstResponse` is removed from the answer of
   `GET /api/v1/stats/reaction-times`, from the CSV export and from the page;
   the average `averageFirstResponseMinutes` leaves the evaluation block of
   the dashboard snapshot (`specs/11-dashboard.md` §11.4a) and the row
   „Ø Zeit bis Rückmeldung“ leaves the display. The column
   `tickets.first_response_at` stays in the database as an unused legacy
   column — no migration removes it and no query reads it.
2. **The statistics name the readable text.** The frequency answer carries the
   labels of the fault templates and of the detected errors next to the key
   (`labelDe` and `labelEn`, the machine key stays for the drilldown and for
   the export). The system type keeps its key alone: `objects.external_type` is
   a free text, so the web translates the known types from a fixed map and
   falls back to the raw value for an unknown one. The page shows the readable
   text only — the key is not a second line under the name. The CSV export
   carries the labels as their own metric rows (`labelDe`, `labelEn`), so the
   file stays machine-readable.
3. **The trends are answered by the API and drawn as inline SVG.** A new route
   `GET /api/v1/stats/trends` answers the averages per bucket over the same
   filter as the other sections (`specs/12-stats.md` §12.11): the reaction
   times per phase and the processing time, each as an average over the
   tickets that were reported in the bucket. The web draws the lines, the bars
   and the ranking as inline SVG — ADR-0012 decision 6 stays valid, no chart
   dependency and no client-side aggregation (the aggregation happens in SQL,
   the browser only draws the answer).

## Alternatives

- **Keeping the phase and writing `first_response_at`:** rejected for now — a
  first answer to the reporter is a workflow of its own (a customer-visible
  comment, ADR-0034), and it belongs into a later phase with its own contract
  than a hidden column.
- **Translating the keys in the browser:** rejected — the browser would need
  the fault catalog and the detected-error catalog beside the statistics, and
  a reader without `settings.read` would see raw keys again. The API answers
  the label.
- **A chart library (chart.js, recharts):** rejected — ADR-0012 decision 6
  keeps the web free of a chart dependency; the series of this page are small
  and an inline SVG with an axis is enough.
- **Aggregating in the browser:** rejected — `PLAN.md` §13 and
  `specs/12-stats.md` §12.7 forbid it: the aggregates belong into SQL.

## Consequences

- The page loses a column that never carried a value and gains the names the
  office knows.
- The trends make a development visible that the tables could not show: a
  reaction time that grows over the months, a processing time that shrinks
  after a change of the duty plan.
- The answer of the statistics API changes in two places: the phase
  `firstResponse` is gone and the groupings carry labels. Consumers of the API
  outside this repository read the versioned CSV export.
- `ADR-0015` is amended: the evaluation block of the dashboard carries three
  averages instead of four, for the same reason.
