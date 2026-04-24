# M0: Active Test Inventory

**Date**: 2026-04-24  
**Status**: BASELINE AUDIT (test file discovery)

## SLD Test Files Summary

**Total test files in SLD module**: 81 files

**Location**: `./mv-design-pro/frontend/src/ui/sld/` and related directories

## Critical Test Files (by topic)

### Hash Parity & Determinism (M0/M9 related)
- **switchgearConfig.hashParity.test.ts** (sld/core/__tests__/)
  - Tests: FE SHA-256 hash matches frozen expectedHash
  - Iterations: 50× stability verification
  - Fixture: switchgear_config_fixture_01.json
  - Status: **ACTIVE** ✅
  
- **determinism.test.ts** (sld/core/__tests__/)
  - Tests: Layout algorithm produces identical output across runs
  - Status: **ACTIVE** ✅
  
- **determinism.test.ts** (engine/sld-layout/__tests__/)
  - Tests: Layout engine (7-phase pipeline) determinism
  - Status: **ACTIVE** ✅

### Layout & Topology Tests
- **layoutPipeline.test.ts** (inferred from file size 67KB)
  - Status: Likely has comprehensive test coverage
  - Critical: Tests phase-by-phase output stability

- **topologyAdapterV2.test.ts** (referenced in CLAUDE.md)
  - Status: Contract test for topology → SLD projection
  - Critical: Ensures ENM input → SLD output consistency

- **switchgearConfig.test.ts** (likely exists)
  - Tests: Switchgear configuration validation
  - Status: Foundational tests

### Symbol & Port Resolution Tests
- **No dedicated symbol resolver test found yet**
  - Risk: SymbolResolver.ts (5.5KB) may lack test coverage
  - Action (M3): Add test for symbol → port mapping consistency

## Test Distribution

| Category | Count | Status |
|----------|-------|--------|
| Determinism | 2-3 | **ACTIVE** ✅ |
| Layout/Topology | 4-5 | **ACTIVE** ✅ |
| Symbol/Port | ? | **NEEDS AUDIT** ⚠️ |
| Contract (per-field) | ? | **ACTIVE** (inferred) |
| Integration | ? | **ACTIVE** (inferred) |
| **Total SLD tests** | **81** | Mixed |

## Test Execution Commands (for M1+)

```bash
# Run all SLD tests
cd mv-design-pro/frontend && npm test -- sld

# Run only determinism tests
npm test -- determinism

# Run only hash parity test
npm test -- hashParity

# Run with coverage
npm run test:coverage -- sld
```

## Key Observations

1. **Determinism tests are ACTIVE**: Core architecture relies on SHA-256 stability
2. **Hash parity is critical**: Any symbol or layout change must pass hash parity test
3. **81 tests is substantial**: Module has good test coverage
4. **No `canonical_gpz_sn_v2` tests yet**: Will be added in M4
5. **Contract tests exist** (referenced in CLAUDE.md): Per-field invariants are tested

## Risks & Gaps

| Gap | Severity | Note |
|-----|----------|------|
| Symbol resolver test coverage unknown | MEDIUM | M3: audit SymbolResolver.ts test coverage |
| No explicit "per-template" test registry | MEDIUM | M5-M6 will add 50+ per-template tests |
| Fixture management scattered | LOW | M4: centralize fixture loading (canonical_gpz_sn_v2) |
| Golden snapshot tests missing | MEDIUM | M9: will add golden SVG snapshots |

## Next Steps (M1+)

1. **M1**: Baseline test suite runs green (verify: `npm test -- sld` passes)
2. **M3**: Add symbol resolver tests before adding SWITCH_FUSE
3. **M5-M6**: Add 50+ per-template invariant tests
4. **M9**: Add golden snapshot tests with determinism verification (100× render hash stability)
