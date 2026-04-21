# MV-DESIGN-PRO System Specification

**Version:** 4.0
**Status:** CANONICAL & BINDING
**Architecture Model:** Canonical Reference Architecture

This document is the **executive overview and navigation hub** for MV-DESIGN-PRO.
The detailed specification lives in `docs/spec/` (18 chapters + supplements).
This file provides the binding architectural rules, terminology, and pointers.

---

## 0. Detailed Specification (SOURCE OF TRUTH)

The full system specification is maintained in **`docs/spec/`**:

### Spec Chapters

| # | Chapter | File |
|---|---------|------|
| 01 | Purpose, Scope, Definitions | [`docs/spec/SPEC_CHAPTER_01_PURPOSE_SCOPE_DEFINITIONS.md`](docs/spec/SPEC_CHAPTER_01_PURPOSE_SCOPE_DEFINITIONS.md) |
| 02 | ENM Domain Model | [`docs/spec/SPEC_CHAPTER_02_ENM_DOMAIN_MODEL.md`](docs/spec/SPEC_CHAPTER_02_ENM_DOMAIN_MODEL.md) |
| 03 | Topology & Connectivity | [`docs/spec/SPEC_CHAPTER_03_TOPOLOGY_CONNECTIVITY.md`](docs/spec/SPEC_CHAPTER_03_TOPOLOGY_CONNECTIVITY.md) |
| 04 | Lines & Cables (MV) | [`docs/spec/SPEC_CHAPTER_04_LINES_CABLES_SN.md`](docs/spec/SPEC_CHAPTER_04_LINES_CABLES_SN.md) |
| 05 | System Canonical Contracts | [`docs/spec/SPEC_CHAPTER_05_SYSTEM_CANONICAL_CONTRACTS.md`](docs/spec/SPEC_CHAPTER_05_SYSTEM_CANONICAL_CONTRACTS.md) |
| 06 | Solver Contracts & ENM Mapping | [`docs/spec/SPEC_CHAPTER_06_SOLVER_CONTRACTS_AND_MAPPING.md`](docs/spec/SPEC_CHAPTER_06_SOLVER_CONTRACTS_AND_MAPPING.md) |
| 07 | Sources, Generators, Loads | [`docs/spec/SPEC_CHAPTER_07_SOURCES_GENERATORS_LOADS.md`](docs/spec/SPEC_CHAPTER_07_SOURCES_GENERATORS_LOADS.md) |
| 08 | Type vs Instance & Catalogs | [`docs/spec/SPEC_CHAPTER_08_TYPE_VS_INSTANCE_AND_CATALOGS.md`](docs/spec/SPEC_CHAPTER_08_TYPE_VS_INSTANCE_AND_CATALOGS.md) |
| 09 | Protection System | [`docs/spec/SPEC_CHAPTER_09_PROTECTION_SYSTEM.md`](docs/spec/SPEC_CHAPTER_09_PROTECTION_SYSTEM.md) |
| 10 | Study Cases & Scenarios | [`docs/spec/SPEC_CHAPTER_10_STUDY_CASES_AND_SCENARIOS.md`](docs/spec/SPEC_CHAPTER_10_STUDY_CASES_AND_SCENARIOS.md) |
| 11 | Reporting & Export | [`docs/spec/SPEC_CHAPTER_11_REPORTING_AND_EXPORT.md`](docs/spec/SPEC_CHAPTER_11_REPORTING_AND_EXPORT.md) |
| 12 | Validation & QA | [`docs/spec/SPEC_CHAPTER_12_VALIDATION_AND_QA.md`](docs/spec/SPEC_CHAPTER_12_VALIDATION_AND_QA.md) |
| 13 | Reporting & Exports (formal) | [`docs/spec/SPEC_CHAPTER_13_REPORTING_AND_EXPORTS.md`](docs/spec/SPEC_CHAPTER_13_REPORTING_AND_EXPORTS.md) |
| 14 | Determinism & Versioning | [`docs/spec/SPEC_CHAPTER_14_DETERMINISM_AND_VERSIONING.md`](docs/spec/SPEC_CHAPTER_14_DETERMINISM_AND_VERSIONING.md) |
| 15 | Governance & ADR | [`docs/spec/SPEC_CHAPTER_15_GOVERNANCE_AND_ADR.md`](docs/spec/SPEC_CHAPTER_15_GOVERNANCE_AND_ADR.md) |
| 16 | External Integrations | [`docs/spec/SPEC_CHAPTER_16_EXTERNAL_INTEGRATIONS.md`](docs/spec/SPEC_CHAPTER_16_EXTERNAL_INTEGRATIONS.md) |
| 17 | Testing & Acceptance | [`docs/spec/SPEC_CHAPTER_17_TESTING_AND_ACCEPTANCE.md`](docs/spec/SPEC_CHAPTER_17_TESTING_AND_ACCEPTANCE.md) |
| 18 | Production & Maintenance | [`docs/spec/SPEC_CHAPTER_18_PRODUCTION_AND_MAINTENANCE.md`](docs/spec/SPEC_CHAPTER_18_PRODUCTION_AND_MAINTENANCE.md) |

