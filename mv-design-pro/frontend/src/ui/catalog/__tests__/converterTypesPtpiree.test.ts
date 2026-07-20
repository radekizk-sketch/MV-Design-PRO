/**
 * fetchConverterTypes — mapowanie PV/BESS niesie certyfikat PTPiREE (regresja z oceny
 * wizualnej kreatora OZE: link certyfikatu ginął, bo flatMap PV/BESS gubił pola ptpiree_*,
 * przez co materialized_params.ptpiree_certificate_ref był zawsze null i ostrzeżenie
 * „brak certyfikatu" pokazywało się nawet dla certyfikowanych falowników).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchConverterTypes } from '../api';

function mockFetch(map: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      for (const [key, body] of Object.entries(map)) {
        if (url.includes(key)) {
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('fetchConverterTypes — certyfikat PTPiREE (PV/BESS)', () => {
  it('PV: przenosi ptpiree_certificate_ref + status na ConverterType', async () => {
    mockFetch({
      '/api/catalog/pv-inverter-types': [
        {
          id: 'pv-1', name: 'Falownik PV', manufacturer: 'SMA', un_kv: 0.4,
          s_n_kva: 1000, p_max_kw: 900, cos_phi_min: 0.9, cos_phi_max: 1.0,
          ptpiree_status: 'POWIAZANY', ptpiree_certificate_ref: 'WOS/2024/PV',
          ptpiree_document_number: 'DOC-PV', ptpiree_wos_version: '2.1',
          ptpiree_source_url: 'https://ptpiree.pl',
        },
      ],
      '/api/catalog/bess-inverter-types': [],
      '/api/catalog/wind-inverter-types': [],
    });
    const types = await fetchConverterTypes();
    const pv = types.find((t) => t.id === 'pv-1');
    expect(pv).toBeDefined();
    // Tabliczka poprawnie przeliczona (kVA→MVA, kW→MW) — nie NaN.
    expect(pv!.sn_mva).toBeCloseTo(1.0, 5);
    expect(pv!.pmax_mw).toBeCloseTo(0.9, 5);
    // Certyfikat PTPiREE zachowany (nie ginie w mapowaniu).
    expect(pv!.ptpiree_certificate_ref).toBe('WOS/2024/PV');
    expect(pv!.ptpiree_status).toBe('POWIAZANY');
    expect(pv!.ptpiree_document_number).toBe('DOC-PV');
  });

  it('BESS: przenosi ptpiree_certificate_ref na ConverterType', async () => {
    mockFetch({
      '/api/catalog/pv-inverter-types': [],
      '/api/catalog/bess-inverter-types': [
        {
          id: 'bess-1', name: 'Magazyn', manufacturer: 'Tesla', un_kv: 0.4,
          s_n_kva: 1100, p_charge_kw: 1000, p_discharge_kw: 1000, e_kwh: 2000,
          ptpiree_status: 'POWIAZANY', ptpiree_certificate_ref: 'WOS/2024/BESS',
        },
      ],
      '/api/catalog/wind-inverter-types': [],
    });
    const types = await fetchConverterTypes();
    const bess = types.find((t) => t.id === 'bess-1');
    expect(bess?.ptpiree_certificate_ref).toBe('WOS/2024/BESS');
    expect(bess?.e_kwh).toBe(2000);
  });
});
