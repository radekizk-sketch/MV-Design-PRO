# M0: Frontend/Backend ENM Alignment

**Date**: 2026-04-24  
**Status**: BASELINE AUDIT (fixture discovery)

## Current State: No Shared Canonical Fixture Yet

### Backend Fixtures
**Location**: `./mv-design-pro/backend/tests/fixtures/`

**Fixtures Scanned**:
- No `canonical_gpz_sn_v2.json` found
- No explicit "golden network" JSON exports
- `switchgear_config_fixture_01.json` exists and is already mirrored with the frontend hash-parity fixture
- Backend uses Python builders (not JSON-first)

**Reference Networks** (Python code):
Files mentioning "canonical":
- `test_reference_networks_determinism.py`
- `test_canonical_operations_registry.py`
- `test_canonical_analysis_api.py`
- `canonical_analysis.py`

**Implication**: Backend builds networks programmatically; does not export to JSON

### Frontend Fixtures
**Location**: `./mv-design-pro/frontend/src/ui/sld/core/__tests__/fixtures/`

**Fixtures Scanned**:
- No `canonical_gpz_sn_v2.json` found
- `switchgear_config_fixture_01.json` exists for config hash parity
- Frontend uses hardcoded builders in `referenceTopologies.ts`
- Example: `GN_01_SN_PROSTA`, `GN_02_SN_ODGALEZIENIE`

**Implication**: Frontend has reference networks but they are TypeScript-based, not JSON

### Misalignment Risk: HIGH

| Asset | Backend | Frontend | Sync? |
|-------|---------|----------|-------|
| canonical_gpz_sn_v2 | ❌ Missing | ❌ Missing | ❌ NO |
| referenceTopologies | (hardcoded Python) | ✅ TypeScript builders | ❌ MANUAL |
| Hash parity fixture | ✅ switchgear_config_fixture_01.json | ✅ switchgear_config_fixture_01.json | ✅ YES |

## M4 Action Plan: Establish FE/BE Parity

### Phase 1: Backend Builder (M4)
**File to create**: `./mv-design-pro/backend/tests/reference_networks/canonical_gpz_sn_v2_builder.py`

**Purpose**:
- Authoritative builder for canonical GPZ SN v2 network
- Generates EnergyNetworkModel with all details:
  - 2 transformers
  - 2 bus sections
  - 4 stations (LEAF, INLINE, BRANCH, SECTIONAL)
  - Coupler (no transformer!)
  - PV source (0.4→15kV transformer)
  - BESS source (0.8→15kV transformer)
  - All devices with catalogId, roles, references

**Output**: Python dict or `EnergyNetworkModel.to_json()`

### Phase 2: Backend Fixture Export (M4)
**File to create**: `./mv-design-pro/backend/tests/fixtures/canonical_gpz_sn_v2.json`

**Purpose**:
- Deterministic JSON export from builder
- Shared between FE and BE
- Enables parity testing (SHA-256)

**Generation**: 
```bash
# Pseudocode
python -m tests.reference_networks.canonical_gpz_sn_v2_builder > fixtures/canonical_gpz_sn_v2.json
```

**Content**: Full ENM structure (devices, branches, catalog bindings, roles, etc.)

### Phase 3: Frontend Fixture Sync (M4)
**File to create/update**: `./mv-design-pro/frontend/src/ui/sld/core/__tests__/fixtures/canonical_gpz_sn_v2.json`

**Purpose**:
- Identical copy of backend JSON
- Frontend loads via `import` or HTTP (mocked)
- Enables projection determinism test: `projectEnmSnapshotToSld(fixture) → SHA-256 stable`

**Sync Strategy**: 
1. Generate from backend builder
2. Copy to `frontend/src/ui/sld/core/__tests__/fixtures/`
3. CI validates byte/hash identity of the backend and frontend fixture copies

## Current Hardcoded Reference Networks

### TypeScript Builders (Frontend)
**File**: `./mv-design-pro/frontend/src/ui/sld/core/referenceTopologies.ts` (40KB)

**Examples**:
- `GN_01_SN_PROSTA` (simple SN)
- `GN_02_SN_ODGALEZIENIE` (branching SN)
- Possibly others (need to read file for full list)

**Status**: Hardcoded, not authoritative  
**Action (M1)**: Document these as examples; replace with canonical_gpz_sn_v2 in M4

### Python Builders (Backend)
**Reference files**:
- `test_reference_networks_determinism.py` — builders with determinism checks
- `test_switchgear_config.py` — config validation

**Status**: Scattered; not unified  
**Action (M4)**: Consolidate into single canonical_gpz_sn_v2_builder.py

## Hash Parity Testing (M4+)

### Test Plan
```typescript
// Frontend parity test (to be created in M4)
describe('canonical_gpz_sn_v2 parity', () => {
  it('frontend fixture copy matches backend fixture hash', () => {
    const beJson = loadJson('backend/tests/fixtures/canonical_gpz_sn_v2.json');
    const feJson = loadJson('frontend/src/ui/sld/core/__tests__/fixtures/canonical_gpz_sn_v2.json');
    const beHash = sha256(JSON.stringify(beJson));
    const feFixtureHash = sha256(JSON.stringify(feJson));

    expect(feFixtureHash).toBe(beHash);
  });

  it('projected SLD output is deterministic', () => {
    const fixture = require('../fixtures/canonical_gpz_sn_v2.json');
    const first = sha256(JSON.stringify(projectEnmSnapshotToSld(fixture)));
    const second = sha256(JSON.stringify(projectEnmSnapshotToSld(fixture)));

    expect(second).toBe(first);
  });
});
```

### Backend Determinism Test (M4+)
```python
# Backend test (to be created in M4)
def test_canonical_gpz_sn_v2_determinism():
    """Builder produces identical JSON 100× in a row."""
    builder = CanonicalGpzSnV2Builder()
    hashes = []
    for _ in range(100):
        enm = builder.build_enm()
        json_str = enm.to_json()
        hashes.append(sha256(json_str))
    
    assert len(set(hashes)) == 1  # All identical
```

## Risks & Dependencies

| Risk | Level | Confirmed fact | Future action |
|------|-------|----------------|---------------|
| **FE/BE JSON mismatch** | **HIGH** | Existing switchgear fixture is mirrored; canonical GPZ SN v2 is missing. | M4 validates byte/hash identity of BE and FE fixture copies. |
| **Manual fixture duplication** | **HIGH** | Current mirrored fixture is duplicated manually. | M4 adds a repeatable sync/check path. |
| **Hardcoded reference nets abandoned** | **MEDIUM** | `referenceTopologies.ts` remains TS-based and not shared with BE. | M1 documents examples; M4 retires or demotes them after canonical fixture creation. |
| **Determinism loss in export** | **MEDIUM** | No canonical GPZ SN v2 export exists yet. | M4 tests builder JSON stability and FE projection stability independently. |
| **No shared fixture schema** | **MEDIUM** | No schema for canonical GPZ SN v2 exists yet. | M4 defines `canonical_gpz_sn_v2.schema.json`. |

## Next Steps

1. **M1**: Audit `referenceTopologies.ts` — list all hardcoded examples
2. **M2-M3**: No FE/BE changes needed (focus on templates/symbols)
3. **M4 (CRITICAL)**:
   - Create `canonical_gpz_sn_v2_builder.py` (backend)
   - Generate `canonical_gpz_sn_v2.json` fixture
   - Sync to frontend `src/ui/sld/core/__tests__/fixtures/`
   - Implement fixture identity and projection determinism tests (SHA-256)
   - Document fixture schema
4. **M9**: Golden snapshot tests will depend on M4 fixture being stable
