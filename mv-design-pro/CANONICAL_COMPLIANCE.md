# MV-DESIGN-PRO Canonical Compliance Checklist

**Version:** 3.0
**Status:** AUDIT DOCUMENT (Updated 2026-01)
**Reference:** SYSTEM_SPEC.md, PLANS.md, sld_rules.md, P11_1d_PROOF_UI_EXPORT.md

---

## Purpose

This document provides a comprehensive checklist for verifying compliance with the canonical architectural principles. Every item must be verifiable in code.

---

## 1. Network Model Compliance

### 1.1 Single Model Principle

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| NM-001 | Exactly ONE NetworkModel per project | Check: no parallel model instances | VERIFY |
| NM-002 | NetworkModel is the single source of truth | Check: no shadow data stores | VERIFY |
| NM-003 | Wizard operates on NetworkModel | Check: wizard service uses NetworkGraph | VERIFY |
| NM-004 | SLD operates on same NetworkModel | Check: SLD uses same NetworkGraph | VERIFY |

**Code locations to verify:**
- `backend/src/network_model/core/graph.py`
- `backend/src/application/network_wizard/service.py`
- `backend/src/application/sld/layout.py`

### 1.2 Element Types

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| NM-010 | Bus = electrical node (single potential) | Check: Bus alias maps to Node | PASS |
| NM-011 | Line = overhead line with R/X | Check: LineBranch has impedance | PASS |
| NM-012 | Cable = underground with R/X/C | Check: LineBranch supports CABLE | PASS |
| NM-013 | Transformer = 2W/3W with impedance | Check: TransformerBranch exists | PASS |
| NM-014 | Switch = OPEN/CLOSE only, NO impedance | Check: Switch class or in_service | VERIFY |
| NM-015 | Source = power injection | Check: Source class exists | PASS |
| NM-016 | Load = power consumption | Check: Load class exists | VERIFY |

**Code locations:**
- `backend/src/network_model/core/node.py`
- `backend/src/network_model/core/branch.py`

### 1.3 Forbidden Elements in Model

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| NM-020 | NO BoundaryNode in NetworkModel | Check: connection_node_id removed from NetworkGraph | PASS |
| NM-021 | NO boundary markers in model | Check: no boundary fields | PASS |
| NM-022 | NO legal/contractual concepts | Check: no legal fields | PASS |
| NM-023 | Station = logical only | Check: Station has no impedance | N/A |

**Remediated (2025-01):** `connection_node_id` removed from NetworkGraph. BoundaryNode is now identified exclusively in the interpretation layer via BoundaryIdentifier. See PLANS.md Phase 2 Task 2.1.

---

## 2. Study Case Compliance

### 2.1 Case Immutability

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| SC-001 | Case CANNOT mutate NetworkModel | Check: Case uses snapshot | VERIFY |
| SC-002 | Case stores ONLY calculation parameters | Check: no model data in Case | VERIFY |
| SC-003 | Multiple Cases → one Model | Check: Cases reference model | VERIFY |
| SC-004 | Case uses NetworkSnapshot (immutable) | Check: snapshot creation | PASS |

**Code locations:**
- `backend/src/domain/models.py`
- `backend/src/network_model/core/snapshot.py`

### 2.2 Result Invalidation

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| SC-010 | Model change invalidates ALL results | Check: invalidation logic | VERIFY |
| SC-011 | Result states: NONE, FRESH, OUTDATED | Check: state enum | VERIFY |
| SC-012 | Re-computation marks as FRESH | Check: solver updates state | VERIFY |

---

## 3. Catalog (Type Library) Compliance

### 3.1 Type Immutability

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| CT-001 | Types are immutable (frozen) | Check: frozen=True | VERIFY |
| CT-002 | Types are shared across projects | Check: global catalog | VERIFY |
| CT-003 | Instances store type reference | Check: type_ref field | VERIFY |
| CT-004 | Local parameters separate | Check: length_km not in type | PASS |

**Code locations:**
- `backend/src/application/network_wizard/service.py` (list_line_types, etc.)

### 3.2 Type Definitions

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| CT-010 | LineType with R, X, B, I_rated | Check: type structure | VERIFY |
| CT-011 | CableType with R, X, C, I_rated | Check: type structure | VERIFY |
| CT-012 | TransformerType with S, U_hv, U_lv, uk%, pk | Check: type structure | VERIFY |

### 3.3 Parameter Precedence (P8.1)

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| CT-020 | Line/Cable: override > type_ref > instance | Check: resolve_line_params() | PASS |
| CT-021 | Transformer: type_ref > instance | Check: resolve_transformer_params() | PASS |
| CT-022 | Backward compat: no type_ref = instance | Check: test_no_type_ref_preserves_legacy_behavior | PASS |
| CT-023 | Validation: type_ref not found → error | Check: TypeNotFoundError raised | PASS |
| CT-024 | Centralized resolver (no duplication) | Check: single resolver module | PASS |
| CT-025 | Deterministic resolution | Check: test_*_is_deterministic | PASS |
| CT-026 | No numeric change for legacy models | Check: regression test | PASS |

**Code locations:**
- `backend/src/network_model/catalog/resolver.py` (central resolver)
- `backend/src/network_model/core/branch.py` (LineBranch, TransformerBranch)
- `backend/tests/network_model/catalog/test_resolver.py` (contract tests)

---

## 4. Solver Layer (WHITE BOX) Compliance

### 4.1 White Box Requirements

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| WB-001 | Expose all calculation steps | Check: trace.step() calls | VERIFY |
| WB-002 | Provide intermediate values | Check: trace.record() calls | VERIFY |
| WB-003 | Allow numerical audit | Check: white_box_trace in result | PASS |
| WB-004 | Document assumptions | Check: docstrings | VERIFY |
| WB-005 | Y-bus matrix accessible | Check: ybus in trace | VERIFY |
| WB-006 | Thevenin impedance accessible | Check: z_th in trace | VERIFY |

**Code locations:**
- `backend/src/network_model/solvers/short_circuit_iec60909.py`
- `backend/src/analysis/power_flow/solver.py`
- `backend/src/network_model/whitebox/tracer.py`

### 4.2 Forbidden Practices

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| WB-010 | NO black-box solvers | Check: all values exposed | VERIFY |
| WB-011 | NO hidden corrections | Check: no undocumented adjustments | VERIFY |
| WB-012 | NO undocumented simplifications | Check: all assumptions documented | VERIFY |
| WB-013 | NO implicit assumptions | Check: explicit parameters | VERIFY |

### 4.3 Result API (Frozen)

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| WB-020 | ShortCircuitResult is frozen | Check: @dataclass(frozen=True) | VERIFY |
| WB-021 | to_dict() method exists | Check: method signature | PASS |
| WB-022 | white_box_trace field exists | Check: field in class | PASS |

---

## 5. Validation Layer Compliance

### 5.1 NetworkValidator

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| VL-001 | Validation before solver | Check: validate() called | VERIFY |
| VL-002 | Graph connectivity check | Check: is_connected() | PASS |
| VL-003 | No dangling elements | Check: dangling detection | VERIFY |
| VL-004 | Source presence required | Check: source validation | PASS |
| VL-005 | Bus voltage > 0 | Check: voltage validation | PASS |
| VL-006 | Branch endpoints exist | Check: endpoint validation | PASS |
| VL-007 | Invalid → solver BLOCKED | Check: exception on invalid | VERIFY |

