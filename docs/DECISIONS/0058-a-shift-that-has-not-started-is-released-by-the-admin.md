# ADR-0058: A shift that has not started is released by the admin

- Status: accepted
- Date: 2026-11-25
- Stakeholders: admin, office, on-call technicians
- Amends: `specs/04-oncall.md` §4a.3 (the rule that a confirmed or swapped shift is never deleted)

## Context

ADR-0047 split the shifts into two kinds: a shift that **held the duty** keeps
its place in the history, and a shift that nobody ever confirmed is a slot of
the plan that the admin owns — even when it already started.

The rule answered the question of the past. It left the question of the future
open: a shift of the coming week that a technician has confirmed stays locked
for ever. The admin cannot remove a shift that was confirmed by mistake, that
belongs to the wrong pool or whose duty was covered otherwise. The interface
answers `409 oncall_shift_locked` with the reason `state` — „die Schicht ist
bestätigt oder im Tausch und bleibt im Verlauf" — and the admin stands in front
of a plan that carries a duty nobody can cancel.

The confirmation of a shift of the coming week is a promise, not a fact. The
duty was not held: nobody was on duty, no ticket was coupled to the shift, and
the history of the office has nothing to record about it. The history begins
when the shift starts.

## Decision

1. **A shift that has not started is released by the delete.** Every state is
   deletable while `starts_at` lies in the future: `UNFILLED`, `DRAFT`,
   `PLANNED`, `DECLINED`, `CONFIRMED` and `SWAP_REQUESTED`. The admin removes
   a confirmed shift of the coming week like any other slot of the plan.
2. **A shift that started keeps the rule of ADR-0047.** A `CONFIRMED` or a
   `SWAP_REQUESTED` shift stays locked, and so does every shift that was
   confirmed at some moment (`confirmed_at` is set then). A published shift
   that started stays locked as well, because it counted for the ticket
   coupling (§4a.6). A shift that nobody ever confirmed stays deletable, also
   after it started.
3. **The lock keeps its reasons.** `409 oncall_shift_locked` carries `state`
   for a confirmed or swapped shift that started, `confirmed` for a shift that
   held the duty and `started` for a published shift that started. The
   interface names the cause of the refusal.
4. **The technician who held the shift is informed.** A delete of a shift that
   was confirmed and a handover of a confirmed shift to another technician
   reach the technician who had the shift, so he learns that his duty is gone
   (WP-M34-02, the event type `oncall.released`).
5. **The events of a released shift go with it.** The events of a shift are
   bound to it (`ON DELETE CASCADE`), and the append-only rule of
   `oncall_events` keeps them from a direct delete. The ticket events that
   name the shift stay with the ticket.

## Alternatives

- **Every confirmed shift stays locked, also before it starts:** rejected. The
  plan is owned by the admin, and a shift of the future holds no duty that
  somebody could rely on.
- **The delete of a confirmed shift needs a second right** (a second
  confirmation of the admin): rejected. The delete of a shift is already the
  right of the admin alone (`oncall.admin`), and the plan of a pool is his.
- **A new state `CANCELLED` instead of the delete:** rejected for this
  version. It would need a place in the coupling of §4a.6, in the iCal feed of
  §4a.7, in the warnings of §4a.6 and in the statistics of §12.
- **The technician keeps the confirmation of a released shift in the plan:**
  rejected. The slot is gone; the office knows the duty through the plan and
  not through a row that nobody may delete.

## Consequences

- The admin deletes a shift of the coming week in every state.
- The history of a duty that was really held stays undeletable.
- The interface offers the delete for a shift that has not started and names
  the reason of a refusal that remains.
- The technician who had the shift learns that his duty is gone
  (WP-M34-02).
