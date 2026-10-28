# WP-M2-03: QR-Aufkleber PDF

depends-on: WP-M2-02
milestone: m2

## Ziel

GET /api/v1/objects/:id/qr.pdf liefert A6-Aufkleber mit QR, Objektname, Objektnummer, „Störung melden", 112-Hinweis.

## Spec-Referenzen

- specs/08-objects-api.md §UI (PDF)

## Aufgabe

1. PDF-Renderer (`pdf-lib` oder `@react-pdf/renderer` — einfachste Lösung, in DECISIONS.md dokumentieren)
2. Route + Test: PDF wird erzeugt, enthält 112-Hinweis (Text-Extraktion)
3. UI-Button „Aufkleber drucken" mit PDF-Download

## Akzeptanz

- PDF öffnet sich, QR scannbar, 112-Hinweis enthalten