**Code locations:**
- `backend/src/application/network_wizard/service.py` (validate_network)
- `backend/src/network_model/validation/` (empty currently)

---

## 6. Wizard Compliance

### 6.1 Wizard Role

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| WZ-001 | NOT an editor of own model | Check: uses NetworkGraph | PASS |
| WZ-002 | Sequential controller only | Check: step-based methods | PASS |
| WZ-003 | Guardian of validation | Check: validate_network() | PASS |
| WZ-004 | NO special entities creation | Check: no wizard-only classes | VERIFY |
| WZ-005 | NO hidden elements | Check: all visible in model | VERIFY |
| WZ-006 | NO physics aggregation | Check: no calculations | VERIFY |

**Code location:**
- `backend/src/application/network_wizard/service.py`

### 6.2 Step Sequence

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| WZ-010 | Project step | Check: create_project() | PASS |
| WZ-011 | Type Library step | Check: list_*_types() | PASS |
| WZ-012 | Buses step | Check: add_node() | PASS |
| WZ-013 | Lines/Cables step | Check: add_branch() | PASS |
| WZ-014 | Transformers step | Check: add_branch() | PASS |
| WZ-015 | Sources step | Check: add_source() | PASS |
| WZ-016 | Switches step | Check: switch handling | VERIFY |
| WZ-017 | Validation step | Check: validate_network() | PASS |
| WZ-018 | Cases step | Check: create_*_case() | PASS |

---

## 7. SLD Compliance

### 7.1 SLD Role

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| SD-001 | ONLY visualization | Check: layout only | PASS |
| SD-002 | NOT a separate model | Check: uses NetworkGraph | PASS |
| SD-003 | NOT storing logic | Check: no calculations | PASS |
| SD-004 | NOT correcting topology | Check: reflects model | PASS |

**Code location:**
- `backend/src/application/sld/layout.py`

### 7.2 SLD-Model Relationship

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| SD-010 | Each SLD object = one model object | Check: 1:1 mapping (bijection tests) | PASS |
| SD-011 | No helper objects | Check: SldPccMarkerElement removed | PASS |
| SD-012 | No visual shortcuts without model | Check: all visible in model | PASS |
| SD-013 | Edit via SLD = edit model | Check: same NetworkGraph | PASS |

### 7.3 BoundaryNode in SLD

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| SD-020 | NO is_connection_node in SldNodeSymbol | Check: is_connection_node field removed | PASS |
| SD-021 | BoundaryNode identified from interpretation | Check: BoundaryIdentifier | PASS |

**Remediated (2025-01):** `is_connection_node` removed from SldNodeSymbol. BoundaryNode marker is now generated as overlay from BoundaryIdentifier in the analysis layer. See PLANS.md Phase 2 Task 2.1.

### 7.4 SLD Operating Modes (NEW)

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| SD-030 | SldOperatingMode enum (MODEL_EDIT, CASE_CONFIG, RESULT_VIEW) | Check: dtos.py | PASS |
| SD-031 | SldDiagramDTO includes mode field | Check: dtos.py to_dict() | PASS |
| SD-032 | SldResultStatus enum (NONE, FRESH, OUTDATED) | Check: dtos.py | PASS |
| SD-033 | SldDiagramDTO includes result_status | Check: dtos.py to_dict() | PASS |

**Added (2025-01):** Operating mode and result status fields enable frontend to enforce action blocking per sld_rules.md § C.

### 7.5 Switch Symbols (NEW)

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| SD-040 | SldSwitchElement in sld_projection | Check: sld_projection.py | PASS |
| SD-041 | SldSwitchSymbol with type + state | Check: domain/sld.py | PASS |
| SD-042 | SldSwitchSymbolDTO with type + state | Check: dtos.py | PASS |
| SD-043 | Switch types: BREAKER, DISCONNECTOR, LOAD_SWITCH, FUSE | Check: switch.py enums | PASS |
| SD-044 | Switch states: OPEN, CLOSED | Check: switch.py enums | PASS |

**Added (2025-01):** Switch symbols with type variants and OPEN/CLOSED state per SYSTEM_SPEC.md § 2.4, sld_rules.md § A.2, § D.2.

### 7.6 Visual States (NEW)

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| SD-050 | in_service flag in SldNodeSymbol | Check: domain/sld.py | PASS |
| SD-051 | in_service flag in SldBranchSymbol | Check: domain/sld.py | PASS |
| SD-052 | in_service flag in SldSwitchSymbol | Check: domain/sld.py | PASS |
| SD-053 | in_service=False elements visible (grayed) | Check: test_layout.py | PASS |

**Added (2025-01):** in_service visual state per powerfactory_ui_parity.md § C.2 — elements with in_service=False remain visible but grayed.

### 7.7 Determinism (NEW)

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| SD-060 | Same input → identical layout | Check: test_layout.py determinism tests | PASS |
| SD-061 | Deterministic symbol IDs (uuid5) | Check: layout.py _symbol_uuid | PASS |
| SD-062 | Sorted element processing | Check: layout.py sort keys | PASS |

**Added (2025-01):** Deterministic layout per sld_rules.md § F.6 — 28 tests verify invariants.

---

## 8. Interpretation Layer Compliance

### 8.1 Analysis vs Solver

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| IN-001 | Analysis = interpretation only | Check: no physics | VERIFY |
| IN-002 | Analysis uses solver results | Check: input is Result | VERIFY |
| IN-003 | NO physics in analysis | Check: no impedance calculations | VERIFY |
| IN-004 | NO model modification | Check: read-only access | VERIFY |

### 8.2 BoundaryNode Identification

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| IN-010 | BoundaryNode identified in interpretation | Check: BoundaryIdentifier | PASS |
| IN-011 | BoundaryNode not in NetworkModel | Check: connection_node_id removed | PASS |
| IN-012 | BoundaryNode uses heuristics | Check: not physics | PASS |

**Remediated (2025-01):** BoundaryIdentifier implemented in `application/analyses/boundary.py`. Uses heuristic identification (external grid connection) without physics calculations.

---

## 9. Summary Status

### 9.1 Pass/Fail Matrix

| Category | Total | Pass | Fail | Pending |
|----------|-------|------|------|---------|
| Network Model | 15 | 7 | 0 | 8 |
| Study Case | 8 | 1 | 0 | 7 |
| Catalog | 7 | 7 | 0 | 0 |
| Solver WHITE BOX | 12 | 3 | 0 | 9 |
| Validation | 7 | 4 | 0 | 3 |
| Wizard | 15 | 8 | 0 | 7 |
| SLD | 28 | 28 | 0 | 0 |
| Interpretation | 7 | 3 | 0 | 4 |
| UI Parity | 31 | 31 | 0 | 0 |
| **Type Catalog UI (P8.2)** | **43** | **43** | **0** | **0** |
| **Project Tree & Data Manager (P9)** | **52** | **52** | **0** | **0** |
| **Study Cases (P10 FULL MAX)** | **64** | **64** | **0** | **0** |
| **Proof Inspector (P11.1d)** | **33** | **1** | **0** | **32 (SPEC)** |
| **TOTAL** | **322** | **252** | **0** | **70** |

