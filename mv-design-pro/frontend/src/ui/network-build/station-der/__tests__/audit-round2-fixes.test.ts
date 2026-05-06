/**
 * Testy drugiego audytu eksperckiego (multi-expert team, 16 ról).
 *
 * Pakiety:
 *  - C: eng.5 (CT klasa), eng.6 (87T dual-core), eng.11 (anti-islanding)
 *  - D: eng.10 (BESS modes), eng.13 (tap-changers), eng.15 (export check)
 *  - F: eng.17 (HV fuses), eng.18 (I_dyn/I_th), eng.20 (VT voltage_factor)
 *  - E: hmi.3 (DER LOD), hmi.5 (voltage mismatch), hmi.11 (handleClose)
 */

import { describe, it, expect } from 'vitest';

import {
  computeDerReadinessMatrix,
  buildAggregatedReadiness,
  // Pakiet D
  BESS_OPERATION_MODE_CATALOG,
  selectBessModesForPcs,
  selectRequiredBessModesForModule,
  TAP_CHANGER_CATALOG,
  selectTapChangersForTransformer,
  getTapChanger,
  validateHostingCapacityExport,
} from '..';
import {
  // Pakiet F
  HV_FUSE_CATALOG,
  selectHvFusesForRating,
  DEVICE_WITHSTAND_CATALOG,
  validateDeviceWithstand,
  isVtVoltageFactorValidForGrounding,
} from '../protection-catalogs';
import type { StationDerConnection } from '../types';

// =============================================================================
// Helper: builduje minimalny DER do testów
// =============================================================================

function makeDer(overrides: Partial<StationDerConnection> = {}): StationDerConnection {
  const base: StationDerConnection = {
    id: 'der_test_001',
    project_id: 'proj-test',
    station_id: 'station-test',
    der_kind: 'PV',
    name: 'Test DER',
    connection_side: 'SN',
    pcc_ref: 'pcc_station-test_PCC-01',
    bay_ref: 'bay_station-test_Pole-01',
    lv_busbar_ref: null,
    transformer_ref: null,
    connection_node_ref: null,
    internal_cable_ref: null,
    voltage_level_ref: null,
    catalogs: {
      device_catalog_ref: 'pv_inv_sma_2500',
      controller_catalog_ref: null,
      battery_catalog_ref: null,
      transformer_catalog_ref: null,
      cable_catalog_ref: null,
      bay_catalog_ref: null,
      protection_catalog_ref: 'protection_der_basic',
      ct_catalog_ref: 'ct_200_5_5p20',
      vt_catalog_ref: 'vt_15kv_100v_3p',
      fault_current_data_ref: null,
      dynamic_model_ref: null,
    },
    profiles: {
      nc_rfg_profile_ref: 'ncrfg_pse',
      lvrt_curve_ref: 'lvrt_pse_b',
      hvrt_curve_ref: 'hvrt_pse_b',
      regulation_profile_ref: null,
    },
    nominal_power_kw: 2500,
    completeness: 'complete',
    readiness: {} as never,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
  };
  return { ...base, ...overrides };
}

// =============================================================================
// Pakiet C — eng.5 (CT klasa zabezpieczeniowa)
// =============================================================================

describe('eng.5 — CT klasa musi być zabezpieczeniowa (5P/10P)', () => {
  it('CT z klasą 5P20 (zabezpieczeniowa) → protection ready', () => {
    const der = makeDer({
      catalogs: {
        ...makeDer().catalogs,
        ct_catalog_ref: 'ct_200_5_5p20', // 5P20
      },
    });
    const matrix = computeDerReadinessMatrix(der);
    expect(matrix.protection).toBe('ready');
  });

  it('CT z klasą 0,5 (pomiarowa) → protection partial + bloker', () => {
    const der = makeDer({
      catalogs: {
        ...makeDer().catalogs,
        ct_catalog_ref: 'ct_50_5_05', // klasa 0,5 — pomiarowa
      },
    });
    const matrix = computeDerReadinessMatrix(der);
    expect(matrix.protection).toBe('partial');

    const aggregated = buildAggregatedReadiness(der);
    const protectionAxis = aggregated.find((a) => a.axis === 'protection');
    expect(protectionAxis?.blockers.some((b) => b.code === 'der.ct_class.invalid')).toBe(true);
  });
});

// =============================================================================
// Pakiet C — eng.6 (87T dual-core dla transformatora ≥ 1.6 MVA)
// =============================================================================

