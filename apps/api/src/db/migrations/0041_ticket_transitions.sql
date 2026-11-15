-- The ticket transitions become configuration (WP-M14-38a, ADR-0025, specs/07-escalation.md
-- §7.13): the steps of the workflow are rows of `ticket_transitions` instead of the code
-- map `TRANSITIONS` in `apps/api/src/tickets/workflow.ts` (`PLAN.md` §7). `from_status`
-- and `to_status` are foreign keys to `ticket_statuses.key` with `ON DELETE cascade`, so
-- a removed status removes its steps; `event_key` is unique over `(from_status, event_key)`
-- — one event performs at most one step. `condition_json` is stored now and evaluated
-- only from WP-M14-41. The migration seeds the 22 steps of `PLAN.md` §7 — the twelve
-- steps of the current map plus the nine `cancelled` rows the wildcard `'*'` expands
-- into — and the nine `ticket_statuses` rows the foreign keys need, both idempotently,
-- so an installed instance keeps its own workflow. The CHECK `tickets_status_check` of
-- migration `0004` is dropped (ADR-0025 decision 5): the rows of `ticket_statuses` and
-- their key-format CHECK (`0040`) are the status configuration and a ticket keeps its
-- status key as history.

CREATE TABLE "ticket_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"event_key" text NOT NULL,
	"condition_json" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_transitions" ADD CONSTRAINT "ticket_transitions_from_status_ticket_statuses_key_fk" FOREIGN KEY ("from_status") REFERENCES "public"."ticket_statuses"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_transitions" ADD CONSTRAINT "ticket_transitions_to_status_ticket_statuses_key_fk" FOREIGN KEY ("to_status") REFERENCES "public"."ticket_statuses"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_transitions_from_status_event_key_key" ON "ticket_transitions" USING btree ("from_status","event_key");--> statement-breakpoint
CREATE INDEX "ticket_transitions_to_status_idx" ON "ticket_transitions" USING btree ("to_status");--> statement-breakpoint
INSERT INTO "ticket_statuses" ("key", "names", "color", "position", "active", "is_terminal")
VALUES
('NEW', '{"de": "Neu", "en": "New"}'::jsonb, '#6b7280', 1, true, false),
('IN_REVIEW', '{"de": "In Prüfung", "en": "In Review"}'::jsonb, '#d97706', 2, true, false),
('WORK_ORDER_CREATED', '{"de": "Auftrag angelegt", "en": "Work order created"}'::jsonb, '#2563eb', 3, true, false),
('OFFERED', '{"de": "Angeboten", "en": "Offered"}'::jsonb, '#7c3aed', 4, true, false),
('ASSIGNED', '{"de": "Zugewiesen", "en": "Assigned"}'::jsonb, '#4338ca', 5, true, false),
('ACCEPTED', '{"de": "Angenommen", "en": "Accepted"}'::jsonb, '#16a34a', 6, true, false),
('ACKNOWLEDGED', '{"de": "Quittiert", "en": "Acknowledged"}'::jsonb, '#0d9488', 7, true, false),
('CLOSED', '{"de": "Geschlossen", "en": "Closed"}'::jsonb, '#9ca3af', 8, true, true),
('CANCELLED', '{"de": "Storniert", "en": "Cancelled"}'::jsonb, '#f43f5e', 9, true, true)
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "ticket_transitions" ("from_status", "to_status", "event_key")
VALUES
('NEW', 'IN_REVIEW', 'review_started'),
('IN_REVIEW', 'WORK_ORDER_CREATED', 'work_order_set'),
('WORK_ORDER_CREATED', 'ASSIGNED', 'assigned'),
('WORK_ORDER_CREATED', 'OFFERED', 'offered'),
('OFFERED', 'ASSIGNED', 'claimed'),
('OFFERED', 'ACCEPTED', 'accepted'),
('OFFERED', 'WORK_ORDER_CREATED', 'declined'),
('ASSIGNED', 'ACCEPTED', 'accepted'),
('ASSIGNED', 'WORK_ORDER_CREATED', 'declined'),
('ACCEPTED', 'ACKNOWLEDGED', 'acknowledged'),
('ACKNOWLEDGED', 'CLOSED', 'closed'),
('CLOSED', 'NEW', 'reopened'),
('CANCELLED', 'NEW', 'uncancelled'),
('NEW', 'CANCELLED', 'cancelled'),
('IN_REVIEW', 'CANCELLED', 'cancelled'),
('WORK_ORDER_CREATED', 'CANCELLED', 'cancelled'),
('OFFERED', 'CANCELLED', 'cancelled'),
('ASSIGNED', 'CANCELLED', 'cancelled'),
('ACCEPTED', 'CANCELLED', 'cancelled'),
('ACKNOWLEDGED', 'CANCELLED', 'cancelled'),
('CLOSED', 'CANCELLED', 'cancelled'),
('CANCELLED', 'CANCELLED', 'cancelled')
ON CONFLICT ("from_status", "event_key") DO NOTHING;--> statement-breakpoint
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_status_check";