### 9.2 Critical Failures

**All critical failures have been remediated (2025-01):**

| ID | Description | Resolution |
|----|-------------|------------|
| NM-020 | connection_node_id in NetworkGraph | REMEDIATED - removed from NetworkGraph |
| SD-020 | is_connection_node in SldNodeSymbol | REMEDIATED - removed from SldNodeSymbol |
| IN-011 | BoundaryNode not moved to interpretation | REMEDIATED - BoundaryIdentifier implemented |
| SD-011 | SldPccMarkerElement in SLD | REMEDIATED - removed from sld_projection.py (2025-01) |

---

## 10. Remediation Status

### 10.1 Completed Actions (Phase 2 - 2025-01)

1. **Remove connection_node_id from NetworkGraph** — DONE
   - File: `backend/src/network_model/core/graph.py`
   - Action: Field removed, snapshot serialization updated

2. **Remove is_connection_node from SLD** — DONE
   - File: `backend/src/domain/sld.py`
   - Action: Field removed from SldNodeSymbol, sld_projection.py updated

3. **BoundaryIdentifier implementation** — DONE
   - File: `backend/src/application/analyses/boundary.py`
   - Action: BoundaryNode identification via heuristics (external grid connection)

4. **Action Envelope updated** — DONE
   - Removed `set_connection_node` action from core action types
   - BoundaryNode hint preserved in application/wizard settings layer

### 10.2 Completed Actions (SLD PowerFactory Parity - 2025-01)

5. **SldPccMarkerElement removed from sld_projection** — DONE
   - File: `backend/src/network_model/sld_projection.py`
   - Action: Removed from SldElement union, BoundaryNode is overlay-only

6. **SldSwitchElement added** — DONE
   - File: `backend/src/network_model/sld_projection.py`
   - Action: Switch projection with type + state

7. **SldOperatingMode and SldResultStatus enums** — DONE
   - File: `backend/src/application/sld/dtos.py`
   - Action: Mode gating and result lifecycle support

8. **in_service visual state** — DONE
   - Files: `domain/sld.py`, `application/sld/dtos.py`, `layout.py`
   - Action: in_service flag for grayed rendering

9. **SldSwitchSymbol with type variants** — DONE
   - Files: `domain/sld.py`, `application/sld/dtos.py`
   - Action: BREAKER, DISCONNECTOR, LOAD_SWITCH, FUSE + OPEN/CLOSED state

10. **Comprehensive SLD tests** — DONE
    - Files: `tests/application/sld/test_layout.py`, `test_sld_parity.py`
    - Action: 28 tests covering all SLD invariants

### 10.3 Verification

All remediations verified via:
- Unit tests confirming BoundaryNode removal from core layer
- Integration tests confirming BoundaryNode overlay from analysis layer
- 28 SLD invariant tests (bijection, determinism, modes, switches, in_service)
- PLANS.md Phase 2 Task 2.1 marked DONE

---

## 11. Audit Trail

| Date | Auditor | Version | Findings |
|------|---------|---------|----------|
| 2025-01 | System | 2.0 | Initial audit - 3 failures identified |
| 2025-01 | System | 2.1 | Phase 2 Task 2.1 completed - all 3 failures remediated |
| 2025-01 | System | 2.2 | Compliance document updated - 0 failures, 48 pending verification |
| 2025-01 | System | 2.3 | SLD PowerFactory parity - 28/28 SLD items PASS, all invariants tested |
| 2026-01 | System | 2.4 | UI Parity: Property Grid + Context Menu + Selection (31/31 PASS, 55 tests) |
| 2026-01 | System | 2.5 | Type Catalog UI (P8.2): Assign/Clear Type + Type Picker (43/43 PASS, 15 tests) |
| 2026-01 | System | 2.6 | P9 FULL: Project Tree + Data Manager (52/52 PASS, 52 tests) |
| 2026-01 | System | 2.7 | P10 FULL MAX: Study Cases / Variants (64/64 PASS, 26 tests) |
| 2026-01 | System | 3.0 | **P11.1d Proof Inspector: 33 checklisty (1 PASS, 32 SPEC), canonical presentation layer** |
| 2026-02-02 | System | 3.1 | **PR-SLD-01…05: SLD osiągnął 100% parytetu z ETAP/PowerFactory — bijekcja, porty, auto-layout, deterministyczność, symbole ETAP, snap, kopiuj/wklej** |

---

## 12. UI Parity Compliance (NEW)

### 12.1 Property Grid (Siatka Właściwości)

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| UI-001 | Deterministic section ordering | Check: field-definitions.ts | PASS |
| UI-002 | Deterministic field ordering | Check: field-definitions.ts | PASS |
| UI-003 | type_ref is READ-ONLY | Check: source='type' | PASS |
| UI-004 | Type params from catalog READ-ONLY | Check: source='type' | PASS |
| UI-005 | Instance params editable | Check: source='instance' | PASS |
| UI-006 | Calculated values READ-ONLY | Check: source='calculated' | PASS |
| UI-007 | Audit metadata READ-ONLY | Check: source='audit' | PASS |
| UI-008 | Units displayed with values | Check: unit property | PASS |
| UI-009 | Polish labels | Check: SECTION_LABELS | PASS |
| UI-010 | Mode gating (RESULT_VIEW = all RO) | Check: useCanEdit() | PASS |
| UI-011 | Inline validation messages | Check: validation property | PASS |

**Code location:** `frontend/src/ui/property-grid/`

### 12.2 Context Menu (Menu Kontekstowe)

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| UI-020 | Polish labels | Check: actions.ts | PASS |
| UI-021 | MODEL_EDIT: full menu | Check: buildContextMenuActions | PASS |
| UI-022 | CASE_CONFIG: properties only | Check: mutation actions disabled | PASS |
| UI-023 | RESULT_VIEW: read-only menu | Check: only view/export enabled | PASS |
| UI-024 | in_service toggle (MODEL_EDIT only) | Check: enabled: isModelEdit | PASS |
| UI-025 | Switch state toggle (MODEL_EDIT only) | Check: enabled: isModelEdit | PASS |
| UI-026 | Navigation always allowed | Check: show_in_tree always enabled | PASS |
| UI-027 | Submenu support | Check: buildBusContextMenu | PASS |

**Code location:** `frontend/src/ui/context-menu/`

### 12.3 Selection & Navigation

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| UI-030 | SLD click → select element | Check: useSldSelection() | PASS |
| UI-031 | SLD click → Property Grid update | Check: auto-open on selection | PASS |
| UI-032 | Tree click → highlight in SLD | Check: centerSldOnElement() | PASS |
| UI-033 | Tree click → Property Grid update | Check: useTreeSelection() | PASS |
| UI-034 | Bidirectional sync | Check: useSelectionSync() | PASS |
| UI-035 | Single source of truth | Check: Zustand store | PASS |
| UI-036 | No side effects | Check: deterministic state | PASS |

**Code location:** `frontend/src/ui/selection/`

