/**
 * Testy napraw audytu eksperckiego (3 perspektywy: profesor + projektant SN +
 * specjalista zabezpieczeń). Pokrywa Naprawy A-D.
 */

import { describe, it, expect } from 'vitest';

import {
  // Naprawa A
  DER_FAULT_CURRENT_DATA_CATALOG,
  DER_DYNAMIC_MODEL_CATALOG,
  NC_RFG_PROFILE_CATALOG,
  computeKappa,
  getFaultCurrentDataForDevice,
  getDynamicModelForDevice,
  validateMinSkAtPcc,
  // Naprawa B
  CONNECTION_VARIANT_CATALOG,
  MV_NEUTRAL_GROUNDING_CATALOG,
  getMvNeutralGrounding,
  // Naprawa C
  PROTECTION_FUNCTION_CATALOG,
  SPZ_CATALOG,
  SZR_CATALOG,
  selectRequiredProtectionFunctionsForDer,
  selectRequiredProtectionFunctionsForGrounding,
  getProtectionFunctionByAnsiCode,
  selectSpzCompatibleWithDer,
  isCtClassValidForProtection,
  isCtClassValidForMetering,
  // Naprawa D
  validateHostingCapacity,
  computeDerReadinessMatrix,
  EMPTY_DER_CATALOGS,
  EMPTY_DER_PROFILES,
  EMPTY_DER_READINESS,
  type StationDerConnection,
} from '..';

const FROZEN_NOW = '2026-05-06T10:00:00Z';

function makeDer(
  overrides: Partial<StationDerConnection> = {},
): StationDerConnection {
  return {
    id: 'der_x',
    project_id: 'p',
    station_id: 's',
    der_kind: 'PV',
    name: 'PV X',
    connection_side: 'SN',
    bus_przylaczenia_ref: 'pcc_x',
    bay_ref: 'bay_x',
    transformer_ref: null,
    lv_busbar_ref: null,
    connection_node_ref: null,
    internal_cable_ref: null,
    voltage_level_ref: null,
    catalogs: { ...EMPTY_DER_CATALOGS, device_catalog_ref: 'pv_inv_sma_2500' },
    profiles: { ...EMPTY_DER_PROFILES, nc_rfg_profile_ref: 'ncrfg_pse' },
    nominal_power_kw: 2500,
    completeness: 'complete',
    readiness: { ...EMPTY_DER_READINESS },
    created_at: FROZEN_NOW,
    updated_at: FROZEN_NOW,
    ...overrides,
  };
}

// =============================================================================
// Naprawa A — profesor energetyki
// =============================================================================

describe('Naprawa A.1 — składowe symetryczne (R₀/X₀/Z₀Z₁)', () => {
  it('katalog DER fault current ma ≥8 pozycji obejmujących PV/BESS/FW', () => {
    expect(DER_FAULT_CURRENT_DATA_CATALOG.length).toBeGreaterThanOrEqual(8);
  });

  it('każda pozycja ma R₁/X₁, R₂/X₂, R₀/X₀ + Z₀/Z₁ ratio + kappa-able rx_ratio', () => {
    for (const item of DER_FAULT_CURRENT_DATA_CATALOG) {
      expect(item.r1_pu).toBeGreaterThan(0);
      expect(item.x1_pu).toBeGreaterThan(0);
      expect(item.r2_pu).toBeGreaterThan(0);
      expect(item.x2_pu).toBeGreaterThan(0);
      expect(item.r0_pu).toBeGreaterThan(0);
      expect(item.x0_pu).toBeGreaterThan(0);
      expect(item.z0_z1_ratio).toBeGreaterThan(1);
      expect(item.rx_ratio_at_terminal).toBeGreaterThan(0);
      expect(['voltage_source', 'current_source_limited']).toContain(item.contribution_model);
    }
  });

  it('getFaultCurrentDataForDevice mapuje PV/BESS/FW device → fault data', () => {
    expect(getFaultCurrentDataForDevice('pv_inv_sma_2500')?.id).toContain('fcd_pv_inv_sma');
    expect(getFaultCurrentDataForDevice('bess_pcs_abb_500')?.id).toContain('fcd_bess_pcs_abb');
    expect(getFaultCurrentDataForDevice('wt_siemens_swt_2300_113')?.contribution_model).toBe('voltage_source');
    expect(getFaultCurrentDataForDevice('unknown')).toBeNull();
  });

  it('DFIG ma transient_short_circuit_pu=5 (4-6×In)', () => {
    const item = getFaultCurrentDataForDevice('wt_siemens_swt_2300_113');
    // (DFIG ma voltage_source contribution model — sprawdzane wcześniej)
    expect(item?.contribution_model).toBe('voltage_source');
  });
});

