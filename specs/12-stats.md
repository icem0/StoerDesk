# 12 — Statistics

**Chapter:** 13
**Scope:** ~140 lines
**Status:** reviewed for phase 9 (WP-M9-01)

The binding summary is `PLAN.md` §13. This slice details the filters, the
reaction-time and frequency queries, the conspicuous-object rule, deadline
compliance and decline statistics, the SQL views, the API and the CSV export.
The decisions behind it are ADR-0012.

## 12.1 Filters and range

Every statistics read takes the same filter object:

| Field | Rule |
| --- | --- |
| `from`, `to` | calendar dates (`YYYY-MM-DD`) in `Europe/Berlin`, inclusive; default the last 30 days; `from <= to` and at most 366 days, otherwise `422 stats_range_invalid` |
| `objectNo` | optional, exact match case-insensitively |
| `systemType` | optional, one `objects.external_type` value |
| `priority` | optional, one `low`/`normal`/`high`/`critical` |
| `technician` | optional user id, matched against `tickets.assigned_user_id` |
| `includeTest` | optional boolean, default `false` |
| `includeSpam` | optional boolean, default `false` |

A ticket counts when its `reported_at` falls inside the local range. `is_test`
tickets are excluded unless `includeTest` is true; `suspected_spam` tickets are
excluded unless `includeSpam` is true. The local range boundaries are converted
with `date-fns-tz`; all buckets use local calendar days, Monday as the first
weekday, in `Europe/Berlin` (§15, all server times UTC).

## 12.2 Reaction times

Three phases are measured from `reported_at`:

| Phase | End |
| --- | --- |
| `review` | `review_started_at` |
| `firstResponse` | `first_response_at` |
| `acknowledge` | `acknowledged_at` |

Only rows with a non-null end inside the range are counted. Per phase the answer
carries `count`, `medianMinutes`, `averageMinutes` and `p90Minutes`, computed in
SQL with `percentile_cont` — never in the client and never from a materialized
snapshot. Negative durations are impossible for a valid workflow and are
ignored if a legacy row violates the order.

Pauses are reported separately, never subtracted from a phase: the response
carries `pausedTickets` and `pauseMinutes` (the summed pause length of the
tickets in the range, from `ticket_pauses`). A consumer can therefore show a
reaction time next to the pause burden of the same period.

## 12.3 Frequency

Three groupings over the same filtered set:

- `series`: one point per bucket, `bucket` being `day`, `week` or `month`,
  answering `{ bucketStart, total }`;
- `bySystemType`: `[{ key, count }]` from `objects.external_type`;
- `byFaultTemplate`: `[{ key, count }]`, one row per distinct
  `tickets.fault_template_keys` entry, keyed by the language-neutral template
  key;
- `bySource`: `[{ key, count }]` over `QR`, `INTERNAL`, `API`.

The bucket is derived from `reported_at` converted to `Europe/Berlin`; a week
starts on Monday. The series has no gaps: an empty bucket is answered with
`total: 0`, so a chart has a continuous axis.

## 12.4 Top objects and the conspicuous flag

`topObjects` is the filtered report count per object, sorted by count descending
and then by lower-case object number, limited to 25 rows, with
`{ objectNo, objectName, count, conspicuous }`. The drilldown opens
`/tickets?objectNo=<objectNo>&from=<from>&to=<to>`.

`conspicuous` is independent of the selected range: it is true when the object
has more than `stats.conspicuous_threshold` tickets in the 90 days before `to`
(default 3, editable on `/admin/dashboard`). The flag never hides a row; it
marks it.

## 12.5 Deadline compliance and declines

`compliance` answers:

- `acknowledged`: tickets in range with `acknowledged_at` set;
- `onTime`: of those, `acknowledged_at <= deadline_at`;
- `late`: the rest;
- `openOverdue`: open, non-cancelled tickets in range with
  `deadline_at < now`;
