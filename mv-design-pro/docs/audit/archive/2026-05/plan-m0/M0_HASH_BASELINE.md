# M0: Hash Parity Baseline

**Date**: 2026-04-24  
**Status**: BASELINE AUDIT (hash values recorded)

## Current Hash Baseline

### Switchgear Config Hash Parity Test
**Test File**: `./mv-design-pro/frontend/src/ui/sld/core/__tests__/switchgearConfig.hashParity.test.ts`

**Fixture**: `switchgear_config_fixture_01.json` (minimal LINE_IN configuration)

**Confirmed locations**:
- `./mv-design-pro/backend/tests/fixtures/switchgear_config_fixture_01.json`
- `./mv-design-pro/frontend/src/ui/sld/core/__tests__/fixtures/switchgear_config_fixture_01.json`

Both copies carry the same frozen `expectedHash`.

**Baseline Expected Hash (SHA-256)**:
```
6287381366bfcb8674551e1f138f61ec41fad5a22658ede6647b11e2d0eb018a
```

**Fixture Description**:
- stationId: station_1
- fieldId: field_1 (POLE_LINIOWE_SN, LINE_IN)
- devices: CB + CABLE_HEAD
- catalogBindings: ABB CB 24kV, Cable head 24kV
- protectionBindings: empty

**Test Validation**:
- Hash format: 64-char lowercase hex (SHA-256) ✅
- Stability: 50× iterations produce identical hash ✅
- Determinism: FE hash == frozen expectedHash ✅

## Determinism Tests

**Test Files**:
1. `./mv-design-pro/frontend/src/engine/sld-layout/__tests__/determinism.test.ts`
   - Location: Layout engine (7-phase pipeline)
   - Purpose: Verify layout algorithm produces identical output across runs
   
2. `./mv-design-pro/frontend/src/ui/sld/core/__tests__/determinism.test.ts`
   - Location: Core SLD rendering
   - Purpose: Verify symbol placement + port routing is deterministic

## Critical Observation: Hash Parity is Input-Based

**Key Finding**: 
- Current hash parity test is **config-centric**, not **topology-centric**
- Hash is computed from SwitchgearConfigV1 structure (fields, devices, bindings)
- **NOT** from ENM topology projection

**Implication for M4**:
- When M4 creates `canonical_gpz_sn_v2.json` fixture, it will likely have **different hash** than current fixture_01
- This is **EXPECTED and NORMAL** — hash changes when fixture content changes
- We must create new baseline hash for canonical_gpz_sn_v2 and document it

## Files Containing Hash References

| File | Purpose | Hash Value |
|------|---------|-----------|
| backend/tests/fixtures/switchgear_config_fixture_01.json | Backend fixture copy | 6287381366bfcb8... |
| frontend/src/ui/sld/core/__tests__/fixtures/switchgear_config_fixture_01.json | Frontend config parity test | 6287381366bfcb8... |
| Other fixtures (if any) | (to be discovered) | (to be baselined) |

## Hash Stability Rules (M3+)

1. **Append-safe changes** (M3 symbol updates):
   - Adding new symbol entries to ports.json
   - New SVG files with distinct names
   - **Should NOT change existing hashes** if append-only

2. **Breaking changes** (expected in M4+):
   - New fixture creation → new baseline hash
   - Modified fixture content → new baseline hash
   - Must document new hash and reason

3. **CI Guarantee**:
   - `switchgearConfig.hashParity.test.ts` will fail if hash changes
   - **By design** — prevents silent data corruption
   - Failure = update expectedHash OR revert change

## Risks & Dependencies

| Risk | Level | Confirmed fact | Future action |
|------|-------|----------------|---------------|
| Hash parity test too strict | LOW | Current expected hash is frozen intentionally. | Update expected hash only when fixture content intentionally changes. |
| M3 symbol append breaks hash | LOW | This config hash should not change for symbol-only additions. | If it changes, inspect config serialization before accepting it. |
| M4 fixture hash unknown | MEDIUM | `canonical_gpz_sn_v2.json` does not exist yet. | Establish separate JSON fixture hash and projected-SLD hash baselines. |
| Backend fixture sync mismatch | MEDIUM | Existing switchgear fixture is mirrored in BE and FE. | M4 should add identity checks for the new canonical fixture too. |

## Next Steps

1. **M2-M3**: Monitor `switchgearConfig.hashParity.test.ts` — should pass (no breaking changes planned)
2. **M3**: When adding symbols, run test to verify hash **stable**
3. **M4**: Create canonical_gpz_sn_v2 fixture, establish **new baseline hash**, document in plan
4. **M9**: Golden snapshot tests will introduce **additional baselines** for rendered SVG output
