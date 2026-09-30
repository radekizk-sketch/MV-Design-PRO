# PROTECTION CANONICAL ARCHITECTURE

> **STAN 2026-09-30:** opisywany kod (`domain/protection_engine_v1.py`, `application/result_mapping/protection_to_resultset_v1.py`,
> `application/result_mapping/short_circuit_to_resultset_v1.py`, `sc_binding_meta.py`, router `api/protection_engine_v1.py`)
> skasowany — ostatnie pliki w karcie RESULTSET-MARTWE-MAPPERY (zgoda B-01 w decyzji O-59); dokument archiwalny, nie opisuje
> stanu bieżącego. Żywa implementacja: model przekaźnika i nastaw w ENM (`enm/models.py::ProtectionAssignment`,
> `ProtectionSetting`, `Measurement`), ocena w `application/protection_analysis/engine.py::ProtectionEvaluationEngine`
> (tor `protection_sn`, trasy `api/protection_runs.py`), krzywe IDMT wyłącznie w
> `network_model/solvers/protection_iec60255.py::compute_idmt_generic`, jedyny producent ResultSetV1:
> `application/result_mapping/canonical_run_to_resultset_v1.py`.

> **Status**: ARCHIWALNY od 2026-09-30 (dawniej BINDING, Phase B)
> **Date**: 2026-02-12
> **Scope**: Protection Block (PR-27→PR-32) layer boundaries, contracts, prohibitions
> **Base**: PR-26 (Protection Engine v1 — 50/51 + IEC curves)

---

## 1. Layer Model

