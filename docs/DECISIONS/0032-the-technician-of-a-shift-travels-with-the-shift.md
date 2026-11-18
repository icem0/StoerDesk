# ADR-0032: The technician of a shift travels with the shift

- Status: accepted
- Date: 2026-11-18
- Stakeholders: office, on-call technician, admin

## Context

The readiness calendar of `/oncall` showed the office that a shift which clearly
had a technician answered „nicht besetzt", and an admin could not read **who**
has the readiness **when**. The calendar had resolved the name of a technician
over the members of the pool (`GET /api/v1/oncall/pools/:id/members`): a shift
whose technician was nobody's member — a pool with a group whose technician was
not in that group, a user without the `oncall` role, or the administrator
themselves — answered nothing.

`specs/04-oncall.md` §4a.3 keeps `user_id` a foreign key to `users`: the
technician of a shift is the person responsible for that shift. §4a.2 makes the
pool the **candidates of a swap**, not the owners of a shift, and the
administration grid offers every active user for a grouped pool. So the
technician of a shift is no member of its pool by design, and a second lookup
cannot name them.

## Decision

1. **The technician travels with the shift.** The calendar range
   `GET /api/v1/oncall/shifts` answers `technician` next to every shift — the
   display data of `user_id` in the shape of a pool member
   (`{ id, givenName, familyName, email }`) or `null` while the slot is
   unstaffed. One request carries what the calendar draws.
2. **The readiness calendar names the technician of the shift it received.** It
   asks for the members of a pool no more; the swap form of the own readiness
   still reads the members of the pool, because those are the candidates of a
   swap.
3. **The gate to the names stays in the web app** (`specs/01-rbac.md` §3.7,
   WP-M14-131/132): a role without `oncall.read_names` reads the same calendar
   and the row answers „besetzt" instead of the name. The answer of the shift
   list stays guarded by `oncall.read` — the same guard the members route of a
   pool already uses.
4. **A shift that has a technician is never called „nicht besetzt".** Without a
   name in the answer the row reads „besetzt", so an older client or a user
   without a display name never looks unstaffed.

## Alternatives

- **The calendar keeps the pool members as the name source.** Rejected: that is
  the reported defect — the technician of a shift need not be a member of the
  pool (§4a.2 names the candidates of a swap), so any of them reads „nicht
  besetzt".
- **The calendar reads the administration users route.** Rejected: the on-call
  role has no `user.read`, so the readiness page would show no names for the
  technicians themselves; and the administration route is no source of the
  readiness.
- **A separate route for the names of the technicians of a range.** Rejected: a
  second request for data the shift list already needs; one request for one
  picture.
- **No names in the shift list, only the id.** Rejected: the calendar could then
  name nothing, which is the complaint of the office.

## Consequences

- The shift list carries the display name and the e-mail of a person, guarded by
  `oncall.read`; the permission `oncall.read_names` decides in the web app
  whether a role ever sees it.
- The iCal feed, the warnings and the administration grid keep their answers.
- The calendar makes no request of its own any more — one answer of the page is
  the whole picture.
