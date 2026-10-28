---

name: Feature
description: Funktionswunsch für StörDesk
labels: ['feature']
body:

- type: markdown
  attributes:
  value: |
  StörDesk ist **kein** Notrufweg. Bei akuter Gefahr: **112** / **110**.
- type: textarea
  id: problem
  attributes:
  label: Problem
  description: Welches Problem wird gelöst?
  validations:
  required: true
- type: textarea
  id: proposal
  attributes:
  label: Vorschlag
  validations:
  required: true
- type: textarea
  id: spec
  attributes:
  label: Bezug zu Spezifikation oder Work Package
  placeholder: z. B. specs/06-report-form.md oder WP-M2-05