- `onTimeRate`: `onTime / acknowledged`, `null` when `acknowledged = 0`.

The timeline stops at `ACKNOWLEDGED` (`PLAN.md` §9), so a ticket without an
acknowledgement has no compliance result and is counted only as `openOverdue`.

`declines` answers `declineRate` and `topReasons`:

- the denominator is the number of distinct tickets in range that reached
  `OFFERED` or `ASSIGNED`;
- the numerator is the number of distinct tickets with a `declined` event in
  `ticket_events`;
- `topReasons` groups the `declined` event payload `reason`, normalized to
  trimmed lower-case keys, sorted by count, limited to ten rows;
- the rate is `null` when the denominator is zero.

## 12.6 Settings

| Key | Default | Validation |
| --- | --- | --- |
| `stats.conspicuous_threshold` | `3` | integer `1`–100 |
| `dashboard.tv_token` | generated | 32-byte `base64url`, never logged |
| `dashboard.tv_anonymize` | `false` | boolean |

The statistics keys live in the existing `settings` table and are read through
`GET /api/v1/settings/dashboard` together with the dashboard settings of
`specs/11-dashboard.md` §11.8. A missing or invalid row falls back to the
default.

## 12.7 SQL views

Migration `0024_stats_views` creates two plain views; phase 9 uses no
materialized view (ADR-0012 decision 2):

- `stats_tickets` — one row per ticket with `ticket_no`, `object_id`,
  `object_no`, `object_name`, `system_type`, `priority`, `source`, `status`,
  `assigned_user_id`, the four workflow timestamps, `deadline_at`, `is_test`,
  `suspected_spam` and the ticket's summed `pause_seconds`;
- `stats_ticket_faults` — one row per ticket and `fault_template_keys` entry.

Every aggregate of §12.2–§12.5 reads these views; no request loads ticket rows
into the API process beyond the aggregate result, and no request loads tickets
into the browser (`PLAN.md` §13). The views inherit the indexes of `tickets`,
`ticket_pauses` and `objects`, so the range predicate uses
`tickets(object_id, reported_at)` and `tickets(status)`.

## 12.8 API

| Method and path | Permission | Answer |
| --- | --- | --- |
| `GET /api/v1/stats/reaction-times` | `stats.read` | §12.2 |
| `GET /api/v1/stats/frequency?bucket=day\|week\|month` | `stats.read` | §12.3 |
| `GET /api/v1/stats/objects` | `stats.read` | §12.4 |
| `GET /api/v1/stats/compliance` | `stats.read` | §12.5 |
| `GET /api/v1/stats/export.csv` | `stats.export` | all sections as CSV |

The four JSON routes share the filter schema of §12.1. A malformed filter is
`422 invalid_request` with field errors; an impossible range is
`422 stats_range_invalid`. The routes are read-only.

## 12.9 CSV export

`GET /api/v1/stats/export.csv` applies the same filters and writes a
semicolon-separated UTF-8 file with the fixed header
`section;metric;bucket;key;value`. The sections are `reactionTimes`,
`frequency`, `objects`, `compliance` and `declines`; `bucket` is empty outside
`frequency`. The response carries
`content-disposition: attachment; filename="stoerdesk-statistik-<from>-<to>.csv"`
and is streamed from the database cursor, never built as one large string in
memory. The export requires `stats.export`, so a `manager` can export while a
read-only statistics viewer cannot.

## 12.10 Boundaries

- No statistics tile on the dashboard beyond the tiles of
  `specs/11-dashboard.md` §11.4 and the evaluations block of §11.4a
  (WP-M10-19, averages only); the dashboard and the statistics page read the
  same views but answer different shapes.
- No scheduled report, no PDF, no e-mail delivery of statistics.
- No object-type deadline analysis (`PLAN.md` §19 leaves it undecided).
- No materialized view and no refresh job in phase 9 (ADR-0012).
- No chart dependency; the web draws the series as inline SVG.
