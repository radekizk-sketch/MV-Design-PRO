# PR-25: Fault Scenario v2 — Contract, Validation, Eligibility, Binding, Determinism

## Status

IMPLEMENTED

## Context

PR-19/PR-24 introduced FaultScenario v1 with metallic-only faults and BUS/BRANCH location types. PR-25 extends the domain to support:

1. **Fault impedance (Zf)** — explicit user-provided impedance for faults through impedance
2. **Branch-point faults** — faults at arbitrary points on branches (alpha parameter)
3. **Arc parameters** — reserved field for future arc modeling (rejected in v2) — **removed in partia integracji 10** (phantom field: always rejected, never read)

All extensions are backward-compatible. The solver (IEC 60909) is NOT modified. **Superseded in part by card OD-14 (partia integracji 10, 2026-10-16)** — see section „Change OD-14” below: the IEC 60909 core now takes Z_f (B-01 consent under O-59), IMPEDANCE mode runs end to end, and the phantom fields are deleted.

## Decision

### Data Schema (v2)

```
FaultScenarioV2 (stan po partii integracji 10):
  id: UUID (stable)
  study_case_id: UUID
  name: str (PL, required)
  fault_type: SC_3F | SC_2F | SC_1F | SC_2F_G
  fault_mode: METALLIC | IMPEDANCE
  fault_impedance?: { r_f_ohm, x_f_ohm }   # required for IMPEDANCE, forbidden for METALLIC; R_f >= 0, X_f >= 0
  fault_location:
    location_type: BUS | BRANCH | NODE | BRANCH_POINT
    element_ref: str
    position: float | null                   # alpha for BRANCH_POINT [0,1]
  config: ShortCircuitConfig
  content_hash: SHA-256
```

Removed in partia integracji 10 (no compatibility layer — CLAUDE.md „Zasady inżynierskie” pkt 1):
`arc_params` (always rejected), `z0_bus_data` (never read by any run — Z0 is MODEL data, gated by the
shared run gate below) and `fault_impedance_type` (always METALLIC, duplicate of `fault_mode`). Request
models use `extra="forbid"`, so a client still sending them gets 422 instead of silent acceptance.

### Error Codes

Domain validation (`FaultScenarioValidationError`, API 422) carries Polish messages without codes:
name required, `element_ref` required, BUS/NODE without position, BRANCH position in (0, 1),
BRANCH_POINT alpha in [0, 1], METALLIC without `fault_impedance`, IMPEDANCE with `fault_impedance`,
`c_factor` > 0, `thermal_time_seconds` > 0. Z_f data rules are named refusals (`OdmowaNazwana`, API 422)
from ONE source shared with the core (`network_model/core/impedancja_przejscia.py`):

| Code | Condition |
|------|-----------|
| `sc.impedancja_zwarcia_pojemnosciowa` | X_f < 0 |
| `sc.rezystancja_zwarcia_ujemna` | R_f < 0 |
| `sc.impedancja_zwarcia_nieskonczona` | R_f or X_f not a finite number |

Eligibility (`GET …/fault-scenarios/{id}/eligibility`) and run creation (`POST …/fault-scenarios/{id}/runs`, 409)
read ONE model gate `enm.canonical_analysis.ocen_model_biegu` (predicates in pairs):

| Code | Condition |
|------|-----------|
| `enm.model_nie_przeszedl_walidacji` | ENM validation FAIL (one blocker per readiness issue) |
| `sc.model_bez_zdolnosci_zwarciowej` | model has no 3F short-circuit capability |
| `sc.model_bez_skladowej_zerowej` | SC_1F / SC_2F_G on a model without zero-sequence data (W001/W002) |
| `ELIG_FAULT_NODE_EMPTY` | empty fault node |
| `fault.location_on_branch_requires_assembler` | BRANCH / BRANCH_POINT location (fault inside a branch is not computed — named refusal) |

Deleted: `ELIG_BINDING_UNSUPPORTED_FAULT_IMPEDANCE` (stub — IMPEDANCE now runs), `ELIG_SC1F_NO_Z0` and
`ELIG_SC2F_NO_Z2` (read the phantom `z0_bus_data` instead of the model).

