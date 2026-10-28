# Locales

Struktur: `locales/{de,en}/{namespace}.json`

- **de** ist Default und Referenz für UI-Texte, **en** ist die Referenzsprache und muss
  vollständig sein (Key-Parität wird von `npm run i18n:check` geprüft).
- Namespaces: `common`, `errors`, `validation`, `ticket`, `object`, `oncall`, `stats`, `settings`.
- JSON-Dateien können keine Kommentare enthalten — daher diese README statt eines
  Header-Kommentars in jeder Datei.
- Schlüssel-Konvention: `namespace.section.element`, Parameter als `{{name}}`.

Beispiel `locales/de/ticket.json`:

```json
{
  "list": {
    "empty": "Keine Tickets vorhanden."
  }
}
```