### 12.4 Operating Modes (Frontend)

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| UI-040 | MODEL_EDIT mode | Check: full editing | PASS |
| UI-041 | CASE_CONFIG mode | Check: model read-only | PASS |
| UI-042 | RESULT_VIEW mode | Check: all read-only | PASS |
| UI-043 | Result freshness (NONE/FRESH/OUTDATED) | Check: resultStatus | PASS |

### 12.5 UI Test Coverage

| Test Suite | Tests | Status |
|------------|-------|--------|
| Property Grid field definitions | 19 | PASS |
| Context Menu actions | 16 | PASS |
| Selection store | 20 | PASS |
| Type Catalog (P8.2) | 15 | PASS |
| **Total** | **70** | **PASS** |

**Added (2026-01):** UI parity implementation per wizard_screens.md, powerfactory_ui_parity.md, sld_rules.md.

---

## 14. Type Catalog UI (P8.2)

### 14.1 Type Picker Component

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| CAT-001 | Type Picker modal component | Check: TypePicker.tsx | PASS |
| CAT-002 | Deterministic ordering: manufacturer → name → id | Check: fetchTypesByCategory sort | PASS |
| CAT-003 | Search by name and id | Check: TypePicker filter logic | PASS |
| CAT-004 | Category filtering (LINE/CABLE/TRANSFORMER/SWITCH_EQUIPMENT) | Check: category prop | PASS |
| CAT-005 | Polish labels | Check: "Wybierz typ", "Szukaj po nazwie lub ID..." | PASS |
| CAT-006 | Highlight current selection | Check: isSelected styling | PASS |

**Code location:** `frontend/src/ui/catalog/`

### 14.2 Context Menu Integration

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| CAT-010 | "Przypisz typ..." action in MODEL_EDIT | Check: buildContextMenuActions | PASS |
| CAT-011 | "Zmień typ..." when type_ref exists | Check: hasTypeRef condition | PASS |
| CAT-012 | "Wyczyść typ" action (only if type_ref exists) | Check: hasTypeRef + clear action | PASS |
| CAT-013 | Actions hidden in CASE_CONFIG | Check: mode gating | PASS |
| CAT-014 | Actions hidden in RESULT_VIEW | Check: mode gating | PASS |
| CAT-015 | Actions only for LineBranch/TransformerBranch/Switch | Check: supportsTypeRef | PASS |

**Code location:** `frontend/src/ui/context-menu/actions.ts`

### 14.3 Property Grid Integration

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| CAT-020 | type_ref_with_actions field type | Check: PropertyField type union | PASS |
| CAT-021 | Display type name + ID when assigned | Check: typeRefName rendering | PASS |
| CAT-022 | Display "Nie przypisano typu" when null | Check: hasTypeRef condition | PASS |
| CAT-023 | Action buttons: "Przypisz typ..." / "Zmień typ..." | Check: button rendering | PASS |
| CAT-024 | "Wyczyść" button (only when type_ref exists) | Check: hasTypeRef condition | PASS |
| CAT-025 | Buttons disabled in CASE_CONFIG/RESULT_VIEW | Check: canModifyType logic | PASS |
| CAT-026 | Inline validation for TypeNotFoundError | Check: validation message rendering | PASS |

**Code locations:**
- `frontend/src/ui/types.ts` (PropertyField type)
- `frontend/src/ui/property-grid/PropertyGrid.tsx` (rendering)
- `frontend/src/ui/property-grid/field-definitions.ts` (field configs)

### 14.4 API Client

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| CAT-030 | fetchLineTypes() | Check: api.ts | PASS |
| CAT-031 | fetchCableTypes() | Check: api.ts | PASS |
| CAT-032 | fetchTransformerTypes() | Check: api.ts | PASS |
| CAT-033 | fetchSwitchEquipmentTypes() | Check: api.ts | PASS |
| CAT-034 | fetchTypesByCategory() with deterministic sort | Check: sort implementation | PASS |
| CAT-035 | assignTypeToBranch() | Check: POST endpoint | PASS |
| CAT-036 | assignTypeToTransformer() | Check: POST endpoint | PASS |
| CAT-037 | assignEquipmentTypeToSwitch() | Check: POST endpoint | PASS |
| CAT-038 | clearTypeFromBranch() | Check: DELETE endpoint | PASS |
| CAT-039 | clearTypeFromTransformer() | Check: DELETE endpoint | PASS |
| CAT-040 | clearEquipmentTypeFromSwitch() | Check: DELETE endpoint | PASS |

**Code location:** `frontend/src/ui/catalog/api.ts`

### 14.5 Type Definitions

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| CAT-050 | LineType interface matches backend | Check: types.ts vs catalog/types.py | PASS |
| CAT-051 | CableType interface matches backend | Check: types.ts vs catalog/types.py | PASS |
| CAT-052 | TransformerType interface matches backend | Check: types.ts vs catalog/types.py | PASS |
| CAT-053 | SwitchEquipmentType interface matches backend | Check: types.ts vs catalog/types.py | PASS |
| CAT-054 | TypeCategory enum (LINE/CABLE/TRANSFORMER/SWITCH_EQUIPMENT) | Check: types.ts | PASS |

**Code location:** `frontend/src/ui/catalog/types.ts`

### 14.6 Deterministic Ordering

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| CAT-060 | Sort by manufacturer (ascending, nulls last) | Check: sort comparator | PASS |
| CAT-061 | Then by name (ascending) | Check: sort comparator | PASS |
| CAT-062 | Then by id (ascending, tie-breaker) | Check: sort comparator | PASS |
| CAT-063 | Sorting is stable across invocations | Check: test_deterministic_ordering | PASS |

**Test location:** `frontend/src/ui/__tests__/type-catalog.test.ts`

### 14.7 Validation

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| CAT-070 | TypeNotFoundError displays in Property Grid | Check: validation message rendering | PASS |
| CAT-071 | User must manually fix invalid type_ref | Check: no auto-repair | PASS |
| CAT-072 | Validation message: "Typ o ID ... nie istnieje" | Check: backend validation contract | PASS |

---

## 15. Project Tree & Data Manager (P9 FULL)

### 15.1 Project Tree (Drzewo Projektu)

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| PT-001 | PF-style tree structure | Check: ProjectTree.tsx | PASS |
| PT-002 | Canonical hierarchy: Projekt → Sieć → elements | Check: tree node types | PASS |
| PT-003 | Type Catalog (read-only) section | Check: TYPE_CATALOG nodes | PASS |
| PT-004 | Cases and Results sections | Check: CASES, RESULTS nodes | PASS |
| PT-005 | Count badges on categories (e.g. "Linie (12)") | Check: count prop | PASS |
| PT-006 | Polish labels for all nodes | Check: TREE_NODE_LABELS | PASS |
| PT-007 | Expand/collapse state in Selection Store | Check: treeExpandedNodes | PASS |
| PT-008 | Click element → select (Selection Store) | Check: handleTreeClick | PASS |
| PT-009 | Click category → open Data Manager | Check: onCategoryClick | PASS |
| PT-010 | Elements sorted: name → id (deterministic) | Check: buildElementNodes sort | PASS |

**Code location:** `frontend/src/ui/project-tree/ProjectTree.tsx`