### Adapter Mapping

- **IMPEDANCE mode (OD-14, partia 10)**: the scenario projects Z_f into run options under the key `fault_impedance` (`enm/scenariusze.py::opcje_biegu_ze_scenariusza`); the assembler validates it with the shared rule and passes `z_f_ohm` to the IEC 60909 core; Z_f = 0 is normalized to „no Z_f” (metallic, bit-for-bit parity). Results with Z_f carry `poza_zakresem_iec60909 = true` and are blocked by authority code SI-117 for withstand, protection, coordination, regulatory evidence and arc-flash consumers (contract `docs/domain/KONTRAKT_SCENARIUSZY_ZWARCIOWYCH_TRYB_IMPEDANCE.md` §3).
- **BRANCH / BRANCH_POINT location**: named refusal `fault.location_on_branch_requires_assembler` in eligibility and in the assembler. The solver operates on nodes only; a fault inside a branch needs a new node in the model (not a heuristic in the solver).

### No Heuristics Rule

The following are explicitly forbidden:
- Auto-selection of nearest node for BRANCH_POINT
- Auto-splitting of branches
- Default impedance values for IMPEDANCE mode
- Auto-calculation of arc parameters
- Implicit conversion from BRANCH_POINT to NODE

### Determinism

1. **Hash**: `content_hash = SHA-256(canonical_json(sorted_keys, compact_separators))`
2. **Fields in hash**: analysis_type, config, fault_impedance, fault_mode, fault_type, location, name (partia 10: `arc_params`, `fault_impedance_type`, `z0_bus_data` removed together with the fields)
3. **Stable JSON**: `json.dumps(content, sort_keys=True, separators=(",", ":"))`
4. **Tests**: `test_fault_scenario_v2_determinism.py` — 5 formal proof classes

### Backward Compatibility

- Stored scenarios without `fault_mode` deserialize as `METALLIC`; keys of removed fields in stored data are ignored by `from_dict()` (no compatibility layer — they are not read).
- `fault_impedance` defaults to `None`.
- `BUS` and `BRANCH` location types still valid.

### Files Changed

| File | Change |
|------|--------|
| `backend/src/domain/fault_scenario.py` | FaultMode, FaultImpedance, v2 fields, validation |
| `backend/src/api/fault_scenarios.py` | v2 request/response models |
| `backend/src/application/fault_scenario_service.py` | v2 create/update/eligibility/overlay |
| `frontend/src/ui/fault-scenarios/types.ts` | v2 TypeScript types |
| `frontend/src/ui/fault-scenarios/FaultScenarioModal.tsx` | v2 UI (mode, Zf `r_f_ohm`/`x_f_ohm`, location) |
| `frontend/src/ui2/spaces/obliczenia/scenariusze/PanelScenariuszy.tsx` | scenario panel of the ui2 shell — creates scenarios and RUNS them (create → execute → terminal state, partia 10) |
| `frontend/src/ui/fault-scenarios/FaultScenariosPanel.tsx` | v2 display |
| `backend/tests/test_fault_scenario_v2.py` | v2 domain tests |
| `backend/tests/test_fault_scenario_v2_determinism.py` | Determinism proofs |

### Change OD-14 (partia integracji 10, 2026-10-16)

The former „Files NOT Changed (Solver Untouched)” list is void: `short_circuit_iec60909.py`, `short_circuit_core.py`,
`short_circuit_asymmetrical_quantities.py` and `machine_sc_iec60909.py` take Z_f additively (B-01 consent for
OD-14 under O-59; Z_f absent → identical result, golden fixtures unchanged). Binding contract:
`docs/domain/KONTRAKT_SCENARIUSZY_ZWARCIOWYCH_TRYB_IMPEDANCE.md`.

## Consequences

1. Zf support is implemented end to end (OD-14); branch-point faults remain a named refusal
2. UI supports full v2 editing (mode, impedance, branch-point alpha)
3. Unsupported features fail deterministically with Polish error messages and FixActions
4. ResultSet v1 is untouched — scenario impacts input/hash, not result structure
5. Zero PCC references introduced