describe('eng.6 — Dual-core CT dla 87T (transformator dedykowany ≥ 1.6 MVA)', () => {
  it('Transformator dedykowany 2500 kW + CT pojedynczy → protection partial', () => {
    const der = makeDer({
      connection_side: 'dedicated_transformer',
      transformer_ref: 'tr_dedicated_test',
      nominal_power_kw: 2500, // ≥ 1600
      catalogs: {
        ...makeDer().catalogs,
        ct_catalog_ref: 'ct_200_5_5p20', // single-core protection
        transformer_catalog_ref: 'btr_pv_15_069_2500',
      },
    });
    const matrix = computeDerReadinessMatrix(der);
    expect(matrix.protection).toBe('partial');

    const aggregated = buildAggregatedReadiness(der);
    const protectionAxis = aggregated.find((a) => a.axis === 'protection');
    expect(protectionAxis?.blockers.some((b) => b.code === 'der.ct_87t_dual_core.required')).toBe(true);
  });

  it('Transformator dedykowany 2500 kW + CT dwurdzeniowy → protection ready', () => {
    const der = makeDer({
      connection_side: 'dedicated_transformer',
      transformer_ref: 'tr_dedicated_test',
      nominal_power_kw: 2500,
      catalogs: {
        ...makeDer().catalogs,
        ct_catalog_ref: 'ct_300_5_dual', // dual-core
        transformer_catalog_ref: 'btr_pv_15_069_2500',
      },
    });
    const matrix = computeDerReadinessMatrix(der);
    expect(matrix.protection).toBe('ready');
  });

  it('Mały transformator (1000 kW < 1600) NIE wymaga 87T', () => {
    const der = makeDer({
      connection_side: 'dedicated_transformer',
      transformer_ref: 'tr_dedicated_test',
      nominal_power_kw: 1000, // < 1600
      catalogs: {
        ...makeDer().catalogs,
        ct_catalog_ref: 'ct_200_5_5p20', // single-core
        transformer_catalog_ref: 'btr_pv_15_04_1000',
      },
    });
    const matrix = computeDerReadinessMatrix(der);
    expect(matrix.protection).toBe('ready');
  });
});

// =============================================================================
// Pakiet C — eng.11 (Anti-islanding dla DER po nN/ZK)
// =============================================================================

describe('eng.11 — Anti-islanding dla DER po nN/ZK/słupie/mufie', () => {
  it('PV po nN bez protection_catalog → bloker anti-islanding', () => {
    const der = makeDer({
      connection_side: 'nN',
      lv_busbar_ref: 'busbar_station-test_main',
      voltage_level_ref: 'lv_0_4kV',
      catalogs: {
        ...makeDer().catalogs,
        protection_catalog_ref: null, // BRAK protection
      },
    });
    const aggregated = buildAggregatedReadiness(der);
    const protectionAxis = aggregated.find((a) => a.axis === 'protection');
    expect(
      protectionAxis?.blockers.some((b) => b.code === 'der.anti_islanding.required'),
    ).toBe(true);
  });

  it('FW po at_zksn bez protection → bloker anti-islanding', () => {
    const der = makeDer({
      der_kind: 'FW',
      connection_side: 'at_zksn',
      bay_ref: null,
      connection_node_ref: 'node_zksn_ZK-12',
      catalogs: {
        ...makeDer().catalogs,
        protection_catalog_ref: null,
      },
    });
    const aggregated = buildAggregatedReadiness(der);
    const protectionAxis = aggregated.find((a) => a.axis === 'protection');
    expect(
      protectionAxis?.blockers.some((b) => b.code === 'der.anti_islanding.required'),
    ).toBe(true);
  });

  it('PV po SN (pole SN) NIE wymaga anti-islanding (zwarcia w polu)', () => {
    const der = makeDer({
      connection_side: 'SN',
      catalogs: {
        ...makeDer().catalogs,
        protection_catalog_ref: null,
      },
    });
    const aggregated = buildAggregatedReadiness(der);
    const protectionAxis = aggregated.find((a) => a.axis === 'protection');
    expect(
      protectionAxis?.blockers.some((b) => b.code === 'der.anti_islanding.required'),
    ).toBe(false);
  });
});

// =============================================================================
// Pakiet D — eng.10 (BESS operation modes)
// =============================================================================

