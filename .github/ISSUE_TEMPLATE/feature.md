---

name: Feature
description: Request a feature for StörDesk
labels: ['feature']
body:

- type: markdown
  attributes:
  value: |
  StörDesk is **not** an emergency call path. In case of acute danger: **112** / **110**.
- type: textarea
  id: problem
  attributes:
  label: Problem
  description: Which problem does this solve?
  validations:
  required: true
- type: textarea
  id: proposal
  attributes:
  label: Proposal
  validations:
  required: true
- type: textarea
  id: spec
  attributes:
  label: Link to specification or work package
  placeholder: e.g. specs/06-report-form.md or WP-M2-05
