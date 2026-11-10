# ADR-0015: Dashboard evaluations — averages only, no worst reaction time

- Status: accepted
- Date: 2026-11-10
- Stakeholders: office, manager, admin

## Context

The office asked for evaluations on the dashboard start page next to the tiles:
average durations such as the processing time of a ticket. The request
explicitly leaves one value out: the worst ("largest") reaction time must
neither be calculated nor displayed. `specs/12-stats.md` §12.2 already answers
median, average and p90 per phase for the statistics page; the dashboard
contract (§11.2) carries no duration at all today, and `specs/12-stats.md`
§12.10 forbids statistics tiles on the dashboard beyond §11.4.

## Decision

1. **The snapshot gains an `evaluations` block** (`specs/11-dashboard.md` §11.2,
   §11.4): `windowDays`, the `tickets` count of the qualifying set inside the
   window and four nullable whole-minute averages — `averageReviewMinutes`,
   `averageFirstResponseMinutes`, `averageAcknowledgeMinutes` (the three phases
   of §12.2 measured from `reported_at`) and `averageProcessingMinutes`
   (`closed_at` minus `reported_at`, the bearbeitung time of a ticket).
2. **Averages only.** No median, no p90 and no max, in the contract and in the
   SQL: the worst reaction time stays out — it is never calculated and never
   displayed on the dashboard. Percentile aggregates remain a statistics-page
   concern (§12.2).
3. **Same base as the fault-free counter.** The window is the last 30 days
   before `now` (`EVALUATION_WINDOW_DAYS`, a fixed constant — not a setting);
   the qualifying set is the counter's set (`is_test = false`,
   `suspected_spam = false`, `status <> 'CANCELLED'`, `reported_at` in the
   window), read from the `stats_tickets` view. A duration without its end
   column or a negative duration is excluded; an average without any sample
   is `null`.
4. **The block is optional in the shared contract** so a browser holding an
   older SSE frame still parses; the service always answers it.

## Alternatives

- **Reusing `queryReactionTimes` of `stats/reaction-times.ts`:** rejected —
  it computes `percentile_cont(0.9)`, and the request explicitly asks to leave
  the worst reaction time out of the calculation, so the dashboard gets its
  own single `AVG`-only query.
- **A stored or materialized average:** rejected (ADR-0012 decision 2) — one
  indexed aggregate per snapshot is cheap enough.
- **A configurable window:** rejected for now — the 30-day constant matches the
  statistics default of §12.1 and keeps the dashboard settings of §11.8
  unchanged; a setting would be a later WP.
- **Displaying max/p90 greyed out:** rejected — the office decision is that the
  value is not part of the product view at all.

## Consequences

- The start page shows one evaluation block (WP-M10-19b); the wall display
  receives the block with the snapshot but only renders what §11.7 lists.
- The statistics API and page keep their p90 columns; the two surfaces answer
  different shapes over the same views.
- `evaluations` is one more aggregate per snapshot and per five-second
  re-render; it carries counts and minutes only — no contact data, no names.