describe('eng.10 — BessOperationModeCatalog', () => {
  it('katalog ma ≥9 trybów obejmujących peak shaving / arbitraż / FCR / aFRR / mFRR / Q(U) / island / self-consumption', () => {
    expect(BESS_OPERATION_MODE_CATALOG.length).toBeGreaterThanOrEqual(9);
    const codes = BESS_OPERATION_MODE_CATALOG.map((m) => m.mode_code);
    expect(codes).toContain('peak_shaving');
    expect(codes).toContain('arbitrage');
    expect(codes).toContain('fcr_n');
    expect(codes).toContain('fcr_d_up');
    expect(codes).toContain('afrr');
    expect(codes).toContain('mfrr');
    expect(codes).toContain('voltage_support');
    expect(codes).toContain('island_backup');
    expect(codes).toContain('self_consumption');
  });

  it('FCR-N ma reaction time 30s i wymaga 4Q', () => {
    const fcrN = BESS_OPERATION_MODE_CATALOG.find((m) => m.mode_code === 'fcr_n');
    expect(fcrN).toBeDefined();
    expect(fcrN!.response_time_s).toBeLessThanOrEqual(30);
    expect(fcrN!.requires_four_quadrant).toBe(true);
  });

  it('Island backup wymaga grid-forming PCS', () => {
    const island = BESS_OPERATION_MODE_CATALOG.find((m) => m.mode_code === 'island_backup');
    expect(island).toBeDefined();
    expect(island!.requires_grid_forming).toBe(true);
  });

  it('selectBessModesForPcs filtruje po 4Q + grid-forming', () => {
    const grid_forming = selectBessModesForPcs({
      fourQuadrant: true,
      gridFormingCapable: true,
    });
    expect(grid_forming.length).toBe(BESS_OPERATION_MODE_CATALOG.length);

    const grid_following_only = selectBessModesForPcs({
      fourQuadrant: true,
      gridFormingCapable: false,
    });
    expect(grid_following_only.every((m) => !m.requires_grid_forming)).toBe(true);
    // island_backup powinien być wykluczony
    expect(grid_following_only.find((m) => m.mode_code === 'island_backup')).toBeUndefined();
  });

  it('selectRequiredBessModesForModule zwraca FCR-N i voltage_support dla modułu C', () => {
    const required = selectRequiredBessModesForModule('C');
    const codes = required.map((m) => m.mode_code);
    expect(codes).toContain('fcr_n');
    expect(codes).toContain('voltage_support');
  });
});

// =============================================================================
// Pakiet D — eng.13 (Tap changers)
// =============================================================================

describe('eng.13 — TapChangerCatalog', () => {
  it('katalog zawiera OLTC dla 110/SN i DETC dla SN/nN', () => {
    expect(TAP_CHANGER_CATALOG.length).toBeGreaterThanOrEqual(4);
    const oltcs = TAP_CHANGER_CATALOG.filter((tc) => tc.type === 'oltc');
    const detcs = TAP_CHANGER_CATALOG.filter((tc) => tc.type === 'detc');
    expect(oltcs.length).toBeGreaterThan(0);
    expect(detcs.length).toBeGreaterThan(0);
  });

  it('OLTC 110/SN ma 17 lub 19 zaczepów ze step 1.25%', () => {
    const oltc110 = TAP_CHANGER_CATALOG.find(
      (tc) => tc.applicable_to.includes('transformer_110_15') && tc.type === 'oltc',
    );
    expect(oltc110).toBeDefined();
    expect([17, 19]).toContain(oltc110!.tap_count);
    expect(oltc110!.step_percent).toBe(1.25);
    expect(oltc110!.supports_avr).toBe(true);
  });

  it('DETC SN/nN nie obsługuje AVR (off-load)', () => {
    const detc = TAP_CHANGER_CATALOG.find((tc) => tc.type === 'detc');
    expect(detc).toBeDefined();
    expect(detc!.supports_avr).toBe(false);
    expect(detc!.switching_time_s).toBe(0); // off-load
  });

  it('selectTapChangersForTransformer filtruje po typie', () => {
    const for110 = selectTapChangersForTransformer('transformer_110_15');
    expect(for110.length).toBeGreaterThan(0);
    expect(for110.every((tc) => tc.applicable_to.includes('transformer_110_15'))).toBe(true);
  });

  it('getTapChanger zwraca null dla nieznanego ID', () => {
    expect(getTapChanger('tc_unknown')).toBeNull();
    const valid = getTapChanger('tc_oltc_110sn_19_125');
    expect(valid).not.toBeNull();
    expect(valid!.tap_count).toBe(19);
  });
});