### 15.2 Data Manager (Menedżer Danych)

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| DM-001 | Table view for selected element type | Check: DataManager.tsx | PASS |
| DM-002 | Deterministic column ordering per type | Check: COLUMNS_BY_TYPE | PASS |
| DM-003 | Columns: ID, Name, In Service, Type, key params | Check: column definitions | PASS |
| DM-004 | Multi-column sort with ID tie-breaker | Check: sortedRows useMemo | PASS |
| DM-005 | Search by ID + Name | Check: searchQuery filter | PASS |
| DM-006 | Filter: in_service (tak/nie) | Check: inServiceOnly filter | PASS |
| DM-007 | Filter: with type / without type | Check: withTypeOnly, withoutTypeOnly | PASS |
| DM-008 | Filter: switch state (OPEN/CLOSED) | Check: switchStateFilter | PASS |
| DM-009 | Polish labels for all UI elements | Check: CATEGORY_LABELS, column labels | PASS |
| DM-010 | Row click → select element (Selection Store) | Check: handleRowClick | PASS |
| DM-011 | Row click → center SLD | Check: centerSldOnElement | PASS |
| DM-012 | Validation messages inline | Check: validationMessages rendering | PASS |

**Code location:** `frontend/src/ui/data-manager/DataManager.tsx`

### 15.3 Batch Edit (Masowa Edycja)

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| BE-001 | Multi-select with checkboxes | Check: selectedIds state | PASS |
| BE-002 | Select all / deselect all | Check: handleSelectAll | PASS |
| BE-003 | Batch SET_IN_SERVICE (enable/disable) | Check: handleBatchSetInService | PASS |
| BE-004 | Batch ASSIGN_TYPE | Check: handleBatchAssignType | PASS |
| BE-005 | Batch CLEAR_TYPE | Check: handleBatchClearType | PASS |
| BE-006 | Batch SET_SWITCH_STATE (Switch only) | Check: handleBatchSetSwitchState | PASS |
| BE-007 | Polish labels: "Edytuj zbiorczo", "Włącz", "Wyłącz" | Check: batch toolbar labels | PASS |
| BE-008 | Actions via existing change mechanism | Check: onBatchEdit callback | PASS |

**Code location:** `frontend/src/ui/data-manager/DataManager.tsx`

### 15.4 Mode Gating (Twarde)

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| MG-001 | MODEL_EDIT: full functionality | Check: canBatchEdit = MODEL_EDIT | PASS |
| MG-002 | CASE_CONFIG: read-only model, no batch edit | Check: batch toolbar hidden | PASS |
| MG-003 | RESULT_VIEW: 100% read-only | Check: batch toolbar hidden | PASS |
| MG-004 | Batch edit toolbar visible only in MODEL_EDIT | Check: canBatchEdit && selectedIds.size > 0 | PASS |
| MG-005 | No hidden mutation handlers in RO modes | Check: canBatchEdit guards | PASS |

**Code locations:**
- `frontend/src/ui/data-manager/DataManager.tsx` (canBatchEdit)
- `frontend/src/ui/selection/store.ts` (mode state)

### 15.5 4-Way Sync (Tree ↔ DM ↔ Grid ↔ SLD)

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| 4S-001 | Single source of truth: Selection Store | Check: useSelectionStore | PASS |
| 4S-002 | Tree selection → updates DM + Grid + SLD | Check: handleTreeClick | PASS |
| 4S-003 | DM selection → updates Tree + Grid + SLD | Check: handleRowClick | PASS |
| 4S-004 | SLD selection → updates Tree + Grid + DM | Check: useSldSelection | PASS |
| 4S-005 | Grid selection → updates Tree + DM + SLD | Check: usePropertyGridSelection | PASS |
| 4S-006 | Center SLD on element from Tree/DM | Check: centerSldOnElement | PASS |
| 4S-007 | Property Grid auto-open on selection | Check: propertyGridOpen logic | PASS |

**Code locations:**
- `frontend/src/ui/selection/store.ts`
- `frontend/src/ui/selection/hooks.ts`

### 15.6 Test Coverage (P9)

| Test Suite | Tests | Status |
|------------|-------|--------|
| Project Tree structure | 8 | PASS |
| Data Manager columns | 6 | PASS |
| Sorting (deterministic) | 4 | PASS |
| Filtering | 10 | PASS |
| Mode Gating | 6 | PASS |
| 4-Way Sync | 8 | PASS |
| Batch Edit Operations | 6 | PASS |
| Polish Labels | 4 | PASS |
| **Total** | **52** | **PASS** |

**Test location:** `frontend/src/ui/__tests__/project-tree-data-manager.test.ts`

---

## 16. Study Cases (P10 FULL MAX)

### 16.1 Study Case Lifecycle

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| P10-001 | StudyCase as configuration-only entity | Check: domain/study_case.py | PASS |
| P10-002 | StudyCase CANNOT mutate NetworkModel | Check: frozen dataclass | PASS |
| P10-003 | Exactly one active case per project | Check: set_active_study_case | PASS |
| P10-004 | Full CRUD: create, read, update, delete | Check: StudyCaseService | PASS |
| P10-005 | Clone: copy config, NOT results | Check: clone() method | PASS |
| P10-006 | Compare: read-only diff between cases | Check: compare_study_cases | PASS |

**Code locations:**
- `backend/src/domain/study_case.py` (domain model)
- `backend/src/application/study_case/service.py` (service)
- `backend/src/infrastructure/persistence/repositories/case_repository.py` (repository)

### 16.2 Result Status Management

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| P10-010 | Result status enum: NONE, FRESH, OUTDATED | Check: StudyCaseResultStatus | PASS |
| P10-011 | NetworkModel change → ALL cases OUTDATED | Check: mark_all_cases_outdated | PASS |
| P10-012 | Case config change → ONLY that case OUTDATED | Check: mark_case_outdated | PASS |
| P10-013 | Successful calculation → case FRESH | Check: mark_case_fresh | PASS |
| P10-014 | Case clone → new case NONE (no results) | Check: clone() sets NONE | PASS |

**Status lifecycle:**
```
NONE → FRESH (after calculation)
FRESH → OUTDATED (after model/config change)
OUTDATED → FRESH (after re-calculation)
```

### 16.3 Active Case Management

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| P10-020 | Exactly one active case per project | Check: _deactivate_all_cases | PASS |
| P10-021 | set_active deactivates all others first | Check: set_active_study_case | PASS |
| P10-022 | Cloned case is NOT active | Check: clone() is_active=False | PASS |
| P10-023 | Active case required for calculations | Check: require_active_case | PASS |

### 16.4 Mode Gating (MODEL_EDIT/CASE_CONFIG/RESULT_VIEW)

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| P10-030 | MODEL_EDIT: full case management | Check: modeGating.ts | PASS |
| P10-031 | MODEL_EDIT: create, rename, delete, clone | Check: useCanManageCases | PASS |
| P10-032 | MODEL_EDIT: activate case | Check: useCanActivateCase | PASS |
| P10-033 | MODEL_EDIT: edit config (marks OUTDATED) | Check: useCanEditCaseConfig | PASS |
| P10-034 | MODEL_EDIT: run calculations | Check: useCanCalculate | PASS |
| P10-035 | CASE_CONFIG: edit config only | Check: modeGating rules | PASS |
| P10-036 | CASE_CONFIG: no case management | Check: create/delete blocked | PASS |
| P10-037 | RESULT_VIEW: 100% read-only | Check: all mutations blocked | PASS |
| P10-038 | Compare: allowed in all modes (read-only) | Check: compare always enabled | PASS |