describe('Naprawa A.2 — c_max/c_min IEC 60909', () => {
  it('każdy NC RfG profil ma c_max=1.10, c_min=0.95 (IEC 60909-0 Tab.1)', () => {
    for (const profile of NC_RFG_PROFILE_CATALOG) {
      expect(profile.c_max).toBe(1.10);
      expect(profile.c_min).toBe(0.95);
    }
  });

  it('NC RfG profile mają sk_min_to_p_ratio_by_module dla A/B/C/D', () => {
    for (const profile of NC_RFG_PROFILE_CATALOG) {
      expect(profile.sk_min_to_p_ratio_by_module.A).toBeNull();
      expect(profile.sk_min_to_p_ratio_by_module.B).toBe(5);
      expect(profile.sk_min_to_p_ratio_by_module.C).toBe(10);
      expect(profile.sk_min_to_p_ratio_by_module.D).toBe(25);
    }
  });
});

describe('Naprawa A.3 — kappa (peak SC factor IEC 60909)', () => {
  it('computeKappa(0) = 2.0 (R/X = 0, najsilniejszy peak)', () => {
    expect(computeKappa(0)).toBeCloseTo(2.0, 5);
  });

  it('computeKappa(0.3) ≈ 1.42 (typowy SN)', () => {
    const k = computeKappa(0.3);
    expect(k).toBeGreaterThan(1.4);
    expect(k).toBeLessThan(1.5);
  });

  it('computeKappa(∞) → 1.02 (czysta rezystancja)', () => {
    const k = computeKappa(100);
    expect(k).toBeCloseTo(1.02, 2);
  });
});

describe('Naprawa A.4 — fault_current_capability_pu w BESS i FW', () => {
  it('BESS PCS ma fault_current_capability_pu', async () => {
    const { BESS_PCS_CATALOG } = await import('../catalogs');
    for (const pcs of BESS_PCS_CATALOG) {
      expect(pcs.fault_current_capability_pu).toBeGreaterThan(1.0);
      expect(pcs.fault_current_capability_pu).toBeLessThan(1.5);
    }
  });

  it('Wind turbines mają fault_current_capability_pu', async () => {
    const { WIND_TURBINE_CATALOG } = await import('../catalogs');
    for (const wt of WIND_TURBINE_CATALOG) {
      expect(wt.fault_current_capability_pu).toBeGreaterThan(1.0);
    }
  });

  it('DFIG (Siemens SWT) ma transient_short_circuit_pu', async () => {
    const { WIND_TURBINE_CATALOG } = await import('../catalogs');
    const dfig = WIND_TURBINE_CATALOG.find((wt) => wt.generator_type === 'DFIG');
    expect(dfig?.transient_short_circuit_pu).toBeGreaterThanOrEqual(4);
  });
});

describe('Naprawa A.5 — modele dynamiczne DER', () => {
  it('katalog dynamicznych modeli ma ≥5 pozycji obejmujących PV/BESS/FW', () => {
    expect(DER_DYNAMIC_MODEL_CATALOG.length).toBeGreaterThanOrEqual(5);
    const types = new Set(DER_DYNAMIC_MODEL_CATALOG.map((m) => m.model_type));
    expect(types.has('pv_grid_following')).toBe(true);
    expect(types.has('bess_grid_forming')).toBe(true);
    expect(types.has('wt_pmsg_full_converter')).toBe(true);
    expect(types.has('wt_dfig')).toBe(true);
  });

  it('getDynamicModelForDevice mapuje device → model', () => {
    expect(getDynamicModelForDevice('pv_inv_sma_2500')?.model_type).toBe('pv_grid_following');
    expect(getDynamicModelForDevice('bess_pcs_sma_2200')?.model_type).toBe('bess_grid_forming');
    expect(getDynamicModelForDevice('wt_siemens_swt_2300_113')?.model_type).toBe('wt_dfig');
  });

  it('każdy model ma response_time_ms + k_factor_iq + iq_max + p_recovery', () => {
    for (const m of DER_DYNAMIC_MODEL_CATALOG) {
      expect(m.response_time_ms).toBeGreaterThan(0);
      expect(m.k_factor_iq_over_du).toBeGreaterThan(0);
      expect(m.iq_max_during_fault_pu).toBeGreaterThan(0);
      expect(m.p_recovery_rate_pu_per_s).toBeGreaterThan(0);
    }
  });
});

