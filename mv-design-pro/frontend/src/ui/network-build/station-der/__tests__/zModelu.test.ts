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
import {
  DER_MATERIALIZED_BINDING_KEYS,
  DER_MATERIALIZED_PROFILE_KEYS,
  deryStacjiZModelu,
  deryZModelu,
} from '../zModelu';

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
    sn_connection_bus_ref: null,
    sn_connection_point_kind: null,
    connection_voltage_kv: null,
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

/**
 * Karta FAB-K (§0 R4, KLASA NIE INSTANCJA): dawny `voltage_level_ref` (drugie
 * „realne źródło" napięcia, z priorytetem nad szyną modelu) USUNIĘTY jako
 * phantom — backend nigdy go nie przyjmował (`_build_domain_payload` dla
 * `nn_side` sam wyprowadza szynę nN stacji, `_resolve_nn_bus_ref`).
 * `connection_voltage_kv` (szyna wytwórcy Z MODELU) jest teraz JEDYNYM
 * źródłem — „priorytet" między dwoma źródłami przestał być możliwym
 * scenariuszem, nie tylko przestał występować w danych.
 */
describe('rozwiazNapiecieKv — JEDNO realne źródło (szyna modelu), zero domysłu', () => {
  it('bierze napięcie SZYNY przyłączenia z modelu (np. 0,8 kV falownika string)', () => {
    expect(
      rozwiazNapiecieKv(rekordLokalny({ connection_voltage_kv: 0.8 })),
    ).toBe(0.8);
  });

  it('bez napięcia szyny zostaje BRAK — nie 15 kV i nie wnioskowanie ze strony przyłączenia', () => {
    expect(
      rozwiazNapiecieKv(rekordLokalny({ connection_voltage_kv: null })),
    ).toBeNull();
  });
});

/**
 * Karta FAB-K (§0 R1, KLASA NIE INSTANCJA — parytet FE/BE). `DER_MATERIALIZED_BINDING_KEYS`/
 * `DER_MATERIALIZED_PROFILE_KEYS` MUSZĄ nazywać dokładnie te same klucze co
 * backendowe `DER_BINDING_KEYS`/`DER_PROFILE_KEYS` (`enm/domain_operations_v2.py`),
 * przypięte osobnym testem `test_der_binding_profile_keys_pin_parytet_fe_be` w
 * `backend/tests/enm/test_set_der_catalog_bindings.py` — jedna strona zmieniona
 * bez drugiej jest dokładnie tym defektem, który sprowadził tę kartę (nagłówek
 * pliku `zModelu.ts`: wiązania zapisane przez PATCH bindings znikały z frontu
 * po odświeżeniu, bo odczyt patrzył na `meta`, nie na `materialized_params`).
 *
 * Test round-trip niżej pilnuje DRUGIEJ połowy łańcucha, której sam test
 * równości nazw NIE widzi: że `derZGeneratora` faktycznie CZYTA z tych list
 * (pętlą — patrz `zModelu.ts`), a nie z równoległych literałów, które kiedyś
 * mogły się od nich rozjechać mimo identycznych nazw w eksportowanej stałej.
 */
