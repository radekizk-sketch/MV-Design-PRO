/**
 * `fetchDerConverterTypes` — przekształtniki katalogu z JEDNEJ końcówki serwera.
 *
 * Dawne `fetchConverterTypes` składało listę we froncie z trzech końcówek i przeliczało
 * tabliczkę (kVA→MVA, kW→MW, napięcie z łańcucha pól, których serwer nie wysyła). Ta druga
 * kopia projekcji gubiła pola kontraktu (najpierw `k_sc`, potem certyfikat PTPiREE — link
 * certyfikatu ginął w kreatorze OZE). Teraz klient przekazuje rekord serwera bez zmian:
 * test pilnuje, że woła wyłącznie `/api/catalog/converter-types` i niczego nie przelicza ani
 * nie gubi (iloczyn: rodzaj PV/magazyn/wiatr × pola certyfikatu i modelu przekształtnika).
 * Równość projekcji `ZRODLO_NN_PV`/`ZRODLO_NN_BESS` z rekordami tej końcówki przypina backend
 * (`tests/api/test_przeksztaltniki_jedna_sciezka.py`).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchDerConverterTypes } from '../api';
import type { ConverterType } from '../types';

const REKORDY: ConverterType[] = [
  {
    id: 'pv-1', name: 'Falownik PV', manufacturer: 'SMA', kind: 'PV', un_kv: 0.4,
    sn_mva: 1.0, pmax_mw: 0.9, cosphi_min: 0.9, cosphi_max: 1.0, k_sc: 1.2,
    ptpiree_status: 'POWIAZANY', ptpiree_certificate_ref: 'WOS/2024/PV',
    ptpiree_document_number: 'DOC-PV', ptpiree_wos_version: '2.1',
    ptpiree_source_url: 'https://ptpiree.pl', flicker_c: 2.5, pll_bandwidth_hz: 20,
    pq_curve: [[0, -0.3, 0.3], [0.9, -0.2, 0.2]],
  },
  {
    id: 'bess-1', name: 'Magazyn', manufacturer: 'Tesla', kind: 'BESS', un_kv: 0.4,
    sn_mva: 1.1, pmax_mw: 1.0, e_kwh: 2000, ptpiree_status: 'POWIAZANY',
    ptpiree_certificate_ref: 'WOS/2024/BESS', control_delay_ms: 20,
  },
  {
    id: 'wind-1', name: 'Turbina', manufacturer: 'Vestas', kind: 'WIND', un_kv: 0.69,
    sn_mva: 4.0, pmax_mw: 3.6, generator_machine_type: 'PMSG', ptpiree_status: 'NIEPOWIAZANY',
  },
];

function mockFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    const rodzaj = url.searchParams.get('kind');
    const body = url.pathname === '/api/catalog/converter-types'
      ? REKORDY.filter((r) => !rodzaj || r.kind === rodzaj)
      : [];
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchDerConverterTypes — jedna końcówka, rekord bez zmian', () => {
  it('woła wyłącznie /api/catalog/converter-types, jeden raz', async () => {
    const fetchMock = mockFetch();
    await fetchDerConverterTypes();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/catalog/converter-types');
  });

  it.each(REKORDY.map((r) => [r.kind, r] as const))(
    '%s: rekord serwera przechodzi co do pola (certyfikat PTPiREE, model przekształtnika)',
    async (_rodzaj, rekord) => {
      mockFetch();
      const typy = await fetchDerConverterTypes();
      expect(typy.find((t) => t.id === rekord.id)).toEqual(rekord);
    },
  );

  it.each(['PV', 'BESS', 'WIND'] as const)('zawężenie rodzajem %s idzie do serwera', async (rodzaj) => {
    const fetchMock = mockFetch();
    const typy = await fetchDerConverterTypes(rodzaj);
    expect(String(fetchMock.mock.calls[0][0])).toContain(`kind=${rodzaj}`);
    expect(typy.map((t) => t.kind)).toEqual([rodzaj]);
  });
});
