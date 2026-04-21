# MV-DESIGN-PRO Architecture

**Version:** 4.0
**Status:** CANONICAL
**Reference:** SYSTEM_SPEC.md (authoritative), `docs/spec/` (detailed chapters)

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      PRESENTATION LAYER                          │
│  Frontend (React/TypeScript), Reports (PDF/DOCX), Exports        │
│  NO physics, NO model mutation                                   │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────┼─────────────────────────────────┐
│                      APPLICATION LAYER                           │
│  ┌──────────┐  ┌─────┐  ┌────────────┐  ┌──────────────────┐   │
│  │  WIZARD  │  │ SLD │  │ VALIDATION │  │ REPORTING ENGINE │   │
│  │ (Editor) │  │     │  │ (pre-check)│  │  (PDF/DOCX)      │   │
│  └────┬─────┘  └──┬──┘  └─────┬──────┘  └────────┬─────────┘   │
│       └───────────┼──────────┼──────────────────┘               │
└───────────────────┼──────────┼──────────────────────────────────┘
                    │          │
┌───────────────────┼──────────┼──────────────────────────────────┐
│                   ▼  DOMAIN LAYER                                │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    NETWORK MODEL (singleton)                │ │
│  │  Bus │ Line │ Cable │ Trafo │ Switch │ Source │ Load       │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────┐  ┌──────────────────────────────────┐   │
│  │     CATALOG        │  │         CASE LAYER                │   │
│  │  (Type Library)    │  │  SC Case │ PF Case │ Prot Case   │   │
│  └────────────────────┘  └──────────────────────────────────┘   │
│  Model mutation allowed HERE ONLY (via Wizard/SLD)               │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────┼─────────────────────────────────┐
│                      SOLVER LAYER                                │
│  ┌────────────────────┐  ┌──────────────────────────────────┐   │
│  │   IEC 60909        │  │    NEWTON-RAPHSON / GS / FD      │   │
│  │  Short Circuit     │  │       Power Flow                 │   │
│  │  Ik'', ip, Ith     │  │    Y-bus, Jacobian, V, P, Q     │   │
│  └────────────────────┘  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              WHITE BOX TRACE (audit trail)                │   │
│  └──────────────────────────────────────────────────────────┘   │
│  PHYSICS HERE ONLY. WHITE BOX REQUIRED.                          │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────┼─────────────────────────────────┐
│                   INTERPRETATION LAYER                            │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ PROOF ENGINE │  │   ANALYSIS   │  │ BOUNDARY IDENTIFIER    │ │
│  │              │  │ Protection   │  │ (BoundaryNode)         │ │
│  │ TraceArtifact│  │ Voltage      │  └────────────────────────┘ │
│  │ ProofDocument│  │ Thermal      │                              │
│  │ Export       │  │ Normative    │                              │
│  └──────────────┘  │ Sensitivity  │                              │
│                     │ Coverage     │                              │
│                     │ Comparison   │                              │
│                     └──────────────┘                              │
│  INTERPRETATION ONLY. NO physics. NO model mutation.             │
└─────────────────────────────────────────────────────────────────┘
```

---

> Normatywne domknięcie IEC 60909-0:2016 (§4.1–§4.8) dla śladu i pakietu dowodowego SC asymetrycznych: [`docs/proof/NORMATIVE_COMPLETION_PACK_IEC_60909.md`](docs/proof/NORMATIVE_COMPLETION_PACK_IEC_60909.md).

> **Spec chapters:** see [`docs/spec/SPEC_CHAPTER_02_ENM_DOMAIN_MODEL.md`](docs/spec/SPEC_CHAPTER_02_ENM_DOMAIN_MODEL.md) (ENM domain), [`docs/spec/SPEC_CHAPTER_06_SOLVER_CONTRACTS_AND_MAPPING.md`](docs/spec/SPEC_CHAPTER_06_SOLVER_CONTRACTS_AND_MAPPING.md) (solver contracts).

## 2. Network Model Layer

### 2.1 Core Elements

See SYSTEM_SPEC.md Section 2 for authoritative element definitions. For the full ENM domain model, see [`docs/spec/SPEC_CHAPTER_02_ENM_DOMAIN_MODEL.md`](docs/spec/SPEC_CHAPTER_02_ENM_DOMAIN_MODEL.md).

Key implementation classes:

| Class | File | Purpose |
|-------|------|---------|
| `Bus` | `network_model/core/bus.py` | Electrical node |
| `LineBranch` | `network_model/core/branch.py` | Line/Cable with impedance |
| `TransformerBranch` | `network_model/core/branch.py` | 2W/3W transformer |
| `Switch` | `network_model/core/switch.py` | Switching apparatus (no impedance) |
| `Source` | `network_model/core/source.py` | External Grid / Generator / Inverter |
| `Load` | `network_model/core/load.py` | Power consumption |
| `NetworkGraph` | `network_model/core/graph.py` | Topology (NetworkX MultiGraph) |
| `NetworkSnapshot` | `network_model/core/snapshot.py` | Frozen immutable snapshot |

### 2.2 NetworkGraph Operations

```python
class NetworkGraph:
    buses: Dict[UUID, Bus]
    branches: Dict[UUID, Branch]
    switches: Dict[UUID, Switch]
    sources: Dict[UUID, Source]
    loads: Dict[UUID, Load]

    def get_effective_topology(self) -> nx.Graph       # Considers switch states
    def find_islands(self) -> List[List[UUID]]          # Connected components
    def is_connected(self) -> bool                      # Full connectivity check
