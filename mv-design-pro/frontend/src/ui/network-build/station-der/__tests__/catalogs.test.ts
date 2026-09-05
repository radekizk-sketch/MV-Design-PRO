/**
 * Testy katalogów station-der (Faza B).
 */

import { describe, it, expect } from 'vitest';

import {
  CONNECTION_VARIANT_CATALOG,
  STATION_TEMPLATE_CATALOG,
  selectConnectionVariantsForKind,
  getLvVoltageLevel,
  getConnectionSideLabelPl,
} from '../catalogs';

// USUNIĘTE (karta FAB-J, 2026-09-05) — `NC_RFG_PROFILE_CATALOG`, `LVRT_CURVE_CATALOG`,
// `HVRT_CURVE_CATALOG`, `PV_INVERTER_CATALOG`, `BESS_PCS_CATALOG`, `BESS_BATTERY_CATALOG`,
// `WIND_TURBINE_CATALOG` — druga kopia danych, dla których backend jest jedynym źródłem
// prawdy (patrz nagłówek `catalogs.ts` dla pełnej prowenincji per pozycja). Pokrycie:
//   - NC RfG profil/operator + LVRT/HVRT ride-through: backend `GET /api/ncrfg-tests/catalog`,
//     testy `derRemoteCatalogs.test.ts` + fikstury `AddDerWizard.test.tsx`/`Etap5Der.test.tsx`.
//   - Urządzenia PV/BESS/FW: backend `GET /api/catalog/converter-types`
//     (`network_model/catalog/mv_converter_catalog.py` + jego testy).
//   - Baterie BESS: backend `GET /api/catalog/bess-battery-types`
//     (`network_model/catalog/mv_bess_battery_catalog.py` + `test_bess_battery_catalog.py`).
describe('Katalogi urządzeń/profili — usunięte z frontu (karta FAB-J)', () => {
  it('catalogs.ts NIE MA już własnej kopii katalogów backendu', async () => {
    const modul = (await import('../catalogs')) as Record<string, unknown>;
    expect(modul.NC_RFG_PROFILE_CATALOG).toBeUndefined();
    expect(modul.LVRT_CURVE_CATALOG).toBeUndefined();
    expect(modul.HVRT_CURVE_CATALOG).toBeUndefined();
    expect(modul.LV_VOLTAGE_LEVEL_CATALOG).toBeUndefined();
    expect(modul.PV_INVERTER_CATALOG).toBeUndefined();
    expect(modul.BESS_PCS_CATALOG).toBeUndefined();
    expect(modul.BESS_BATTERY_CATALOG).toBeUndefined();
    expect(modul.WIND_TURBINE_CATALOG).toBeUndefined();
    expect(modul.validateMinSkAtPcc).toBeUndefined();
    expect(modul.getNcRfgProfile).toBeUndefined();
    expect(modul.selectLvrtCurvesForProfile).toBeUndefined();
    expect(modul.selectHvrtCurvesForProfile).toBeUndefined();
    expect(modul.selectPvInvertersForVoltage).toBeUndefined();
    expect(modul.selectBessPcsForVoltage).toBeUndefined();
  });
});

describe('LvVoltageLevelCatalog — getLvVoltageLevel parsuje wartość-referencję', () => {
  it('getLvVoltageLevel zwraca poziom napięcia parsując referencję jako liczbę kV', () => {
    // Karta FAB-J: referencja JEST wartością kV jako łańcuch (wyprowadzoną z
    // `derRemoteCatalogs.ts::useLvVoltageLevelsKv`, `un_kv` katalogu przekształtników
    // backendu) — nie identyfikatorem katalogowym typu `"lv_0_4kV"`.
    expect(getLvVoltageLevel('0.4')?.nominal_kv).toBe(0.4);
    expect(getLvVoltageLevel('0.69')?.nominal_kv).toBe(0.69);
    expect(getLvVoltageLevel('6')?.nominal_kv).toBe(6);
  });

  it('getLvVoltageLevel zwraca null dla braku referencji albo wartości nie-liczbowej', () => {
    expect(getLvVoltageLevel(null)).toBeNull();
    expect(getLvVoltageLevel('')).toBeNull();
    expect(getLvVoltageLevel('lv_0_4kV')).toBeNull();
    expect(getLvVoltageLevel('0')).toBeNull();
    expect(getLvVoltageLevel('-0.4')).toBeNull();
  });
});

describe('ConnectionVariantCatalog', () => {
  it('zawiera 6 wariantów (3 stacjonarne + 3 pozastacjonarne — Naprawa B.2)', () => {
    expect(CONNECTION_VARIANT_CATALOG).toHaveLength(6);
    const sides = CONNECTION_VARIANT_CATALOG.map((v) => v.side);
    expect(sides).toContain('SN');
    expect(sides).toContain('nN');
    expect(sides).toContain('dedicated_transformer');
    expect(sides).toContain('at_zksn');
    expect(sides).toContain('at_branch_pole');
    expect(sides).toContain('at_cable_joint');
  });

  it('selectConnectionVariantsForKind: PV ma 6 wariantów (SN, nN, dedicated, ZK SN, słup, mufa)', () => {
    const variants = selectConnectionVariantsForKind('PV');
    expect(variants).toHaveLength(6);
  });

  it('selectConnectionVariantsForKind: FW ma 3 warianty (SN, dedicated, słup) — nie nN, nie mufa', () => {
    const variants = selectConnectionVariantsForKind('FW');
    const sides = variants.map((v) => v.side);
    expect(sides).toContain('SN');
    expect(sides).toContain('dedicated_transformer');
    expect(sides).toContain('at_branch_pole');
    expect(sides).not.toContain('nN');
    expect(sides).not.toContain('at_cable_joint');
  });

  it('getConnectionSideLabelPl zwraca polski label', () => {
    expect(getConnectionSideLabelPl('SN')).toContain('SN');
    expect(getConnectionSideLabelPl('nN')).toContain('nN');
    expect(getConnectionSideLabelPl('dedicated_transformer')).toContain('transformator');
  });
});

describe('StationTemplateCatalog', () => {
  it('zawiera ≥10 szablonów stacji', () => {
    expect(STATION_TEMPLATE_CATALOG.length).toBeGreaterThanOrEqual(10);
  });

  it('każdy szablon ma topological_type i transformer_count', () => {
    for (const tmpl of STATION_TEMPLATE_CATALOG) {
      expect(['końcowa', 'przelotowa', 'odgałęźna', 'sekcyjna']).toContain(tmpl.topological_type);
      expect(tmpl.transformer_count).toBeGreaterThanOrEqual(1);
      expect(tmpl.nn_voltage_level_refs.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('zawiera co najmniej jeden multi-voltage szablon (>1 poziom nN)', () => {
    const multi = STATION_TEMPLATE_CATALOG.filter((t) => t.nn_voltage_level_refs.length > 1);
    expect(multi.length).toBeGreaterThan(0);
  });

  it('zawiera szablony z PV/BESS', () => {
    const labels = STATION_TEMPLATE_CATALOG.map((t) => t.label_pl).join(' ');
    expect(labels).toContain('PV');
    expect(labels).toContain('BESS');
  });
});
