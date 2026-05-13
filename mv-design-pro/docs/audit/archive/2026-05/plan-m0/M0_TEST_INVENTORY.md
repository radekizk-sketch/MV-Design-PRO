# M0: Active Test Inventory

**Date**: 2026-04-24  
**Status**: BASELINE AUDIT (test file discovery)

## SLD Test Files Summary

**Total test files in SLD module**: 82 files

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
  - Confirmed fact: no `*SymbolResolver*.test.*` file is present under `frontend/src/ui/sld`
  - Risk: SymbolResolver.ts inline definitions may drift from `canonical_symbols/ports.json`
  - Action (M3): Add test for symbol → port mapping consistency and ports.json parity

## Test Distribution

| Category | Count | Status |
|----------|-------|--------|
| Determinism | 2-3 | **ACTIVE** ✅ |
| Layout/Topology | 4-5 | **ACTIVE** ✅ |
| Symbol/Port | ? | **NEEDS AUDIT** ⚠️ |
| Contract (per-field) | ? | **ACTIVE** (inferred) |
| Integration | ? | **ACTIVE** (inferred) |
| **Total SLD tests** | **82** | Confirmed by local scan on PR branch |

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
3. **82 tests is substantial**: Module has good test coverage
4. **No `canonical_gpz_sn_v2` tests yet**: Will be added in M4
5. **Contract tests exist** (referenced in CLAUDE.md): Per-field invariants are tested

## Risks & Gaps

| Gap | Severity | Confirmed fact | Future action |
|-----|----------|----------------|---------------|
| Symbol resolver test coverage missing | MEDIUM | No dedicated SymbolResolver test file was found. | M3 adds resolver/ports parity tests before symbol additions. |
| No explicit "per-template" test registry | MEDIUM | Current tests exist but are not organized as a formal per-template matrix. | M5-M6 add per-template invariant tests. |
| Fixture management scattered | LOW | Existing switchgear fixture lives under SLD core test fixtures and backend fixtures. | M4 centralizes canonical GPZ SN v2 fixture loading/sync. |
| Golden snapshot tests missing | MEDIUM | No canonical GPZ SN v2 golden SVG snapshot exists. | M9 adds golden SVG snapshots. |

## Next Steps (M1+)

1. **M1**: Baseline test suite runs green (verify: `npm test -- sld` passes)
2. **M3**: Add symbol resolver tests before adding SWITCH_FUSE
3. **M5-M6**: Add 50+ per-template invariant tests
4. **M9**: Add golden snapshot tests with determinism verification (100× render hash stability)