```

### 2.3 NetworkSnapshot

Frozen snapshot of network state. Used for solver input and audit trail.
- `fingerprint()` provides deterministic hash for comparison
- `to_graph()` converts back to mutable graph for analysis

---

> **Spec chapters:** see [`docs/spec/SPEC_CHAPTER_03_TOPOLOGY_CONNECTIVITY.md`](docs/spec/SPEC_CHAPTER_03_TOPOLOGY_CONNECTIVITY.md), [`docs/spec/SPEC_CHAPTER_04_LINES_CABLES_SN.md`](docs/spec/SPEC_CHAPTER_04_LINES_CABLES_SN.md).

## 3. Catalog Layer

### 3.1 Immutable Types

| Type | Key Parameters |
|------|---------------|
| `LineType` | r_ohm_per_km, x_ohm_per_km, b_us_per_km, rated_current_a |
| `CableType` | r_ohm_per_km, x_ohm_per_km, c_nf_per_km, rated_current_a |
| `TransformerType` | rated_power_mva, uk_percent, pk_kw, i0_percent, p0_kw, vector_group |

All types are frozen dataclasses. Shared across projects.

### 3.2 Catalog Resolver

Centralized parameter resolution: `network_model.catalog.resolver`

```
Instance → type_ref → Catalog lookup → resolved parameters
         ↘ impedance_override (if set)
```

Transparent source tracking via `ParameterSource` enum.

> **Spec chapter:** see [`docs/spec/SPEC_CHAPTER_08_TYPE_VS_INSTANCE_AND_CATALOGS.md`](docs/spec/SPEC_CHAPTER_08_TYPE_VS_INSTANCE_AND_CATALOGS.md).

---

## 4. Validation Layer

```
NetworkModel ──> NetworkValidator.validate() ──> VALID → Solver allowed
                                              ──> INVALID → Solver BLOCKED
```

Implementation: `network_model/validation/validator.py`

13 industrial-grade rules with suggested_fix diagnostics:
1. Empty network check
2. Graph connectivity (single island)
3. Source presence (SLACK or inverter)
4. Dangling elements (invalid branch endpoints)
5. Bus voltage validity (> 0)
6. Branch endpoint validity (exist, no self-loops)
7. Transformer HV/LV voltage validity
8. SLACK node presence and uniqueness
9. Switch endpoint validity
10. Inverter source bus validity
11. Branch impedance validity (non-zero for lines/cables)
12. Transformer HV/LV polarity vs bus voltages
13. Voltage level consistency on lines/cables

> **Spec chapter:** see [`docs/spec/SPEC_CHAPTER_12_VALIDATION_AND_QA.md`](docs/spec/SPEC_CHAPTER_12_VALIDATION_AND_QA.md).

---

## 5. Case Layer

### 5.1 StudyCase (frozen dataclass)

```python
class StudyCase:
    id: UUID
    config: StudyCaseConfig          # Calculation parameters
    result_status: NONE | FRESH | OUTDATED
    is_active: bool                  # Exactly ONE active per project
    result_refs: Tuple[...]          # Result references

    def clone() -> StudyCase         # Config copied, results NOT copied, status=NONE
    def mark_as_fresh(result)        # After successful calculation
    def mark_as_outdated()           # After model/config change
