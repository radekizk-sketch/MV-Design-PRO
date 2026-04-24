# M0: Frontend/Backend ENM Alignment

**Date**: 2026-04-24  
**Status**: BASELINE AUDIT (fixture discovery)

## Current State: No Shared Canonical Fixture Yet

### Backend Fixtures
**Location**: `./mv-design-pro/backend/tests/fixtures/`

**Fixtures Scanned**:
- No `canonical_gpz_sn_v2.json` found
- No explicit "golden network" JSON exports
- Backend uses Python builders (not JSON-first)

**Reference Networks** (Python code):
Files mentioning "canonical":
- `test_reference_networks_determinism.py`
- `test_canonical_operations_registry.py`
- `test_canonical_analysis_api.py`
- `canonical_analysis.py`

**Implication**: Backend builds networks programmatically; does not export to JSON

### Frontend Fixtures
**Location**: `./mv-design-pro/frontend/src/test/fixtures/`

**Fixtures Scanned**:
- No `canonical_gpz_sn_v2.json` found
- Frontend uses hardcoded builders in `referenceTopologies.ts`
- Example: `GN_01_SN_PROSTA`, `GN_02_SN_ODGALEZIENIE`

**Implication**: Frontend has reference networks but they are TypeScript-based, not JSON

### Misalignment Risk: HIGH

| Asset | Backend | Frontend | Sync? |
|-------|---------|----------|-------|
| canonical_gpz_sn_v2 | ❌ Missing | ❌ Missing | ❌ NO |
| referenceTopologies | (hardcoded Python) | ✅ TypeScript builders | ❌ MANUAL |
| Hash parity fixture | (none yet) | ✅ switchgear_config_fixture_01.json | ⚠️ PARTIAL |

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
**File to create/update**: `./mv-design-pro/frontend/src/test/fixtures/canonical_gpz_sn_v2.json`

**Purpose**:
- Identical copy of backend JSON
- Frontend loads via `import` or HTTP (mocked)
- Enables parity test: `projectEnmSnapshotToSld(fixture) → SHA-256 stable`

**Sync Strategy**: 
1. Generate from backend builder
2. Copy to frontend/src/test/fixtures/
3. CI validates SHA-256 match (parity test)

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
  it('BE JSON == FE projected SLD (SHA-256)', () => {
    const beJson = require('../fixtures/canonical_gpz_sn_v2.json');
    const beHash = sha256(JSON.stringify(beJson));
    
    const projected = projectEnmSnapshotToSld(beJson);
    const feHash = sha256(JSON.stringify(projected));
    
    expect(feHash).toBe(beHash); // Both deterministic, hashes should match
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

| Risk | Level | Mitigation |
|------|-------|-----------|
| **FE/BE JSON mismatch** | **HIGH** | M4: SHA-256 parity test catches divergence |
| **Manual fixture duplication** | **HIGH** | M4: automatic sync (CI validates) |
| **Hardcoded reference nets abandoned** | **MEDIUM** | M1: document as examples; M4: retire in favor of canonical fixture |
| **Determinism loss in export** | **MEDIUM** | M4: test builder 100× → verify hash stable |
| **No shared fixture schema** | **MEDIUM** | M4: define canonical_gpz_sn_v2.schema.json |

## Next Steps

1. **M1**: Audit `referenceTopologies.ts` — list all hardcoded examples
2. **M2-M3**: No FE/BE changes needed (focus on templates/symbols)
3. **M4 (CRITICAL)**:
   - Create `canonical_gpz_sn_v2_builder.py` (backend)
   - Generate `canonical_gpz_sn_v2.json` fixture
   - Sync to frontend `src/test/fixtures/`
   - Implement parity test (SHA-256)
   - Document fixture schema
4. **M9**: Golden snapshot tests will depend on M4 fixture being stable
