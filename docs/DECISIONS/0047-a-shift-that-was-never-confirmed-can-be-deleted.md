# ADR-0047: A shift that was never confirmed can be deleted after it started

- Status: accepted
- Date: 2026-11-24
- Stakeholders: admin, office, on-call technicians
- Amends: `specs/04-oncall.md` §4a.3 (the rule that a shift is never deleted after it started)

## Context

The plan of a readiness pool is made of slots. The office generates the slots
of a week, assigns a technician, publishes the shift, and the technician
confirms it — or declines it, or says nothing.

The old rule of `specs/04-oncall.md` §4a.3 was simple: a shift is never
deleted after it started. `deleteShift` refused every shift whose
`starts_at` lay in the past, with `409 oncall_shift_locked`.

The rule protected the history of the duty: a shift that held the readiness
was part of the record — it answered the question "who was on duty on that
evening", and its events (`confirmed`, `declined`, the swap steps) belong to
it. But the rule also protected the slots that nobody ever took. A shift that
was published, that nobody confirmed and that nobody declined stayed in the
plan for ever: the office could not remove a slot that no one held, and the
plan carried a gap that never closes. The admin could only reassign it, which
leaves the slot in the plan with a new name.

The two cases are not the same. A shift that held the duty is history. A shift
that nobody ever confirmed is a slot of the plan — and the plan is what the
admin owns.

## Decision

1. **A shift that held the duty keeps its place.** A `CONFIRMED` or
   `SWAP_REQUESTED` shift stays locked, and so does every shift that was
   confirmed at some moment — `confirmed_at` is set then, also when the
   technician declined afterwards. The confirmation is the sign that the shift
   was covered; the history of the shift stays with it.
2. **A shift that nobody ever confirmed may be deleted, also after it
   started.** The states `UNFILLED`, `DRAFT` and `DECLINED` are deletable that
   way. The admin removes the slots that were offered and never accepted.
3. **A published shift that started stays locked.** A `PLANNED` shift counts
   for the ticket coupling (§4a.6): the office may have offered a ticket on
   it, and the technician of the shift was warned that nobody confirmed. That
   record stays.
4. **The lock names its reason.** `409 oncall_shift_locked` carries the reason
   in its params: `state` for a confirmed or swapped shift, `confirmed` for a
   shift that held the duty, `started` for a published shift that started. The
   interface can name the cause instead of a generic refusal.
5. **The events of a deleted shift go with it.** The events of a shift are
   bound to it (`ON DELETE CASCADE`), and the append-only rule of
   `oncall_events` keeps them from a direct delete. This does not change: the
   ticket events that name the shift (`payload.shiftId`, the assigned
   technician) stay with the ticket.

## Alternatives

- **Every shift stays undeletable after it started:** rejected. The office
  keeps the slots that nobody accepted in the plan for ever, and the plan of
  a pool drifts away from the duty that is really there.
- **A shift that was published may be deleted even when it started:** rejected.
  It counted for the ticket coupling; deleting it would remove a record of a
  duty that the office may have relied on.
- **A new state `CANCELLED` instead of a delete:** rejected for this version.
  It would need a place in the coupling of §4a.6, in the iCal feed of §4a.7,
  in the warnings of §4a.6 and in the statistics of §12 — a state that is
  worth it for a shift that the office keeps, not for one it removes.
- **The delete keeps the events of the shift in a separate table:** rejected
  for this version. The events of a slot nobody held carry no duty; the
  decline of the ticket that follows the shift stays with the ticket.

## Consequences

- The admin removes the slots that nobody accepted — also the ones of the
  past weeks, so the plan of a pool can be cleaned up.
- A shift that held the duty stays undeletable, and the interface names the
  reason of the refusal.
- The rule of the spec changes; the ADR names it, so the next reader of
  `deleteShift` finds the reason of the three locks.
