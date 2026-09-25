/**
 * Szuflada SLD — identyfikacja pola i aparatu z MODELU (karta #135 (e)1).
 *
 * Nagłówek szuflady aparatu pokazywał „000": identyfikacja czytała nieistniejące
 * `snapshot.substations[].bays`, a stacja pola była PIERWSZĄ stacją rysunku
 * (`sldData.stations[0]`), więc pole w innej stacji dostawało cudzy kod. Rodzaj aparatu
 * zgadywano z napisu identyfikatora (`'tr'` → T, `'es'` → QE). Teraz: pole z `snapshot.bays`,
 * stacja z `Bay.substation_ref`, aparat = ten sam identyfikator co na rysunku
 * (`projectBayPrimaryDevices` → `symbolIdForPrimaryDeviceKind` → `apparatusIdentifiers`).
 *
 * Iloczyn cech: {stacja pierwsza, druga, nieobecna na rysunku} × {aparat w `primary_devices`
 * z oznaczeniem / bez, aparat tylko w `equipment_refs`} × {numer pola z danych, pozycja} ×
 * {identyfikator mylący dawną heurystykę} × {nośnik pola: element `bays`, specyfikacja stacji
 * `meta.field_specs`}. Nośnik dopisany przy integracji (2026-09-24): pola stacji wstawionej
 * operacją `insert_station_on_segment_sn` żyją WYŁĄCZNIE w specyfikacji stacji — szuflada
 * czytająca tylko `snapshot.bays` gubiła stację, pole i identyfikator (zrzut e2e: brak „S01"),
 * a tytuł aparatu spadał na człon identyfikatora „000" zamiast nazwy z modelu.
 */
import { describe, expect, it } from 'vitest';

import { makeCalculationReadySnapshot } from '../../../../test/enmCalculationSnapshot';
import type { Bay, BayPrimaryDevice, EnergyNetworkModel } from '../../../../types/enm';
import { buildSldDataFromSnapshot, type SldDataPayload } from '../../v2/canvas/enmToSldAdapter';
import { buildStationBranchDetailDrawerData } from '../detailDrawerData';

function aparat(device_ref: string, kind: BayPrimaryDevice['kind'], designation?: string): BayPrimaryDevice {
  return { device_ref, symbol_ref: `symbol:${device_ref}`, kind, placement: 'MIDSTREAM', is_controllable: true, designation };
}

function pole(ref_id: string, substation_ref: string, extra: Partial<Bay>): Bay {
  return {
    id: ref_id,
    ref_id,
    name: `Pole ${ref_id}`,
    tags: [],
    meta: {},
    bay_role: 'OUT',
    substation_ref,
    bus_ref: 'bus-source',
    equipment_refs: [],
    ...extra,
  };
}

function model(pola: Bay[]): EnergyNetworkModel {
  const snapshot = makeCalculationReadySnapshot();
  snapshot.bays = pola;
  return snapshot;
}

/** Rysunek z dwiema stacjami (kody S01, S02) — minimalny widok stacji wystarcza szufladzie pola. */
function rysunek(snapshot: EnergyNetworkModel, stacje: Array<{ id: string; stationCode: string }>): SldDataPayload {
  const baza = buildSldDataFromSnapshot(snapshot, null);
  return {
    ...baza,
    stations: stacje.map((s) => ({ ...(baza.stations[0] ?? {}), id: s.id, stationCode: s.stationCode, name: `Stacja ${s.stationCode}` })),
  } as unknown as SldDataPayload;
}

const DWIE_STACJE = [
  { id: 'st-1', stationCode: 'S01' },
  { id: 'st-2', stationCode: 'S02' },
];

