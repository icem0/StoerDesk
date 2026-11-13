-- Migration 0035: work_order_text — freier Text für den Arbeitsauftrag
-- Ersetzt das starre Paar work_order_type / work_order_number durch ein
-- einzelnes freies Textfeld, wie es auch bei einem Kommentar verwendet wird.

alter table tickets
  add column work_order_text text;

comment on column tickets.work_order_text is 'Freier Text des Arbeitsauftrags (z. B. "AA 4711" oder "SA 12345"), gesetzt bei work_order_set.';
