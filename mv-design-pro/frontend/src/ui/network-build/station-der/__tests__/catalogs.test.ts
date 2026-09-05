/**
 * Testy katalogów station-der (Faza B).
 */

import { describe, it, expect } from 'vitest';

import {
  CONNECTION_LEVEL_CATALOG,
  SN_CONNECTION_POINT_KIND_CATALOG,
  STATION_TEMPLATE_CATALOG,
  selectConnectionLevelsForKind,
  getLvVoltageLevel,
  getConnectionSideLabelPl,
  getSnConnectionPointKindLabelPl,
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

/**
 * Karta FAB-K (§0 R3, KLASA NIE INSTANCJA): `CONNECTION_VARIANT_CATALOG`
 * (6 „wariantów" — SN/nN/dedicated_transformer/at_zksn/at_branch_pole/
 * at_cable_joint) mieszał DWIE ortogonalne decyzje fizyczne w jednym enumie:
 * POZIOM przyłączenia (nN vs SN przez transformator dedykowany — żadne
 * urządzenie katalogu przekształtników nie łączy się z siecią SN bez
 * pośredniczącego transformatora, więc goły `SN` bez transformatora nie
 * istnieje fizycznie) i, dla SN, PUNKT przyłączenia (element ISTNIEJĄCY w
 * modelu — szyna stacji / `BranchPointSN` / `Junction`, WYBRANY z migawki, nie
 * z katalogu UI). Cztery z sześciu dawnych wariantów dawały gwarantowany 422
 * (`generator.block_transformer_catalog_missing`) — usunięte jako phantom.
 * `CONNECTION_LEVEL_CATALOG` niesie WYŁĄCZNIE poziom (2 pozycje);
 * `SN_CONNECTION_POINT_KIND_CATALOG` niesie WYŁĄCZNIE etykiety RODZAJU punktu
 * (pochodna typu elementu modelu, `AddDerWizard.tsx::selectSnConnectionPointCandidates`
 * wybiera realne kandydatury z migawki, nie z tego katalogu). Mufa kablowa
 * (`CableJoint`) nie ma topologii w modelu — nie jest punktem przyłączenia.
 */
describe('ConnectionLevelCatalog', () => {
  it('zawiera DOKŁADNIE 2 poziomy przyłączenia (nN, SN przez transformator dedykowany)', () => {
    expect(CONNECTION_LEVEL_CATALOG).toHaveLength(2);
    const sides = CONNECTION_LEVEL_CATALOG.map((v) => v.side);
    expect(sides).toContain('nN');
    expect(sides).toContain('dedicated_transformer');
  });

  it('selectConnectionLevelsForKind: PV ma 2 poziomy (nN, dedicated_transformer)', () => {
    const levels = selectConnectionLevelsForKind('PV');
    expect(levels).toHaveLength(2);
    expect(levels.map((v) => v.side)).toEqual(expect.arrayContaining(['nN', 'dedicated_transformer']));
  });

  it('selectConnectionLevelsForKind: FW ma WYŁĄCZNIE dedicated_transformer — nie nN', () => {
    const levels = selectConnectionLevelsForKind('FW');
    const sides = levels.map((v) => v.side);
    expect(sides).toContain('dedicated_transformer');
    expect(sides).not.toContain('nN');
  });

  it('getConnectionSideLabelPl zwraca polski label — WYŁĄCZNIE dwie wartości', () => {
    expect(getConnectionSideLabelPl('nN')).toContain('nN');
    expect(getConnectionSideLabelPl('dedicated_transformer')).toContain('transformator');
  });
});

describe('SnConnectionPointKindCatalog', () => {
  it('zawiera DOKŁADNIE 3 rodzaje punktu SN (szyna stacji, ZK SN, słup rozgałęźny, odgałęzienie) — bez mufy', () => {
    expect(SN_CONNECTION_POINT_KIND_CATALOG).toHaveLength(4);
    const kinds = SN_CONNECTION_POINT_KIND_CATALOG.map((v) => v.kind);
    expect(kinds).toEqual(expect.arrayContaining(['station_bus', 'zksn', 'branch_pole', 'junction']));
  });

  it('getSnConnectionPointKindLabelPl zwraca polski label per rodzaj, „—" dla null', () => {
    expect(getSnConnectionPointKindLabelPl('station_bus')).toBeTruthy();
    expect(getSnConnectionPointKindLabelPl('zksn')).toContain('ZK');
    expect(getSnConnectionPointKindLabelPl('branch_pole')).toContain('rozgałęźny');
    expect(getSnConnectionPointKindLabelPl('junction')).toContain('Odgałęzienie');
    expect(getSnConnectionPointKindLabelPl(null)).toBe('—');
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