```

### 5.2 StudyCaseService

Manages CRUD, clone, activate/deactivate, compare (read-only), invalidation.

Implementation: `application/study_case/`, `application/active_case/`

> **Spec chapter:** see [`docs/spec/SPEC_CHAPTER_10_STUDY_CASES_AND_SCENARIOS.md`](docs/spec/SPEC_CHAPTER_10_STUDY_CASES_AND_SCENARIOS.md).

---

## 6. Solver Layer

### 6.1 IEC 60909 Short Circuit

```
Input: NetworkSnapshot + fault_location + c_max/c_min + fault_type
Steps:
  1. Build equivalent circuit (Z_source)
  2. Calculate Thevenin impedance (Z_th)
  3. Calculate Ik'' = (c * Un) / (sqrt(3) * |Z_th|)
  4. Calculate ip = kappa * sqrt(2) * Ik''
  5. Calculate Ith = Ik'' * sqrt(m + n)
Output: ShortCircuitResult (frozen) + WhiteBoxTrace
```

### 6.2 Newton-Raphson Power Flow

```
Input: NetworkSnapshot + solver options (max_iter, tolerance)
Steps:
  1. Build Y-bus matrix
  2. Initialize voltage vector
  3. NR iterations: mismatch → Jacobian → correction → update
  4. Calculate branch flows and losses
Output: PowerFlowResult (frozen) + WhiteBoxTrace
```

### 6.3 Alternative Power Flow Methods

- **Gauss-Seidel**: iterative per-bus voltage update
- **Fast Decoupled**: simplified Jacobian (P-delta, Q-V decoupled)

### 6.4 White Box Trace

```python
class WhiteBoxTrace:
    steps: List[TraceStep]           # Named calculation steps
    values: Dict[str, Any]           # All intermediate values

    def step(name) -> None           # Mark calculation step
    def record(key, value) -> None   # Record intermediate value
    def to_dict() -> dict            # Export for audit
```

> **Spec chapter:** see [`docs/spec/SPEC_CHAPTER_06_SOLVER_CONTRACTS_AND_MAPPING.md`](docs/spec/SPEC_CHAPTER_06_SOLVER_CONTRACTS_AND_MAPPING.md).

---

## 7. Interpretation Layer

### 7.1 Proof Engine

```
WhiteBoxTrace + SolverResult (READ-ONLY)
        │
        ▼
TraceArtifact (frozen, immutable after creation)
        │
        ▼
ProofDocument (Formula → Data → Substitution → Result → Unit Check)
        │
        ├─> proof.json
        ├─> proof.tex
        ├─> proof.pdf
        └─> proof.docx