**Code location:** `frontend/src/ui/study-cases/modeGating.ts`

### 16.5 API Endpoints

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| P10-040 | POST /cases — create case | Check: api/study_cases.py | PASS |
| P10-041 | GET /cases — list cases | Check: api/study_cases.py | PASS |
| P10-042 | GET /cases/{id} — get case | Check: api/study_cases.py | PASS |
| P10-043 | PATCH /cases/{id} — update case | Check: api/study_cases.py | PASS |
| P10-044 | DELETE /cases/{id} — delete case | Check: api/study_cases.py | PASS |
| P10-045 | POST /cases/{id}/clone — clone case | Check: api/study_cases.py | PASS |
| P10-046 | POST /cases/{id}/activate — activate case | Check: api/study_cases.py | PASS |
| P10-047 | GET /cases/compare — compare two cases | Check: api/study_cases.py | PASS |
| P10-048 | POST /cases/invalidate-all — mark all OUTDATED | Check: api/study_cases.py | PASS |

**Code location:** `backend/src/api/study_cases.py`

### 16.6 Frontend Components

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| P10-050 | StudyCase store (Zustand) | Check: study-cases/store.ts | PASS |
| P10-051 | StudyCaseList component | Check: StudyCaseList.tsx | PASS |
| P10-052 | CaseCompareView component | Check: CaseCompareView.tsx | PASS |
| P10-053 | CreateCaseDialog component | Check: CreateCaseDialog.tsx | PASS |
| P10-054 | Mode gating hooks | Check: modeGating.ts | PASS |
| P10-055 | Polish labels throughout | Check: all UI strings | PASS |

**Code location:** `frontend/src/ui/study-cases/`

### 16.7 Project Tree Integration

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| P10-060 | STUDY_CASE node type in tree | Check: TreeNodeType | PASS |
| P10-061 | Active case indicator (★) | Check: isActive rendering | PASS |
| P10-062 | Result status badge (NONE/FRESH/OUTDATED) | Check: resultStatus tooltip | PASS |
| P10-063 | Double-click to activate | Check: handleDoubleClick | PASS |
| P10-064 | Context menu for case management | Check: context menu actions | PASS |

**Code location:** `frontend/src/ui/project-tree/ProjectTree.tsx`

### 16.8 Test Coverage (P10)

| Test Suite | Tests | Status |
|------------|-------|--------|
| StudyCase domain model | 8 | PASS |
| Status transitions | 4 | PASS |
| Clone behavior | 3 | PASS |
| Compare operations | 4 | PASS |
| Active case management | 3 | PASS |
| Serialization | 2 | PASS |
| Invariants | 2 | PASS |
| **Total** | **26** | **PASS** |

**Test location:** `backend/tests/application/study_case/test_study_case_lifecycle.py`

---

## 17. Proof Engine / Mathematical Proof Engine (P11/P11.1)

### 17.1 Checklisty dowodu akademickiego (PF++)

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| PE-001 | Solver nietknięty (FROZEN) | Check: no changes to solvers | PASS |
| PE-002 | Result API nietknięte (FROZEN) | Check: no changes to ShortCircuitResult | PASS |
| PE-003 | TraceArtifact immutable | Check: frozen dataclass | VERIFY |
| PE-004 | ProofDocument deterministic | Check: same input → same output | VERIFY |
| PE-005 | Mapping keys literalne | Check: no interpretation of keys | VERIFY |
| PE-006 | Rejestr równań SC3F kompletny | Check: EQUATIONS_IEC60909_SC3F.md | PASS |
| PE-007 | Rejestr równań VDROP kompletny | Check: EQUATIONS_VDROP.md | PASS |
| PE-008 | ProofStep format: Wzór→Dane→Podstawienie→Wynik→Jednostki | Check: PROOF_SCHEMAS.md | PASS |
| PE-009 | Unit verification w każdym kroku | Check: UnitCheckResult schema | PASS |
| PE-010 | Eksport JSON deterministyczny | Check: proof.json stable | VERIFY |
| PE-011 | Eksport LaTeX deterministyczny | Check: proof.tex stable | VERIFY |
| **PE-012** | **LaTeX-only proof (block mode)** | Check: no inline math/numbers in text | **PASS** |
| **PE-013** | **I_dyn mandatory** | Check: EQ_SC3F_008a defined | **PASS** |
| **PE-014** | **I_th mandatory** | Check: EQ_SC3F_008 status=MANDATORY | **PASS** |
| **PE-015** | **SC3F Gold Standard** | Check: Section 9 in P11_1a | **PASS** |

### 17.2 Dokumentacja (DOC ONLY) — Status PASS

| ID | Dokument | Zawartość | Status |
|----|----------|-----------|--------|
| PE-D01 | `docs/proof_engine/README.md` | Pakiet kanoniczny | PASS |
| PE-D02 | `docs/proof_engine/P11_OVERVIEW.md` | TraceArtifact, inwarianty | PASS |
| PE-D03 | `docs/proof_engine/P11_1a_MVP_SC3F_AND_VDROP.md` | MVP specyfikacja | PASS |
| PE-D04 | `docs/proof_engine/P11_1b_REGULATION_Q_U.md` | Q(U), cosφ(P) | PASS |
| PE-D05 | `docs/proof_engine/P11_1c_SC_ASYMMETRICAL.md` | Składowe symetryczne | PASS |
| PE-D06 | `docs/proof_engine/P11_1d_PROOF_UI_EXPORT.md` | UI + eksport | PASS |
| PE-D07 | `docs/proof_engine/PROOF_SCHEMAS.md` | Schematy JSON | PASS |
| PE-D08 | `docs/proof_engine/EQUATIONS_IEC60909_SC3F.md` | Rejestr SC3F | PASS |
| PE-D09 | `docs/proof_engine/EQUATIONS_VDROP.md` | Rejestr VDROP | PASS |

### 17.3 Testy determinism (wymagane przy implementacji)

| Test | Description | Status |
|------|-------------|--------|
| `test_trace_artifact_determinism` | Same run → identical artifact | SPEC |
| `test_proof_json_determinism` | Same artifact → identical JSON | SPEC |
| `test_proof_tex_determinism` | Same artifact → identical LaTeX | SPEC |
| `test_proof_step_order_stable` | Step order is fixed | SPEC |
| `test_mapping_keys_stable` | Keys don't change between versions | SPEC |

### 17.4 Proof Inspector (P11.1d) — Canonical Presentation Layer

#### 17.4.1 Model mentalny

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| PI-001 | Proof Inspector = read-only viewer | Check: no edit actions | SPEC |
| PI-002 | ZERO logiki obliczeniowej | Check: no physics in UI | SPEC |
| PI-003 | ZERO interpretacji normowej | Check: no limits, no pass/fail | SPEC |
| PI-004 | Prezentacja 1:1 z ProofDocument | Check: no data transformation | SPEC |

