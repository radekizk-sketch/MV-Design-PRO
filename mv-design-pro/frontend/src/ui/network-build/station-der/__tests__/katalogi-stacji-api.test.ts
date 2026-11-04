// @vitest-environment node
/**
 * Klient katalogów konfiguracji stacji i pakietu rozszerzeń stacji — format żądań
 * i adresy (karta JEDNA-SCIEZKA-EDYCJI: zasoby stacji czytane z modelu pod
 * `/api/v1/projects/{id}/stations/...`, katalogi pod `/api/v1/catalog/konfiguracja-stacji`).
 * Backend zastąpiony przez `global.fetch`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import * as api from '../katalogi-stacji-api';
import {
  fetchKatalogiStacjiSnapshot,
  fetchUziemienieSnStacji,
  generatePakietRozszerzenProjektu,
  generateRaportRozszerzen,
  validateVtGroundingApi,
} from '../katalogi-stacji-api';

const originalFetch = global.fetch;

function odpowiedz(json: unknown): { ok: true; json: () => Promise<unknown> } {
  return { ok: true, json: async () => json };
}

describe('klient katalogów stacji i pakietu rozszerzeń', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetchKatalogiStacjiSnapshot pobiera /api/v1/catalog/konfiguracja-stacji/snapshot', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      odpowiedz({
        bess_operation_modes: [],
        tap_changers: [],
        hv_fuses: [],
        pf_curves: [],
        block_transformers: [],
      }),
    );

    const snapshot = await fetchKatalogiStacjiSnapshot();
    expect(Object.keys(snapshot).sort()).toEqual([
      'bess_operation_modes',
      'block_transformers',
      'hv_fuses',
      'pf_curves',
      'tap_changers',
    ]);
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/catalog/konfiguracja-stacji/snapshot');
  });

  it('validateVtGroundingApi POST z payload', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      odpowiedz({ ok: false, message_pl: 'Wymaga U_th = 1.9' }),
    );

    const res = await validateVtGroundingApi({ voltage_factor: 1.5, grounding_type: 'isolated' });
    expect(res.ok).toBe(false);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/catalog/konfiguracja-stacji/validate-vt-grounding',
      expect.objectContaining({ method: 'POST', headers: { 'Content-Type': 'application/json' } }),
    );
  });

  it('błąd backendu jest wyjątkiem z kodem odpowiedzi, nie cichym pustym wynikiem', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });
    await expect(generatePakietRozszerzenProjektu('p-1')).rejects.toThrow('500');
  });

  it('pakiet i uziemienie SN pól czytają model pod adresem stacji projektu (ukośniki kodowane)', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(odpowiedz({ project_id: 'p-1', per_station: [] }))
      .mockResolvedValueOnce(odpowiedz({ station_id: 'stn/1', sekcje: [], pola: [] }));

    await generatePakietRozszerzenProjektu('p-1');
    await fetchUziemienieSnStacji({ projectId: 'p-1', stationId: 'stn/e7ac/station', pola: ['Pole 01'] });

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      '/api/v1/projects/p-1/stations/_validate-all',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      '/api/v1/projects/p-1/stations/stn%2Fe7ac%2Fstation/_uziemienie-sn',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ pola: ['Pole 01'] }) }),
    );
  });

  it('raport z pakietu backendu idzie do generate-report katalogów stacji', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(odpowiedz({ text_pl: 'Raport' }));
    const pakiet = {
      station_id: 'stn/1',
      station_nazwa: 'Stacja',
      all_pass: true,
      fail_count: 0,
      proof_count: 0,
      proofs: [],
      braki_danych: [],
      generated_at: '1970-01-01T00:00:00Z',
    };
    await generateRaportRozszerzen({
      project_name: 'P',
      station_id: 'stn/1',
      station_name: 'Stacja',
      proof_pack: pakiet,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/catalog/konfiguracja-stacji/generate-report',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('klient nie ma już zapisu konfiguracji stacji obok modelu (jedna droga edycji)', () => {
    const nazwy = Object.keys(api);
    for (const skasowana of [
      'validateDeviceWithstandApi',
      'fetchDeviceWithstandCatalog',
      'validateHostingCapacityExportApi',
    ]) {
      expect(nazwy).not.toContain(skasowana);
    }
  });
});
