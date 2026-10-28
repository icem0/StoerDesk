---

name: Bug
description: Report a malfunction in StörDesk
labels: ['bug']
body:

- type: markdown
  attributes:
  value: |
  StörDesk is **not** an emergency call path. In case of acute danger: **112** / **110**.
- type: textarea
  id: what
  attributes:
  label: What happened?
  description: What did you expect, and what happened instead?
  validations:
  required: true
- type: textarea
  id: repro
  attributes:
  label: Reproduction
  description: Steps that reproduce the malfunction.
  validations:
  required: true
- type: input
  id: env
  attributes:
  label: Environment
  placeholder: version/commit, browser, device
- type: textarea
  id: logs
  attributes:
  label: Logs or screenshots
  description: Please do not attach any personal data.