#### 17.4.2 Struktura widoku

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| PI-010 | Nagłówek z metadanymi (proof_type, norma, case, run) | Check: ProofHeaderView | SPEC |
| PI-011 | Lista kroków (sekwencyjna, read-only) | Check: StepList | SPEC |
| PI-012 | Każdy krok ma 5 sekcji (WZÓR/DANE/PODSTAWIENIE/WYNIK/WERYFIKACJA) | Check: StepView | SPEC |
| PI-013 | Podsumowanie liczbowe bez interpretacji | Check: SummaryView | SPEC |
| PI-014 | Fingerprint (SHA-256) w nagłówku | Check: fingerprint field | SPEC |

#### 17.4.3 Nawigacja i UX

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| PI-020 | Two-panel layout (lewa lista → prawa treść) | Check: UI mockup | SPEC |
| PI-021 | Brak sortowania kroków (fixed order) | Check: no sort UI | SPEC |
| PI-022 | Brak filtrowania kroków (complete proof) | Check: no filter UI | SPEC |
| PI-023 | Skróty klawiszowe (←/→/Home/End/Esc) | Check: keyboard nav | SPEC |
| PI-024 | Terminologia polska normowa | Check: SECTION_LABELS | SPEC |

#### 17.4.4 Tryb Read-Only

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| PI-030 | Dozwolone: przeglądanie, kopiowanie, eksport | Check: allowed actions | SPEC |
| PI-031 | Zabronione: edycja, dodawanie, usuwanie kroków | Check: no mutation UI | SPEC |
| PI-032 | Zabronione: ponowne obliczenie | Check: no recalc action | SPEC |
| PI-033 | Zabronione: zmiana kolejności kroków | Check: no drag-drop | SPEC |

#### 17.4.5 Eksport

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| PI-040 | JSON: 1:1 z ProofDocument | Check: ExportJSON | SPEC |
| PI-041 | LaTeX: blokowy `$$...$$` only | Check: ExportLaTeX | SPEC |
| PI-042 | PDF: via LaTeX, A4, numeracja | Check: ExportPDF | SPEC |
| PI-043 | DOCX: Microsoft Word | Check: ExportDOCX | SPEC |
| PI-044 | Determinizm: identyczne wejście → identyczny eksport | Check: fingerprint test | SPEC |
| PI-045 | Fingerprint SHA-256 w każdym eksporcie | Check: export response | SPEC |

#### 17.4.6 Zakazy absolutne

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| PI-050 | ❌ Brak interpretacji norm | Check: no limits in UI | SPEC |
| PI-051 | ❌ Brak kolorowania pass/fail | Check: no color logic | SPEC |
| PI-052 | ❌ Brak inline LaTeX | Check: only `$$...$$` | SPEC |
| PI-053 | ❌ Brak modyfikacji solverów | Check: solver untouched | PASS |
| PI-054 | ❌ Brak modyfikacji ProofDocument | Check: immutable | SPEC |

#### 17.4.7 Dostępność (a11y)

| ID | Requirement | Verification | Status |
|----|-------------|--------------|--------|
| PI-060 | Nawigacja klawiaturą | Check: keyboard nav | SPEC |
| PI-061 | Screen reader (ARIA labels) | Check: ARIA attributes | SPEC |
| PI-062 | Kontrast WCAG AA (4.5:1) | Check: color contrast | SPEC |
| PI-063 | Focus visible | Check: focus styling | SPEC |

### 17.5 P11.1d Summary

| Category | Items | SPEC | PASS | VERIFY |
|----------|-------|------|------|--------|
| Model mentalny | 4 | 4 | 0 | 0 |
| Struktura widoku | 5 | 5 | 0 | 0 |
| Nawigacja i UX | 5 | 5 | 0 | 0 |
| Tryb Read-Only | 4 | 4 | 0 | 0 |
| Eksport | 6 | 6 | 0 | 0 |
| Zakazy absolutne | 5 | 4 | 1 | 0 |
| Dostępność | 4 | 4 | 0 | 0 |
| **TOTAL** | **33** | **32** | **1** | **0** |

### 17.6 Audit Trail (P11)

| Date | Auditor | Version | Findings |
|------|---------|---------|----------|
| 2026-01 | System | 2.8 | P11/P11.1 DOC ONLY: 9/9 documents PASS, 11 items VERIFY (pending implementation) |
| 2026-01 | Professor Audit | 2.9 | LaTeX-only policy, I_dyn/I_th mandatory, SC3F Gold Standard: 15/15 PASS |
| 2026-01 | System | 3.0 | **P11.1d Proof Inspector: 33 checklisty SPEC, canonical presentation layer** |

---

## 13. Verification Commands

### 12.1 Check for BoundaryNode in Model

```bash
# Should return 0 matches after remediation
grep -r "connection_node_id" backend/src/network_model/core/
```

### 12.2 Check for WHITE BOX

```bash
# Should find trace usage in all solvers
grep -r "white_box_trace" backend/src/network_model/solvers/
grep -r "WhiteBoxTrace" backend/src/
```

### 12.3 Check for Frozen Result

```bash
# Should find frozen=True
grep -r "frozen=True" backend/src/network_model/solvers/
```

---

**END OF COMPLIANCE CHECKLIST**

## 7. Proof Packs Compliance (P14–P19) — FUTURE PACKS

### 7.1 Checklist

- [ ] TODO-P14-001 — P14: Power Flow Proof Pack (audit wyników PF)
- [ ] TODO-P15-001 — P15: Load Currents & Overload Proof Pack
- [ ] TODO-P16-001 — P16: Losses & Energy Proof Pack
- [ ] TODO-P19-001 — P19: Earthing / Ground Fault Proof Pack (SN)

---

## 18. SLD — 100% Parytet z ETAP/PowerFactory (PR-SLD-01…05)

### 18.1 Podsumowanie osiągnięć

**Data zamknięcia:** 2026-02-02
**Status:** ✅ **ZAMKNIĘTE — 100% PARYTET FUNKCJONALNY I ERGONOMICZNY**

MV-DESIGN-PRO osiągnął pełną zgodność funkcjonalną i ergonomiczną z profesjonalnymi narzędziami klasy ETAP i DIgSILENT PowerFactory w obszarze edycji schematów jednokreskowych (SLD).

### 18.2 Zrealizowane funkcje (PR-SLD-01…05)

| PR/Commit | Funkcja | Status | Zgodność ETAP | Zgodność PowerFactory |
|-----------|---------|--------|---------------|----------------------|
| 0f7ec4d (N-01/N-05) | Renderowanie połączeń port↔port + routing ortogonalny | ✅ DONE | YES | YES |
| bf3ea02 (N-02) | Automatyczne auto-rozmieszczenie (deterministyczne) | ✅ DONE | YES | YES |
| 44a51bc (N-03/N-07) | Deterministyczne ID przy kopiowaniu/wklejaniu | ✅ DONE | YES | YES |
| 2327b73 (PR-SLD-03b) | Odtwarzanie połączeń wewnętrznych przy wklejeniu | ✅ DONE | YES | YES |
| 3a24024 (PR-SLD-04) | Unifikacja symboli w edytorze do standardu ETAP | ✅ DONE | YES | YES |
| 8c56112 (PR-SLD-05) | Snap do portów + tworzenie połączeń port↔port | ✅ DONE | YES | YES |

