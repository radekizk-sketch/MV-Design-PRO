// @vitest-environment node
/**
 * Testy API client'a audit2 (Phase 6 frontend).
 *
 * Sprawdzaja format requestow + parsowanie odpowiedzi z backendu.
 * Backend mock przez global.fetch override.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  fetchAudit2CatalogSnapshot,
  getStationAudit2Config,
  validateVtGroundingApi,
  validateDeviceWithstandApi,
} from '../audit2-api';
import rekordyAudytu2 from './rekordyAudytu2.json';

const originalFetch = global.fetch;

describe('audit2 API client', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetchAudit2CatalogSnapshot pobiera /api/v1/catalog/audit2/snapshot', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        bess_operation_modes: [],
        tap_changers: [],
        hv_fuses: [],
        device_withstand: [],
        pf_curves: [],
        block_transformers: [],
      }),
    });

    const snapshot = await fetchAudit2CatalogSnapshot();
    expect(snapshot).toHaveProperty('bess_operation_modes');
    expect(snapshot).toHaveProperty('tap_changers');
    expect(snapshot).toHaveProperty('hv_fuses');
    expect(snapshot).toHaveProperty('block_transformers');
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/catalog/audit2/snapshot');
  });

  it('validateVtGroundingApi POST z payload', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => rekordyAudytu2.vt.nie_spelnia,
    });

    const res = await validateVtGroundingApi({
      voltage_factor: 1.5,
      grounding_type: 'isolated',
    });
    // Rekord K z backendu (karta WERDYKT-MIGRACJA-190) — nie flaga `ok`.
    expect(res.ocena.status_maszynowy).toBe('NIE_SPELNIA');
    expect(res.message_pl).toBe(res.ocena.wyjasnienie.zdanie_pl);
    expect(res.message_pl).toContain('1,9');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/catalog/audit2/validate-vt-grounding',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('validateDeviceWithstandApi rzuca error gdy backend zwraca 500', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(
      validateDeviceWithstandApi({
        device_id: 'wstd_breaker_vacuum_15_25',
        i_peak_calculated_ka: 50,
        i_thermal_calculated_ka: 20,
        t_clearing_s: 1.0,
      }),
    ).rejects.toThrow('500');
  });

  it('koduje referencję stacji z ukośnikami w URL konfiguracji audit2', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(
      getStationAudit2Config('project-1', 'stn/e7ac9af3834811e633a6a98f1d3d4112/station'),
    ).resolves.toBeNull();

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/projects/project-1/audit2-station-config/stn%2Fe7ac9af3834811e633a6a98f1d3d4112%2Fstation',
    );
  });
});
