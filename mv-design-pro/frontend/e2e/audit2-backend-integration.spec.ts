/**
 * E2E real-backend test dla katalogow audytu 2 (Phase 7).
 *
 * Wymaga uruchomionego backendu:
 *   poetry run uvicorn src.api.main:app --reload --port 8000
 *
 * Pokrywa scenariusze A-P (16 acceptance scenarios) zwiazane z audytem 2:
 *   A. GET /api/v1/catalog/audit2/snapshot zwraca 7 katalogow
 *   B. GET BESS modes: 9 trybow
 *   C. GET tap-changers: 4 pozycje (OLTC + DETC)
 *   D. GET HV fuses: 4 pozycje (klasy)
 *   E. GET device-withstand: 5 aparatow
 *   F. GET PF curves: 5 krzywych z parametrami
 *   G. GET block-transformers: 5 pozycji (PV/BESS/FW)
 *   H. GET MV neutral groundings: 5 typow
 *   I. POST validate-vt-grounding: petersen 1.5 -> FAIL
 *   J. POST validate-vt-grounding: petersen 1.9 -> OK
 *   K. POST validate-device-withstand: I_dyn 50 ka -> OK
 *   L. POST validate-device-withstand: I_dyn 70 kA -> FAIL
 *   M. POST validate-hosting-capacity-export: ratio 1.2 -> normal
 *   N. POST validate-hosting-capacity-export: ratio 5 -> requires_ramp_down
 *   O. POST build-station-payload: deterministic z DERs
 *   P. POST generate-proof-pack: pelen pakiet 5 typow walidacji
 */

import { test, expect, type APIRequestContext } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';

async function backendUp(request: APIRequestContext): Promise<boolean> {
  try {
    const res = await request.get(`${BACKEND_BASE}/api/v1/catalog/audit2/snapshot`);
    return res.ok();
  } catch {
    return false;
  }
}

