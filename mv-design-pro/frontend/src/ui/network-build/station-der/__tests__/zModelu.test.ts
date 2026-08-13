/**
 * Wytwórcy DER Z MODELU → warsztat (`useStationDerStore`) → ocena zgodności.
 *
 * CO PRZYPINA (defekt zmierzony na żywej aplikacji 2026-08-05): wytwórca zapisany
 * kreatorem źródła OZE trafiał do modelu, ale nie do warsztatu, więc ekrany
 * strumienia OZE (macierz NC RfG, pulpit OZE, krzywe P–Q, walidacja falownika)
 * meldowały „Brak modułów wytwórczych do oceny" mimo generatora w modelu.
 *
 * REGUŁA KLASA, NIE INSTANCJA — testy chodzą ILOCZYNEM CECH, nie jednym
 * przykładem: pochodzenie rekordu (model × warsztat lokalny) × tożsamość
 * (ta sama × inna) oraz źródło napięcia przyłączenia (referencja poziomu ×
 * szyna modelu × brak obu).
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import { rozwiazNapiecieKv } from '../../../../ui2/oze/macierz/macierzModel';
import { selectAllDers, useStationDerStore } from '../store';
import { EMPTY_DER_CATALOGS, EMPTY_DER_PROFILES, EMPTY_DER_READINESS } from '../types';
import type { StationDerConnection } from '../types';
import { deryStacjiZModelu, deryZModelu } from '../zModelu';

const STACJA = 'stn/aaa/station';
const SZYNA_NN = 'stn/aaa/nn_bus';

function migawka(over: Partial<EnergyNetworkModel> = {}): EnergyNetworkModel {
  return {
    header: {
      enm_version: '1.0',
      name: 'Sieć testowa',
      description: null,
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
      revision: 1,
      hash_sha256: 'x',
      defaults: { frequency_hz: 50, unit_system: 'SI' },
    },
    buses: [{ ref_id: SZYNA_NN, id: SZYNA_NN, voltage_kv: 0.8 }],
    branches: [],
    transformers: [],
    sources: [],
    generators: [],
    loads: [],
    substations: [{ ref_id: STACJA, id: STACJA, bus_refs: [SZYNA_NN], transformer_refs: [] }],
    bays: [],
    junctions: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
    ...over,
  } as unknown as EnergyNetworkModel;
}

function generatorPv(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ref_id: 'pv/111/converter',
    id: 'pv/111/converter',
    name: 'Blok PV',
    bus_ref: SZYNA_NN,
    station_ref: STACJA,
    p_mw: 0.215,
    gen_type: 'pv_inverter',
    catalog_ref: 'conv-pv-card-huawei-sun2000-215ktl',
    catalog_namespace: 'ZRODLO_NN_PV',
    connection_variant: 'nn_side',
    meta: {},
    ...over,
  };
}

function rekordLokalny(over: Partial<StationDerConnection> = {}): StationDerConnection {
  return {
    id: 'lokalny-1',
    project_id: 'p',
    station_id: STACJA,
    der_kind: 'PV',
    name: 'Blok PV',
    connection_side: 'nN',
    bus_przylaczenia_ref: SZYNA_NN,
    bay_ref: null,
    transformer_ref: null,
    lv_busbar_ref: SZYNA_NN,
    connection_node_ref: null,
    internal_cable_ref: null,
    voltage_level_ref: null,
    catalogs: { ...EMPTY_DER_CATALOGS, device_catalog_ref: 'conv-pv-card-huawei-sun2000-215ktl' },
    profiles: { ...EMPTY_DER_PROFILES },
    nominal_power_kw: 215,
    unit_count: null,
    completeness: 'ready',
    readiness: { ...EMPTY_DER_READINESS },
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...over,
  } as StationDerConnection;
}

describe('deryZModelu — odwzorowanie migawki na rekordy warsztatu', () => {
  it('generator z jawną referencją stacji: tożsamość, moc i napięcie SZYNY z modelu', () => {
    const dery = deryZModelu(migawka({ generators: [generatorPv()] as never }), 'projekt-1');

    expect(dery).toHaveLength(1);
    expect(dery[0].id).toBe('pv/111/converter');
    expect(dery[0].station_id).toBe(STACJA);
    expect(dery[0].der_kind).toBe('PV');
    expect(dery[0].nominal_power_kw).toBe(215);
    // Napięcie NIE jest zgadywane — pochodzi z szyny przyłączenia migawki.
    expect(dery[0].connection_voltage_kv).toBe(0.8);
    expect(dery[0].catalogs.device_catalog_ref).toBe('conv-pv-card-huawei-sun2000-215ktl');
  });

  it('generator BEZ referencji stacji: stacja rozwiązana z szyny przyłączenia', () => {
    const dery = deryZModelu(
      migawka({ generators: [generatorPv({ station_ref: null })] as never }),
      null,
    );

    expect(dery).toHaveLength(1);
    expect(dery[0].station_id).toBe(STACJA);
  });

  it('szyna spoza migawki: napięcie zostaje BRAKIEM (zero wartości domyślnej)', () => {
    const dery = deryZModelu(
      migawka({ generators: [generatorPv({ bus_ref: 'nie/ma/takiej/szyny' })] as never }),
      null,
    );

    expect(dery[0].connection_voltage_kv).toBeNull();
  });

  it('deryStacjiZModelu zawęża TEN SAM wynik do wskazanej stacji', () => {
    const snapshot = migawka({ generators: [generatorPv()] as never });

    expect(deryStacjiZModelu(snapshot, STACJA, null)).toHaveLength(1);
    expect(deryStacjiZModelu(snapshot, 'stn/inna/station', null)).toHaveLength(0);
  });
});

describe('synchronizujZModelu — model wygrywa, praca lokalna nie ginie', () => {
  beforeEach(() => {
    useStationDerStore.getState().reset();
  });

  it('wprowadza wytwórcę z modelu do warsztatu (ekrany OZE czytają selectAllDers)', () => {
    const dery = deryZModelu(migawka({ generators: [generatorPv()] as never }), null);
    useStationDerStore.getState().synchronizujZModelu(dery);

    expect(selectAllDers(useStationDerStore.getState()).map((der) => der.id)).toEqual([
      'pv/111/converter',
    ]);
  });

  it('rekord lokalny DUBLUJĄCY wytwórcę modelu znika, choć MODEL ZMIENIA NAZWĘ', () => {
    // Regresja: model wyświetla „PV 01 - fotowoltaika" tam, gdzie kreator stacji
    // zapisał „Blok PV" — klucz znaczeniowy z nazwą nie zrównywał tej pary
    // i macierz zgodności liczyła jedno urządzenie dwa razy.
    useStationDerStore.getState().attachDer({
      id: 'lokalny-1',
      project_id: 'p',
      station_id: STACJA,
      der_kind: 'PV',
      name: 'Blok PV',
      connection_side: 'nN',
      bus_przylaczenia_ref: SZYNA_NN,
      catalogs: { device_catalog_ref: 'conv-pv-card-huawei-sun2000-215ktl' },
      nominal_power_kw: 215,
    });
    const dery = deryZModelu(migawka({ generators: [generatorPv()] as never }), null);
    useStationDerStore.getState().synchronizujZModelu(dery);

    expect(selectAllDers(useStationDerStore.getState()).map((der) => der.id)).toEqual([
      'pv/111/converter',
    ]);
  });

  it('rekord lokalny o INNYM znaczeniu zostaje obok wytwórcy z modelu', () => {
    useStationDerStore.getState().attachDer({
      id: 'lokalny-2',
      project_id: 'p',
      station_id: STACJA,
      der_kind: 'BESS',
      name: 'Magazyn 1',
      connection_side: 'nN',
      bus_przylaczenia_ref: SZYNA_NN,
      nominal_power_kw: 500,
    });
    const dery = deryZModelu(migawka({ generators: [generatorPv()] as never }), null);
    useStationDerStore.getState().synchronizujZModelu(dery);

    expect(selectAllDers(useStationDerStore.getState()).map((der) => der.id).sort()).toEqual([
      'lokalny-2',
      'pv/111/converter',
    ]);
  });

  it('powtórna synchronizacja tą samą migawką NIE zmienia referencji stanu', () => {
    const dery = deryZModelu(migawka({ generators: [generatorPv()] as never }), null);
    useStationDerStore.getState().synchronizujZModelu(dery);
    const pierwszy = useStationDerStore.getState().ders;
    useStationDerStore.getState().synchronizujZModelu(dery);

    expect(useStationDerStore.getState().ders).toBe(pierwszy);
  });
});

describe('rozwiazNapiecieKv — dwie realne dane modelowe, zero domysłu', () => {
  it('referencja poziomu napięcia ma pierwszeństwo', () => {
    expect(
      rozwiazNapiecieKv(
        rekordLokalny({ voltage_level_ref: 'lv_0_4kV', connection_voltage_kv: 0.8 }),
      ),
    ).toBe(0.4);
  });

  it('bez referencji poziomu bierze napięcie SZYNY z modelu (np. 0,8 kV falownika string)', () => {
    expect(
      rozwiazNapiecieKv(rekordLokalny({ voltage_level_ref: null, connection_voltage_kv: 0.8 })),
    ).toBe(0.8);
  });

  it('bez obu danych zostaje BRAK — nie 15 kV i nie wnioskowanie ze strony przyłączenia', () => {
    expect(
      rozwiazNapiecieKv(rekordLokalny({ voltage_level_ref: null, connection_voltage_kv: null })),
    ).toBeNull();
  });
});
