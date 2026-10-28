---

name: Security
description: Report a vulnerability (never as a public issue!)
labels: ['security']
body:

- type: markdown
  attributes:
  value: |
  Please do **not** report this as a public issue.
  Use the reporting channel described in `SECURITY.md`.
  This form only supports internal coordination.
- type: textarea
  id: summary
  attributes:
  label: Short summary
  validations:
  required: true