describe('Naprawa B.4 — validateMinSkAtPcc (NC RfG Art.17)', () => {
  it('moduł A nie ma wymogu Sk', () => {
    const result = validateMinSkAtPcc({
      profileRef: 'ncrfg_pse',
      moduleType: 'A',
      p_der_mw: 0.5,
      available_sk_mva: 5,
    });
    expect(result.required_sk_mva).toBeNull();
    expect(result.ok).toBe(true);
  });

  it('moduł B wymaga Sk ≥ 5×P', () => {
    const result = validateMinSkAtPcc({
      profileRef: 'ncrfg_pse',
      moduleType: 'B',
      p_der_mw: 1.0,
      available_sk_mva: 5,
    });
    expect(result.required_sk_mva).toBe(5);
    expect(result.ok).toBe(true);
  });

  it('moduł D wymaga Sk ≥ 25×P (zwraca exceeded gdy Sk < required)', () => {
    const result = validateMinSkAtPcc({
      profileRef: 'ncrfg_pse',
      moduleType: 'D',
      p_der_mw: 50.0,
      available_sk_mva: 1000, // wymagane = 25×50 = 1250 MVA
    });
    expect(result.required_sk_mva).toBe(1250);
    expect(result.ok).toBe(false);
  });
});

// =============================================================================
// Naprawa B — projektant SN
// =============================================================================

describe('Naprawa B.1 — uziemienie neutralne (4 typy)', () => {
  it('katalog ma 5 typów uziemienia (izolowana, Petersen, R7Ω, R40Ω, bezp.)', () => {
    expect(MV_NEUTRAL_GROUNDING_CATALOG.length).toBe(5);
    const types = MV_NEUTRAL_GROUNDING_CATALOG.map((g) => g.grounding_type);
    expect(types).toContain('isolated');
    expect(types).toContain('petersen_coil');
    expect(types).toContain('resistor_grounded');
    expect(types).toContain('directly_grounded');
  });

  it('Resistor 7Ω ma R=7 (parametr definiujący wariant)', () => {
    const r = getMvNeutralGrounding('mng_resistor_low');
    expect(r?.r_ohm).toBe(7);
  });

  // ===========================================================================
  // KARTA K-O — PIN KLASY: katalog uziemienia nie zgaduje prądu ani praktyki
  // ===========================================================================
  //
  // Trzy poprzednie piny sprawdzały „typowy zakres I_k1" (Petersen < 20 A,
  // rezystor > 200 A, bezpośrednie > 1 kA) — czyli utrwalały liczby, które nie
  // pochodziły z żadnego źródła i były pokazywane użytkownikowi obok wyniku
  // solvera SC1F. Pin poniżej pilnuje, żeby nie wróciły.
  it('KLASA: żadna pozycja nie niesie zgadywanego I_k1 ani cudzej praktyki', () => {
    expect(MV_NEUTRAL_GROUNDING_CATALOG.length).toBeGreaterThan(0);
    for (const g of MV_NEUTRAL_GROUNDING_CATALOG) {
      expect(g).not.toHaveProperty('typical_ik1_a_range');
      expect(g).not.toHaveProperty('typical_operators_pl');
    }
  });

  it('KLASA: opisy wariantów nie przypisują praktyki imiennym operatorom', () => {
    const operatorzy = ['PGE', 'Tauron', 'Energa', 'Enea', 'PSE'];
    for (const g of MV_NEUTRAL_GROUNDING_CATALOG) {
      for (const o of operatorzy) {
        expect(
          g.description_pl.includes(o),
          `Wariant ${g.id} przypisuje praktyke operatorowi "${o}" bez cytatu z IRiESD.`,
        ).toBe(false);
      }
    }
  });
});