```

Key components:
- `TraceArtifact`: immutable capture of solver execution
- `ProofDocument`: formal mathematical proof with ProofSteps
- `EquationRegistry`: canonical equations (SC3F, VDROP) with mapping keys
- `ProofInspector`: UI component (read-only viewer, 5-section step display)

### 7.2 Analysis Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Protection Analysis | `application/analyses/protection/` | Overcurrent settings, coordination, selectivity |
| Protection Engine v1 | `domain/protection_engine_v1.py` | ANSI 50/51, IEC IDMT curves (WHITE BOX) |
| Protection Analysis Model | `domain/protection_analysis.py` | Evaluation, trace, summary (interpretation only) |
| Protection → ResultSet | `application/result_mapping/protection_to_resultset_v1.py` | Mapper to canonical ResultSet |
| Protection Library | `application/analyses/protection/catalog/` | Vendor curves (Elektrometal ETango), IDMT |
| Voltage Analysis | `analysis/voltage/` | Voltage violations, profiles |
| Power Flow Interpretation | `analysis/power_flow/` | PF result analysis |
| Normative Evaluator | `analysis/normative/` | PN-EN compliance rules |
| Coverage Score | `analysis/coverage_score/` | Analysis completeness assessment |
| LF Sensitivity | `analysis/lf_sensitivity/` | Load flow sensitivity analysis |
| Boundary Identifier | `analysis/boundary/` | BoundaryNode identification (heuristic) |
| Scenario Comparison | `analysis/scenario_comparison/` | Case A vs B delta analysis |
| Recommendations | `analysis/recommendations/` | Auto-generated improvement suggestions |

### 7.3 Design Synthesis

`application/analyses/design_synth/` - Connection study pipeline combining SC + PF + Protection into unified evidence trace.

> **Spec chapters:** see [`docs/spec/SPEC_CHAPTER_09_PROTECTION_SYSTEM.md`](docs/spec/SPEC_CHAPTER_09_PROTECTION_SYSTEM.md), [`docs/spec/SPEC_CHAPTER_11_REPORTING_AND_EXPORT.md`](docs/spec/SPEC_CHAPTER_11_REPORTING_AND_EXPORT.md).

---

## 8. Application Layer

### 8.1 Network Wizard

Sequential controller for model editing. Operates directly on NetworkModel.

Implementation: `application/network_wizard/`, `application/wizard_actions/`, `application/wizard_runtime/`

### 8.2 SLD (Single Line Diagram)

Backend: `application/sld/` (layout, projection)
Frontend: `ui/sld/` (rendering, symbols, overlays, export)

SLD Auto-Layout Engine (frontend, 5-phase pipeline):
1. **Phase 1**: Voltage band assignment
2. **Phase 2**: Bay detection
3. **Phase 3**: Crossing minimization
4. **Phase 4**: Coordinate assignment
5. **Phase 5**: Connection routing

Geometry modes: AUTO / CAD / HYBRID (overrides via CadOverridesDocument)

### 8.3 Analysis Run Service

Unified pipeline for running analyses: `application/analysis_run/`
- Orchestrates solver execution → analysis → proof generation
- Manages result storage and export

### 8.4 Project Archive

`application/project_archive/` - Full project import/export as ZIP (project.json + manifest.json). Deterministic, versioned, integrity-verified (SHA-256).

---

## 9. API Layer

FastAPI endpoints: `api/`

| Endpoint Group | Purpose |
|---------------|---------|
| Projects | CRUD for projects |
| Study Cases | Case management, activation |
| Analysis Runs | Trigger calculations, get results |
| Proof Packs | Proof document retrieval, export |
| Snapshots | Network snapshot management |
| Design Synth | Connection study API |
| Project Archive | Import/export |
| Health | `/api/health` smoke check |

---

## 10. Frontend Architecture

### 10.1 Technology

React 18 + TypeScript, Vite, Zustand (state), @tanstack/react-query (data fetching), Tailwind CSS, KaTeX (math rendering).

### 10.2 Module Map

| Module | Location | Purpose |
|--------|----------|---------|
| SLD Editor | `ui/sld/` | Diagram rendering, symbols, overlays, export |
| SLD Layout Engine | `engine/sld-layout/` | 5-phase auto-layout pipeline |
| Results Browser | `ui/results-browser/` | Tabular result exploration, filtering, export |
| Case Manager | `ui/case-manager/` | Case CRUD, activation, mode gating |
| Proof Inspector | `proof-inspector/` | ProofDocument viewer, export (JSON/PDF/LaTeX) |
| Designer | `designer/` | Wizard-style project building |
| Protection Diagnostics | `ui/protection-diagnostics/` | Protection analysis display |
| Protection Curves | `ui/protection-curves/` | I-t curve editor/viewer |
| Voltage Profile | `ui/voltage-profile/` | Bus voltage profile charts |
| Power Flow Results | `ui/power-flow-results/` | PF results inspector, SLD overlay |
| Power Flow Comparison | `ui/power-flow-comparison/` | Case A vs B comparison |
| Reference Patterns | `ui/reference-patterns/` | Reference network patterns |
| Context Menu | `ui/context-menu/` | Right-click actions |
| Issue Panel | `ui/issue-panel/` | Validation issues display |
| Status Bar | `ui/status-bar/` | Global status display |
| Inspector Panel | `ui/inspector-panel/` | Element property inspection |
| SLD Editor (CAD) | `ui/sld-editor/` | CAD geometry editing tools |
| Project Archive | `ui/project-archive/` | Import/export dialog |

### 10.3 State Management

Zustand stores per module (results, SLD mode, protection diagnostics, power flow). No global monolithic store.

---

## 11. Data Flows

### 11.1 Edit Flow

```
User edit (Wizard or SLD)
    → NetworkModel.modify()
    → SLD.refresh() (immediate)
    → All Cases.result_status = OUTDATED