describe('DER_MATERIALIZED_BINDING_KEYS / DER_MATERIALIZED_PROFILE_KEYS — parytet z backendem', () => {
  it('nazwy kluczy 1:1 z backendowym DER_BINDING_KEYS/DER_PROFILE_KEYS (enm/domain_operations_v2.py)', () => {
    // Karta FAB-L: `fault_current_data_ref` USUNIĘTE z obu stron (solver nigdy
    // go nie czytał — inwentarz `short_circuit_iec60909.py`/`enm/mapping.py`).
    // Backendowe `DER_PROFILE_KEYS` zyskało piąty klucz, `bess_operation_mode_
    // refs` — NIE tutaj, bo jest listą, nie skalarem (patrz opis przy stałej
    // i test dedykowany `bess_operation_mode_refs` niżej).
    expect(DER_MATERIALIZED_BINDING_KEYS).toEqual([
      'protection_catalog_ref',
      'ct_catalog_ref',
      'vt_catalog_ref',
      'dynamic_model_ref',
    ]);
    expect(DER_MATERIALIZED_PROFILE_KEYS).toEqual([
      'nc_rfg_profile_ref',
      'lvrt_curve_ref',
      'hvrt_curve_ref',
      'pf_curve_ref',
    ]);
  });

  const WARTOSC_DLA_KLUCZA: Record<
    | (typeof DER_MATERIALIZED_BINDING_KEYS)[number]
    | (typeof DER_MATERIALIZED_PROFILE_KEYS)[number],
    string
  > = {
    protection_catalog_ref: 'REF-OC-200',
    ct_catalog_ref: 'ct_200_5_5p10_10va_abb',
    vt_catalog_ref: 'vt_10kv_100v_05_abb',
    dynamic_model_ref: 'default_pv_gfl',
    nc_rfg_profile_ref: 'pse',
    lvrt_curve_ref: 'lvrt_pse_b',
    hvrt_curve_ref: 'hvrt_pse_b',
    pf_curve_ref: 'pf_pse_2024',
  };

  it.each(DER_MATERIALIZED_BINDING_KEYS)(
    'wiązanie katalogowe „%s": obecne w materialized_params → wartość w catalogs, brak → null',
    (klucz) => {
      const wartosc = WARTOSC_DLA_KLUCZA[klucz];
      const zWartoscia = deryZModelu(
        migawka({
          generators: [generatorPv({ materialized_params: { [klucz]: wartosc } })] as never,
        }),
        null,
      );
      expect(zWartoscia[0].catalogs[klucz]).toBe(wartosc);

      const bezWartosci = deryZModelu(
        migawka({ generators: [generatorPv({ materialized_params: {} })] as never }),
        null,
      );
      expect(bezWartosci[0].catalogs[klucz]).toBeNull();
    },
  );

  it.each(DER_MATERIALIZED_PROFILE_KEYS)(
    'profil zgodności „%s": obecny w materialized_params.profiles → wartość w profiles, brak → null',
    (klucz) => {
      const wartosc = WARTOSC_DLA_KLUCZA[klucz];
      const zWartoscia = deryZModelu(
        migawka({
          generators: [
            generatorPv({ materialized_params: { profiles: { [klucz]: wartosc } } }),
          ] as never,
        }),
        null,
      );
      expect(zWartoscia[0].profiles[klucz]).toBe(wartosc);

      const bezWartosci = deryZModelu(
        migawka({
          generators: [generatorPv({ materialized_params: { profiles: {} } })] as never,
        }),
        null,
      );
      expect(bezWartosci[0].profiles[klucz]).toBeNull();
    },
  );

  describe('bess_operation_mode_refs — profil w KSZTAŁCIE LISTY (karta FAB-L)', () => {
    it('obecny w materialized_params.profiles → lista w profiles, brak → pusta tablica', () => {
      const zWartoscia = deryZModelu(
        migawka({
          generators: [
            generatorPv({
              materialized_params: {
                profiles: { bess_operation_mode_refs: ['mode_peak_shaving', 'mode_self_consumption'] },
              },
            }),
          ] as never,
        }),
        null,
      );
      expect(zWartoscia[0].profiles.bess_operation_mode_refs).toEqual([
        'mode_peak_shaving',
        'mode_self_consumption',
      ]);

      const bezWartosci = deryZModelu(
        migawka({ generators: [generatorPv({ materialized_params: { profiles: {} } })] as never }),
        null,
      );
      expect(bezWartosci[0].profiles.bess_operation_mode_refs).toEqual([]);
    });

    it('wartość spoza kształtu kontraktu (string zamiast listy) daje pustą tablicę, nie iteruje znaków', () => {
      // Iloczyn cech (KLASA NIE INSTANCJA pkt 2): zapis sprzed karty FAB-L albo
      // dana uszkodzona nie może zamienić się w listę jednoznakowych "trybów".
      const wynik = deryZModelu(
        migawka({
          generators: [
            generatorPv({
              materialized_params: { profiles: { bess_operation_mode_refs: 'mode_peak_shaving' } },
            }),
          ] as never,
        }),
        null,
      );
      expect(wynik[0].profiles.bess_operation_mode_refs).toEqual([]);
    });

    it('elementy nie-tekstowe albo puste w liście są odfiltrowane', () => {
      const wynik = deryZModelu(
        migawka({
          generators: [
            generatorPv({
              materialized_params: {
                profiles: { bess_operation_mode_refs: ['mode_peak_shaving', '', '  ', 7, null] },
              },
            }),
          ] as never,
        }),
        null,
      );
      expect(wynik[0].profiles.bess_operation_mode_refs).toEqual(['mode_peak_shaving']);
    });
  });
});
