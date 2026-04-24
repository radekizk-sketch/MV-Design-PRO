# M0: Identified Architectural Risks

**Date**: 2026-04-24  
**Status**: BASELINE AUDIT (risk assessment from M0 findings)

## Evidence Boundary

| Area | Confirmed repo fact | Future assumption/action |
|------|---------------------|--------------------------|
| `SWITCH_FUSE` | `DeviceTypeV1` currently has `FUSE` and `LOAD_SWITCH`, but no `SWITCH_FUSE`. | M3 must decide whether a separate `SWITCH_FUSE` type is required or whether existing types cover the apparatus. |
| Fixture parity | `switchgear_config_fixture_01.json` already exists in both backend and frontend fixture trees. | `canonical_gpz_sn_v2.json` is still missing and needs a separate M4 builder/sync path. |
| Symbol ports | `ports.json` exists, but runtime uses inline `SYMBOL_DEFINITIONS` in `SymbolResolver.ts`. | New symbols require updates in both metadata surfaces or a parity/generation mechanism. |

## Critical Risks (MUST ADDRESS IN M1-M9)

### R1: SWITCH_FUSE Missing from DeviceTypeV1
**Severity**: 🔴 **CRITICAL**  
**Component**: Frontend symbol inventory  
**Issue**:
- SWITCH_FUSE not in DeviceTypeV1 enum (fieldDeviceContracts.ts)
- Blueprint requires it for `STATION_TRANSFORMER_CUBICLE`, but runtime currently has `FUSE` and `LOAD_SWITCH`
- M3 must validate whether a distinct switch-fuse device is needed before adding a new enum value

**Impact**:
- ST-01/ST-02/ST-03/ST-04 may be underspecified if switch-fuse is distinct in the target catalog
- M3 cannot proceed without an explicit add-vs-map decision

**Mitigation**:
- **M3 Action**: Decide add-vs-map strategy for SWITCH_FUSE
- If adding: create switch_fuse.svg symbol (if missing)
- If adding: append entry to ports.json and update SymbolResolver.ts inline definitions
- Verify hash parity test still passes

**Owner**: M3 (Symbol inventory cleanup)

---

### R2: FE/BE Fixture Mismatch
**Severity**: 🔴 **CRITICAL**  
**Component**: canonical_gpz_sn_v2 fixture (missing)  
**Issue**:
- No canonical_gpz_sn_v2.json in backend fixtures
- No canonical_gpz_sn_v2.json in frontend SLD test fixtures
- Existing `switchgear_config_fixture_01.json` is already mirrored in BE/FE and is not the missing canonical topology fixture
- Frontend uses hardcoded `referenceTopologies.ts` (40KB)
- Backend uses scattered Python builders

**Impact**:
- Frontend and backend may diverge on golden network
- Cannot ensure FE rendering matches BE model
- Parity testing impossible until M4 creates fixture

**Mitigation**:
- **M4 Action**: Create authoritative backend builder
- Generate shared JSON fixture
- Implement BE/FE fixture identity test plus FE projection determinism test
- Retire hardcoded builders

**Owner**: M4 (Canonical fixture + parity)

---

### R3: NOP (Normally Open Point) Incorrectly Positioned
**Severity**: 🟡 **HIGH**  
**Component**: Topological marker concept  
**Issue**:
- NOP should **NOT** be in DeviceTypeV1 enum
- NOP is topological marker, not catalog device
- Risk: Codex treats it as device requiring catalogId

**Impact**:
- NOP may appear in bay template requirements
- M3 audit will fail if NOP is mixed with physical devices
- Catalog binding rules will be violated

**Mitigation**:
- **M2 Action**: Explicitly separate NOP from DeviceTypeV1
- Document: "NOP is topological marker only"
- M3: Verify NOP has NO_CATALOG_ID status
- M5: NOP renders as legend miniature only (not in bay)

**Owner**: M2 (DeviceSlotPosition + Contracts clarification)

---

### R4: ports.json / SymbolResolver Sync Strategy Not Enforced
**Severity**: 🟡 **HIGH**  
**Component**: Symbol inventory management  
**Issue**:
- Hash parity test is strict (brittle)
- Any modification to ports.json risks metadata drift
- Runtime symbol ports are currently inline in `SymbolResolver.ts`, not loaded directly from ports.json
- No tooling enforces append-only or parity between these two surfaces