// =============================================================================
// Pakiet D — eng.15 (Hosting capacity export check)
// =============================================================================

describe('eng.15 — Hosting capacity export check', () => {
  it('Lokalna autokonsumpcja (P_DER < P_load) → no_export', () => {
    const result = validateHostingCapacityExport({
      station_id: 'st1',
      p_export_kw: 500,
      p_import_kw: 1000,
    });
    expect(result.status).toBe('no_export');
    expect(result.p_net_export_kw).toBe(-500);
  });

  it('Eksport normalny (P_DER ≈ 1.2 × P_load) → normal_export', () => {
    const result = validateHostingCapacityExport({
      station_id: 'st1',
      p_export_kw: 1200,
      p_import_kw: 1000,
    });
    expect(result.status).toBe('normal_export');
  });

  it('Wysoki eksport (P_DER ≈ 2.5 × P_load) → high_export_warning', () => {
    const result = validateHostingCapacityExport({
      station_id: 'st1',
      p_export_kw: 2500,
      p_import_kw: 1000,
    });
    expect(result.status).toBe('high_export_warning');
    expect(result.message_pl.toLowerCase()).toContain('curtailment');
  });

  it('Krytyczny eksport (P_DER > 3 × P_load) → requires_ramp_down', () => {
    const result = validateHostingCapacityExport({
      station_id: 'st1',
      p_export_kw: 5000,
      p_import_kw: 1000,
    });
    expect(result.status).toBe('requires_ramp_down');
    expect(result.message_pl).toContain('ramp-down');
  });
});

// =============================================================================
// Pakiet F — eng.17 (HV fuses)
// =============================================================================

describe('eng.17 — HvFuseCatalog', () => {
  it('katalog ma ≥4 bezpieczniki SN', () => {
    expect(HV_FUSE_CATALOG.length).toBeGreaterThanOrEqual(4);
  });

  it('Wszystkie pozycje mają napięcie 6-36 kV', () => {
    for (const f of HV_FUSE_CATALOG) {
      expect(f.nominal_voltage_kv).toBeGreaterThanOrEqual(6);
      expect(f.nominal_voltage_kv).toBeLessThanOrEqual(36);
    }
  });

  it('selectHvFusesForRating filtruje po napięciu i prądzie', () => {
    const fuses_15kv = selectHvFusesForRating({
      voltageKv: 15,
      minCurrentA: 50,
    });
    expect(fuses_15kv.length).toBeGreaterThan(0);
    expect(fuses_15kv.every((f) => Math.abs(f.nominal_voltage_kv - 15) <= 1.0)).toBe(true);
    expect(fuses_15kv.every((f) => f.nominal_current_a >= 50)).toBe(true);
  });

  it('Pre-arcing time przy 6×In jest mniejszy niż total clearing time', () => {
    for (const f of HV_FUSE_CATALOG) {
      expect(f.pre_arcing_time_at_6in_ms).toBeLessThan(f.total_clearing_time_at_6in_ms);
    }
  });
});

// =============================================================================
// Pakiet F — eng.18 (I_dyn / I_th withstand)
// =============================================================================