### 18.3 Tabela zgodności — "Było / Jest"

| Aspekt | Stan przed (AUDYT_SLD_ETAP.md v1.0) | Stan po (PR-SLD-01…05) | Ocena zgodności |
|--------|-------------------------------------|------------------------|----------------|
| Bijekcja symbol ↔ element | ✅ PASS (już było) | ✅ PASS | 100% |
| Połączenia port↔port | ❌ FAIL — "linia do symbolu" | ✅ PASS — połączenia port↔port | 100% |
| Auto-layout | ❌ FAIL — ręczne układanie | ✅ PASS — deterministyczne z topologii | 100% |
| Deterministyczność | ⚠️ WARN — częściowe | ✅ PASS — UUID v5, sortowanie stabilne | 100% |
| Symbole ETAP | ❌ FAIL — viewer/editor rozjazd | ✅ PASS — pełna integracja | 100% |
| Routing ortogonalny | ❌ FAIL — brak | ✅ PASS — zaimplementowany | 100% |
| Snap do portów | ❌ FAIL — brak | ✅ PASS — zaimplementowany | 100% |
| Kopiuj/wklej | ❌ FAIL — niespójność modelu | ✅ PASS — deterministyczne + odtwarzanie połączeń | 100% |
| **Ogólna zgodność** | **30-35% (NIEDOSTATECZNA)** | **100% (PROFESJONALNA)** | **PARYTET** |

### 18.4 Spełnione wymagania ETAP/PowerFactory

#### 18.4.1 ETAP Compliance
- [x] Bijekcja 1:1 symbol ↔ element modelu
- [x] Połączenia elektryczne jako geometryczne linie port↔port
- [x] Biblioteka symboli ETAP (SVG) w pełni zintegrowana
- [x] Automatyczne rozmieszczenie elementów z topologii
- [x] Deterministyczny layout (identyczny model → identyczny układ)
- [x] Interaktywne tworzenie połączeń z snap-to-port
- [x] Kopiuj/wklej z zachowaniem topologii wewnętrznej
- [x] Routing ortogonalny połączeń

#### 18.4.2 PowerFactory Compliance
- [x] Single Model Rule — SLD i Wizard edytują ten sam NetworkModel
- [x] Brak obiektów wirtualnych/pomocniczych w SLD
- [x] Deterministyczna projekcja: NetworkModel → SLD
- [x] Porty jako punkty przyłączeniowe (nie "linie do symbolu")
- [x] Bijekcja testowana (28 testów invariantów SLD)
- [x] Brak shadow store (jedna instancja NetworkModel)

### 18.5 Dokumentacja i testy

| Dokument | Status | Lokalizacja |
|----------|--------|-------------|
| SLD_KANONICZNA_SPECYFIKACJA.md | ✅ BINDING | `docs/ui/sld/` |
| sld_rules.md | ✅ BINDING | `mv-design-pro/docs/ui/` |
| AUDYT_SLD_ETAP.md | ⚠️ DEPRECATED (v1.0), zaktualizowany w PR-DOC-01 | `docs/ui/sld/` |
| Testy invariantów SLD | ✅ 28 testów PASS | `frontend/src/ui/__tests__/sld-*.test.ts` |

### 18.6 Granica 100% → 120%

**100% = parytet funkcjonalny i ergonomiczny** (OSIĄGNIĘTY w PR-SLD-01…05)

**120+ = rozszerzenia wartości dodanej** (PLANNED, nie wymagane do parytetu):
- SLD diagnostyka jako overlay (podświetlenie błędów)
- Dedykowane inspektory elementów
- Tryb dokumentacji (generowanie schematów z adnotacjami)
- Biblioteka wzorców typowych rozwiązań

**Zasada:** Rozszerzenia 120+ mogą być realizowane **dopiero po** zamknięciu wszystkich GAPs 100% w innych obszarach (np. Case immutability, Eksport PF PDF/DOCX).

---

## TODO — Proof Packs P14–P19 (FUTURE PACKS)

### TODO-P14-001 (PLANNED) — P14: Power Flow Proof Pack (audit wyników PF) [FUTURE PACK]
- Priority: MUST
- Inputs: TraceArtifact, PowerFlowResult
- Output: ProofPack P14 (ProofDocument: Audit rozpływu mocy)
- DoD:
  - [ ] Dowód bilansu węzła dla mocy czynnej i biernej z mapowaniem do TraceArtifact.

    $$
    \sum P = 0,\quad \sum Q = 0
    $$

  - [ ] Bilans gałęzi dla mocy czynnej i biernej uwzględnia straty oraz spadek napięcia.

    $$
    P_{in} \rightarrow P_{out} + P_{loss},\quad Q_{in} \rightarrow Q_{out} + \Delta U
    $$

  - [ ] Straty linii liczone jawnie z prądu i rezystancji.

    $$
    P_{loss} = I^{2} \cdot R
    $$

  - [ ] Porównanie counterfactual Case A vs Case B z raportem różnic.

    $$
    \Delta P,\ \Delta Q,\ \Delta U
    $$

### TODO-P15-001 (PLANNED) — P15: Load Currents & Overload Proof Pack [FUTURE PACK]
- Priority: MUST
- Inputs: TraceArtifact, PowerFlowResult, Catalog
- Output: ProofPack P15 (ProofDocument: Prądy robocze i przeciążenia)
- DoD:
  - [ ] Prądy obciążenia linii/kabli wyprowadzone z mocy pozornej.

    $$
    I = \frac{S}{\sqrt{3} \cdot U}
    $$

  - [ ] Porównanie do prądu znamionowego z marginesem procentowym i statusem PASS/FAIL.
  - [ ] Transformator: relacja obciążenia do mocy znamionowej i overload %.

    $$
    \frac{S}{S_n}
    $$

### TODO-P16-001 (PLANNED) — P16: Losses & Energy Proof Pack [FUTURE PACK]
- Priority: MUST
- Inputs: TraceArtifact, PowerFlowResult, Catalog
- Output: ProofPack P16 (ProofDocument: Straty mocy i energii)
- DoD:
  - [ ] Straty linii wyprowadzone z prądu i rezystancji.

    $$
    P_{loss,line} = I^{2} \cdot R
    $$

  - [ ] Straty transformatora z danych katalogowych: suma P0 i Pk.

    $$
    P_{loss,trafo} = P_{0} + P_{k}
    $$

  - [ ] Energia strat z profilu obciążenia (integracja w czasie).

    $$
    E_{loss} = \int P_{loss} \, dt
    $$

### TODO-P19-001 (PLANNED) — P19: Earthing / Ground Fault Proof Pack (SN) [FUTURE PACK]
- Priority: MUST
- Inputs: TraceArtifact, Catalog
- Output: ProofPack P19 (ProofDocument: Doziemienia / uziemienia SN)
- DoD:
  - [ ] Jeśli SN: prądy doziemne z uwzględnieniem impedancji uziemienia i rozdziału prądu.
  - [ ] Tryb uproszczonych napięć dotykowych z wyraźnymi zastrzeżeniami.
  - [ ] Terminologia w ProofDocument: 1F-Z, 2F, 2F-Z oraz BoundaryNode – węzeł przyłączenia.
