/**
 * Testy API client'a audit2 (Phase 6 frontend).
 *
 * Sprawdzaja format requestow + parsowanie odpowiedzi z backendu.
 * Backend mock przez global.fetch override.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  fetchAudit2CatalogSnapshot,
  validateVtGroundingApi,
  validateDeviceWithstandApi,
  validateHostingCapacityExportApi,
} from '../audit2-api';

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
        mv_neutral_groundings: [],
      }),
    });

    const snapshot = await fetchAudit2CatalogSnapshot();
    expect(snapshot).toHaveProperty('bess_operation_modes');
    expect(snapshot).toHaveProperty('tap_changers');
    expect(snapshot).toHaveProperty('hv_fuses');
    expect(snapshot).toHaveProperty('mv_neutral_groundings');
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/catalog/audit2/snapshot');
  });

  it('validateVtGroundingApi POST z payload', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: false, message_pl: 'Wymaga U_th = 1.9' }),
    });

    const res = await validateVtGroundingApi({
      voltage_factor: 1.5,
      grounding_type: 'isolated',
    });
    expect(res.ok).toBe(false);
    expect(res.message_pl).toContain('1.9');
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

  it('runAudit2PowerFlow parsuje wynik z audit trail (Phase 37)', async () => {
    const { runAudit2PowerFlow } = await import('../audit2-api');
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        case_id: 'case-1',
        project_id: 'proj-1',
        station_id: 'st-1',
        audit2_applied: { tap_position_changes: { tr_001: { new_tap_position: 0 } } },
        solver_attempted: true,
        solver_error: 'Empty graph',
        audit2_extensions_keys: ['power_flow_extensions', 'sc_iec60909_extensions'],
        graph_branch_count: 0,
        graph_node_count: 0,
        graph_inverter_source_count: 0,
        snapshot_id_loaded: null,
      }),
    });

    const res = await runAudit2PowerFlow({
      case_id: 'case-1',
      project_id: 'proj-1',
      station_id: 'st-1',
    });
    expect(res.solver_attempted).toBe(true);
    expect(res.audit2_extensions_keys).toContain('power_flow_extensions');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/cases/audit2-power-flow',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('validateHostingCapacityExportApi parsuje wynik no_export', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        station_id: 's1',
        p_export_kw: 500,
        p_import_kw: 1000,
        p_net_export_kw: -500,
        export_to_import_ratio: 0.5,
        status: 'no_export',
        message_pl: 'Lokalna autokonsumpcja',
      }),
    });

    const res = await validateHostingCapacityExportApi({
      station_id: 's1',
      p_export_kw: 500,
      p_import_kw: 1000,
    });
    expect(res.status).toBe('no_export');
    expect(res.p_net_export_kw).toBe(-500);
  });
});