```
┌──────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                         │
│  Frontend (React/TS), Reports (PDF/DOCX), SLD overlays       │
│  NO physics. NO model mutation. 100% Polish UI.              │
└──────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                          │
│  ┌──────────────────┐  ┌──────────────────────────────────┐  │
│  │ ExecutionEngine   │  │ ResultMapping                    │  │
│  │ (run orchestration│  │ protection_to_resultset_v1.py    │  │
│  │  PROTECTION type) │  │ short_circuit_to_resultset_v1.py │  │
│  └──────────────────┘  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ ProtectionCurrentResolver (PR-27)                        │ │
│  │ • Maps current_source → test points or SC results        │ │
│  │ • Explicit selection ONLY (no auto-mapping)              │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────┐
│                      DOMAIN LAYER                            │
│  ┌─────────────────────┐  ┌──────────────────────────────┐   │
│  │ ProtectionEngineV1  │  │ ProtectionAnalysis           │   │
│  │ (50/51, IEC IDMT)   │  │ (evaluation, trace, summary) │   │
│  │ FROZEN after PR-26  │  │ interpretation only           │   │
│  └─────────────────────┘  └──────────────────────────────┘   │
│  ┌─────────────────────┐  ┌──────────────────────────────┐   │
│  │ StudyCase            │  │ ProtectionConfig             │   │
│  │ (case params only)   │  │ (template_ref, overrides)    │   │
│  └─────────────────────┘  └──────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ ResultSet / ElementResult (frozen, deterministic)        │  │
│  └─────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────┐
│                      SOLVER LAYER (UNTOUCHABLE)              │
│  IEC 60909 Short Circuit — DO NOT MODIFY                     │
│  Newton-Raphson / GS / FD Power Flow                         │
│  ShortCircuitResult (FROZEN v1) — DO NOT MODIFY              │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Boundary Rules (BINDING)

### 2.1 SC vs Protection — Strict Separation

| Aspect | SC Solver | Protection Engine |
|--------|-----------|-------------------|
| Layer | Solver | Domain (interpretation) |
| Physics | YES (IEC 60909) | NO |
| Input | NetworkSnapshot + fault params | Relay settings + test points |
| Output | ShortCircuitResult (frozen) | ProtectionResultSetV1 |
| ResultSet | SC ResultSet v1 (frozen) | Protection ResultSet (separate) |
| Mutual dependency | None | Consumes SC results (read-only) |

**Rule**: Protection READS SC results. Protection NEVER modifies SC results, solver code, or SC ResultSet v1.

### 2.2 Current Source — Explicit Selection Only

The bridge between SC results and Protection analysis (PR-27) MUST follow:

1. `current_source` is an **explicit enum choice**: `TEST_POINTS` or `SC_RESULT`
2. If `SC_RESULT`: user must explicitly select `run_id`, `quantity` (e.g., `ikss_a`), `target_ref` (element mapping)
3. **No auto-mapping**: if the mapping SC element → relay is ambiguous, raise a deterministic error with FixAction candidates
4. **No fallback**: if current source is not fully specified, the engine refuses to execute
5. **No default selection**: candidates are presented without pre-selection

### 2.3 Coordination — Numbers Only

Coordination (PR-28) computes selectivity margins:

```
Margin(I) = t_upstream(I) − t_downstream(I)
```

Rules:
- Relay pairs are **explicitly defined** by user (upstream + downstream IDs)
- **No auto-detection** of upstream/downstream topology
- **No OK/FAIL verdict** — only numerical margins with trace
- Sign convention: positive margin = upstream is slower (expected)

### 2.4 Overlay — Token-Only

Protection SLD overlay (PR-30) follows existing overlay canon:

- Token-based rendering (semantic CSS classes, no hex colors)
- No geometry modification
- No zoom-dependent layout
- Deterministic token ordering
- Run-bound payloads (`run_id` is binding)

### 2.5 Report — Data Model Only

Protection report (PR-31) is a data model:

- Contains: relay settings, current source, trip times, margins, trace summary
- Stable float formatting (no locale-dependent rendering)
- Stable element ordering (lexicographic by element_ref)
- `current_source` metadata is mandatory in every report

---

## 3. Prohibitions (BINDING)

| ID | Prohibition | Enforcement |
|----|-------------|-------------|
| P-01 | No SC solver modification | diff-guard on `network_model/solvers/` (PR-32) |
| P-02 | No SC ResultSet v1 modification | schema snapshot guard (PR-32) |
| P-03 | No heuristic current mapping | Code review + test (ambiguous → error) |
| P-04 | No auto-selection of target_ref | Test: no default value in FixAction candidates |
| P-05 | No auto-detection of upstream/downstream | Test: explicit pair required |
| P-06 | No OK/FAIL verdicts in coordination | Test: only numerical margins |
| P-07 | No overlay geometry modification | overlay_no_physics_guard.py (existing) |
| P-08 | No physics in presentation layer | arch_guard.py (existing) |
| P-09 | No non-deterministic patterns | determinism guard (PR-32) |
| P-10 | No English in UI | no_codenames_guard.py + review |

---

## 4. Data Flow (PR-27→PR-32)

```
SC Solver (FROZEN)
    │
    ▼ (read-only)
SC ResultSet v1 (FROZEN)
    │
    ▼ (explicit user selection: run_id + quantity + target_ref)
ProtectionCurrentResolver (PR-27)
    │
    ├─ TEST_POINTS → user-defined test point currents
    └─ SC_RESULT → resolved currents from SC ResultSet
    │
    ▼
Protection Engine v1 (PR-26, frozen after merge)
    │ (50/51 evaluation per relay per test point)
    ▼
ProtectionResultSetV1
    │
    ├─▶ ResultSet mapper → canonical ResultSet (storage)
    ├─▶ Coordination (PR-28) → SelectivityPair margins
    ├─▶ SLD Overlay (PR-30) → token payload for frontend
    └─▶ Report Model (PR-31) → export-ready data
```

---

## 5. Error Handling Canon

All protection errors follow the existing FixAction pattern:

| Error | FixAction | Auto-fix |
|-------|-----------|----------|
| Ambiguous SC → relay mapping | Candidate list (ranked deterministically) | NEVER |
| Missing CT ratio | NAVIGATE_TO_ELEMENT | NEVER |
| Missing test points | ADD_MISSING_DEVICE | NEVER |
| Invalid curve params | OPEN_MODAL | NEVER |
| SC run not found | Candidate runs list | NEVER |

**Rule**: FixActions are declarative suggestions. The user must explicitly click to accept.

---

*End of Protection Canonical Architecture.*