**Impact**:
- M3 symbol additions may update ports.json but still fail to render because SymbolResolver.ts was not updated
- Developer may need to manually update multiple symbol registries
- Risk of accidental port coordinate changes

**Mitigation**:
- **M3 Strategy**: APPEND new symbols to end of ports.json
- Update `CanonicalSymbolId`, `SYMBOL_DEFINITIONS`, and resolver mappings in SymbolResolver.ts
- NEVER modify existing port coordinates
- Run hash parity test immediately after changes
- If hash changes unexpectedly, revert and investigate

**Owner**: M3 (implementation discipline)

---

### R5: Layout Pipeline Determinism Not Guaranteed for New Topologies
**Severity**: 🟡 **HIGH**  
**Component**: layoutPipeline.ts (7-phase algorithm)  
**Issue**:
- Current determinism tests use `switchgear_config_fixture_01.json` (minimal LINE_IN)
- No golden tests for complex topologies (GPZ with coupler, stations, PV/BESS)
- M4 canonical_gpz_sn_v2 may expose latent non-determinism

**Impact**:
- M9 golden snapshot test may fail due to layout instability
- Hash parity test may be flaky on complex fixtures
- Risk: Silent data corruption (different output on re-run)

**Mitigation**:
- **M4 Action**: Test canonical_gpz_sn_v2 builder 100× → verify JSON hash stable
- **M5-M6**: Test layout algorithm with complex topologies
- **M9 Action**: Golden SVG snapshots with 100× determinism check
- Document: "If layout output differs, investigate root cause immediately"

**Owner**: M4, M9 (determinism validation)

---

## High-Priority Risks (ADDRESS IN M2-M6)

### R6: BayTemplate Structure Not Yet Extracted
**Severity**: 🟡 **HIGH**  
**Component**: Template contracts  
**Issue**:
- BayTemplate structure exists informally in bayRenderer.ts (28KB)
- Not extracted as formal TypeScript interface
- Risks: template not enforced, developer guessing

**Impact**:
- M5 component rendering cannot be template-driven
- M6 invariant tests cannot reference formal contract
- M8 backend validator cannot align with template

**Mitigation**:
- **M2 Action**: Extract `BayTemplate` interface
- Define: `BayTemplateGpz` vs `BayTemplateStation`
- Create: `stationSwitchgearTemplates.ts` with formal structure
- M3-M5: Code against formal interfaces

**Owner**: M2 (Template contracts extraction)

---

### R7: Symbol Resolver Test Coverage Unknown
**Severity**: 🟡 **HIGH**  
**Component**: SymbolResolver.ts  
**Issue**:
- No explicit test file found for SymbolResolver
- Risk: Symbol → SVG mapping may have bugs
- M3 addition of SWITCH_FUSE may expose issues

**Impact**:
- SWITCH_FUSE symbol may fail to render
- Symbol rotation/port alignment may be incorrect
- Hash parity test may fail unexpectedly

**Mitigation**:
- **M3 Action**: Audit SymbolResolver.ts for test coverage
- If missing: add tests before adding SWITCH_FUSE
- Test: DeviceTypeV1 → symbol path resolution
- Test: inline port definitions match ports.json for runtime symbols

**Owner**: M3 (symbol resolver validation)

---

### R8: Hardcoded Validators Not Per-Template
**Severity**: 🟡 **HIGH**  
**Component**: Electrical correctness rules  
**Issue**:
- Risk: Global rules like "every CB has CT" applied everywhere
- Correct rules: "GPZ_LINE_BAY CB has CT in axis; STATION_LINE_INCOMING CB does not"
- M5-M6 per-template invariants will conflict if not carefully separated

**Impact**:
- M5 component rendering may violate global validator
- M6 tests may be overly strict or incorrect
- M8 backend validator may be too broad

**Mitigation**:
- **M5-M6 Action**: Define invariants **per-template**, not globally
- Document: "No universal 'every CB has CT' rule"
- Validator checks template contract, not global assumptions
- M8: Backend validator enforces only universal rules (coupler ≠ TR, etc.)

