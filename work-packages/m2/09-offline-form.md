# WP-M2-09: Offline-Meldung (Dexie + Service Worker)

depends-on: WP-M2-05
milestone: m2

## Ziel

Ohne Verbindung: Meldung in Dexie outbox, Badge „1 wartet", Senden bei online/Start.

## Spec-Referenzen

- specs/09-offline.md §Offline-Meldung

## Aufgabe

1. Dexie-Schema (outbox: id, client_uuid, payload, photos, status, retries)
2. Service Worker (Workbox injectManifest, precache App-Shell)
3. Absenden-Flow: online → direkt; offline → outbox
4. Sync bei `online`-Event, App-Start, manueller Button
5. Background Sync wo verfügbar (nicht iOS)
6. Tests (Playwright): Flugmodus, senden, online, genau 1 Ticket

## Akzeptanz

- Playwright-Offline-Test grün (acceptance 18.1 #2)
