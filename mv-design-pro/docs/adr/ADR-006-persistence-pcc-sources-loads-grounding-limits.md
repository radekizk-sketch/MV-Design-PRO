# ADR-006: Persistence of BoundaryNode, Sources, Loads, Grounding, Limits

## Status
**SUPERSEDED by ADR-027** (2026-09-30, O-60/O-63, V12K-347): punkt przyłączenia jako obiekt umowny na terminalu; źródła, odbiory, uziemienie i limity żyją w ENM (`Source.neutral_grounding`, `GroundingConfig`, `ConnectionConditions`), nie w dedykowanych tabelach legacy. Treść poniżej historyczna.

## Context
PR3 requires explicit persistence for BoundaryNode – węzeł przyłączenia, sources, loads,
network grounding, and operational limits. JSON payloads must remain deterministic and
schema-driven for import/export workflows.

## Decision
We introduce dedicated tables:
- `project_settings` for BoundaryNode, grounding, and limits
- `network_sources` and `network_loads` for node-attached assets

All payloads are stored as deterministic JSON and accessed only through repositories.

## Consequences
- Project configuration stays atomic and consistent across SQLite/PostgreSQL.
- Import/export workflows remain deterministic and versionable.
