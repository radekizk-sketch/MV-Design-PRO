// @vitest-environment node
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
  derZGeneratoraModelu,
  deryStacjiZModelu,
  deryZModelu,
  refKataloguTransformatoraDedykowanego,
} from '../zModelu';
import type { BlockTransformerItem } from '../katalogi-stacji-api';

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

  /**
   * Karta CERTYFIKAT-Z-KATALOGU: ryzyko nazwane przy odbiorze karty — status
   * certyfikatu PTPiREE jest POCHODNĄ katalogu, nie wyborem projektanta
   * (`DerCatalogSelections.ptpiree_status`). Bez tej naprawy lokalny zapis
   * (jakimkolwiek mechanizmem — store bez backendu) PRZEŻYWAŁBY synchronizację
   * z modelem i ekran pokazywałby powiązanie z wykazem na podstawie DEKLARACJI,
   * nie katalogu — DOKŁADNIE ta sama klasa fabrykacji co usunięte
   * `includes('ptpiree')`, tylko innym mechanizmem (zapis zamiast zgadywania z nazwy).
   * (Karta AB-1a Pakiet D2: kliencki predykat statusu certyfikatu skasowany — status
   * pokazuje się wyłącznie z adnotacji backendu, którą ten test przypina do modelu.)
   */
  it('samodeklarowany ptpiree_certificate_ref na id modelu NIE PRZEŻYWA ponownej synchronizacji', () => {
    const dery = deryZModelu(migawka({ generators: [generatorPv()] as never }), null);
    useStationDerStore.getState().synchronizujZModelu(dery);
    useStationDerStore.getState().updateDerCatalogs('pv/111/converter', {
      ptpiree_certificate_ref: 'samodeklarowany-fake',
      ptpiree_status: 'POWIAZANY',
    });
    expect(
      useStationDerStore.getState().ders['pv/111/converter']?.catalogs.ptpiree_certificate_ref,
    ).toBe('samodeklarowany-fake');

    // Ponowna synchronizacja TĄ SAMĄ migawką — model nadal nie ma certyfikatu.
    useStationDerStore.getState().synchronizujZModelu(dery);
    const wynik = useStationDerStore.getState().ders['pv/111/converter'];

    expect(wynik?.catalogs.ptpiree_certificate_ref).toBeNull();
    expect(wynik?.catalogs.ptpiree_status).toBeNull();
  });

  it('readiness lokalna (updateDerReadiness) PRZEŻYWA synchronizację — naprawa jest WĄSKA, nie ogólna zmiana precedencji', () => {
    const dery = deryZModelu(migawka({ generators: [generatorPv()] as never }), null);
    useStationDerStore.getState().synchronizujZModelu(dery);
    useStationDerStore.getState().updateDerReadiness('pv/111/converter', { sc_3f: 'ready' });
    useStationDerStore.getState().synchronizujZModelu(dery);

    expect(useStationDerStore.getState().ders['pv/111/converter']?.readiness.sc_3f).toBe('ready');
  });

  it('certyfikat Z MODELU (materialized_params.ptpiree_status) PRZEŻYWA synchronizację niezmieniony', () => {
    const dery = deryZModelu(
      migawka({
        generators: [
          generatorPv({
            materialized_params: {
              ptpiree_status: 'POWIAZANY',
              ptpiree_certificate_ref: 'ptpiree-wipwc-1-2-row-3254',
            },
          }),
        ] as never,
      }),
      null,
    );
    useStationDerStore.getState().synchronizujZModelu(dery);
    useStationDerStore.getState().synchronizujZModelu(dery);
    const wynik = useStationDerStore.getState().ders['pv/111/converter'];

    expect(wynik?.catalogs.ptpiree_status).toBe('POWIAZANY');
    expect(wynik?.catalogs.ptpiree_certificate_ref).toBe('ptpiree-wipwc-1-2-row-3254');
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

  /**
   * Karta CERTYFIKAT-Z-KATALOGU: `ptpiree_status`/`ptpiree_certificate_ref` są
   * specjalnym przypadkiem (jak `battery_catalog_ref`) — POZA pętlą
   * `DER_MATERIALIZED_BINDING_KEYS`, bo backend je zapisuje WYŁĄCZNIE przy
   * materializacji urządzenia (`_certyfikat_ptpiree_z_katalogu`), nigdy przez
   * `set_der_catalog_bindings`. Test round-trip pilnuje, że oba pola tej samej
   * adnotacji trafiają do `catalogs` NIEZALEŻNIE (jedno obecne bez drugiego nie
   * jest realnym stanem backendu — `annotate_with_ptpiree_status` zapisuje je
   * razem — ale odczyt frontu musi być odporny na oba osobno).
   */
  describe('ptpiree_status / ptpiree_certificate_ref — tabliczka certyfikatu PTPiREE', () => {
    it('oba pola obecne w materialized_params → oba w catalogs', () => {
      const dery = deryZModelu(
        migawka({
          generators: [
            generatorPv({
              materialized_params: {
                ptpiree_status: 'POWIAZANY',
                ptpiree_certificate_ref: 'ptpiree-wipwc-1-2-row-3254',
              },
            }),
          ] as never,
        }),
        null,
      );
      expect(dery[0].catalogs.ptpiree_status).toBe('POWIAZANY');
      expect(dery[0].catalogs.ptpiree_certificate_ref).toBe('ptpiree-wipwc-1-2-row-3254');
    });

    it('brak tabliczki certyfikatu → oba pola null (uczciwy stan zerowy, nie zgadywanie)', () => {
      const dery = deryZModelu(
        migawka({ generators: [generatorPv({ materialized_params: {} })] as never }),
        null,
      );
      expect(dery[0].catalogs.ptpiree_status).toBeNull();
      expect(dery[0].catalogs.ptpiree_certificate_ref).toBeNull();
    });

    it('ptpiree_status=NIEPOWIAZANY bez referencji → status NIEPOWIAZANY czytelny wprost (nie null)', () => {
      const dery = deryZModelu(
        migawka({
          generators: [
            generatorPv({ materialized_params: { ptpiree_status: 'NIEPOWIAZANY' } }),
          ] as never,
        }),
        null,
      );
      expect(dery[0].catalogs.ptpiree_status).toBe('NIEPOWIAZANY');
      expect(dery[0].catalogs.ptpiree_certificate_ref).toBeNull();
    });
  });

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

describe('refKataloguTransformatoraDedykowanego — tożsamość z modelu, nie dopasowanie po danych', () => {
  // Dwie pozycje listy o TYCH SAMYCH danych elektrycznych (np. olejowa i sucha): dawna
  // inferencja po (moc, napięcia, grupa) brała pierwszą z listy, czyli mogła podstawić
  // cudzą pozycję. Iloczyn: catalog_ref transformatora {pozycja A, pozycja B, spoza listy,
  // brak} × wskazanie wytwórcy {istniejący transformator, nieistniejący, brak}.
  const pozycja = (id: string): BlockTransformerItem => ({
    id,
    catalog_namespace: 'TRAFO_SN_NN',
    catalog_version: 'legacy',
    label_pl: id,
    sn_kva: 1250,
    hv_kv: 15,
    lv_kv: 0.69,
    uk_percent: 6,
    pk_kw: 12,
    p0_kw: 2,
    i0_percent: 0.5,
    vector_group: 'Dyn11',
    is_mv_to_mv: false,
    applicable_der_kinds: ['PV', 'BESS', 'FW'],
    galvanic_isolation: true,
    source_reference: 'fikstura',
    verification_status: 'VERIFIED',
  });
  const LISTA = [pozycja('tr-a'), pozycja('tr-b')];
  const zTransformatorem = (catalogRef: string | null) =>
    migawka({
      transformers: [
        {
          ref_id: 'tr-1',
          id: 'tr-1',
          sn_mva: 1.25,
          uhv_kv: 15,
          ulv_kv: 0.69,
          vector_group: 'Dyn11',
          catalog_ref: catalogRef,
        },
      ],
    } as unknown as Partial<EnergyNetworkModel>);

  it.each([
    ['tr-a', 'tr-a'],
    ['tr-b', 'tr-b'],
    ['tr-spoza-listy', null],
    [null, null],
  ])('catalog_ref %s → pozycja %s', (catalogRef, oczekiwana) => {
    expect(refKataloguTransformatoraDedykowanego(zTransformatorem(catalogRef), 'tr-1', LISTA)).toBe(
      oczekiwana,
    );
  });

  it.each([['tr-nieistniejacy'], [null]])('wskazanie %s → brak pozycji', (wskazanie) => {
    expect(refKataloguTransformatoraDedykowanego(zTransformatorem('tr-a'), wskazanie, LISTA)).toBeNull();
  });
});

describe('derZGeneratoraModelu — JEDEN czytnik generatora dla magazynu i widoku źródła', () => {
  // Karta JEDNA-SCIEZKA-EDYCJI: widok źródła miał drugie odwzorowanie, które rozjeżdżało się
  // z magazynem (nieznany wariant → nN, liczba jednostek z innego słownika, zmyślone
  // `tr_${ref}`). Iloczyn cech: wariant {nn_side, block_transformer, alias zastany} ×
  // transformator dedykowany {wskazany, niewskazany} × liczba jednostek {w meta, brak}.
  // Kryterium: rekord pojedynczego odczytu === rekord z `deryZModelu` (ten sam czytnik)
  // i nigdy referencja transformatora, którego w modelu nie ma.
  const TRANSFORMATOR = {
    ref_id: 'tr-ded-1',
    id: 'tr-ded-1',
    hv_bus_ref: 'bus-sn-1',
    lv_bus_ref: SZYNA_NN,
    sn_mva: 1.25,
    catalog_ref: 'tr-a',
  };
  const przypadki = ['nn_side', 'block_transformer', 'DEDICATED_MV_CONNECTION'].flatMap((wariant) =>
    [true, false].flatMap((zTransformatorem) =>
      [true, false].map((zLiczba) => [wariant, zTransformatorem, zLiczba] as const),
    ),
  );

  it.each(przypadki)('wariant %s × transformator %s × liczba jednostek %s', (wariant, zTr, zLiczba) => {
    const generator = generatorPv({
      connection_variant: wariant,
      ...(zTr ? { blocking_transformer_ref: 'tr-ded-1' } : {}),
      meta: zLiczba ? { quantity: 4 } : {},
    });
    const snapshot = migawka({
      generators: [generator],
      transformers: [TRANSFORMATOR],
      buses: [
        { ref_id: SZYNA_NN, id: SZYNA_NN, voltage_kv: 0.8 },
        { ref_id: 'bus-sn-1', id: 'bus-sn-1', voltage_kv: 15 },
      ],
    } as unknown as Partial<EnergyNetworkModel>);
    const pojedynczy = derZGeneratoraModelu(snapshot, 'pv/111/converter');
    const zListy = deryZModelu(snapshot, null).find((der) => der.id === 'pv/111/converter');
    expect(pojedynczy).not.toBeNull();
    expect(pojedynczy).toEqual(zListy);
    expect(pojedynczy?.transformer_ref).toBe(zTr ? 'tr-ded-1' : null);
    expect(pojedynczy?.connection_side).toBe(wariant === 'nn_side' ? 'nN' : 'dedicated_transformer');
    expect(pojedynczy?.unit_count).toBe(zLiczba ? 4 : null);
    expect(pojedynczy?.sn_connection_bus_ref).toBe(
      zTr && wariant !== 'nn_side' ? 'bus-sn-1' : null,
    );
  });

  it.each([
    ['generator spoza modelu', 'pv/nieistniejacy', {}],
    ['rodzaj nierozpoznany', 'pv/111/converter', { gen_type: 'synchronous', catalog_namespace: null, catalog_ref: null, ref_id: 'gen/111', id: 'gen/111' }],
    ['brak stacji', 'pv/111/converter', { station_ref: null, bus_ref: 'inna/szyna' }],
  ])('%s → null (bez domysłu)', (_opis, ref, zmiana) => {
    const snapshot = migawka({ generators: [generatorPv(zmiana)] } as unknown as Partial<EnergyNetworkModel>);
    expect(derZGeneratoraModelu(snapshot, ref)).toBeNull();
  });

  it('brak migawki albo wskazania → null', () => {
    expect(derZGeneratoraModelu(null, 'pv/111/converter')).toBeNull();
    expect(derZGeneratoraModelu(migawka(), null)).toBeNull();
  });
});
