# WP-M2-05: Meldeformular UI

depends-on: WP-M2-04
milestone: m2

## Ziel

/m/:token zeigt vorbefülltes Formular. Felder aus specs/06. Client-seitige Bildkompression auf 1600px/JPEG 0.8.

## Spec-Referenzen

- specs/06-report-form.md komplett
- specs/13-ui.md (Mobile-first, Touch-Ziele)

## Aufgabe

1. Route /m/:token in apps/web
2. Komponenten: ObjektHeader, FaultChips (Mehrfachauswahl), FreeText, PhotoUpload (bis 6, Kompression via canvas), ContactFields, SendButton
3. i18n-Keys de+en
4. Nach Senden: Bestätigungsseite mit Ticketnummer + Statuslink
5. Tests (Playwright): DE und EN, Formular ausfüllen, senden, Bestätigung sichtbar

## Akzeptanz

- Formular funktioniert auf Mobile (Viewport 375×667)
- 2 Playwright-Tests grün
- Kein hartkodierter String (Lint grün)
