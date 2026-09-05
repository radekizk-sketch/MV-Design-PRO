/**
 * Testy katalogów station-der (Faza B).
 */

import { describe, it, expect } from 'vitest';

import type {
  BessOperationModeItem,
  TapChangerItem,
} from '../audit2-api';
import {
  CONNECTION_LEVEL_CATALOG,
  SN_CONNECTION_POINT_KIND_CATALOG,
  getConnectionSideLabelPl,
  getSnConnectionPointKindLabelPl,
  getTapChanger,
  selectBessModesForPcs,
  selectConnectionLevelsForKind,
  selectTapChangersForTransformer,
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
//
// USUNIĘTE (karta FAB-L, 2026-09-05) — `MV_NEUTRAL_GROUNDING_CATALOG`,
// `BESS_OPERATION_MODE_CATALOG`, `TAP_CHANGER_CATALOG` (→ snapshot audytu 2,
// selektory poniżej przyjmują katalog jako parametr), `DER_FAULT_CURRENT_DATA_
// CATALOG` + `computeKappa` + `getFaultCurrentDataForDevice` (fizyka bez
// konsumenta solvera — usunięte bez zamiennika, κ pochodzi z
// `ShortCircuitResult.kappa`), `DER_DYNAMIC_MODEL_CATALOG` +
// `getDynamicModelForDevice` (→ `GET /api/catalog/der-dynamic-profiles`,
// `derRemoteCatalogs.ts`), `STATION_TEMPLATE_CATALOG` (zero konsumentów
// produkcyjnych), `getLvVoltageLevel` (zero konsumentów — `connection_voltage_kv`
// jest dziś liczbą czytaną wprost z modelu, karta FAB-K).
describe('Katalogi usunięte z frontu (karty FAB-J/K/L)', () => {
  it('catalogs.ts NIE MA już własnej kopii katalogów backendu ani fizyki liczonej w UI', async () => {
    const modul = (await import('../catalogs')) as Record<string, unknown>;
    // FAB-J
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
    // FAB-L: mirrory backendu → snapshot audytu 2
    expect(modul.MV_NEUTRAL_GROUNDING_CATALOG).toBeUndefined();
    expect(modul.BESS_OPERATION_MODE_CATALOG).toBeUndefined();
    expect(modul.TAP_CHANGER_CATALOG).toBeUndefined();
    // FAB-L: fizyka bez konsumenta solvera
    expect(modul.DER_FAULT_CURRENT_DATA_CATALOG).toBeUndefined();
    expect(modul.computeKappa).toBeUndefined();
    expect(modul.getFaultCurrentDataForDevice).toBeUndefined();
    // FAB-L: model dynamiczny → backend
    expect(modul.DER_DYNAMIC_MODEL_CATALOG).toBeUndefined();
    expect(modul.getDynamicModelForDevice).toBeUndefined();
    // FAB-L: martwe eksporty
    expect(modul.STATION_TEMPLATE_CATALOG).toBeUndefined();
    expect(modul.getLvVoltageLevel).toBeUndefined();
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

/**
 * Karta FAB-L: `selectBessModesForPcs`/
 * `selectTapChangersForTransformer`/`getTapChanger` przyjmują katalog jako
 * PARAMETR (snapshot audytu 2), zamiast czytać statyk modułowy — fikstury
 * poniżej są kształtem 1:1 z backendowym `to_dict()` (`audit2_catalogs.py`),
 * nie wymyślonymi wartościami.
 */
describe('Selektory snapshotu audytu 2 (parametryzowane, karta FAB-L)', () => {

  const bessModes: readonly BessOperationModeItem[] = [
    {
      id: 'mode_peak_shaving', catalog_namespace: 'bess_operation_mode', catalog_version: '2026-08-14',
      label_pl: 'Peak shaving', description_pl: 'x', mode_code: 'peak_shaving',
      requires_four_quadrant: false, requires_grid_forming: false,
    },
    {
      id: 'mode_fcr_n', catalog_namespace: 'bess_operation_mode', catalog_version: '2026-08-14',
      label_pl: 'FCR-N', description_pl: 'x', mode_code: 'fcr_n',
      requires_four_quadrant: true, requires_grid_forming: false,
    },
    {
      id: 'mode_island_backup', catalog_namespace: 'bess_operation_mode', catalog_version: '2026-08-14',
      label_pl: 'Praca wyspowa', description_pl: 'x', mode_code: 'island_backup',
      requires_four_quadrant: true, requires_grid_forming: true,
    },
  ];

  it('selectBessModesForPcs filtruje wg zdolności PODANEGO przekształtnika (iloczyn cech)', () => {
    expect(selectBessModesForPcs(bessModes, { fourQuadrant: false, gridFormingCapable: false }))
      .toEqual([bessModes[0]]);
    expect(selectBessModesForPcs(bessModes, { fourQuadrant: true, gridFormingCapable: false }).map((m) => m.id))
      .toEqual(['mode_peak_shaving', 'mode_fcr_n']);
    expect(selectBessModesForPcs(bessModes, { fourQuadrant: true, gridFormingCapable: true }))
      .toHaveLength(3);
    expect(selectBessModesForPcs([], { fourQuadrant: true, gridFormingCapable: true })).toEqual([]);
  });

  const tapChangers: readonly TapChangerItem[] = [
    {
      id: 'tc_oltc_110sn_19_125', catalog_namespace: 'tap_changer', catalog_version: '2026-08-14',
      label_pl: 'OLTC 110/SN 19 zaczepów', type: 'oltc', neutral_position: 0, tap_count: 19,
      step_percent: 1.25, range_percent: 11.25, regulated_side: 'hv', supports_avr: true,
      applicable_to: ['transformer_110_15', 'transformer_110_20'],
    },
    {
      id: 'tc_detc_snnn_5_25', catalog_namespace: 'tap_changer', catalog_version: '2026-08-14',
      label_pl: 'DETC SN/nN 5 zaczepów', type: 'detc', neutral_position: 0, tap_count: 5,
      step_percent: 2.5, range_percent: 5, regulated_side: 'hv', supports_avr: false,
      applicable_to: ['transformer_15_04', 'block_transformer'],
    },
  ];

  it('selectTapChangersForTransformer filtruje wg typu transformatora z PODANEGO katalogu', () => {
    expect(selectTapChangersForTransformer(tapChangers, 'transformer_110_15')).toEqual([tapChangers[0]]);
    expect(selectTapChangersForTransformer(tapChangers, 'transformer_15_04')).toEqual([tapChangers[1]]);
    expect(selectTapChangersForTransformer([], 'transformer_110_15')).toEqual([]);
  });

  it('getTapChanger zwraca pozycję po id z PODANEGO katalogu, null dla braku/nieznanego', () => {
    expect(getTapChanger(tapChangers, 'tc_detc_snnn_5_25')?.tap_count).toBe(5);
    expect(getTapChanger(tapChangers, null)).toBeNull();
    expect(getTapChanger(tapChangers, 'tc_nieznany')).toBeNull();
  });
});
