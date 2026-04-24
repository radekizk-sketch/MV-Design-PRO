# M0: Symbol & Device Type Inventory

**Date**: 2026-04-24  
**Status**: BASELINE AUDIT (symbol count and device type scan)

## Symbol Files Count
- **Total SVG symbols**: 23 files
- **Location**: `./mv-design-pro/frontend/src/ui/sld/canonical_symbols/`
- **Port configuration**: `ports.json` (7.9 KB, version 1.0.0)

## Device Type V1 Inventory

**Defined Types** (from `fieldDeviceContracts.ts`):
```typescript
const DeviceTypeV1 = {
  CB: 'CB',                      // Circuit Breaker (Wyłącznik)
  DS: 'DS',                      // Disconnector (Rozłącznik)
  ES: 'ES',                      // Earthing Switch (Rozłącznik uziemniający)
  CT: 'CT',                      // Current Transformer (Transformator prądowy)
  VT: 'VT',                      // Voltage Transformer (Transformator napięciowy)
  RELAY: 'RELAY',                // Relay (Przekaźnik)
  LOAD_SWITCH: 'LOAD_SWITCH',    // Load Switch (Bezpiecznik obciążeniowy)
  FUSE: 'FUSE',                  // Fuse (Bezpiecznik)
  CABLE_HEAD: 'CABLE_HEAD',      // Cable Head (Głowica kablowa)
  TRANSFORMER_DEVICE: 'TRANSFORMER_DEVICE', // Transformer
  GENERATOR_PV: 'GENERATOR_PV',  // PV Generator
  GENERATOR_BESS: 'GENERATOR_BESS', // BESS Generator
  GENERATOR_FW: 'GENERATOR_FW',  // Flywheel Generator
  PCS: 'PCS',                    // Power Conversion System
  BATTERY: 'BATTERY',            // Battery
  ACB: 'ACB',                    // Air Circuit Breaker
}
```

**Type Count**: 16 defined types

## Critical Gaps (M3 Action Items)

| Type | Status | Note |
|------|--------|------|
| FUSE | ✅ EXISTS | Available; no action needed |
| SWITCH_FUSE | ❌ **MISSING** | **REQUIRED for STATION_TRANSFORMER_CUBICLE** |
| CABLE_HEAD | ✅ EXISTS | Present in enum |
| RELAY | ✅ EXISTS | Present in enum |
| NORMALLY_OPEN_POINT (NOP) | ❌ **NOT IN ENUM** | Topological marker only (should NOT be DeviceTypeV1) |

### Symbol vs Device Type Mismatch

**Analysis**:
- 23 SVG symbols in canonical_symbols/
- 16 DeviceTypeV1 types
- Missing DeviceTypeV1 for visual symbols (need to audit which SVG exist but have no enum)

**Recommendation**: M3 should audit:
1. Each SVG file → verify it has entry in ports.json
2. Each ports.json entry → verify DeviceTypeV1 enum exists
3. Add SWITCH_FUSE to DeviceTypeV1 and create symbol if missing

## Ports.json Structure

**Schema Version**: 1.0.0  
**Format**: 
```json
{
  "symbols": {
    "symbol_key": {
      "description": "Polish / English name",
      "viewBox": "0 0 100 100",
      "ports": {
        "left": { "x": 0, "y": 50 },
        "right": { "x": 100, "y": 50 }
      },
      "allowedRotations": [0, 90],
      "defaultRotation": 0
    }
  }
}
```

**Known Entries** (sample from ports.json):
- busbar
- circuit_breaker
- disconnector
- line_overhead
- line_cable
- transformer_2w
- transformer_3w
- generator
- pv
- (+ 14 more)

## Hash Parity & Determinism Tests

**Test Files**:
- `./mv-design-pro/frontend/src/ui/sld/core/__tests__/switchgearConfig.hashParity.test.ts`
- `./mv-design-pro/frontend/src/engine/sld-layout/__tests__/determinism.test.ts`
- `./mv-design-pro/frontend/src/ui/sld/core/__tests__/determinism.test.ts`

**Purpose**: Verify that symbol rendering is deterministic (same input → same hash 100× in a row)

## Risks & Dependencies

| Risk | Level | Action |
|------|-------|--------|
| SWITCH_FUSE missing | **CRITICAL** | Add to DeviceTypeV1 + create SVG symbol (M3) |
| NOP as DeviceTypeV1 | **HIGH** | NOP must remain topological marker only, NOT in enum |
| ports.json sync with symbols | **MEDIUM** | M3: append-safe audit; ensure each SVG has port entry |
| Symbol-to-DeviceType mismatch | **MEDIUM** | M3: verify 1-to-1 correspondence |

## Files to Monitor/Modify (M3+)

- `./mv-design-pro/frontend/src/ui/sld/core/fieldDeviceContracts.ts` (48KB)
  - Add SWITCH_FUSE to DeviceTypeV1
- `./mv-design-pro/frontend/src/ui/sld/canonical_symbols/ports.json`
  - APPEND (don't replace) new symbol entries
- `./mv-design-pro/frontend/src/ui/sld/SymbolResolver.ts`
  - Register new symbol mappings
- SVG files in `canonical_symbols/` directory
  - Add switch_fuse.svg (if missing)

## Next Steps

1. **M3 Audit**: Verify each SVG ↔ ports.json ↔ DeviceTypeV1 parity
2. **M3 Addition**: Add SWITCH_FUSE symbol and type
3. **M3 Tests**: Ensure `switchgearConfig.hashParity.test.ts` passes with append-safe changes
