---

name: Bug
description: Fehler in StörDesk melden
labels: ['bug']
body:

- type: markdown
  attributes:
  value: |
  StörDesk ist **kein** Notrufweg. Bei akuter Gefahr: **112** / **110**.
- type: textarea
  id: was
  attributes:
  label: Was ist passiert?
  description: Was wurde erwartet, was ist stattdessen eingetreten?
  validations:
  required: true
- type: textarea
  id: repro
  attributes:
  label: Reproduktion
  description: Schritte, mit denen der Fehler reproduzierbar ist.
  validations:
  required: true
- type: input
  id: env
  attributes:
  label: Umgebung
  placeholder: Version/Commit, Browser, Gerät
- type: textarea
  id: logs
  attributes:
  label: Logs oder Screenshots
  description: Bitte keine personenbezogenen Daten anhängen.