**Owner**: M5-M6 (per-template invariant design)

---

## Medium-Priority Risks (MONITOR)

### R9: FE/BE Voltage Direction Mismatch (PV/BESS Transformers)
**Severity**: 🟠 **MEDIUM**  
**Component**: Transformer direction (0.4→15kV vs 15→0.4kV)  
**Issue**:
- PV transformer: 0.4/15 kV (LV → SN, source direction)
- BESS transformer: 0.8/15 kV (LV → SN, source direction)
- Risk: FE renders incorrectly; BE models 15→0.4 (wrong direction)

**Impact**:
- M4 fixture may have wrong transformer direction
- M8 validator will flag mismatch
- Proof engine may produce incorrect power flow equations

**Mitigation**:
- **M4 Action**: Document transformer direction in builder comments
- Verify: `v_primary = 0.4`, `v_secondary = 15` for PV
- Verify: `v_primary = 0.8`, `v_secondary = 15` for BESS
- **M8 Test**: Assert transformer voltages match expected direction
- **M9 Test**: Verify rendered symbols show source-side lower voltage

**Owner**: M4, M8 (direction validation in fixture + validator)

---

### R10: ActiveCaseBar Deprecated (M7b Replacement)
**Severity**: 🟠 **MEDIUM**  
**Component**: Layout shell  
**Issue**:
- Current UI uses ActiveCaseBar
- M7a/M7b replaces with ScadaTopBar
- Risk: 190+ tests depend on CanonicalLayout alias; import breakage

**Impact**:
- M7a import alias must work: `import { CanonicalLayout } from ...`
- M7b removal of ActiveCaseBar may orphan state management
- Forbidden terms guard may catch "case" references

**Mitigation**:
- **M7a Action**: Alias API for backwards compatibility
- **M7b Action**: Atomic commit; test updates in same commit
- Pre-M7a: Baseline which components import ActiveCaseBar
- M7b: Replace all imports in one shot

**Owner**: M7a-M7b (layout shell replacement)

---

## Low-Priority Risks (DOCUMENT)

### R11: Legacy VisualGraph Bridge Unused
**Severity**: 🟢 **LOW**  
**Component**: legacyVisualGraphBridge.ts (2.4KB)  
**Issue**:
- File exists but marked as legacy
- No tests; may be dead code
- Risk: Confuses developers; takes space

**Impact**: None currently; candidate for M7b cleanup  
**Mitigation**: M7b removes with ActiveCaseBar deprecation  
**Owner**: M7b (layout refactoring)

---

### R12: referenceTopologies.ts Hardcoding
**Severity**: 🟢 **LOW**  
**Component**: Golden network builders  
**Issue**:
- 40KB of hardcoded network builders
- Not authoritative (backend has own builders)
- Will be superseded by canonical_gpz_sn_v2.json in M4

**Impact**: Maintenance burden; duplication risk  
**Mitigation**: **M4 Action** — retire hardcoded builders after fixture created  
**Owner**: M4 (fixture creation + migration)

---

## Risk Mitigation Timeline

| Milestone | Critical Risks | High Risks | Medium Risks |
|-----------|---|---|---|
| **M2** | — | R6 (templates) | — |
| **M3** | R1 (SWITCH_FUSE) | R7 (symbol resolver) | R4 (ports/resolver sync) |
| **M4** | R2 (FE/BE fixture) | — | R5 (layout determinism), R9 (PV/BESS direction) |
| **M5-M6** | — | R8 (per-template rules) | — |
| **M7a-M7b** | — | — | R10 (ActiveCaseBar), R11 (legacy bridge) |
| **M8** | — | — | R5 (validator alignment) |
| **M9** | — | — | R5 (golden snapshots), R12 (retire builders) |

## Escalation Criteria

**STOP and escalate if**:
- Hash parity test fails unexpectedly (unexpected hash value)
- determinism.test.ts produces different output on re-run
- Symbol rendering differs between FE and BE
- Transformer direction does not match (0.4→15 vs 15→0.4)
- Cannot create per-template invariants due to architecture conflict

**In all cases**: Document in PLANS.md before proceeding.
