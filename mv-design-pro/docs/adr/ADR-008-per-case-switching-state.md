# ADR-008: Per-case Switching State Model

## Status
**SUPERSEDED by ADR-016/ADR-017** (2026-09-30, O-63): stan łączeń per przypadek = typowana delta `OperatingScenario` (`enm/scenariusze.py`) rozwiązywana w `EffectiveNetworkSnapshot`; tabela `network_switching_states` istnieje wyłącznie w legacy SQL (`migrations/003_network_wizard_assets.sql:43`, `migracja_legacy_db.py:38`) i odchodzi procedurą kasacji W1. Treść poniżej historyczna.

## Context
Operating cases must represent switching states for breakers, disconnectors, couplers,
and other elements to match substation workflows.

## Decision
We introduce `network_switching_states` keyed by operating case and element IDs, storing
`element_type` and `in_service`. The Network Wizard applies these overrides when building
`NetworkGraph` and solver inputs.

## Consequences
- Switching states remain deterministic and stored in the database.
- Case-specific topology changes are reproducible and auditable.
