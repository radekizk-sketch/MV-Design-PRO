/*
 * Fixture 1:1 realnego kształtu wyniku zwarciowego (karta E8.2 §3): `ShortCircuitRow`
 * z `ui/results-inspector/types.ts:157-167` — WSZYSTKIE pola kontraktu obecne
 * (target_id, element_id?, target_name, ikss_ka, ip_ka, ith_ka, sk_mva, fault_type,
 * flags), w tym wartości `null` i `flags` niepuste. Tabela = `ShortCircuitResults`
 * (`types.ts:172-176`). Wartości `fault_type` zgodne z backendem
 * (`enm/canonical_analysis.py:1664` → short_circuit_type: „3F"/„2F"/„1F").
 */

import type {
  ShortCircuitResults,
  ShortCircuitRow,
} from '../../../../ui/results-inspector/types';
import type { WkladZwarciowy } from '../zwarciaModel';

export function shortCircuitRowFixture(over: Partial<ShortCircuitRow> = {}): ShortCircuitRow {
  return {
    target_id: 'BUS-GPZ',
    element_id: 'EL-GPZ',
    target_name: 'Szyna GPZ 15 kV',
    ikss_ka: 12.345,
    ip_ka: 31.2,
    ith_ka: 12.5,
    sk_mva: 320.75,
    fault_type: '3F',
    flags: [],
    ...over,
  };
}

export function shortCircuitResultsFixture(
  over: Partial<ShortCircuitResults> = {},
): ShortCircuitResults {
  return {
    run_id: 'sc-run-1',
    rows: [
      shortCircuitRowFixture(),
      shortCircuitRowFixture({
        target_id: 'BUS-ST1',
        element_id: 'EL-ST1',
        target_name: 'Szyna ST1 15 kV',
        ikss_ka: 8.4,
        ip_ka: 21.0,
        ith_ka: 8.5,
        sk_mva: 218.1,
        fault_type: '1F',
        flags: ['SYNTHETIC'],
      }),
      shortCircuitRowFixture({
        target_id: 'BUS-ST2',
        element_id: undefined,
        target_name: null,
        ikss_ka: null,
        ip_ka: null,
        ith_ka: null,
        sk_mva: null,
        fault_type: null,
        flags: ['SLACK', 'NIEZNANA_FLAGA'],
      }),
    ],
    ...over,
  };
}

/** Wkłady źródeł dla punktu (projekcja prezentacyjna — dane przez props). */
export function wkladyFixture(): WkladZwarciowy[] {
  return [
    { id: 'SRC-GRID', zrodlo: 'Sieć zasilająca 110 kV', pradKA: 9.0, dowodRef: 'SRC-GRID' },
    { id: 'SRC-INV', zrodlo: 'Falownik PV', pradKA: 3.0 },
  ];
}
