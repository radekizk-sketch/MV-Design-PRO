# TRACE AS-IS MAP — MV-Design-PRO

**KOREKTA 2026-09-05 (karta CV-3.3-A2):** dokument sprzed kanonu V12.xx, poza
hierarchią `CLAUDE.md`. `load_flow_to_resultset_v1.py` (wzmiankowany niżej)
skasowany — zero konsumenta produkcyjnego. Szczegóły →
`docs/architecture/CONVERGENCE_ROADMAP.md` CV-3.3-A2.

**Status (pierwotny)**: BINDING (Commit 1 — RUN #2B)
**Data**: Pełny skan repozytorium z dnia 2026-02-13
**Cel**: Dokumentacja stanu zastanego warstwy trace/white-box przed implementacją Trace v2

---

## Spis treści

1. [SC (IEC 60909) — White-Box Trace](#1-sc-iec-60909--white-box-trace)
2. [Protection (50/51 + IDMT) — Trace v1](#2-protection-5051--idmt--trace-v1)
3. [Load Flow (Newton-Raphson / GS / FDLF) — Trace](#3-load-flow--trace)
4. [Execution — run_hash, snapshot_hash, storage](#4-execution--run_hash-snapshot_hash-storage)
5. [Frontend — TraceViewer, Compare, Export](#5-frontend--traceviewer-compare-export)
6. [CI — Guards, Determinism Suites](#6-ci--guards-determinism-suites)
7. [Luki i punkty integracji Trace v2](#7-luki-i-punkty-integracji-trace-v2)

---

## 1. SC (IEC 60909) — White-Box Trace

### 1.1 Solver

| Plik | Opis |
|------|------|
| `backend/src/network_model/solvers/short_circuit_iec60909.py` | Główny solver IEC 60909 (1008 linii) |
| `backend/src/network_model/solvers/short_circuit_core.py` | Funkcje fizyki: Z-bus, Z_equiv, Ik'', post-fault (158 linii) |
| `backend/src/network_model/solvers/short_circuit_contributions.py` | Struktury kontrybuacji źródeł i gałęzi (80 linii) |

### 1.2 ShortCircuitResult (Frozen API)

Plik: `short_circuit_iec60909.py`, linie 58–203

Kanoniczne klucze (`EXPECTED_SHORT_CIRCUIT_RESULT_KEYS`, linie 34–55):

```
short_circuit_type, fault_node_id, c_factor, un_v, zkk_ohm, rx_ratio,
kappa, tk_s, tb_s, ikss_a, ip_a, ith_a, ib_a, sk_mva,
ik_thevenin_a, ik_inverters_a, ik_total_a,
contributions, branch_contributions, white_box_trace
```

**Status**: FROZEN — zmiana wymaga version bump.

### 1.3 White-Box Trace (lista dict)

Pole `white_box_trace: list[dict]` w `ShortCircuitResult`.

Generowane przez `_build_white_box_trace()` (linie 267–423), 7 kanonicznych kroków:

| Krok | key | Wzór | Dane pośrednie |
|------|-----|------|----------------|
| 1 | `Zk` | `Z_k = Z_1` (3F) / `Z_1+Z_2` (2F) / composite | z1_ohm, z2_ohm, z0_ohm, z_equiv_ohm |
| 2 | `Ikss` | `I_k'' = (c·U_n·k_U) / |Z_k|` | c_factor, un_v, voltage_factor, z_equiv_abs_ohm → ikss_a |
| 3 | `kappa` | `κ = 1.02 + 0.98·exp(-3R/X)` | r_ohm, x_ohm, rx_ratio → kappa |
| 4 | `Ip` | `I_p = κ·√2·I_k''` | kappa, ikss_a → ip_a |
| 5 | `Ib` | `I_b = I_k''·√(1+((κ-1)·e^{-t_b/t_a})²)` | kappa, ikss_a, tb_s, ta_s, exp_factor → ib_a |
| 6 | `Ith` | `I_th = I_k''·√t_k` | ikss_a, tk_s → ith_a |
| 7 | `Sk` | `S_k = √3·U_n·I_k'' / 10^6` | un_v, ikss_a → sk_mva |

Schemat każdego kroku:

```python
{
    "key": str,              # identyfikator kroku
    "title": str,            # opis po polsku
    "formula_latex": str,    # wzór LaTeX
    "inputs": dict,          # dane wejściowe z wartościami
    "substitution": str,     # wzór z podstawionymi wartościami
    "result": dict,          # wynik obliczeń
    "notes": str | None      # notatki opcjonalne
}
```

### 1.4 WhiteBoxTracer (infrastruktura)

Plik: `backend/src/network_model/whitebox/tracer.py` (63 linie)

- `WhiteBoxStep` (frozen dataclass): key, title, formula_latex, inputs, substitution, result, notes
- `WhiteBoxTracer` (kolektor): steps, add_step(), add(), to_list()

### 1.5 Binding i Result Mapping

| Plik | Rola |
|------|------|
| `backend/src/application/solvers/short_circuit_binding.py` | Adaptor aplikacyjny: dispatch do solvera bez modyfikacji |
| `backend/src/application/result_mapping/short_circuit_to_resultset_v1.py` | Mapper: ShortCircuitResult → ResultSet v1 (pure mapping, no physics) |

Mapper eksponuje `white_box_steps_count` w global_results.

### 1.6 Eksport DOCX

Plik: `backend/src/network_model/reporting/short_circuit_report_docx.py` (283 linie)

- `_add_white_box_step()` renderuje krok trace jako: header, formula, inputs table, substitution, result table, notes

### 1.7 Proof Engine (SC)

Złote pliki: `backend/tests/golden/sc_asymmetrical/1f_z/proof.json`

ProofDocument generowany z white_box_trace:
- header: metadane (fault_location, fault_type, solver_version)
- steps: ProofStep (equation, input_values, result, source_keys, unit_check)

### 1.8 Testy SC White-Box

| Plik | Co weryfikuje |
|------|---------------|
| `backend/tests/test_short_circuit_iec60909.py` (785 linii) | Struktura trace: 7 kroków, klucze, typy |
| `backend/tests/test_result_api_contract.py` | Kontrakt frozen API: EXPECTED_SHORT_CIRCUIT_RESULT_KEYS, EXPECTED_WHITE_BOX_STEP_KEYS |

---

## 2. Protection (50/51 + IDMT) — Trace v1

### 2.1 Protection Engine v1

Plik: `backend/src/domain/protection_engine_v1.py` (717 linii)

**Natywny white-box trace wbudowany w funkcje obliczeniowe.**

#### Struktury wyników:

| Klasa | Linie | Opis |
|-------|-------|------|
| `Function50Result` | 298–312 | Wynik zabezpieczenia I>> (picked_up, t_trip_s) |
| `Function51Result` | 315–338 | Wynik IDMT (t_trip_s, curve_type, pickup_a_secondary, tms) |
| `TestPointResult` | 368–393 | Per-test-point: i_a_secondary, function_results, **trace: dict** |
| `ProtectionResultSetV1` | 432–462 | Komplet wyników z deterministic_signature (SHA-256) |
| `RelayResultV1` | 401–424 | Per-relay: relay_id, attached_cb_id, per_test_point |

#### CTRatio

Plik: `protection_engine_v1.py`, linie 69–107

- `CTRatio` (frozen): primary_a, secondary_a, ratio, to_primary(), to_secondary()
- Konwersja: linia 651 — `i_secondary = relay.ct_ratio.to_secondary(tp.i_a_primary)`

### 2.2 Inline Trace w funkcjach obliczeniowych

#### iec_curve_time_seconds() (linie 470–546)

Trace dict zawiera:

```
formula: "t = TMS * A / (M^B - 1)"
standard: "IEC 60255-151:2009"
curve_type, curve_label_pl, A, B, TMS
I_secondary, I_pickup_secondary
M = I / I_pickup                    ← INTERMEDIATE
M_power_B = M^B                     ← INTERMEDIATE
denominator = M^B - 1               ← INTERMEDIATE
base_time_s = A / denominator       ← INTERMEDIATE
trip_time_before_clamp_s            ← INTERMEDIATE
clamped: bool, max_time_s
trip_time_s: float
result: "TRIP" | "NO_TRIP" | "NO_TRIP_REASON"
reason_pl: str
```

#### function_50_evaluate() (linie 549–586)

Trace dict zawiera:

```
function: "50"
label_pl: "Zabezpieczenie zwarciowe (I>>)"
I_secondary, pickup_a_secondary, picked_up, t_trip_s
result: "DISABLED" | "TRIP" | "NO_TRIP"
notes_pl: str
```

### 2.3 Protection Analysis Domain (warstwa domenowa)

Plik: `backend/src/domain/protection_analysis.py` (456 linii)

| Klasa | Linie | Opis |
|-------|-------|------|
| `ProtectionTraceStep` | 228–257 | step, description_pl, inputs, outputs |
| `ProtectionTrace` | 260–311 | run_id, sc_run_id, snapshot_id, template_ref, overrides, steps, created_at |
| `ProtectionEvaluation` | 52–120 | device_id, i_fault_a, i_pickup_a, t_trip_s, trip_state, curve_ref, margin_percent, notes_pl |
| `ProtectionResult` | 161–220 | run_id, sc_run_id, protection_case_id, evaluations, summary |

### 2.4 Protection Evaluation Engine (warstwa aplikacyjna)

Plik: `backend/src/application/protection_analysis/engine.py` (771 linii)

Stałe IEC 60255-151:2009 (linie 47–68):

```
SI:  A=0.14,  B=0.02
VI:  A=13.5,  B=1.0
EI:  A=80.0,  B=2.0
```

Funkcje:

| Funkcja | Linie | Formuła |
|---------|-------|---------|
| `compute_iec_inverse_time()` | 187–222 | `t = TMS × A / ((I/Ipickup)^B - 1)` |
| `compute_margin_percent()` | 250–266 | `margin = (I_fault/I_pickup - 1) × 100` |

Trace w `evaluate()` (linie 288–359): kroki input_validation, device_evaluation, summary_computation.

### 2.5 IEC Curves (alternatywna implementacja)

Plik: `backend/src/protection/curves/iec_curves.py`

`IECTrippingResult` (linie 101–138): current_multiple, m_power_b, denominator, numerator, base_time_s, will_trip — eksponuje ALL intermediates via `to_dict()`.

### 2.6 Overcurrent Pipeline

Plik: `backend/src/application/analyses/protection/overcurrent/pipeline.py` (353 linie)

`_build_trace_overcurrent_v0()` (linie 222–262): kroki read_short_circuit_run, build_protection_input, compute_settings, build_report, index_run.

### 2.7 Result Mapping

Plik: `backend/src/application/result_mapping/protection_to_resultset_v1.py` (124 linie)

- `map_protection_to_resultset_v1()`: ProtectionResultSetV1 → canonical ResultSet
- ElementResult per relay: attached_cb_id, test_point_count, test_points (F50/F51)
- Global results: analysis_type, relay_count, total_test_points, total_f51_trips, total_f50_pickups, deterministic_signature

### 2.8 Powiązanie SC → Protection

```
ShortCircuitResult (ikss_a, fault_node_id)
  → ProtectionInput (fault_levels, connection_node)
    → Devices (from template) + Faults
      → ProtectionEvaluation per (device, fault)
        → M = I/Ipickup → t = TMS×A/(M^B-1)
          → ProtectionResult → ResultSet v1
```

### 2.9 Testy Protection Trace

| Plik | Co weryfikuje |
|------|---------------|
| `backend/tests/test_protection_coordination_v1.py` | Pełny flow: execute → ResultSetV1 z trace dict |
| `backend/tests/e2e/test_protection_exports_deterministic.py` | Determinizm eksportów |

---

## 3. Load Flow — Trace

### 3.1 Solvers

| Plik | Metoda |
|------|--------|
| `backend/src/network_model/solvers/power_flow_newton.py` | Newton-Raphson (primary) |
| `backend/src/network_model/solvers/power_flow_newton_internal.py` | NR internal: build_ybus_pu, build_jacobian, compute_branch_flows |
| `backend/src/network_model/solvers/power_flow_gauss_seidel.py` | Gauss-Seidel (SOR) |
| `backend/src/network_model/solvers/power_flow_fast_decoupled.py` | Fast-Decoupled (XB/BX) |

### 3.2 PowerFlowTrace (frozen, immutable)

Plik: `backend/src/network_model/solvers/power_flow_trace.py`

Wersja solvera: `POWER_FLOW_SOLVER_VERSION = "1.0.0"`

#### PowerFlowIterationTrace (frozen dataclass, linie 15–65):

```
k: int                          # numer iteracji (1-indexed)
mismatch_per_bus: dict           # {bus_id → {delta_p_pu, delta_q_pu}}
norm_mismatch: float             # norma L2 lub max
max_mismatch_pu: float           # max mismatch
jacobian: dict | None            # bloki J1, J2, J3, J4 (opcjonalne)
delta_state: dict | None         # {bus_id → {delta_theta_rad, delta_v_pu}}
state_next: dict | None          # {bus_id → {v_pu, theta_rad}}
damping_used: float
step_norm: float
pv_to_pq_switches: list[str] | None
cause_if_failed: str | None
```

#### PowerFlowTrace (frozen dataclass, linie 67–131):

```
solver_version: str              # "1.0.0"
input_hash: str                  # SHA-256 wejścia
snapshot_id: str | None
case_id: str | None
run_id: str | None
init_state: dict                 # {bus_id → {v_pu, theta_rad}}
init_method: str                 # "flat" | "last_solution"
tolerance: float
max_iterations: int
base_mva: float
slack_bus_id: str
pq_bus_ids: tuple[str, ...]     # posortowane
pv_bus_ids: tuple[str, ...]     # posortowane
ybus_trace: dict
iterations: tuple[PowerFlowIterationTrace, ...]
converged: bool
final_iterations_count: int
```

Builder: `build_power_flow_trace()` (linie 134–194) — deterministyczne sortowanie kluczy.

### 3.3 PowerFlowResultV1 (Frozen API)

Plik: `backend/src/network_model/solvers/power_flow_result.py`

Wersja: `POWER_FLOW_RESULT_VERSION = "1.0.0"` — FROZEN po wprowadzeniu.

| Klasa | Zawiera |
|-------|---------|
| `PowerFlowBusResult` | bus_id, v_pu, angle_deg, p_injected_mw, q_injected_mvar |
| `PowerFlowBranchResult` | branch_id, p_from_mw, q_from_mvar, p_to_mw, q_to_mvar, losses_p_mw, losses_q_mvar |
| `PowerFlowSummary` | total_losses_p_mw/q_mvar, min/max_v_pu, slack_p_mw/q_mvar |
| `PowerFlowResultV1` | result_version, converged, iterations_count, tolerance_used, base_mva, slack_bus_id, bus_results, branch_results, summary |

### 3.4 LoadFlowResultSetV1

Plik: `backend/src/application/result_mapping/load_flow_to_resultset_v1.py`

```
analysis_type: "LOAD_FLOW"
result_version: "1.0.0"
snapshot_hash, run_hash, input_hash
convergence_status: CONVERGED | NOT_CONVERGED
iteration_count: int
nodes: tuple[LoadFlowNodeResult, ...]    # posortowane po node_id
branches: tuple[LoadFlowBranchResult, ...] # posortowane po branch_id
totals: LoadFlowTotals
warnings, errors: tuple[str, ...]
deterministic_signature: str              # SHA-256
```

### 3.5 Dane pośrednie (intermediate values)

**Per-iteracja** (z PowerFlowTrace.iterations[k]):

| Wartość | Typ | Opis |
|---------|-----|------|
| v_pu | float | Napięcie węzła (p.u.) |
| theta_rad | float | Kąt napięcia (rad) |
| delta_p_pu | float | Mismatch P (p.u.) |
| delta_q_pu | float | Mismatch Q (p.u.) |
| delta_theta_rad | float | Zmiana kąta w iteracji |
| delta_v_pu | float | Zmiana napięcia w iteracji |
| norm_mismatch | float | Norma L2 wektora mismatch |
| step_norm | float | Norma L2 kroku Newtona |
| damping_used | float | Współczynnik tłumienia |
| jacobian (J1–J4) | dict | Bloki macierzy Jacobiego (trace_level="full") |
| pv_to_pq_switches | list | Przełączenia PV→PQ |

**Globalne** (z PowerFlowTrace):

| Wartość | Opis |
|---------|------|
| tolerance | Tolerancja zbieżności (ε) |
| max_iterations | Limit iteracji |
| final_iterations_count | Faktyczna liczba iteracji |
| converged | Status zbieżności |
| solver_version | "1.0.0" |
| init_method | "flat" / "last_solution" |
| ybus_trace | Ślad budowy Y-bus |

### 3.6 Proof Engine (P14 — Power Flow)

Plik: `backend/src/application/proof_engine/packs/p14_power_flow.py`

`P14PowerFlowProof` — generuje ProofDocument z danych LF:
- Walidacja zbieżności
- Weryfikacja bilansu mocy (P i Q)
- Sprawdzenie limitów napięć
- Kroki dowodowe: LaTeX + symbolic

### 3.7 Trace levels

| Poziom | Zawartość |
|--------|-----------|
| `"summary"` (default) | Zbieżność, normy mismatch, liczba iteracji |
| `"full"` | Pełny white-box: per-bus mismatch, Jacobian J1–J4, zmiany stanu |

### 3.8 Testy LF Trace

| Plik | Co weryfikuje |
|------|---------------|
| `backend/tests/e2e/test_pf_determinism_workflow.py` | Determinizm NR/GS/FDLF (2× run → identyczny wynik + trace) |
| `backend/tests/e2e/test_pf_exports_deterministic.py` | Determinizm eksportów LF |

---

## 4. Execution — run_hash, snapshot_hash, storage

### 4.1 Run i ResultSet

Plik: `backend/src/domain/execution.py`

#### Run (frozen dataclass, linie 65–104):

```
id: UUID
study_case_id: UUID
analysis_type: ExecutionAnalysisType  # SC_3F | SC_1F | SC_2F | LOAD_FLOW | PROTECTION
solver_input_hash: str                # SHA-256 kanonicznego wejścia
status: RunStatus                     # PENDING → RUNNING → DONE | FAILED
started_at, finished_at: datetime
error_message: str | None
```

#### ResultSet (frozen dataclass, linie 203–267):

```
run_id: UUID
analysis_type: ExecutionAnalysisType
validation_snapshot: dict
readiness_snapshot: dict
element_results: tuple[ElementResult, ...]  # posortowane po element_ref
global_results: dict
deterministic_signature: str                # SHA-256 kanonicznego JSON
fault_scenario_id, fault_type, fault_location  # PR-19
```

### 4.2 Hash computation

Plik: `execution.py`, linie 290–316

```python
def compute_solver_input_hash(solver_input_json: dict) -> str:
    # 1. Rekurencyjne sortowanie kluczy dict
    # 2. Sortowanie list deterministycznych po stable_key
    # 3. Serializacja: json.dumps(sort_keys=True, separators=(",",":"))
    # 4. SHA-256 na UTF-8 bajtach

def compute_result_signature(result_data: dict) -> str:
    # Identyczny algorytm — sygnatura wyniku
```

Deterministyczne klucze list (`_DETERMINISTIC_LIST_KEYS`, linie 367–380):

```
buses, branches, transformers, inverter_sources, switches,
element_results, nodes, relay_results, test_points,
target_ref_mapping, margin_points, pairs
```

### 4.3 Network Snapshot Fingerprint

Plik: `backend/src/network_model/core/snapshot.py`

```python
def compute_fingerprint(data: dict) -> str:
    # Rekurencyjna kanonizacja: sort keys, float→round(10), x.0→int
    # SHA-256 na JSON UTF-8
```

Klasy:

| Klasa | Opis |
|-------|------|
| `SnapshotMeta` | snapshot_id, parent_snapshot_id, fingerprint (P10a) |
| `NetworkSnapshot` | meta + graph, property fingerprint |
| `SnapshotReadOnlyGuard` | Context manager — rzuca wyjątek przy mutacji |

### 4.4 Persystencja (ORM)

Plik: `backend/src/infrastructure/persistence/models.py`

#### AnalysisRunORM (linie 403–431):

```
id: UUID
project_id, operating_case_id: UUID
analysis_type, status, result_status: str
input_snapshot: dict (DeterministicJSON)
input_hash: str(128) (INDEX)
result_summary: dict
trace_json: dict | list | None          ← TRACE STORAGE
white_box_trace: list[dict] | None      ← WHITE-BOX STORAGE
error_message: str | None
```

#### StudyRunORM (linie 458–482):

```
id: UUID
project_id, case_id: UUID
analysis_type: str
input_hash: str(128)
network_snapshot_id: str(64)            ← P10a BINDING
solver_version_hash: str(64)            ← P10a reprodukowalność
result_state: str (VALID | OUTDATED)
status: str
```

#### NetworkSnapshotORM (linie 176–191):

```
snapshot_id: str(64) (PK)
fingerprint: str(64)                    ← SHA-256
snapshot_json: dict (DeterministicJSON)
```

#### DeterministicJSON TypeDecorator (linie 81–103):

Kanonizuje JSON na bind: sort keys, normalize values. PostgreSQL JSONB lub SQLite TEXT.

### 4.5 Repozytoria

| Repozytorium | Klucz | Opis |
|--------------|-------|------|
| AnalysisRunRepository | id, input_hash | CRUD + invalidation (mark_results_outdated) |
| StudyRunRepository | id, network_snapshot_id | CRUD + invalidate_runs_for_snapshot (P10a) |
| SnapshotRepository | snapshot_id, fingerprint | CRUD + find_by_fingerprint (dedup) |
| AnalysisRunIndexRepository | run_id, fingerprint | Index artefaktów analiz |

### 4.6 Execution Engine Service

Plik: `backend/src/application/execution_engine/service.py` (596 linii)

Flow:

```
create_run(study_case_id, analysis_type, solver_input)
  → solver_input_hash = SHA-256(canonical(solver_input))
  → Run [PENDING]

execute_run_sc(run_id, graph, config, fault_node_id, ...)
  → Run [RUNNING]
  → execute_short_circuit() (solver binding)
  → map_short_circuit_to_resultset_v1()
  → ResultSet (frozen) z deterministic_signature
  → Run [DONE]
  → Store: AnalysisRunORM (trace_json, white_box_trace)
```

### 4.7 Study Scenario Orchestration

Plik: `backend/src/application/study_scenario/models.py`

```
Study → Scenario → Run → proof_set_ids, solver_versions
```

Namespace UUIDs: uuid5(NAMESPACE_URL, "mv-design-pro:study/scenario/run/snapshot")

Hash: `_hash_payload()` = SHA-256 na `_stable_json()` (sort_keys, compact separators).

### 4.8 Proof Engine Types

Plik: `backend/src/application/proof_engine/types.py`

| Klasa | Opis |
|-------|------|
| `ProofDocument` | document_id, artifact_id (UUID), proof_type, steps, summary |
| `ProofStep` | step_id, equation (EquationDefinition), input_values, substitution_latex, result, unit_check, source_keys |
| `ProofType` | SC3F_IEC60909, SC1F, SC2F, SC2FG, VDROP, LOAD_FLOW_VOLTAGE, PROTECTION_OVERCURRENT, ... |

ProofDocument.artifact_id → TraceArtifact (UUID, implicit — brak jawnego TraceArtifact v2).

---

## 5. Frontend — TraceViewer, Compare, Export

### 5.1 TraceViewer (3-panelowy)

Plik: `frontend/src/ui/proof/TraceViewer.tsx` (489 linii)

- Layout: TOC (lewy) | Content (środek) | Metadata (prawy)
- Pełnotekstowe wyszukiwanie z filtrami (faza, "tylko problemy")
- Deep linking: URL state (trace_section, trace_step)
- Selection → trace navigation mapping
- Eksport: JSONL i PDF (client-side)
- 100% polskie etykiety UI

Podkomponenty:

| Komponent | Plik | Rola |
|-----------|------|------|
| `TraceStepView` | `proof/TraceStepView.tsx` | Szczegóły kroku: formuła (KaTeX), inputs table, substitution, result |
| `TraceToc` | `proof/TraceToc.tsx` | Nawigacja: grupowanie po fazach, filtrowanie, podświetlanie |
| `TraceMetadataPanel` | `proof/TraceMetadataPanel.tsx` | Metadane: run_id, snapshot_id, input_hash, statystyki |
| `TraceSearchBar` | `proof/search/TraceSearchBar.tsx` | Wyszukiwanie, filtry, nawigacja wyników |

### 5.2 Math Rendering (KaTeX)

Plik: `frontend/src/ui/proof/MathRenderer.tsx` (263 linie)

- Renderuje LaTeX: inline ($...$) i block ($$...$$)
- Auto-detekcja trybu z delimiterów
- Fail-safe fallback na tekst przy błędach KaTeX
- Feature flag: `ENABLE_MATH_RENDERING`
- Security: `trust: false`
- Helpery: `MathBlock()`, `MathInline()`

### 5.3 TraceCompare (porównanie śladów)

| Plik | Rola |
|------|------|
| `proof/compare/TraceCompareView.tsx` | Side-by-side: Run A vs Run B, swap, nawigacja zmian, filtr ALL/CHANGES |
| `proof/compare/diffTrace.ts` | Algorytm porównawczy: deterministyczny, per-step, string-only |
| `proof/compare/types.ts` | TraceDiffStatus: UNCHANGED/CHANGED/ADDED/REMOVED, polskie etykiety, kolory Tailwind |
| `proof/compare/TraceDiffList.tsx` | Lista kroków z wizualnym statusem |
| `proof/compare/exportDiffJson.ts` | Eksport porównania do JSON |

Algorytm diffTrace:
- Matchowanie kroków po kluczu (key → step_id → step number → index)
- Porównanie pole-po-polu (string only, no value calculations)
- Status: UNCHANGED, CHANGED, ADDED, REMOVED
- **Brak fizyki** — czysto prezentacyjne

### 5.4 Eksport

| Plik | Format | Opis |
|------|--------|------|
| `proof/export/exportTracePdf.ts` (533 linie) | PDF | Client-side via browser print dialog, A4, 15mm margins, polskie etykiety |
| `proof/export/exportTraceJsonl.ts` (168 linii) | JSONL | Newline-delimited JSON: header + steps, export_version |

### 5.5 Deep Linking / URL State

Plik: `frontend/src/ui/proof/traceUrlState.ts`

- Parametry URL: `trace_section`, `trace_step`
- Funkcje: readTraceStateFromUrl(), updateUrlWithStep(), generateTraceDeepLink(), copyTraceDeepLink()

### 5.6 Typy TypeScript

| Plik | Typy |
|------|------|
| `frontend/src/ui/results-inspector/types.ts` | TraceStep, TraceValue, ExtendedTrace, RunHeader, TRACE_FIELD_LABELS (PL), TRACE_VALUE_LABELS (PL) |
| `frontend/src/proof-inspector/types.ts` | ProofValueView, StepView, UnitCheckView, HeaderView, InspectorView |

### 5.7 API Fetching

Plik: `frontend/src/ui/results-inspector/api.ts`

- `fetchExtendedTrace(runId)` → `GET /api/analysis-runs/{run_id}/results/trace`
- Zwraca: ExtendedTrace z white_box_trace[]

### 5.8 State Management (Zustand)

Plik: `frontend/src/ui/results-inspector/store.ts`

- `extendedTrace: ExtendedTrace | null`
- `isLoadingTrace: boolean`
- `loadExtendedTrace()` — lazy loading, fetch tylko przy wyborze tab TRACE

### 5.9 Integracja

| Strona | Import |
|--------|--------|
| `ResultsInspectorPage.tsx` | TraceViewerContainer z `../proof` |
| `ProtectionResultsInspectorPage.tsx` | Trace display dla protection |
| `PowerFlowResultsInspectorPage.tsx` | Trace display dla power flow |
| `protection-coordination/TracePanel.tsx` | Alternatywny accordion layout (bez KaTeX) |

---

## 6. CI — Guards, Determinism Suites

### 6.1 Guards aktywne w CI (GitHub Actions)

| Guard | Workflow | Opis |
|-------|----------|------|
| Python Tests | `python-tests.yml` | Wszystkie testy pytest na push/PR |
| Arch Guard | `arch-guard.yml` | Izolacja warstw: solvers ↔ analysis ↔ protection |
| No Codenames | `no-codenames-guard.yml` | Blokada nazw kodowych P1/P7/P11/... w frontend |
| Physics Label | `physics-label-guard.yml` | Brak edytowalnych pól fizycznych w modalach |
| Docs Guard | `docs-guard.yml` | Zakaz PCC w docs entrypoint, weryfikacja linków |

### 6.2 Guards ręczne (skrypty)

| Guard | Skrypt | Opis |
|-------|--------|------|
| Solver Diff | `scripts/solver_diff_guard.py` | SHA-256 hash solverów vs reference (`guard_references/solver_hashes.json`) |
| Solver Boundary | `scripts/solver_boundary_guard.py` | Blokada modyfikacji SC/Protection solverów z LF PR |
| ResultSet v1 Contract | `scripts/resultset_v1_schema_guard.py` | Frozen contract: sc_to_resultset_v1 + protection_to_resultset_v1 |
| Overlay No-Physics | `scripts/overlay_no_physics_guard.py` | Brak fizyki w SLD overlay (PR-16) |
| Results Workspace Determinism | `scripts/results_workspace_determinism_guard.py` | Brak Date.now()/Math.random()/uuid4() w results |
| Fault Scenarios Determinism | `scripts/fault_scenarios_determinism_guard.py` | Determinizm + brak PCC w fault scenarios |
| Protection No-Heuristics | `scripts/protection_no_heuristics_guard.py` | Brak auto_select/fallback/guess/heuristic (PR-32) |
| Load Flow No-Heuristics | `scripts/load_flow_no_heuristics_guard.py` | Brak auto-select slack, implicit cosφ |
| No Direct Fault Params | `scripts/no_direct_fault_params_guard.py` | fault_node_id i execute_short_circuit tylko w whitelist (PR-19) |

### 6.3 Solver Hash Reference

Plik: `scripts/guard_references/solver_hashes.json`

7 chronionych plików solverów z SHA-256:

```
power_flow_fast_decoupled.py
power_flow_gauss_seidel.py
power_flow_newton.py
power_flow_newton_internal.py
short_circuit_contributions.py
short_circuit_core.py
short_circuit_iec60909.py
```

### 6.4 Testy determinizmu

| Plik | Co weryfikuje |
|------|---------------|
| `tests/test_solver_input_determinism.py` | Identyczny ENM + catalog → identyczny solver-input hash |
| `tests/e2e/test_pf_determinism_workflow.py` | NR/GS/FDLF: 2× run → identyczny wynik + trace |
| `tests/e2e/test_protection_exports_deterministic.py` | Determinizm eksportów protection |
| `tests/e2e/test_pf_exports_deterministic.py` | Determinizm eksportów LF |
| `tests/test_result_api_contract.py` | Frozen API keys: SC result + white_box_trace |
| `tests/golden/test_golden_network_sn.py` | Golden network: ≥40 nodes, ≥31 line segments, benchmark SC |
| `tests/ci/test_user_visible_guards.py` | Brak alert/confirm/prompt, brak nazw kodowych w proof/audit |

### 6.5 Biblioteka determinizmu (utils)

Plik: `backend/tests/utils/determinism.py` (144 linie)

| Funkcja | Opis |
|---------|------|
| `canonicalize(obj)` | Rekurencyjna normalizacja: sort keys, Decimal→str, UUID→str |
| `fingerprint(obj)` | SHA-256 na canonicalize → JSON |
| `scrub_dynamic(obj, keys, paths)` | Usunięcie pól dynamicznych (created_at, timestamp, id) |
| `assert_deterministic(a, b, ...)` | Porównanie z scrub + raportowanie diffing paths |

---

## 7. Luki i punkty integracji Trace v2

### 7.1 Brak: TraceArtifactV2

- **Nie istnieje** zunifikowany typ TraceArtifactV2 wspólny dla SC/Protection/LF.
- SC ma `white_box_trace: list[dict]` (inline w ShortCircuitResult).
- Protection ma `TestPointResult.trace: dict` + `ProtectionTrace` (tuple ProtectionTraceStep).
- LF ma `PowerFlowTrace` (frozen dataclass) — najbardziej rozbudowany.
- Każda analiza ma **inną strukturę trace** — brak wspólnego schematu.

### 7.2 Brak: EquationRegistry

- Nie istnieje centralny rejestr równań (eq_id → label_pl → symbolic_latex → variables).
- SC: formuły hardkodowane w `_build_white_box_trace()`.
- Protection: formuły hardkodowane w `iec_curve_time_seconds()`.
- LF: brak jawnych formuł w trace (PowerFlowTrace zawiera wartości numeryczne, nie LaTeX).

### 7.3 Brak: MathSpecVersion

- Nie istnieje wersjonowanie specyfikacji matematycznej.
- `POWER_FLOW_SOLVER_VERSION = "1.0.0"` i `POWER_FLOW_RESULT_VERSION = "1.0.0"` to wersje API, nie math spec.
- Zmiana równania nie jest śledzona wersją.

### 7.4 Brak: TraceDiffEngine (backend)

- Frontend `diffTrace.ts` jest czysto prezentacyjny (string comparison, brak fizyki).
- **Brak backendowego TraceDiffEngine** — deterministyczne porównanie nie istnieje po stronie serwera.
- Frontend nie ma dostępu do intermediate_values w jednolitym formacie.

### 7.5 Brak: run_hash vs trace_signature rozdzielenie

- `solver_input_hash` (Run) = hash wejścia → odpowiada koncepcji run_hash.
- `deterministic_signature` (ResultSet) = hash wyniku → nie jest trace_signature.
- **Brak jawnej trace_signature** = SHA-256 kanonicznej serializacji trace.
- run_hash i trace_signature nie są formalnie rozdzielone w architekturze.

### 7.6 Brak: LaTeX Generator (deterministyczny backend)

- Frontend generuje PDF via `exportTracePdf.ts` (client-side print dialog) — **nie deterministyczny**.
- Frontend generuje JSONL via `exportTraceJsonl.ts` — deterministyczny ale format ≠ LaTeX.
- Backend DOCX export (`short_circuit_report_docx.py`) — zawiera white-box steps ale format ≠ LaTeX.
- **Brak backendowego deterministycznego LaTeX generatora** z TraceArtifactV2 + EquationRegistry.

### 7.7 Istniejąca infrastruktura do wykorzystania

| Element | Lokalizacja | Co można wykorzystać |
|---------|-------------|---------------------|
| `WhiteBoxTracer` + `WhiteBoxStep` | `network_model/whitebox/tracer.py` | Baza struktury kroku — rozbudować do TraceArtifactV2 |
| `compute_solver_input_hash()` | `domain/execution.py` | Algorytm kanonizacji → run_hash |
| `compute_fingerprint()` | `network_model/core/snapshot.py` | Algorytm snapshot_hash |
| `DeterministicJSON` | `infrastructure/persistence/models.py` | Typ bazodanowy dla trace storage |
| `determinism.py` utils | `tests/utils/determinism.py` | canonicalize(), fingerprint(), assert_deterministic() |
| `PowerFlowTrace` | `solvers/power_flow_trace.py` | Wzorzec frozen trace z iteracjami — najbliższy Trace v2 |
| `ProofDocument` + `ProofStep` | `proof_engine/types.py` | Wzorzec dowodowy z unit_check — rozbudować |
| Frontend TraceViewer | `ui/proof/TraceViewer.tsx` | 3-panel UI — zaadaptować do TraceArtifactV2 |
| Frontend diffTrace | `ui/proof/compare/diffTrace.ts` | Algorytm porównawczy — wymienić na backend TraceDiffEngine |
| Frontend MathRenderer | `ui/proof/MathRenderer.tsx` | KaTeX rendering — zachować |

### 7.8 Najlepsze punkty integracji emitterów

| Emitter | Punkt integracji | Źródło danych |
|---------|-----------------|---------------|
| **TraceEmitterSC** | Po `execute_short_circuit()`, przed `map_to_resultset_v1()` | ShortCircuitResult.white_box_trace + ShortCircuitCoreResult + PostProcessResult |
| **TraceEmitterProtection** | Po `execute_protection_v1()` | ProtectionResultSetV1 (TestPointResult.trace) + ProtectionTrace |
| **TraceEmitterLoadFlow** | Po PowerFlowNewtonSolver.solve() | PowerFlowNewtonSolution + PowerFlowTrace + PowerFlowResultV1 |

### 7.9 Podsumowanie luk

```
                     SC            Protection      Load Flow
                     ───────────   ──────────────  ──────────────
Trace istnieje?      TAK (v1)      TAK (v1 inline) TAK (frozen)
Wspólny schemat?     NIE           NIE             NIE
EquationRegistry?    NIE           NIE             NIE
MathSpecVersion?     NIE           NIE             NIE
trace_signature?     NIE           NIE             NIE
Backend TraceDiff?   NIE           NIE             NIE
LaTeX Generator?     NIE           NIE             NIE
UI Trace Viewer?     TAK           TAK (częściowo) TAK
UI Trace Compare?    TAK           -               -
```

---

## Zależności od dokumentów kanonicznych

| Dokument | Rola |
|----------|------|
| `SYSTEM_SPEC.md` | Architektura warstwowa — trace w warstwie domain/solver |
| `AGENTS.md` | Zakazy: nie dotykać solverów, nie zmieniać ResultSet v1 |
| `ARCHITECTURE.md` | Granice warstw: Solver → Analysis → Presentation |
| `PLANS.md` | Plan RUN #2B (ten dokument) |

---

*Koniec TRACE_ASIS_MAP.md — Commit 1 (RUN #2B)*
