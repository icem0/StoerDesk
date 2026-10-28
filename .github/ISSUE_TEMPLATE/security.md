---

name: Sicherheitslücke
description: Sicherheitslücke melden (nicht als öffentliches Issue!)
labels: ['security']
body:

- type: markdown
  attributes:
  value: |
  Bitte **nicht** als öffentliches Issue melden.
  Nutze den in `SECURITY.md` beschriebenen Meldeweg.
  Dieses Formular dient nur der internen Koordination.
- type: textarea
  id: summary
  attributes:
  label: Kurzbeschreibung
  validations:
  required: true
