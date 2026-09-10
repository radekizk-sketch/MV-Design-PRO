/**
 * Testy napraw "deferred" z audytu eksperckiego (B.5 + C.7).
 */

import { describe, it, expect } from 'vitest';

import {
  // B.5 — block_transformer
  selectBlockTransformersForDer,
  getBlockTransformer,
} from '..';
import type { BlockTransformerItem } from '../audit2-api';

/**
 * Karta FAB-J: `BLOCK_TRANSFORMER_CATALOG` usunięty z `catalogs.ts` — jedyne
 * źródło jest teraz snapshot audytu 2 backendu (`useAudit2CatalogSnapshot`,
 * `audit2-api.ts::BlockTransformerItem`). `selectBlockTransformersForDer`/
 * `getBlockTransformer` przyjmują listę jako parametr zamiast czytać statyk
 * modułowy — testy podają ją fikstury jawnie.
 */
function blockTransformerFixture(
  id: string,
  overrides: Partial<BlockTransformerItem> = {},
): BlockTransformerItem {
  return {
    id,
    catalog_namespace: 'block_transformer',
    catalog_version: '1.0',
    label_pl: `Transformator dedykowany ${overrides.hv_kv ?? 15}/${overrides.lv_kv ?? 0.69} kV`,
    transformer_type_ref: `tr-test-${id}`,
    sn_kva: 1000,
    hv_kv: 15,
    lv_kv: 0.69,
    uk_percent: 6,
    pk_kw: 10,
    p0_kw: 2,
    i0_percent: 0.5,
    vector_group: 'Dyn11',
    is_mv_to_mv: false,
    applicable_der_kinds: ['PV'],
    galvanic_isolation: true,
    source_reference: 'Fikstura testowa',
    verification_status: 'VERIFIED',
    ...overrides,
  };
}

const BLOCK_TRANSFORMER_FIXTURES: readonly BlockTransformerItem[] = [
  blockTransformerFixture('btr_pv_15_069_800', {
    sn_kva: 800, hv_kv: 15, lv_kv: 0.69, applicable_der_kinds: ['PV', 'BESS'],
  }),
  blockTransformerFixture('btr_pv_15_069_1250', {
    sn_kva: 1250, hv_kv: 15, lv_kv: 0.69, applicable_der_kinds: ['PV', 'BESS', 'FW'],
  }),
  blockTransformerFixture('btr_bess_15_04_1000', {
    sn_kva: 1000, hv_kv: 15, lv_kv: 0.4, applicable_der_kinds: ['BESS'], galvanic_isolation: true,
  }),
  blockTransformerFixture('btr_bess_15_04_500_no_iso', {
    sn_kva: 500, hv_kv: 15, lv_kv: 0.4, applicable_der_kinds: ['BESS'], galvanic_isolation: false,
  }),
  blockTransformerFixture('btr_fw_15_3', {
    sn_kva: 5000, hv_kv: 15, lv_kv: 3, applicable_der_kinds: ['FW'], is_mv_to_mv: true, vector_group: 'YNd11',
  }),
];

describe('Naprawa B.5 — BlockTransformerCatalog (przez fikstury audytu 2)', () => {
  it('front NIE MA już własnego katalogu transformatorów dedykowanych', async () => {
    const modul = (await import('../catalogs')) as Record<string, unknown>;
    expect(modul.BLOCK_TRANSFORMER_CATALOG).toBeUndefined();
  });

  it('katalog (fikstura) ma ≥5 pozycji obejmujących PV/BESS/FW + SN/SN', () => {
    expect(BLOCK_TRANSFORMER_FIXTURES.length).toBeGreaterThanOrEqual(5);
    expect(BLOCK_TRANSFORMER_FIXTURES.some((t) => t.applicable_der_kinds.includes('PV'))).toBe(true);
    expect(BLOCK_TRANSFORMER_FIXTURES.some((t) => t.applicable_der_kinds.includes('BESS'))).toBe(true);
    expect(BLOCK_TRANSFORMER_FIXTURES.some((t) => t.applicable_der_kinds.includes('FW'))).toBe(true);
  });

  it('zawiera transformator SN/SN dla turbinowni FW (15/3+ kV)', () => {
    const mvToMv = BLOCK_TRANSFORMER_FIXTURES.filter((t) => t.is_mv_to_mv);
    expect(mvToMv.length).toBeGreaterThan(0);
    expect(mvToMv[0].applicable_der_kinds).toContain('FW');
    expect(mvToMv[0].lv_kv).toBeGreaterThan(1.0);
  });

  it('selectBlockTransformersForDer filtruje po DER kind', () => {
    const fwOnly = selectBlockTransformersForDer(BLOCK_TRANSFORMER_FIXTURES, { derKind: 'FW' });
    expect(fwOnly.length).toBeGreaterThan(0);
    expect(fwOnly.every((t) => t.applicable_der_kinds.includes('FW'))).toBe(true);
  });

  it('selectBlockTransformersForDer filtruje po napięciu HV/LV', () => {
    const pv15to069 = selectBlockTransformersForDer(BLOCK_TRANSFORMER_FIXTURES, {
      derKind: 'PV',
      hvKv: 15,
      lvKv: 0.69,
    });
    expect(pv15to069.length).toBeGreaterThan(0);
    expect(pv15to069.every((t) => Math.abs(t.hv_kv - 15) < 0.5 && Math.abs(t.lv_kv - 0.69) < 0.05)).toBe(true);
  });

  it('selectBlockTransformersForDer wymusza galwaniczną izolację dla BESS', () => {
    const bessIsolated = selectBlockTransformersForDer(BLOCK_TRANSFORMER_FIXTURES, {
      derKind: 'BESS',
      requiresGalvanicIsolation: true,
    });
    expect(bessIsolated.length).toBeGreaterThan(0);
    expect(bessIsolated.every((t) => t.galvanic_isolation === true)).toBe(true);
  });

  it('getBlockTransformer zwraca null dla unknown id', () => {
    expect(getBlockTransformer(BLOCK_TRANSFORMER_FIXTURES, 'unknown_xyz')).toBeNull();
  });

  it('getBlockTransformer pobiera szczegóły katalogowe', () => {
    const item = BLOCK_TRANSFORMER_FIXTURES[0];
    expect(getBlockTransformer(BLOCK_TRANSFORMER_FIXTURES, item.id)?.label_pl).toBe(item.label_pl);
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