describe('Naprawa B.2 — connection variants (rozszerzony)', () => {
  it('katalog wariantów ma 6 pozycji (3 stacjonarne + 3 pozastacjonarne)', () => {
    expect(CONNECTION_VARIANT_CATALOG.length).toBe(6);
    const sides = CONNECTION_VARIANT_CATALOG.map((v) => v.side);
    expect(sides).toContain('at_zksn');
    expect(sides).toContain('at_branch_pole');
    expect(sides).toContain('at_cable_joint');
  });

  it('ZK SN wymaga zabezpieczenia kierunkowego (67/67N)', () => {
    const zksn = CONNECTION_VARIANT_CATALOG.find((v) => v.side === 'at_zksn');
    expect(zksn?.required_objects_pl.some((o) => o.includes('kierunkow'))).toBe(true);
  });

  it('Słup rozgałęźny dostępny dla PV i FW (nie BESS — brak energii)', () => {
    const pole = CONNECTION_VARIANT_CATALOG.find((v) => v.side === 'at_branch_pole');
    expect(pole?.applicable_der_kinds).toContain('PV');
    expect(pole?.applicable_der_kinds).toContain('FW');
    expect(pole?.applicable_der_kinds).not.toContain('BESS');
  });
});

// =============================================================================
// Naprawa C — specjalista zabezpieczeń
// =============================================================================

describe('Naprawa C.1 — ANSI function catalog', () => {
  it('katalog ma ≥17 funkcji ANSI (50/51/50N/51N/67/67N/87T/27/59/81U/81O/79/86/25/32/46/49)', () => {
    expect(PROTECTION_FUNCTION_CATALOG.length).toBeGreaterThanOrEqual(17);
    const codes = PROTECTION_FUNCTION_CATALOG.map((f) => f.ansi_code);
    for (const required of ['50', '51', '50N', '51N', '67', '67N', '87T', '27', '59', '81U', '81O', '79', '86', '25', '32', '46', '49']) {
      expect(codes).toContain(required);
    }
  });

  it('selectRequiredProtectionFunctionsForDer zwraca 27/59/81U/81O + nadprądowe', () => {
    const required = selectRequiredProtectionFunctionsForDer();
    const codes = required.map((f) => f.ansi_code);
    expect(codes).toContain('27');
    expect(codes).toContain('59');
    expect(codes).toContain('81U');
    expect(codes).toContain('81O');
    expect(codes).toContain('51');
    expect(codes).toContain('67'); // kierunkowe wymagane dla DER
  });

  it('selectRequiredProtectionFunctionsForGrounding(petersen) → 67N (Naprawa C.2)', () => {
    const required = selectRequiredProtectionFunctionsForGrounding('petersen_coil');
    const codes = required.map((f) => f.ansi_code);
    expect(codes).toContain('67N');
  });

  it('selectRequiredProtectionFunctionsForGrounding(resistor) → 50N/51N', () => {
    const required = selectRequiredProtectionFunctionsForGrounding('resistor_grounded');
    const codes = required.map((f) => f.ansi_code);
    expect(codes).toContain('50N');
    expect(codes).toContain('51N');
  });

  it('getProtectionFunctionByAnsiCode mapuje code → polish description', () => {
    expect(getProtectionFunctionByAnsiCode('87T')?.label_pl).toContain('różnicowe');
    expect(getProtectionFunctionByAnsiCode('79')?.label_pl).toContain('SPZ');
    expect(getProtectionFunctionByAnsiCode('25')?.label_pl).toContain('Synchrocheck');
  });
});

