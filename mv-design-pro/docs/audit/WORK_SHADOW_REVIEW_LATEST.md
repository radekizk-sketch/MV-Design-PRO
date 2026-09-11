# Niezależny shadow review — delta 1e962025..cac842855

## REVIEW RANGE

Base: `1e96202535abb0acfb123ebac8a49dae430e792c`

Head: `cac842855ca9acab9552435432492d85ddfe5bd0`

Opus branch: `claude/max-dynamic-audit-kzbivg`

PR: **NONE for this branch**. PR #475 remains open, but its recorded head is still `1e962025`.

Merge base: `1e96202535abb0acfb123ebac8a49dae430e792c`

Delta: 4 commits, 34 changed files according to compare API.

## EXECUTIVE VERDICT

**REJECT CURRENT DELTA**

The catalog/namespace changes improve traceability, but the owner’s mandatory k_sc boundary is not implemented. The branch still permits a short-circuit payload containing the system default while eligibility remains true.

## NEW P0/P1

### P0-DELTA-03 — DEFAULT_FORBIDDEN k_sc can still feed authoritative capability

- **Claim under test:** a missing k_sc is visible and cannot establish production readiness for short-circuit, breaking-capacity, protection or evidence output.
- **Evidence:** `solver_input/builder.py` emits `k_sc_efektywny=1.1` into `InverterSourcePayload` and marks only the trace entry `DEFAULT_FORBIDDEN`. `solver_input/eligibility.py::check_eligibility` has no k_sc/provenance check for `SHORT_CIRCUIT_3F`, `SHORT_CIRCUIT_1F` or `PROTECTION`; it checks only common topology/catalog conditions (and a protectable switch for protection). `SolverInputEnvelope` has no authoritative-capability gate.
- **Reproduction:** construct an otherwise valid graph with an inverter whose `k_sc=None`. The builder deterministically emits numeric `k_sc=1.1) and trace `source_kind=DEFAULT_FORBIDDEN`; the same graph passes `check_eligibility` because no predicate consumes that provenance. The current owner rule therefore fails at the capability boundary.
- **Why it matters:** DER fault current changes Ik'', Icu selection and protection coordination. A visible warning is insufficient when the result can be consumed as an authoritative SC/protection input.
- **Acceptance test:** for every graph with any active inverter `k_sc_zrodlo=DEFAULT_FORBIDDEN`, short-circuit 3F/1F and protection eligibility must be false with a stable blocker; load-flow, topology and SLD eligibility must remain independently evaluable. Evidence/regulatory APIs must reject such results even if a caller supplies an apparently successful solver result.
- **Existing tests:** do not detect this owner-required behavior; current tests assert provenance labeling, not capability blocking.

### P1-DELTA-04 — non-finite positive k_sc is accepted as a declaration

- **Claim under test:** the single k_sc acceptance predicate prevents invalid values.
- **Independent executable counterexample:** importing only the changed function with dependency stubs gives:
  `wspolczynnik_wkladu_zwarciowego(float("inf")) == (inf, "DEKLARACJA")`.
  The same predicate maps NaN to the default, but accepts +Inf because it tests only `> 0`. Consequently `ik_sc_a = inf`, and the trace is not DEFAULT_FORBIDDEN.
- **Why it matters:** Inf can poison SC currents, apparatus checks and serialized results while being labeled as a user/catalog declaration.
- **Acceptance test:** reject non-finite k_sc (NaN, +Inf, -Inf) before materialization; emit an explicit unresolved/invalid-data blocker, never a catalog or override provenance.

### P1-DELTA-05 — readiness claims are broader than the executable 57/57 gate

- **Claim under test:** “57/57 template readiness” means all 57 templates are engineering-ready.
- **Evidence:** `test_bramka_pokrycia_katalogowego_szablonow.py` calls `engineering-readiness` but filters issues to exactly `switch.catalog_ref_missing`; it never asserts `gotowosc["ready"] is True`, nor absence of other blockers. The test itself states it is the only executable place enforcing 57/57.
- **Reproduction:** any template response containing `{"ready": false, "issues":[{"code":"other.blocker"}]}` and no `switch.catalog_ref_missing` passes the parametrized assertion.
- **Why it matters:** 57/57 proves only the absence of this one switch-binding code along the tested path. It does not prove complete engineering readiness, SC/protection suitability, provenance, selectivity, Icu/Iz, k_sc or regulatory evidence.
- **Acceptance test:** publish the metric as “57/57 without switch.catalog_ref_missing”, or make the gate assert the complete readiness contract and report capability-scoped blockers separately.

### P1-DELTA-06 — closed SN voltage map rejects standard 11/22/33 kV systems

- **Claim under test:** voltage-class selection is physically complete for IEC MV systems.
- **Evidence:** `SZEREG_U_M_KV` contains only 3, 6, 10, 15, 20, 30, 35 kV. The executable function returns `None` for 11, 22 and 33 kV, although IEC 60038 lists these nominal system voltages with corresponding equipment maxima (12, 24 and 36 kV). This is a deliberate refusal, not a numerical edge case.
- **Reproduction:** extracted current functions return:
  `11 -> None`, `22 -> None`, `33 -> None` for `napiecie_najwyzsze_sieci_kv`; a 15 kV input returns 17.5 kV as expected.
- **Why it matters:** valid MV DER stations on common 11/22/33 kV systems are blocked or left without a selected apparatus. A closed map is a valid domain constraint only if the product explicitly scopes those voltages; no such scope is encoded in this function.
- **Acceptance test:** either support the complete declared voltage scope (including 11/22/33 and documented variants such as 13.8/22.9/34.5 kV) or reject/document that the product is intentionally limited to the current subset.

## k_sc READINESS VERDICT

**REFUTED for the owner decision.** Provenance semantics are improved: missing declaration remains `None`, serialisation preserves declaration, and the trace can say `DEFAULT_FORBIDDEN`. However, that tag is informational only. No capability-scoped blocker prevents the numeric 1.1 from reaching short-circuit/protection consumers, and no evidence-layer rejection is visible in the changed code. Exploratory use is acceptable only if the output is technically non-authoritative and impossible to submit as a validated result; that boundary is not enforced here.

## CATALOG INVARIANT VERDICT

**PARTIALLY SUPPORTED.** The tests are useful internal-consistency checks, but they are not independent manufacturer or normative oracles, and several hard predicates are too broad for the families to which they are applied.

| Rule | Classification | Independent challenge |
|---|---|---|
| R0 >= R1 | PLAUSIBILITY GUARD ONLY | Sequence resistance depends on conductor/sheath/earth-return geometry; it is not a universal inequality for all cable/line constructions. |
| P0 < Pk | PLAUSIBILITY GUARD ONLY | Typical distribution transformers satisfy it, but core and winding designs do not make the inequality a mathematical necessity for every transformer family. |
| Icw <= Icu | TOO STRONG / INVALID AS IMPLEMENTED | Icw (withstand) and Icu (breaking) are different ratings and the code mixes LV/MV families; applicability must be encoded per apparatus standard/variant, not imposed globally on every pair. |
| 0 < R/X < 1 | PLAUSIBILITY GUARD ONLY | Inductive MV utility equivalents commonly fall here, but resistive/low-voltage or specially defined source equivalents can have R/X >= 1. |
| 0 < i0% < 10 | PLAUSIBILITY GUARD ONLY | Reasonable for ordinary distribution-transformer records, not universal for special transformers; the current test also skips missing/zero values. |

The IEC 60038 table includes 11, 22 and 33 kV nominal systems alongside 12/24/36 kV equipment maxima, so the closed map is incomplete for a generic MV product. genui{"citation":{"ref":"turn1search24"}} Sequence-resistance references likewise note that zero-sequence resistance may be greater or less than positive-sequence resistance depending on construction. genui{"citation":{"ref":"turn0search1"}}

Additional guard weakness: `WYMAGANE["transformer_types"]` omits `p0_kw` and `i0_percent`, while the invariant tests filter absent values. An externally sourced transformer with those fields missing can therefore be classified `PRODUCTION_READY` by `_klasyfikacja` (independent execution: `_klasyfikacja(1,100,{"DOKUMENT_ZEWNETRZNY":1}) -> "PRODUCTION_READY"`). This is a readiness-metric gap, not proof that current records are wrong.

## 57/57 VS 23/23

- **57/57 is not 23/23.** The former is a template-path measurement; the latter is a catalog-family completeness/provenance matrix.
- The executable 57/57 test proves only that each enumerated template, through the tested API path, leaves no `switch.catalog_ref_missing` issue. It does not prove `ready=True` or production engineering readiness.
- The inventory reports complete *listed* fields, but its own table shows only 10/23 families classified production-ready and many converter/transformer/apparatus records without external manufacturer provenance. Complete fields without verifiable provenance are not production-verified engineering data.
- Current claims that all catalog families are production-ready, or that 57/57 alone means production-ready station templates, overstate the evidence.

## PHYSICS SCORE

PARTIALLY SUPPORTED — namespace/voltage-side correction is physically sensible for the tested 15 kV/0.4 kV cases, but k_sc remains an authoritative-path defect and the voltage map is incomplete.

## MATHEMATICS SCORE

PARTIALLY SUPPORTED — the current (I=S/(\sqrt3 U)) and U_m mapping are coherent on the represented subset; non-finite k_sc acceptance and incomplete voltage domain invalidate a general claim.

## NUMERICAL SCORE

UNRESOLVED — no new independent integration/refinement evidence in this delta; prior dynamic findings remain open.

## ENERGY / NETWORK SCORE

UNRESOLVED — k_sc can still alter SC outputs without an enforced provenance gate; no new independent KCL/energy qualification was added.

## CATALOG ENGINEERING SCORE

PARTIALLY SUPPORTED — provenance limitations are documented and the ABB extraction path is more reproducible, but internal invariants are not an external oracle and readiness classification can omit solver-used fields.

## CI DELTA

At HEAD check-runs: 5 completed success, 3 completed failure, 2 in progress (frontend and full-real-backend-e2e).

- **New/incremental red:** `V12K Extended Invariant Guards` fails deterministically at `enm/domain_operations_v2.py:5923` (`meta.quantity` fallback literal, guard budget 0, found 1). This is introduced by the new guard scope; it is not an environmental failure.
- **Inherited red:** `pytest` remains 7 failed (11655 passed, 14 skipped), same failure count/family as the previous checkpoint; `SLD Contract Tests (Vitest)` is also still red. No evidence that the four catalog commits caused those inherited failures.
- Green checks prove only their own scripts; they do not establish physical or regulatory validity.

## MUTATION STATUS

New relevant mutants:

- **SURVIVED (P0):** remove capability gating for DEFAULT_FORBIDDEN k_sc — current implementation is equivalent to this mutation because no such gate exists.
- **SURVIVED (P1):** replace finite-value validation with `k_sc > 0`; +Inf survives as a declaration.
- **SURVIVED (P1):** change a readiness response to `ready=False` while removing only `switch.catalog_ref_missing`; the 57/57 test still passes.
- **KILLED (scope-limited):** wrong DER apparatus namespace (APARAT_NN on a 15 kV bus) is killed by the changed voltage-side selection path for the represented 15 kV case.
- **SURVIVED (scope-limited):** set bus voltage to unknown; `przestrzen_aparatu_dla_napiecia(None)` returns APARAT_NN. Explicit binding can therefore default to the nN namespace unless a later missing-voltage guard fires.

## UNRESOLVED PROFESSORIAL QUESTIONS

- **SOL CAN RESOLVE:** What exact capability contract/API must reject DEFAULT_FORBIDDEN k_sc while leaving load-flow/topology/SLD independent?
- **SOL CAN RESOLVE:** Is the product scope intentionally limited to 10/15/20/30/35 kV, or must the IEC 60038 11/22/33 kV series and regional variants be supported?
- **SOL CAN RESOLVE:** Which catalog fields are mandatory for each solver capability (specifically transformer P0 and i0), and which are merely optional metadata?
- **SOL CAN RESOLVE:** Should Icw/Icu be checked only for apparatus variants whose governing standard defines a comparable relation?

