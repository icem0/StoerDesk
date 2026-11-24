-- The selection of the channels per event type is gone (`specs/10-notifications.md`
-- §11.4, ADR-0045): every event goes over the channels of the user — the
-- linked and confirmed accounts of §11.3a. The rows of the table carried a
-- choice per event type that nobody could make correctly; the rule of the
-- administration (§11.9) now says what a user must have set up.
--
-- The table is dropped with its index and its check constraints.
DROP TABLE IF EXISTS "notification_preferences";