describe('Naprawa C.6 — klasy CT (reguly normowe, bez katalogu syntetycznego)', () => {
  // V12K-239: `CT_CATALOG` (5 wpisow syntetycznych) USUNIETY — po wpieciu klasy jako
  // DANEJ nie mial juz zadnego konsumenta produkcyjnego, a jego pokrycie identyfikatorow
  // z katalogiem realnym (12 typow) bylo ZEROWE, wiec test jego rozmiaru mierzyl atrape.
  // `VT_CATALOG` USUNIETY (V12K-257): ten sam defekt co CT — identyfikatory syntetyczne
  // wpisywane do modelu przez picker. Dlug zapisany wtedy osobno zostal splacony:
  // picker bierze typy z katalogu backendu, a werdykt zgodnosci z jego reguly.
  // Tutaj zostaja reguly klasowe, ktore CZYTA regula gotowosci.
  it('isCtClassValidForProtection rozpoznaje 5P/10P', () => {
    expect(isCtClassValidForProtection('5P10')).toBe(true);
    expect(isCtClassValidForProtection('10P20')).toBe(true);
    expect(isCtClassValidForProtection('0.5')).toBe(false);
    expect(isCtClassValidForProtection('1.0')).toBe(false);
  });

  it('isCtClassValidForMetering rozpoznaje 0.2/0.5/1.0', () => {
    expect(isCtClassValidForMetering('0.5')).toBe(true);
    expect(isCtClassValidForMetering('0.2')).toBe(true);
    expect(isCtClassValidForMetering('5P10')).toBe(false);
  });

  it('front NIE MA wlasnego katalogu VT ani wlasnej reguly wspolczynnika (V12K-257)', async () => {
    // Te dwa testy sprawdzaly wczesniej zawartosc `VT_CATALOG` i `selectVtForVoltage`
    // — czyli istnienie ROWNOLEGLEGO katalogu czterech typow, ktorych identyfikatory
    // nie istnialy w katalogu backendu, oraz TRZECIEJ kopii reguly IEC 61869-3
    // (z progami zanizonymi tak, jak poprawil je V12K-256). Zapisany wybor byl
    // referencja donikad, a werdykt móglby przeczyc backendowi i pakietowi dowodowemu.
    //
    // Intencja testu zostaje ta sama — pilnowac zrodla danych o przekladnikach —
    // ale odwrocona: front ma ich NIE MIEC. Typy pochodza z `/api/catalog/vt-types`,
    // werdykt z `/api/v1/catalog/audit2/validate-vt-grounding`.
    const modul = (await import('../protection-catalogs')) as Record<string, unknown>;
    expect(modul.VT_CATALOG).toBeUndefined();
    expect(modul.selectVtForVoltage).toBeUndefined();
    expect(modul.isVtVoltageFactorValidForGrounding).toBeUndefined();
  });

  it('rozlacznosc: zadna klasa nie jest jednoczesnie zabezpieczeniowa i pomiarowa', () => {
    // Kontrola odwrotna do obu regul naraz — bez niej mozna by je „naprawic" tak, ze
    // obie zwracaja true i os zabezpieczen przechodzi na przekladniku pomiarowym.
    for (const klasa of ['0.2', '0.5', '1.0', '5P10', '5P20', '10P10', '10P20'] as const) {
      expect(isCtClassValidForProtection(klasa) && isCtClassValidForMetering(klasa)).toBe(false);
    }
  });
});

describe('Naprawa C.3 — SPZ catalog', () => {
  it('SPZ_CATALOG ma 1-cykl, 2-cykle, 3-cykle', () => {
    expect(SPZ_CATALOG.length).toBe(3);
    const cycles = SPZ_CATALOG.map((s) => s.cycles);
    expect(cycles).toEqual(expect.arrayContaining([1, 2, 3]));
  });

  it('selectSpzCompatibleWithDer pomija SPZ 3-cykle (typowo niekompatybilny)', () => {
    const compatible = selectSpzCompatibleWithDer();
    expect(compatible.every((s) => s.compatible_with_der)).toBe(true);
    expect(compatible.find((s) => s.cycles === 3)).toBeUndefined();
  });

  it('SPZ wymaga synchrocheck dla wielocyklowych', () => {
    const multi = SPZ_CATALOG.filter((s) => s.cycles > 1);
    expect(multi.every((s) => s.requires_synchrocheck)).toBe(true);
  });
});

describe('Naprawa C.4 — SZR catalog', () => {
  it('SZR_CATALOG ma 3 tryby (fast/synchrocheck/live)', () => {
    expect(SZR_CATALOG.length).toBe(3);
    const modes = SZR_CATALOG.map((s) => s.mode);
    expect(modes).toContain('fast_break_before_make');
    expect(modes).toContain('slow_with_synchrocheck');
    expect(modes).toContain('live_transfer');
  });

  it('każdy SZR wymaga ≥2 transformatorów', () => {
    for (const szr of SZR_CATALOG) {
      expect(szr.requires_min_transformers).toBeGreaterThanOrEqual(2);
    }
  });
});