test.describe('Audit2 Backend Integration (A-P)', () => {
  test.beforeAll(async ({ request }) => {
    const up = await backendUp(request);
    test.skip(!up, `Backend nie uruchomiony pod ${BACKEND_BASE}.`);
  });

  test('A. snapshot zwraca 7 katalogow', async ({ request }) => {
    const res = await request.get(`${BACKEND_BASE}/api/v1/catalog/audit2/snapshot`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('bess_operation_modes');
    expect(body).toHaveProperty('tap_changers');
    expect(body).toHaveProperty('hv_fuses');
    expect(body).toHaveProperty('device_withstand');
    expect(body).toHaveProperty('pf_curves');
    expect(body).toHaveProperty('block_transformers');
    expect(body).toHaveProperty('mv_neutral_groundings');
  });

  test('B. BESS modes: minimum 9 trybow', async ({ request }) => {
    const res = await request.get(`${BACKEND_BASE}/api/v1/catalog/audit2/bess-operation-modes`);
    const body = await res.json();
    expect(body.length).toBeGreaterThanOrEqual(9);
    const codes = body.map((m: { mode_code: string }) => m.mode_code);
    expect(codes).toContain('fcr_n');
    expect(codes).toContain('voltage_support');
    expect(codes).toContain('island_backup');
  });

  test('C. tap-changers: OLTC + DETC obecne', async ({ request }) => {
    const res = await request.get(`${BACKEND_BASE}/api/v1/catalog/audit2/tap-changers`);
    const body = await res.json();
    expect(body.length).toBeGreaterThanOrEqual(4);
    const types = new Set(body.map((tc: { type: string }) => tc.type));
    expect(types.has('oltc')).toBeTruthy();
    expect(types.has('detc')).toBeTruthy();
  });

  test('D. HV fuses: 3 klasy obecne', async ({ request }) => {
    const res = await request.get(`${BACKEND_BASE}/api/v1/catalog/audit2/hv-fuses`);
    const body = await res.json();
    const classes = new Set(body.map((f: { class: string }) => f.class));
    expect(classes.has('full_range')).toBeTruthy();
    expect(classes.has('general_purpose')).toBeTruthy();
    expect(classes.has('back_up')).toBeTruthy();
  });

  test('E. device-withstand: aparatura SN obecna', async ({ request }) => {
    const res = await request.get(`${BACKEND_BASE}/api/v1/catalog/audit2/device-withstand`);
    const body = await res.json();
    const types = new Set(body.map((d: { device_type: string }) => d.device_type));
    expect(types.has('breaker_vacuum_15')).toBeTruthy();
    expect(types.has('busbar_15_2000')).toBeTruthy();
  });

  test('F. PF curves: PSE B/C/D z roznymi droopami', async ({ request }) => {
    const res = await request.get(`${BACKEND_BASE}/api/v1/catalog/audit2/pf-curves`);
    const body = await res.json();
    const pseB = body.find((c: { operator_code: string; module_type: string }) =>
      c.operator_code === 'PSE' && c.module_type === 'B',
    );
    const pseD = body.find((c: { operator_code: string; module_type: string }) =>
      c.operator_code === 'PSE' && c.module_type === 'D',
    );
    expect(pseB.droop_percent).toBe(5.0);
    expect(pseD.droop_percent).toBe(3.0);
  });

  test('G. block-transformers: SN/SN dla turbinowni FW', async ({ request }) => {
    const res = await request.get(`${BACKEND_BASE}/api/v1/catalog/audit2/block-transformers`);
    const body = await res.json();
    const mvToMv = body.filter((b: { is_mv_to_mv: boolean }) => b.is_mv_to_mv);
    expect(mvToMv.length).toBeGreaterThan(0);
    expect(mvToMv[0].applicable_der_kinds).toContain('FW');
  });

  test('H. MV neutral groundings: 4 typy', async ({ request }) => {
    const res = await request.get(`${BACKEND_BASE}/api/v1/catalog/audit2/mv-neutral-groundings`);
    const body = await res.json();
    const types = new Set(body.map((g: { grounding_type: string }) => g.grounding_type));
    expect(types.has('isolated')).toBeTruthy();
    expect(types.has('petersen_coil')).toBeTruthy();
    expect(types.has('resistor_grounded')).toBeTruthy();
    expect(types.has('directly_grounded')).toBeTruthy();
  });

  test('I. validate-vt-grounding petersen 1.5 -> FAIL', async ({ request }) => {
    const res = await request.post(
      `${BACKEND_BASE}/api/v1/catalog/audit2/validate-vt-grounding`,
      { data: { voltage_factor: 1.5, grounding_type: 'petersen_coil' } },
    );
    const body = await res.json();
    expect(body.ok).toBeFalsy();
  });

  test('J. validate-vt-grounding petersen 1.9 -> OK', async ({ request }) => {
    const res = await request.post(
      `${BACKEND_BASE}/api/v1/catalog/audit2/validate-vt-grounding`,
      { data: { voltage_factor: 1.9, grounding_type: 'petersen_coil' } },
    );
    const body = await res.json();
    expect(body.ok).toBeTruthy();
  });

  test('K. validate-device-withstand 50 kA peak -> OK', async ({ request }) => {
    const res = await request.post(
      `${BACKEND_BASE}/api/v1/catalog/audit2/validate-device-withstand`,
      {
        data: {
          device_id: 'wstd_breaker_vacuum_15_25',
          i_peak_calculated_ka: 50,
          i_thermal_calculated_ka: 20,
          t_clearing_s: 1.0,
        },
      },
    );
    const body = await res.json();
    expect(body.ok).toBeTruthy();
    expect(body.i_dyn_ok).toBeTruthy();
    expect(body.i_th_ok).toBeTruthy();
  });

  test('L. validate-device-withstand 70 kA peak -> FAIL', async ({ request }) => {
    const res = await request.post(
      `${BACKEND_BASE}/api/v1/catalog/audit2/validate-device-withstand`,
      {
        data: {
          device_id: 'wstd_breaker_vacuum_15_25',
          i_peak_calculated_ka: 70,
          i_thermal_calculated_ka: 20,
          t_clearing_s: 1.0,
        },
      },
    );
    const body = await res.json();
    expect(body.ok).toBeFalsy();
    expect(body.i_dyn_ok).toBeFalsy();
  });

  test('M. validate-hosting-capacity ratio 1.2 -> normal_export', async ({ request }) => {
    const res = await request.post(
      `${BACKEND_BASE}/api/v1/catalog/audit2/validate-hosting-capacity-export`,
      { data: { station_id: 's1', p_export_kw: 1200, p_import_kw: 1000 } },
    );
    const body = await res.json();
    expect(body.status).toBe('normal_export');
  });

  test('N. validate-hosting-capacity ratio 5 -> requires_ramp_down', async ({ request }) => {
    const res = await request.post(
      `${BACKEND_BASE}/api/v1/catalog/audit2/validate-hosting-capacity-export`,
      { data: { station_id: 's2', p_export_kw: 5000, p_import_kw: 1000 } },
    );
    const body = await res.json();
    expect(body.status).toBe('requires_ramp_down');
    expect(body.message_pl).toContain('ramp-down');
  });

  test('O. build-station-payload deterministic z DERs', async ({ request }) => {
    const payload = {
      station_id: 'station_e2e_001',
      mv_neutral_grounding_ref: 'mng_petersen',
      tap_changer_refs: ['tc_oltc_110sn_19_125'],
      der_specs: [
        {
          der_id: 'der_pv_001',
          der_kind: 'PV',
          block_transformer_catalog_ref: 'btr_pv_15_069_2500',
          pf_curve_ref: 'pf_pse_b',
        },
        {
          der_id: 'der_bess_001',
          der_kind: 'BESS',
          bess_operation_mode_refs: ['mode_fcr_n', 'mode_voltage_support'],
        },
      ],
    };
    const res1 = await request.post(
      `${BACKEND_BASE}/api/v1/catalog/audit2/build-station-payload`,
      { data: payload },
    );
    const res2 = await request.post(
      `${BACKEND_BASE}/api/v1/catalog/audit2/build-station-payload`,
      { data: payload },
    );
    const body1 = await res1.json();
    const body2 = await res2.json();
    expect(body1).toEqual(body2);
    expect(body1.payload.der_payloads.length).toBe(2);
    expect(body1.solver_extensions.sc_iec60909_extensions).toBeDefined();
    expect(body1.solver_extensions.power_flow_extensions).toBeDefined();
  });

  test('P. generate-proof-pack pelny pakiet z 5 walidacji', async ({ request }) => {
    const payload = {
      station_id: 'station_e2e_002',
      bess_modes_specs: [
        {
          der_id: 'der_001',
          pcs_four_quadrant: true,
          pcs_grid_forming: false,
          nc_rfg_module: 'B',
          selected_mode_refs: ['mode_voltage_support'],
        },
      ],
      tap_changer_specs: [
        {
          transformer_id: 'tr_001',
          transformer_type: 'transformer_110_15',
          tap_changer_ref: 'tc_oltc_110sn_19_125',
          requires_avr: true,
        },
      ],
      hosting_capacity_specs: [
        { station_id: 'station_e2e_002', p_export_kw: 1200, p_import_kw: 1000 },
      ],
      device_withstand_specs: [
        {
          device_id: 'wstd_breaker_vacuum_15_25',
          i_peak_calculated_ka: 50,
          i_thermal_calculated_ka: 20,
          t_clearing_s: 1.0,
        },
      ],
      vt_grounding_specs: [
        {
          bay_designation: 'POLE-01',
          vt_voltage_factor: 1.9,
          grounding_type: 'petersen_coil',
        },
      ],
      generated_at_iso: '2026-04-01T00:00:00Z',
    };
    const res = await request.post(
      `${BACKEND_BASE}/api/v1/catalog/audit2/generate-proof-pack`,
      { data: payload },
    );
    const body = await res.json();
    expect(body.station_id).toBe('station_e2e_002');
    expect(body.proof_count).toBe(5);
    expect(body.all_pass).toBeTruthy();
  });
});
