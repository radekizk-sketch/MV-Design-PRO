# Spec vs Code Gap Report (PowerFactory-Aligned)

**Scope:** Canonical spec alignment audit against code and documentation.
**Canonical references:** `SYSTEM_SPEC.md`, `ARCHITECTURE.md`, `AGENTS.md`, `PLANS.md`, `CANONICAL_COMPLIANCE.md`.

## 1) Compliance Matrix (Spec → Docs → Code)

| Rule (Canonical) | Evidence in Docs | Evidence in Code | Status | Location(s) | Proposed Fix |
|---|---|---|---|---|---|
| Single NetworkModel per project (no shadow models) | `SYSTEM_SPEC.md` §2.1, §13; `AGENTS.md` §2.3 | `NetworkGraph` exists but multiple builders create new instances from persistence; no explicit single-model enforcement | **PENDING** | `backend/src/network_model/core/graph.py`, `backend/src/application/network_wizard/service.py`, `backend/src/application/analysis_run/service.py` | Add explicit “single model” invariant checks (one active graph per project) and document enforcement in application layer. |
| BoundaryNode is **NOT** in NetworkModel; BoundaryNode is interpretation-only | `SYSTEM_SPEC.md` §2.1, §18.3.4; `AGENTS.md` §2.5 | `NetworkGraph` contains no BoundaryNode field; BoundaryNode is stored as application settings hint and used in analysis/wizard | **PASS** | `backend/src/network_model/core/graph.py`, `backend/src/application/network_wizard/service.py`, `backend/src/application/analyses/boundary.py` | No change required. |
| Case cannot mutate NetworkModel; cases only store parameters | `SYSTEM_SPEC.md` §3; `AGENTS.md` §2.4 | Operating/study cases stored separately; graph built from persistence with case overlays (switching states) | **PENDING** | `backend/src/domain/models.py`, `backend/src/application/network_wizard/service.py` | Add explicit immutability enforcement (e.g., snapshot usage + write guards) and document overlay boundaries. |
| Validation must gate solver execution (NetworkValidator) | `SYSTEM_SPEC.md` §7; `CANONICAL_COMPLIANCE.md` §5 | `NetworkValidator` exists but analysis run path uses custom validation; no direct NetworkValidator call before solver | **FAIL** | `backend/src/network_model/validation/validator.py`, `backend/src/application/analysis_run/service.py` | Wire `NetworkValidator` into analysis execution paths (PF + SC) before solving. |
| Switch has NO impedance and is topology-only | `SYSTEM_SPEC.md` §2.4; `ARCHITECTURE.md` §2.1 | `Switch` class exists with no impedance fields; not integrated into NetworkGraph yet | **PENDING** | `backend/src/network_model/core/switch.py`, `backend/src/network_model/core/graph.py` | Add switches to graph topology (OPEN/CLOSED) without impedance fields. |
| Bus terminology (Bus ≠ Node) | `SYSTEM_SPEC.md` §2.2, §12 | Bus alias implemented for PF terminology; Node remains legacy | **PASS** | `backend/src/network_model/core/bus.py` | Full rename planned for a future major version. |
| Solver-only physics (analysis is interpretation) | `SYSTEM_SPEC.md` §5–6; `AGENTS.md` §2.1 | Power flow solver currently implemented under `analysis/power_flow/` | **PENDING** | `backend/src/analysis/power_flow/solver.py` | Move solver to `network_model/solvers/` or create clear solver module boundary per spec. |
| WHITE BOX trace required, frozen Result API (IEC 60909) | `SYSTEM_SPEC.md` §5.5; `AGENTS.md` §2.2 | `ShortCircuitResult` is frozen with `to_dict()` and `white_box_trace` | **PASS** | `backend/src/network_model/solvers/short_circuit_iec60909.py`, `backend/src/network_model/whitebox/tracer.py` | No change required. |
| Deterministic ordering for serialization and outputs | `AGENTS.md` §4.2, §5.2 | Snapshot and exports sort by ID; analysis inputs canonicalized | **PASS** | `backend/src/network_model/core/snapshot.py`, `backend/src/application/analysis_run/service.py` | No change required. |
| SLD is visualization-only; no BoundaryNode in model | `SYSTEM_SPEC.md` §9; `PLANS.md` Phase 2 Task 2.1 | Projection uses snapshot nodes/branches only; BoundaryNode marker is not generated from graph | **PASS** | `backend/src/network_model/sld_projection.py` | No change required. |
| Result invalidation on model change | `SYSTEM_SPEC.md` §10 | No explicit invalidation mechanism found | **FAIL** | `backend/src/domain/models.py`, `backend/src/application/analysis_run/service.py` | Implement ResultInvalidator per PLANS Phase 4. |
| No shadow stores / duplicate models | `AGENTS.md` §2.3 | Multiple persistence tables (nodes, branches, settings) and snapshot store coexist; no explicit single-source enforcement | **PENDING** | `backend/src/infrastructure/persistence/models.py`, `backend/src/application/snapshots/service.py` | Document authoritative data path and enforce single-source ownership in services. |
| Case results keying to snapshot IDs | `SYSTEM_SPEC.md` §10, §18 | Analysis runs store `input_snapshot` and `input_hash` | **PASS** | `backend/src/domain/analysis_run.py`, `backend/src/application/analysis_run/service.py` | No change required. |

## 2) Required Refactors (Non-P0, defer per PLANS)

- **Power Flow solver location:** move or re-export under `network_model/solvers/` to align with solver-layer canonical boundaries (PLANS Phase 2/3).  
- **Bus terminology:** rename or alias `Node` → `Bus` across core model and DTOs (PLANS Phase 2).  
- **NetworkValidator gate:** integrate `NetworkValidator` in analysis run execution (PLANS Phase 2).  
- **Result invalidation:** add model-change invalidation for case results (PLANS Phase 4).  
- **Switch integration:** add switch topology handling to NetworkGraph (PLANS Phase 2).  

## 3) Docs to Deprecate/Remove

> The following documents duplicate or conflict with canonical sources, or represent outdated ExecPlans.

- `ExecPlan.md` (root) — feature-specific plan, superseded by `PLANS.md` (archived under `docs/audit/historical_execplans/`).  
- `governance/execplans/ExecPlan-01.md` through `ExecPlan-16.md` — legacy plans; several conflict with BoundaryNode rules in canonical spec (archived under `docs/audit/historical_execplans/`).  
- `docs/execplans/EXECPLANS.md` — historical catalog that presents itself as a master plan; duplicates `PLANS.md` and conflicts with canonical BoundaryNode rule (archived under `docs/audit/historical_execplans/`).  

**Risk/Impact:** removal may break deep links; replace with historical notes under `docs/audit/` where needed and update references in docs.
