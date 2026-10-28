# WP-M1-10: CI + Repo-Dateien

depends-on: WP-M1-01
milestone: m1

## Ziel

GitHub Actions: check + i18n:check + Playwright (leer). Alle Pflichtdateien aus specs/00 §0.2.

## Spec-Referenzen

- specs/00-conventions.md §0.2

## Aufgabe

1. `.github/workflows/check.yml`: Node 22, npm ci, npm run check, Playwright-Install
2. `LICENSE` (MIT, Copyright-Zeile aus .env oder Platzhalter)
3. `README.md` mit 112-Disclaimer oben, Schnellstart, Lizenz-Badge
4. `CONTRIBUTING.md` (DCO, Conventional Commits, PR-Prozess)
5. `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1)
6. `SECURITY.md` (Kontaktweg, keine öffentlichen Issues)
7. `CHANGELOG.md` (Keep a Changelog, Unreleased)
8. `.github/ISSUE_TEMPLATE/{bug,feature,security}.md`
9. `.github/PULL_REQUEST_TEMPLATE.md`
10. `.github/dependabot.yml`
11. `docs/ARCHITECTURE.md`, `docs/COMPLIANCE.md`, `docs/GLOSSARY.md`, `docs/I18N.md`, `docs/DECISIONS.md` (leer, ADR-Format)

## Akzeptanz

- CI läuft auf GitHub grün
- Alle Pflichtdateien existieren
- README enthält 112-Disclaimer
