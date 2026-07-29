/**
 * D2 (RECENZJA_DER_SN_DOBORY_2026-07): test klienta końcówki DOBORU toru DER-SN.
 * Dobór liczy backend (WHITE BOX); klient tylko wysyła parametry i mapuje wynik.
 * Parytet reguły doboru pokrywają testy backendu (test_der_selection_preview*).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchCableLayingConditions,
  fetchDerSelectionPreview,
  type DerSelectionPreviewRequest,
} from '../derSelectionApi';

const RESPONSE = {
  sum_apparent_power_mva: 0.998,
  transformer_current_a: 38.49,
  transformer: {
    proposal: {
      catalog_ref: 'tr-1000',
      name: 'TR 1000 kVA 15/0.4',
      sn_mva: 1.0,
      primary_kv: 15.0,
      secondary_kv: 0.4,
      uk_percent: 6.0,
      vector_group: 'Dyn11',
    },
    required_apparent_power_mva: 0.998,
    effective_load_mva: 0.998,
    rejected: [],
    error_code: null,
    error_pl: null,
    formula_ref: 'S_wym',
  },
  cable: null,
  field_apparatus: null,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    expect(String(input)).toBe('/api/solver/der-selection-preview');
    return { ok: true, json: async () => RESPONSE } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchDerSelectionPreview', () => {
  it('wysyła żądanie na końcówkę doboru i mapuje propozycję TR', async () => {
    const req: DerSelectionPreviewRequest = {
      sum_active_power_mw: 0.998,
      inverter_output_kv: 0.4,
      sn_bus_voltage_kv: 15.0,
      cable_length_km: 1.0,
    };
    const result = await fetchDerSelectionPreview(req);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject(req);
    expect(result.transformer.proposal?.sn_mva).toBe(1.0);
  });

  it('błąd 422 z backendu → uczciwy komunikat PL z detalem', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: 'ΣS falowników musi być dodatnie.' }),
    } as Response);
    await expect(
      fetchDerSelectionPreview({
        sum_active_power_mw: -1,
        inverter_output_kv: 0.4,
        sn_bus_voltage_kv: 15,
        cable_length_km: 1,
      }),
    ).rejects.toThrow(/dodatnie/);
  });

  it('brak odpowiedzi backendu → uczciwy fallback PL', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => {
        throw new Error('no body');
      },
    } as unknown as Response);
    await expect(
      fetchDerSelectionPreview({
        sum_active_power_mw: 1,
        inverter_output_kv: 0.4,
        sn_bus_voltage_kv: 15,
        cable_length_km: 1,
      }),
    ).rejects.toThrow(/niedostępny/);
  });
});

// ---------------------------------------------------------------------------
// Karta F-K7 / V12K-207: końcówka listy warunków ułożenia kabla.
// ---------------------------------------------------------------------------

const WARUNKI = {
  sets: [
    {
      name: 'warunki_katalogowe',
      label_pl: 'Warunki katalogowe (bez korekty)',
      f_grunt: 1.0,
      f_wiazka: 1.0,
      f_grupa: 1.0,
      total: 1.0,
      basis: 'Karta katalogowa producenta.',
      assumption_pl: 'Obciazalnosc przyjeta dla WARUNKOW KATALOGOWYCH.',
    },
  ],
  custom_name: 'wlasne',
  default_name: 'warunki_katalogowe',
  limitation_pl: 'System nie interpoluje miedzy zestawami.',
};

describe('fetchCableLayingConditions — warunki ułożenia z backendu (V12K-207)', () => {
  it('czyta listę zestawów z końcówki GET (kreator nie ma własnej listy)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => WARUNKI } as Response);
    const wynik = await fetchCableLayingConditions();
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/solver/cable-laying-conditions');
    expect(wynik.default_name).toBe('warunki_katalogowe');
    expect(wynik.sets[0].total).toBe(1.0);
    expect(wynik.limitation_pl).toContain('nie interpoluje');
  });

  it('błąd backendu → wyjątek z treścią PL (bez cichego pustego wyniku)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: 'Katalog warunków niedostępny.' }),
    } as Response);
    await expect(fetchCableLayingConditions()).rejects.toThrow(/niedostępny/);
  });
});
