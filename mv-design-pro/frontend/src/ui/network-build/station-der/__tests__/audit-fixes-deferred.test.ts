/**
 * Testy napraw "deferred" z audytu eksperckiego (B.5 + C.7).
 */

import { describe, it, expect } from 'vitest';

import {
  // B.5 — block_transformer
  BLOCK_TRANSFORMER_CATALOG,
  selectBlockTransformersForDer,
  getBlockTransformer,
} from '..';

describe('Naprawa B.5 — BlockTransformerCatalog', () => {
  it('katalog ma ≥5 pozycji obejmujących PV/BESS/FW + SN/SN', () => {
    expect(BLOCK_TRANSFORMER_CATALOG.length).toBeGreaterThanOrEqual(5);
    const types = BLOCK_TRANSFORMER_CATALOG;
    expect(types.some((t) => t.applicable_der_kinds.includes('PV'))).toBe(true);
    expect(types.some((t) => t.applicable_der_kinds.includes('BESS'))).toBe(true);
    expect(types.some((t) => t.applicable_der_kinds.includes('FW'))).toBe(true);
  });

  it('zawiera transformator SN/SN dla turbinowni FW (15/3+ kV)', () => {
    const mvToMv = BLOCK_TRANSFORMER_CATALOG.filter((t) => t.is_mv_to_mv);
    expect(mvToMv.length).toBeGreaterThan(0);
    expect(mvToMv[0].applicable_der_kinds).toContain('FW');
    expect(mvToMv[0].lv_kv).toBeGreaterThan(1.0);
  });

  it('selectBlockTransformersForDer filtruje po DER kind', () => {
    const fwOnly = selectBlockTransformersForDer({ derKind: 'FW' });
    expect(fwOnly.length).toBeGreaterThan(0);
    expect(fwOnly.every((t) => t.applicable_der_kinds.includes('FW'))).toBe(true);
  });

  it('selectBlockTransformersForDer filtruje po napięciu HV/LV', () => {
    const pv15to069 = selectBlockTransformersForDer({
      derKind: 'PV',
      hvKv: 15,
      lvKv: 0.69,
    });
    expect(pv15to069.length).toBeGreaterThan(0);
    expect(pv15to069.every((t) => Math.abs(t.hv_kv - 15) < 0.5 && Math.abs(t.lv_kv - 0.69) < 0.05)).toBe(true);
  });

  it('selectBlockTransformersForDer wymusza galwaniczną izolację dla BESS', () => {
    const bessIsolated = selectBlockTransformersForDer({
      derKind: 'BESS',
      requiresGalvanicIsolation: true,
    });
    expect(bessIsolated.length).toBeGreaterThan(0);
    expect(bessIsolated.every((t) => t.galvanic_isolation === true)).toBe(true);
  });

  it('getBlockTransformer zwraca null dla unknown id', () => {
    expect(getBlockTransformer('unknown_xyz')).toBeNull();
  });

  it('getBlockTransformer pobiera szczegóły katalogowe', () => {
    const item = BLOCK_TRANSFORMER_CATALOG[0];
    expect(getBlockTransformer(item.id)?.label_pl).toBe(item.label_pl);
  });
});

// NAPRAWA C.7 — RACHUNEK USUNIĘTY Z FRONTU (K7-B, 2026-07-31).
//
// Stały tu asercje na moduł `selectivity-grading.ts`: `computeTripTime`
// (charakterystyki IDMT SI/VI/EI/LTI wg IEC 60255-151), `validateTimeGrading`
// i `validateTimeGradingRange` (werdykt selektywności Δt pary zabezpieczeń wraz
// z przemiataniem zakresu prądów) oraz `recommendedDeltaT`. Moduł deklarował
// w nagłówku „zasada NOT-A-SOLVER: te obliczenia są pure-functional dla walidacji
// UI" — co było obejściem reguły, a nie jej spełnieniem: liczył czasy zadziałania
// i ogłaszał selektywność, tyle że bez śladu i bez odbiorcy (poza tym testem
// nikt go nie wołał).
//
// Zdolność w backendzie: `api/protection_coordination.py` — `SelectivityCheck`
// (verdict PASS/MARGINAL/FAIL, margin_s = rzeczywiste Δt/CTI, required_margin_s,
// notes_pl) via `POST /protection-coordination/projects/{id}/run` oraz
// `GET /protection-coordination/{run_id}/checks/selectivity`. Ten sam wzorzec
// domknięcia, którym R3 (2026-07-18) usunęło `tmsCoordination.ts`.