### Supplements

| Document | Purpose |
|----------|---------|
| [`docs/spec/AUDIT_SPEC_VS_CODE.md`](docs/spec/AUDIT_SPEC_VS_CODE.md) | Spec-vs-code gap analysis (BINDING decision matrix) |
| [`docs/spec/SPEC_EXPANSION_PLAN.md`](docs/spec/SPEC_EXPANSION_PLAN.md) | Spec expansion roadmap & AS-IS/TO-BE policy |
| [`docs/spec/SPEC_GAP_SUPPLEMENT_PROTECTION_WHITEBOX_LEGACY.md`](docs/spec/SPEC_GAP_SUPPLEMENT_PROTECTION_WHITEBOX_LEGACY.md) | Gap closure: Protection, WhiteBox, OperatingCase |
| [`docs/spec/ENERGY_NETWORK_MODEL.md`](docs/spec/ENERGY_NETWORK_MODEL.md) | ENM reference model |
| [`docs/spec/SLD_TOPOLOGICAL_ENGINE.md`](docs/spec/SLD_TOPOLOGICAL_ENGINE.md) | SLD engine spec |
| [`docs/spec/WIZARD_FLOW.md`](docs/spec/WIZARD_FLOW.md) | Wizard workflow |

---

## 1. Architectural Principles

The system follows the canonical reference architecture:
- One explicit NetworkModel per project (singleton)
- Multiple Study Cases (calculation scenarios)
- No fictional entities in solvers
- All calculations WHITE BOX (auditable)
- Strict layer separation: Solver / Analysis / Application / Presentation

> **Detail:** see Chapter 01 (Purpose & Scope) and Chapter 05 (System Canonical Contracts).

---

## 2. Network Model (Singleton)

There is exactly ONE NetworkModel per project. It contains only physical electrical elements.

### 2.1 Core Elements

| Element | Description | Physics Impact |
|---------|-------------|----------------|
| **Bus** | Electrical node (single potential) | Yes - voltage level |
| **Line** | Overhead line (explicit branch) | Yes - R/X impedance |
| **Cable** | Underground cable (explicit branch) | Yes - R/X + capacitance |
| **Transformer2W** | Two-winding transformer | Yes - impedance transformation |
| **Switch/Breaker** | Switching device | NO - topology only (OPEN/CLOSE) |
| **Source** | External Grid / Generator / Inverter | Yes - power injection |
| **Load** | Electrical load | Yes - power consumption |

### 2.2 NOT in NetworkModel

- BoundaryNode — interpretation, not physics (belongs to Analysis layer)
- Boundary markers, legal/contractual boundaries
- Station containers store no physics (logical grouping only)

> **Detail:** see Chapter 02 (ENM Domain Model), Chapter 03 (Topology), Chapter 04 (Lines & Cables), Chapter 07 (Sources & Loads).
> **ENM vs Solver model distinction:** see [AUDIT_SPEC_VS_CODE.md](docs/spec/AUDIT_SPEC_VS_CODE.md) Section 2.

---

## 3. Type Catalog (Library)

- Types are **immutable** once created
- Types are **shared** across projects
- Catalog manages PASSIVE elements only (Line, Cable, Transformer, Switch types)
- Source, Load, Protection parameters are Case-dependent, NOT cataloged
- Centralized resolver: `network_model.catalog.resolver`

> **Detail:** see Chapter 08 (Type vs Instance & Catalogs).

---

## 4. Study Case Architecture

**Case != Model.** A Case is a calculation scenario that:
- CANNOT mutate the NetworkModel
- Stores ONLY calculation parameters
- References the NetworkModel (read-only)