describe('szuflada SLD — identyfikacja pola i aparatu z modelu (karta #135 (e)1)', () => {
  it('aparat w polu DRUGIEJ stacji: kod stacji S02 (nie pierwsza stacja rysunku), nazwa pola z modelu', () => {
    const snapshot = model([
      pole('bay-a1', 'st-1', { primary_devices: [aparat('cb-a1', 'CB')] }),
      pole('bay-b1', 'st-2', { primary_devices: [aparat('ds-b1', 'DS'), aparat('cb-b1', 'CB')] }),
    ]);
    const dane = buildStationBranchDetailDrawerData(snapshot, rysunek(snapshot, DWIE_STACJE), null, 'apparatus', 'cb-b1');
    expect(dane?.parentStationLabel).toBe('S02');
    expect(dane?.parentBayLabel).toBe('Pole bay-b1');
    expect(dane?.globalId).toBe('S02.F01.Q2');
  });

  it.each([
    ['numer pola z danych', { bay_number: 'F07' }, 'S02.F07.QE1'],
    ['pozycja pola w stacji', {}, 'S02.F02.QE1'],
  ])('%s → oznacznik pola; rodzaj aparatu z modelu, nie z napisu identyfikatora', (_opis, extra, oczekiwany) => {
    const snapshot = model([
      pole('bay-b1', 'st-2', { primary_devices: [aparat('cb-b1', 'CB')] }),
      // identyfikator „tr-uziemnik" mylił dawną heurystykę (`'tr'` → T); rodzaj w modelu: ES
      pole('bay-b2', 'st-2', { ...extra, primary_devices: [aparat('tr-uziemnik', 'ES')] }),
    ]);
    const dane = buildStationBranchDetailDrawerData(snapshot, rysunek(snapshot, DWIE_STACJE), null, 'apparatus', 'tr-uziemnik');
    expect(dane?.globalId).toBe(oczekiwany);
  });

  it('oznaczenie aparatu z danych ma pierwszeństwo przed konwencją (ten sam identyfikator co rysunek)', () => {
    const snapshot = model([pole('bay-b1', 'st-2', { primary_devices: [aparat('cb-b1', 'CB', 'Q0')] })]);
    const dane = buildStationBranchDetailDrawerData(snapshot, rysunek(snapshot, DWIE_STACJE), null, 'apparatus', 'cb-b1');
    expect(dane?.globalId).toBe('S02.F01.Q0');
  });

  it('aparat tylko w `equipment_refs` (bez aparatu pierwotnego w modelu): nazwa pola jest, identyfikator — uczciwy brak', () => {
    const snapshot = model([pole('bay-b1', 'st-2', { equipment_refs: ['cb-luzem'] })]);
    const dane = buildStationBranchDetailDrawerData(snapshot, rysunek(snapshot, DWIE_STACJE), null, 'apparatus', 'cb-luzem');
    expect(dane?.parentBayLabel).toBe('Pole bay-b1');
    expect(dane?.globalId).toBeNull();
  });

  it('stacja pola nieobecna na rysunku: brak kodu stacji i identyfikatora (nie pierwsza stacja rysunku)', () => {
    const snapshot = model([pole('bay-x1', 'st-9', { primary_devices: [aparat('cb-x1', 'CB')] })]);
    const dane = buildStationBranchDetailDrawerData(snapshot, rysunek(snapshot, DWIE_STACJE), null, 'apparatus', 'cb-x1');
    expect(dane?.parentStationLabel).toBeNull();
    expect(dane?.globalId).toBeNull();
    expect(dane?.parentBayLabel).toBe('Pole bay-x1');
  });

  describe('nośnik pola: specyfikacja stacji `meta.field_specs` (pole bez elementu `bays`)', () => {
    function modelZeSpecyfikacja(stacja: string, specyfikacje: Array<Record<string, unknown>>): EnergyNetworkModel {
      const snapshot = makeCalculationReadySnapshot();
      snapshot.bays = [];
      snapshot.substations = [
        ...(snapshot.substations ?? []),
        { id: stacja, ref_id: stacja, name: `Stacja ${stacja}`, tags: [], meta: { field_specs: specyfikacje } } as unknown as EnergyNetworkModel['substations'][number],
      ];
      snapshot.branches = [
        ...snapshot.branches,
        { id: 'cb-spec-1', ref_id: 'cb-spec-1', name: 'Wyłącznik pola SN 1', type: 'breaker', from_bus_ref: 'bus-source', to_bus_ref: 'bus-source', status: 'closed', tags: [], meta: {} } as unknown as EnergyNetworkModel['branches'][number],
      ];
      return snapshot;
    }

    it.each([
      ['druga stacja rysunku', 'st-2', 'S02'],
      ['pierwsza stacja rysunku', 'st-1', 'S01'],
    ])('%s: stacja i pole ze specyfikacji, tytuł aparatu z nazwy w modelu (nie „000")', (_opis, stacja, kod) => {
      const snapshot = modelZeSpecyfikacja(stacja, [
        { field_ref: `${stacja}/sn_field/000`, name: 'Pole liniowe wejściowe 1', bay_role: 'IN', bus_ref: 'bus-source', equipment_refs: ['cb-spec-1'] },
      ]);
      const dane = buildStationBranchDetailDrawerData(snapshot, rysunek(snapshot, DWIE_STACJE), null, 'apparatus', 'cb-spec-1');
      expect(dane?.parentStationLabel).toBe(kod);
      expect(dane?.parentBayLabel).toBe('Pole liniowe wejściowe 1');
      expect(dane?.label).toBe('Wyłącznik pola SN 1');
      // Specyfikacja bez aparatów pierwotnych — identyfikator aparatu: uczciwy brak.
      expect(dane?.globalId).toBeNull();
    });

    it('aparat pierwotny w specyfikacji: identyfikator globalny wg pozycji pola w kolejności specyfikacji', () => {
      const snapshot = modelZeSpecyfikacja('st-2', [
        { field_ref: 'st-2/sn_field/000', name: 'Pole liniowe wejściowe 1', bay_role: 'IN', bus_ref: 'bus-source', equipment_refs: ['cb-inny'] },
        {
          field_ref: 'st-2/sn_field/001',
          name: 'Pole liniowe wyjściowe 2',
          bay_role: 'OUT',
          bus_ref: 'bus-source',
          equipment_refs: ['cb-spec-1'],
          primary_devices: [aparat('ds-spec-1', 'DS'), aparat('cb-spec-1', 'CB')],
        },
      ]);
      const dane = buildStationBranchDetailDrawerData(snapshot, rysunek(snapshot, DWIE_STACJE), null, 'apparatus', 'cb-spec-1');
      expect(dane?.parentBayLabel).toBe('Pole liniowe wyjściowe 2');
      expect(dane?.globalId).toBe('S02.F02.Q2');
    });

    it('symbol aparatu z konwencji niesie identyfikator POLA: stacja i pole zidentyfikowane, aparat bez identyfikatora', () => {
      const snapshot = modelZeSpecyfikacja('st-2', [
        { field_ref: 'st-2/sn_field/000', name: 'Pole liniowe wejściowe 1', bay_role: 'IN', bus_ref: 'bus-source', equipment_refs: ['cb-spec-1'] },
      ]);
      const dane = buildStationBranchDetailDrawerData(snapshot, rysunek(snapshot, DWIE_STACJE), null, 'apparatus', 'st-2/sn_field/000');
      expect(dane?.parentStationLabel).toBe('S02');
      expect(dane?.parentBayLabel).toBe('Pole liniowe wejściowe 1');
      expect(dane?.label).toBe('Pole liniowe wejściowe 1');
      expect(dane?.globalId).toBeNull();
    });

    it('pole bez nazwy w modelu: okruszek pola to uczciwy brak, nie surowy identyfikator pola', () => {
      const snapshot = modelZeSpecyfikacja('st-2', [
        { field_ref: 'st-2/sn_field/000', bay_role: 'IN', bus_ref: 'bus-source', equipment_refs: ['cb-spec-1'] },
      ]);
      const dane = buildStationBranchDetailDrawerData(snapshot, rysunek(snapshot, DWIE_STACJE), null, 'apparatus', 'cb-spec-1');
      expect(dane?.parentBayLabel).toBeNull();
      expect(dane?.parentStationLabel).toBe('S02');
    });
  });
});