```

### 11.2 Calculation Flow

```
User triggers "Calculate"
    → NetworkValidator.validate()
    → [VALID] Create NetworkSnapshot (frozen)
    → Solver.solve(snapshot) → Result + WhiteBoxTrace
    → Store result, mark Case FRESH
    → [Optional] ProofEngine generates ProofDocument
```

### 11.3 Proof Generation Flow

```
TraceArtifact (from solver)
    → Load EquationRegistry
    → Map trace values → equation symbols
    → Generate substitutions, results, unit checks
    → Build ProofStep[] → ProofDocument
    → Export: JSON / LaTeX / PDF / DOCX
```

---

## 12. File Organization

```
backend/src/
├── network_model/
│   ├── core/           Bus, Branch, Switch, Source, Load, Graph, Snapshot
│   ├── catalog/        Types (Line, Cable, Trafo), Resolver, Governance
│   ├── solvers/        IEC60909 SC, NR/GS/FD Power Flow, Y-bus
│   ├── validation/     NetworkValidator
│   └── whitebox/       WhiteBoxTrace
├── analysis/
│   ├── boundary/       BoundaryIdentifier (BoundaryNode)
│   ├── coverage_score/ Completeness assessment
│   ├── lf_sensitivity/ Load flow sensitivity
│   ├── normative/      PN-EN compliance evaluator
│   ├── power_flow/     PF interpretation & violations
│   ├── protection/     Protection analysis
│   ├── recommendations/ Auto-recommendations
│   ├── scenario_comparison/ Case delta analysis
│   └── voltage/        Voltage violations & profiles
├── application/
│   ├── active_case/    Active case service
│   ├── analyses/       Protection, Design Synth
│   ├── analysis_run/   Unified run pipeline + export
│   ├── designer/       Designer engine + constraints
│   ├── equipment_proof/ Equipment withstand proofs
│   ├── network_model/  Single network model service
│   ├── network_wizard/ Wizard service + import/export
│   ├── project_archive/ Project ZIP import/export
│   ├── reference_patterns/ Reference network patterns
│   ├── sld/            SLD layout + projection
│   ├── study_case/     Case lifecycle
│   ├── study_scenario/ Scenario orchestration
│   └── wizard_actions/runtime/ Wizard action system
├── proof_engine/       TraceArtifact, ProofDocument, Equation Registry
├── domain/             Domain models, units, validation
├── api/                FastAPI endpoints
└── infrastructure/     Persistence, repositories

frontend/src/
├── engine/sld-layout/  5-phase auto-layout pipeline
├── designer/           Wizard-style project builder
├── proof-inspector/    Proof document viewer
└── ui/
    ├── sld/            SLD rendering, symbols, overlays, export
    ├── sld-editor/     CAD geometry editing
    ├── results-browser/ Tabular results
    ├── case-manager/   Case CRUD + mode gating
    ├── protection-*/   Protection diagnostics + curves
    ├── voltage-profile/ Voltage charts
    ├── power-flow-*/   PF results + comparison
    └── ...             Other UI modules