Result Status Lifecycle: `NONE -> FRESH -> OUTDATED -> FRESH`

> **Detail:** see Chapter 10 (Study Cases & Scenarios).

---

## 5. Solver Layer (WHITE BOX)

Solver = pure physics + computational algorithm. No interpretation, no limits, no normative assessment. Full white-box trace required.

### 5.1 Implemented Solvers

| Solver | Location | Status |
|--------|----------|--------|
| IEC 60909 Short Circuit | `network_model.solvers.short_circuit_iec60909` | STABLE |
| Newton-Raphson Power Flow | `network_model.solvers.power_flow_newton` | STABLE |
| Gauss-Seidel Power Flow | `network_model.solvers.power_flow_gauss_seidel` | STABLE |
| Fast Decoupled Power Flow | `network_model.solvers.power_flow_fast_decoupled` | STABLE |

### 5.2 Frozen Result API

```python
@dataclass(frozen=True)
class ShortCircuitResult:
    ikss_ka: float    # Initial symmetrical short-circuit current
    ip_ka: float      # Peak short-circuit current
    ith_ka: float     # Thermal equivalent current
    white_box_trace: WhiteBoxTrace

@dataclass(frozen=True)
class PowerFlowResult:
    bus_voltages: Dict[UUID, BusVoltage]
    branch_flows: Dict[UUID, BranchFlow]
    losses: LossResult
    white_box_trace: WhiteBoxTrace
```

FROZEN: These APIs cannot change without major version bump.

> **Detail:** see Chapter 06 (Solver Contracts & Mapping).

---

## 6. Analysis / Interpretation Layer

Analysis = interpretation of solver results. No physics. No model modification.

Implemented analyses: Protection, Voltage, Thermal/Overload, Normative Evaluator, Coverage Score, LF Sensitivity, Scenario Comparison, Auto Recommendations, Boundary Identifier.

### 6.1 Protection Analysis (AnalysisType: PROTECTION)

Protection is a separate AnalysisType in the execution pipeline. It does NOT reside in the Solver layer — it is purely interpretive.

- **Engine**: Protection Engine v1 (ANSI 50/51, IEC IDMT curves) — `domain/protection_engine_v1.py`
- **Current source**: Explicit selection — `TEST_POINTS` (user-defined) or `SC_RESULT` (read-only from SC ResultSet)
- **Coordination**: Explicit relay pairs (upstream/downstream), numerical margins only, no verdicts
- **Boundary**: Protection READS SC results. Protection NEVER modifies SC solver or SC ResultSet v1.
- **Contracts**: See [`docs/analysis/PROTECTION_CONTRACTS.md`](docs/analysis/PROTECTION_CONTRACTS.md)
- **Architecture**: See [`docs/analysis/PROTECTION_CANONICAL_ARCHITECTURE.md`](docs/analysis/PROTECTION_CANONICAL_ARCHITECTURE.md)

> **Detail:** see Chapter 09 (Protection), Chapter 12 (Validation & QA).
> **Normative completion (IEC 60909-0:2016 asymmetrical):** see [`docs/proof/NORMATIVE_COMPLETION_PACK_IEC_60909.md`](docs/proof/NORMATIVE_COMPLETION_PACK_IEC_60909.md).

---

## 7. Proof Engine

```
SOLVER (frozen) --> WhiteBoxTrace + SolverResult (READ-ONLY)
                          |
                    PROOF ENGINE (interpretation)
                          |
                    TraceArtifact --> ProofDocument --> Export (JSON/LaTeX/PDF/DOCX)
```

### 7.1 Invariants (BINDING)

| Invariant | Description |
|-----------|-------------|
| Solver untouched | Proof Engine does NOT modify solvers or Result API |
| Determinism | Same run_id = identical proof.json and proof.tex |
| Pure interpretation | Proofs generated from existing trace/result data |
| Step completeness | Each step: Formula > Data > Substitution > Result > Unit Check |
| LaTeX-only math | Block `$$...$$` only, no inline `$...$` |

### 7.2 Implemented Proof Packs

SC3F (IEC 60909), VDROP, Equipment, Power Flow, Losses & Energy, Protection Overcurrent, Earthing/Ground Fault, Load Flow Voltage.

> **Detail:** see [`docs/proof_engine/README.md`](docs/proof_engine/README.md) and [`docs/proof_engine/P11_OVERVIEW.md`](docs/proof_engine/P11_OVERVIEW.md).