// =============================================================================
// Naprawa D — readiness aware grounding + hosting capacity
// =============================================================================

describe('Naprawa D — readiness z grounding-aware (uwzględnia A.1, A.5)', () => {
  it('SC1F → "partial" gdy brak fault_current_data (A.1)', () => {
    const matrix = computeDerReadinessMatrix(makeDer());
    expect(matrix.sc_3f).toBe('ready'); // SC3F nie wymaga Z₀
    expect(matrix.sc_1f).toBe('partial'); // SC1F wymaga Z₀
    expect(matrix.sc_2fg).toBe('partial'); // SC2FG też wymaga Z₀
  });

  it('SC1F → "ready" gdy fault_current_data jest podany', () => {
    const matrix = computeDerReadinessMatrix(
      makeDer({
        catalogs: {
          ...EMPTY_DER_CATALOGS,
          device_catalog_ref: 'pv_inv_sma_2500',
          fault_current_data_ref: 'fcd_pv_inv_sma_2500',
        },
      }),
    );
    expect(matrix.sc_1f).toBe('ready');
    expect(matrix.sc_2fg).toBe('ready');
  });

  it('FRT/HVRT → "partial" gdy brak dynamic_model_ref (A.5)', () => {
    const matrix = computeDerReadinessMatrix(
      makeDer({
        profiles: {
          ...EMPTY_DER_PROFILES,
          nc_rfg_profile_ref: 'ncrfg_pse',
          lvrt_curve_ref: 'lvrt_pse_b',
          hvrt_curve_ref: 'hvrt_pse_b',
        },
      }),
    );
    expect(matrix.frt).toBe('partial');
    expect(matrix.hvrt).toBe('partial');
  });

  it('FRT/HVRT → "ready" gdy dynamic_model_ref jest podany', () => {
    const matrix = computeDerReadinessMatrix(
      makeDer({
        profiles: {
          ...EMPTY_DER_PROFILES,
          nc_rfg_profile_ref: 'ncrfg_pse',
          lvrt_curve_ref: 'lvrt_pse_b',
          hvrt_curve_ref: 'hvrt_pse_b',
        },
        catalogs: {
          ...EMPTY_DER_CATALOGS,
          device_catalog_ref: 'pv_inv_sma_2500',
          dynamic_model_ref: 'dyn_pv_gfl_typical',
        },
      }),
    );
    expect(matrix.frt).toBe('ready');
    expect(matrix.hvrt).toBe('ready');
  });
});

describe('Naprawa D — validateHostingCapacity (B.3)', () => {
  it('utilization ≤ 80% → ok', () => {
    const result = validateHostingCapacity({
      station_id: 's',
      busbar_kind: 'lv_busbar',
      busbar_ref: 'bb_main',
      ders: [
        makeDer({ id: 'der_a', lv_busbar_ref: 'bb_main', nominal_power_kw: 200 }),
        makeDer({ id: 'der_b', lv_busbar_ref: 'bb_main', nominal_power_kw: 150 }),
      ],
      capacity_limit_kw: 630, // 630 kVA transformator
    });
    expect(result.status).toBe('ok');
    expect(result.utilization_percent).toBeCloseTo((350 / 630) * 100, 1);
  });

  it('utilization 80-100% → warning', () => {
    const result = validateHostingCapacity({
      station_id: 's',
      busbar_kind: 'lv_busbar',
      busbar_ref: 'bb_main',
      ders: [makeDer({ id: 'der_a', lv_busbar_ref: 'bb_main', nominal_power_kw: 550 })],
      capacity_limit_kw: 630,
    });
    expect(result.status).toBe('warning');
  });

  it('utilization > 100% → exceeded z polskim message', () => {
    const result = validateHostingCapacity({
      station_id: 's',
      busbar_kind: 'lv_busbar',
      busbar_ref: 'bb_main',
      ders: [
        makeDer({ id: 'a', lv_busbar_ref: 'bb_main', nominal_power_kw: 800 }),
        makeDer({ id: 'b', lv_busbar_ref: 'bb_main', nominal_power_kw: 800 }),
      ],
      capacity_limit_kw: 1000,
    });
    expect(result.status).toBe('exceeded');
    expect(result.message_pl).toContain('Przekroczona zdolność');
    expect(result.message_pl).toContain('redukcja mocy DER');
  });
});