```

---

## 13. UI Contract References

UI contracts define presentation rules and are maintained separately from this architecture document.

| Contract | File | Scope |
|----------|------|-------|
| SLD UI Contract | `docs/ui/SLD_UI_CONTRACT.md` | Priority Stack, Dense SLD, Color, Print-First |
| SLD Render Layers | `docs/ui/SLD_RENDER_LAYERS_CONTRACT.md` | CAD vs SCADA layers |
| Topology Tree | `docs/ui/TOPOLOGY_TREE_CONTRACT.md` | Navigation backbone |
| Switching State Explorer | `docs/ui/SWITCHING_STATE_EXPLORER_CONTRACT.md` | Switch states, islands |
| SC Node Results | `docs/ui/SC_NODE_RESULTS_CONTRACT.md` | Bus-centric SC results |
| Catalog Browser | `docs/ui/CATALOG_BROWSER_CONTRACT.md` | Type Library UI |
| Case Comparison | `docs/ui/CASE_COMPARISON_UI_CONTRACT.md` | Delta view A/B/C |
| Results Browser | `docs/ui/RESULTS_BROWSER_CONTRACT.md` | Tabular exploration |
| Element Inspector | `docs/ui/ELEMENT_INSPECTOR_CONTRACT.md` | Multi-tab element view |
| Expert Modes | `docs/ui/EXPERT_MODES_CONTRACT.md` | Operator/Designer/Analyst/Auditor |
| Global Context Bar | `docs/ui/GLOBAL_CONTEXT_BAR.md` | Sticky context bar |
| Protection Curves | `docs/ui/PROTECTION_CURVES_IT_SUPERIOR_CONTRACT.md` | I-t curves |
| Protection Architecture | `docs/analysis/PROTECTION_CANONICAL_ARCHITECTURE.md` | Canonical layer model |
| Protection Contracts | `docs/analysis/PROTECTION_CONTRACTS.md` | Type definitions, API contracts |
| Protection Dependency | `docs/analysis/PROTECTION_DEPENDENCY_GRAPH.md` | PR-27→PR-32 order + gating |
| Protection Guards | `docs/analysis/PROTECTION_DETERMINISM_GUARDS.md` | Determinism invariants |
| Protection Insight | `docs/ui/PROTECTION_INSIGHT_CONTRACT.md` | Selectivity explainer |
| PDF Report | `docs/ui/PDF_REPORT_SUPERIOR_CONTRACT.md` | Report generation |
| Voltage Profile | `docs/ui/VOLTAGE_PROFILE_BUS_CONTRACT.md` | Bus voltage profiles |
| Canonical Parity | `docs/ui/UI_CANONICAL_PARITY_MATRIX.md` | Feature parity matrix |

---

## 14. Architecture Decision Records

| ADR | Topic |
|-----|-------|
| ADR-001 | Power Flow v2: overlay vs core |
| ADR-002 | Network Wizard Service / Unit System |
| ADR-003 | Domain Layer Boundaries / BoundaryNode Persistence |
| ADR-004 | Network Import/Export Contracts |
| ADR-005 | Solver Input DTO Contracts |
| ADR-006 | Solver Layer Separation / BoundaryNode Persistence |
| ADR-007 | IEC60909 Frozen Reference / Type Library Strategy |
| ADR-008 | Per-Case Switching State / Power Flow Location |
| ADR-009 | XLSX Importer (future) |
| ADR-010 | Unified Analysis Run Contract |

Location: [`docs/adr/ADR-*.md`](docs/adr/)

---

## 15. Detailed Specification

For the full detailed specification (18 chapters + supplements), see [`SYSTEM_SPEC.md`](SYSTEM_SPEC.md) Section 0 or browse [`docs/spec/`](docs/spec/) directly.

Key entry points:
- [`docs/spec/AUDIT_SPEC_VS_CODE.md`](docs/spec/AUDIT_SPEC_VS_CODE.md) — Spec-vs-code gap analysis
- [`docs/spec/SPEC_EXPANSION_PLAN.md`](docs/spec/SPEC_EXPANSION_PLAN.md) — Spec expansion roadmap

---

**END OF ARCHITECTURE DOCUMENT**