---

## 8. Validation Layer

NetworkValidator runs BEFORE any solver execution (13 industrial-grade rules).

> **Detail:** see Chapter 12 (Validation & QA).

---

## 9. Application Layer

- **Wizard**: Sequential controller for NetworkModel editing
- **SLD**: Visualization of NetworkModel (1:1 mapping, auto-layout, overlays)
- **Wizard/SLD Unity**: Both edit THE SAME NetworkModel instance

> **Detail:** see Chapter 05 (System Canonical Contracts), [`docs/spec/WIZARD_FLOW.md`](docs/spec/WIZARD_FLOW.md), [`docs/spec/SLD_TOPOLOGICAL_ENGINE.md`](docs/spec/SLD_TOPOLOGICAL_ENGINE.md).

---

## 10. Canonical Terminology

| Term | Definition | Reference Equivalent |
|------|------------|------------------------|
| Bus | Electrical node (single potential) | Terminal |
| Branch | Physical connection with impedance | Line/Cable/Trafo |
| Switch | Switching apparatus (no impedance) | Switch/Breaker |
| Station | Logical container (no physics) | Substation folder |
| Case | Calculation scenario | Study Case |
| Catalog | Type library | Type Library |

**Forbidden Terms in Core Model**: BoundaryNode, Connection Point, Virtual Node, Aggregated Element.

> **Detail:** see Chapter 01 (Purpose, Scope, Definitions).

---

## 11. Immutable Invariants

1. WHITE BOX Trace is foundational. All solvers expose intermediate values.
2. Result API IEC 60909 is FROZEN: `ShortCircuitResult`, `to_dict()`, `white_box_trace`.
3. Separation: solver != case != analysis.
4. Normative language: IEC / PN-EN.
5. Single NetworkModel per project.
6. Case cannot mutate model.
7. Validation before computation.
8. Determinism: same input = same output.
9. BoundaryNode is NOT in NetworkModel.
10. No project codenames in UI-visible strings.

---

## 12. Reference Documents

| Category | Location |
|----------|----------|
| **Detailed Specification (18 chapters)** | [`docs/spec/SPEC_CHAPTER_*.md`](docs/spec/) |
| **Spec vs Code Audit** | [`docs/spec/AUDIT_SPEC_VS_CODE.md`](docs/spec/AUDIT_SPEC_VS_CODE.md) |
| **Spec Expansion Plan** | [`docs/spec/SPEC_EXPANSION_PLAN.md`](docs/spec/SPEC_EXPANSION_PLAN.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Agent Governance | [`AGENTS.md`](AGENTS.md) |
| Operational Plan | [`PLANS.md`](PLANS.md) |
| UI Contracts | [`docs/ui/*.md`](docs/ui/) |
| Proof Engine Specs | [`docs/proof_engine/*.md`](docs/proof_engine/) |
| Architecture Decision Records | [`docs/adr/ADR-*.md`](docs/adr/) |
| Protection Specs | [`docs/protection/*.md`](docs/protection/) |
| Protection Architecture | [`docs/analysis/PROTECTION_CANONICAL_ARCHITECTURE.md`](docs/analysis/PROTECTION_CANONICAL_ARCHITECTURE.md) |
| Protection Contracts | [`docs/analysis/PROTECTION_CONTRACTS.md`](docs/analysis/PROTECTION_CONTRACTS.md) |
| Protection Dependency Graph | [`docs/analysis/PROTECTION_DEPENDENCY_GRAPH.md`](docs/analysis/PROTECTION_DEPENDENCY_GRAPH.md) |
| Protection Determinism Guards | [`docs/analysis/PROTECTION_DETERMINISM_GUARDS.md`](docs/analysis/PROTECTION_DETERMINISM_GUARDS.md) |
| Protection AS-IS Map | [`docs/analysis/PROTECTION_ASIS_MAP.md`](docs/analysis/PROTECTION_ASIS_MAP.md) |
| Analysis Specs | [`docs/analysis/*.md`](docs/analysis/) |
| Canonical Compliance | [`CANONICAL_COMPLIANCE.md`](CANONICAL_COMPLIANCE.md) |
| Documentation Index | [`docs/INDEX.md`](docs/INDEX.md) |
| Historical ExecPlans (archive) | [`docs/audit/historical_execplans/`](docs/audit/historical_execplans/) |

---

**END OF SYSTEM SPECIFICATION**