describe('eng.18 — Device withstand validation (I_dyn / I_th)', () => {
  it('katalog ma typowe aparaty SN: wyłącznik próżniowy/SF6, szyna, rozłącznik', () => {
    expect(DEVICE_WITHSTAND_CATALOG.length).toBeGreaterThanOrEqual(5);
    const types = DEVICE_WITHSTAND_CATALOG.map((d) => d.device_type);
    expect(types).toContain('breaker_vacuum_15');
    expect(types).toContain('breaker_sf6_15');
    expect(types).toContain('busbar_15_2000');
  });

  it('Walidacja przechodzi gdy I_dyn i I_th są w granicach', () => {
    const result = validateDeviceWithstand({
      device_id: 'wstd_breaker_vacuum_15_25',
      i_peak_calculated_ka: 50, // < 63 kA limit
      i_thermal_calculated_ka: 20, // < 25 kA / 1s
      t_clearing_s: 1.0,
    });
    expect(result.ok).toBe(true);
    expect(result.i_dyn_ok).toBe(true);
    expect(result.i_th_ok).toBe(true);
    expect(result.utilization_dyn_percent).toBeCloseTo(79.4, 1);
  });

  it('Walidacja blokuje gdy I_dyn przekroczone', () => {
    const result = validateDeviceWithstand({
      device_id: 'wstd_breaker_vacuum_15_25',
      i_peak_calculated_ka: 70, // > 63 kA limit
      i_thermal_calculated_ka: 20,
      t_clearing_s: 1.0,
    });
    expect(result.ok).toBe(false);
    expect(result.i_dyn_ok).toBe(false);
    expect(result.message_pl).toContain('I_dyn');
  });

  it('Walidacja blokuje gdy I_th przekroczone (z skalowaniem czasu)', () => {
    const result = validateDeviceWithstand({
      device_id: 'wstd_breaker_vacuum_15_25', // I_th=25 kA / 1s
      i_peak_calculated_ka: 50,
      i_thermal_calculated_ka: 60, // > 25 kA przy t=1s
      t_clearing_s: 1.0,
    });
    expect(result.ok).toBe(false);
    expect(result.i_th_ok).toBe(false);
    expect(result.message_pl).toContain('I_th');
  });

  it('I_th_eff dla SF6 (rated 31,5 kA / 3s) skaluje się z czasem clearing', () => {
    // I_th_eff = 31.5 × √(3/0.5) = 31.5 × 2.45 ≈ 77 kA dla t=0.5s
    const result_500ms = validateDeviceWithstand({
      device_id: 'wstd_breaker_sf6_15_31_5',
      i_peak_calculated_ka: 50,
      i_thermal_calculated_ka: 60, // OK przy t=0.5s
      t_clearing_s: 0.5,
    });
    expect(result_500ms.i_th_ok).toBe(true);
    // Ten sam prąd przy t=3s (rated) — graniczne
    const result_3s = validateDeviceWithstand({
      device_id: 'wstd_breaker_sf6_15_31_5',
      i_peak_calculated_ka: 50,
      i_thermal_calculated_ka: 60, // > 31.5 kA przy t=3s
      t_clearing_s: 3.0,
    });
    expect(result_3s.i_th_ok).toBe(false);
  });

  it('Nieznana aparatura zwraca ok=false z polskim komunikatem', () => {
    const result = validateDeviceWithstand({
      device_id: 'wstd_unknown',
      i_peak_calculated_ka: 50,
      i_thermal_calculated_ka: 20,
      t_clearing_s: 1.0,
    });
    expect(result.ok).toBe(false);
    expect(result.message_pl).toContain('Brak aparatury w katalogu');
  });
});

// =============================================================================
// Pakiet F — eng.20 (VT voltage_factor validation per grounding)
// =============================================================================

describe('eng.20 — VT voltage_factor walidacja względem typu sieci', () => {
  it('Sieć izolowana wymaga U_th = 1.9 (8h)', () => {
    const ok_19 = isVtVoltageFactorValidForGrounding(1.9, 'isolated');
    expect(ok_19.ok).toBe(true);

    const fail_15 = isVtVoltageFactorValidForGrounding(1.5, 'isolated');
    expect(fail_15.ok).toBe(false);
    expect(fail_15.message_pl).toContain('izolowana');
    expect(fail_15.message_pl).toContain('1.9');
  });

  it('Sieć skompensowana (Petersena) wymaga U_th = 1.9 (8h)', () => {
    const ok_19 = isVtVoltageFactorValidForGrounding(1.9, 'petersen_coil');
    expect(ok_19.ok).toBe(true);

    const fail_15 = isVtVoltageFactorValidForGrounding(1.5, 'petersen_coil');
    expect(fail_15.ok).toBe(false);
    expect(fail_15.message_pl).toContain('Petersena');
  });

  it('Sieć R-grounded wymaga U_th ≥ 1.5 (30s)', () => {
    const ok_15 = isVtVoltageFactorValidForGrounding(1.5, 'resistor_grounded');
    expect(ok_15.ok).toBe(true);

    const ok_19 = isVtVoltageFactorValidForGrounding(1.9, 'resistor_grounded');
    expect(ok_19.ok).toBe(true);

    const fail_12 = isVtVoltageFactorValidForGrounding(1.2, 'resistor_grounded');
    expect(fail_12.ok).toBe(false);
  });

  it('Sieć directly-grounded akceptuje U_th = 1.2', () => {
    const ok_12 = isVtVoltageFactorValidForGrounding(1.2, 'directly_grounded');
    expect(ok_12.ok).toBe(true);
  });
});
