# ADR-003: Persistence of BoundaryNode and Sources

## Status
**SUPERSEDED by ADR-027** (2026-09-30, O-60/O-63, V12K-347): punkt przyłączenia nie jest kolumną persystencji ani węzłem — jest obiektem umownym `GridConnectionPoint` wskazującym terminal; legacy SQL `projects.connection_node_id` odchodzi procedurą kasacji W1. Treść poniżej historyczna.

## Context
PR3 requires persistence of BoundaryNode – węzeł przyłączenia and source definitions.
PR2 schema does not include these fields.

## Decision
We extend the `projects` table with:
- `connection_node_id` (nullable FK to `network_nodes`),
- `sources_jsonb` (deterministic JSON array).

This keeps the schema minimal while preserving deterministic serialization and
transactional updates via repositories.

## Consequences
- BoundaryNode and sources are stored alongside project metadata with stable JSON ordering.
- Imports/exports remain simple and avoid additional join tables unless needed later.
