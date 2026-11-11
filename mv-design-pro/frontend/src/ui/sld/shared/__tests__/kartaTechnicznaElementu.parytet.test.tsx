/**
 * K6 (Z-12) — test parytetu karty technicznej inspektora: iloczyn rodzaj elementu × dane
 * {pełne, brak}.
 *
 * Cechy iloczynu:
 *  - rodzaj karty: stacja, pole, aparat (w polu), łącznik (tor poza polem), transformator,
 *    odcinek, źródło OZE (tor SN), sieć zasilająca, szyna — `RODZAJE_KARTY`, każdy rodzaj
 *    z fikstury, test pada, gdy rodzaj nie ma przypadku;
 *  - dane: „pełne" (każda wielkość z modelu albo katalogu) i „brak" (ta sama topologia,
 *    bez parametrów, katalogów, nazw, oznaczeń, zabezpieczeń i przekładników).
 *
 * Kryterium: pole wymagane (`WYMAGANE_POLA_KARTY`) JEST na karcie w obu wariantach; przy
 * danych pełnych ma wartość (lista — co najmniej jedną pozycję, tabela — wiersz), przy braku
 * pokazuje „brak danych" (render `KartaTechnicznaElementu`, atrybut `data-brak`), z wyjątkiem
 * pól wyprowadzonych z samej topologii albo rodzaju obiektu (`Z_TOPOLOGII`) — te muszą mieć
 * wartość także bez parametrów. Brak danej nigdy nie zamienia się w wartość zastępczą.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { BayPrimaryDeviceKind, EnergyNetworkModel } from '../../../../types/enm';
import { symbolIdForPrimaryDeviceKind } from '../../v3/compose/apparatusSequence';
import { ROLA_SYMBOLU_PL } from '../identyfikatorAparatu';
import { KartaTechnicznaElementu } from '../../../network-build/inspektor-elementu/KartaTechnicznaElementu';
import type { DaneElementuKanwy } from '../daneElementuKanwy';
import {
  BRAK_DANYCH_PL,
  KATALOGI_PUSTE,
  POZYCJA_KATALOGU_BEZ_NAZWY_PL,
  RODZAJE_KARTY,
  WYMAGANE_POLA_KARTY,
  buildKartaTechniczna,
  kluczeKarty,
  type KartaTechniczna,
  type KatalogiKarty,
  type RodzajKarty,
  type WierszKarty,
} from '../kartaTechnicznaElementu';

type Wariant = 'pelne' | 'brak';

/** Rejestr ZAMKNIĘTY rodzajów rekordu aparatu pola — nowy rodzaj w `types/enm.ts` bez wpisu
 *  tu nie skompiluje się (iloczyn testu roli niżej). */
const RODZAJE_REKORDU = {
  CB: true,
  LOAD_SWITCH: true,
  DS: true,
  ES: true,
  CT: true,
  VT: true,
  CABLE_HEAD: true,
  TRANSFORMER_DEVICE: true,
  FUSE: true,
  GENERATOR_PV: true,
  GENERATOR_BESS: true,
  GENERATOR_FW: true,
  PCS: true,
  BATTERY: true,
  SURGE_ARRESTER: true,
  UNBALANCE_CT: true,
  PHASE_TO_PHASE_VT: true,
} as const satisfies Record<BayPrimaryDeviceKind, true>;

const KATALOGI: KatalogiKarty = {
  aparatySn: new Map([
    [
      'vd4-24-630-20',
      {
        id: 'vd4-24-630-20',
        name: 'VD4 24 kV 630 A 20 kA',
        u_n_kv: 24,
        i_n_a: 630,
        breaking_capacity_ka: 20,
        i_th_ka: 20,
        i_th_duration_s: 3,
        i_dyn_ka: 50,
      } as never,
    ],
  ]),
  transformatory: new Map([['tr-630-15-04', { name: 'TNOSCT 630 kVA 15/0,4 kV' }]]),
  przeksztaltniki: new Map([['conv-bess-2500', { name: 'PCS BESS 2,5 MW / 0,8 kV', manufacturer: 'Producent PCS' }]]),
  systemyZasilajace: new Map([['siec-110-250', { name: 'Sieć 110 kV · Sₖ″ 250 MVA' }]]),
  rodzinyRozdzielnic: new Map(),
  szablonyPol: [],
  operatorzyNcRfg: [
    {
      operator_id: 'pse',
      operator_name_pl: 'PSE — Polskie Sieci Elektroenergetyczne',
      reactive_power: { q_range_pct_pn_min: -0.33, q_range_pct_pn_max: 0.33, cos_phi_min: 0.95, voltage_control_modes: [] },
      ride_through: { lvrt: [{ time_s: 0, voltage_pu: 0.05 }], hvrt: [{ time_s: 0, voltage_pu: 1.3 }] },
    } as never,
  ],
  krzywePf: new Map([['pf-1', 'Charakterystyka P(f) operatora']]),
  profileDynamiki: [
    // Pełna pozycja katalogu (typ `DerDynamicProfileItem`, bez rzutowania) — niepełna atrapa
    // ukrywała, że etykieta profilu czyta proweniencję.
    {
      profile_id: 'dyn-bess',
      profile_name_pl: 'Profil BESS grid-following',
      der_kind: 'BESS',
      control_mode: 'grid_following',
      tp_s: 0.05,
      tq_s: 0.05,
      p_f_droop_pu: 0.04,
      p_f_dead_band_hz: 0.2,
      q_u_droop_pu: 4.0,
      q_u_dead_band_pu: 0.02,
      i_max_pu: 1.1,
      v_min_continuous_pu: 0.9,
      v_max_continuous_pu: 1.1,
      frt_response_time_ms: 30,
      iq_max_during_fault_pu: 1.0,
      iq_priority_during_fault: true,
      p_recovery_rate_pu_per_s: 0.2,
      p_recovery_delay_ms: 0,
      virtual_inertia_h_s: null,
      pll_kp: 50,
      pll_ki: 500,
      current_kp: 1,
      current_ki: 100,
      frt_k_factor: 2,
      gfm_control: null,
      virtual_damping_pu: null,
      virtual_resistance_pu: null,
      virtual_reactance_pu: null,
      current_limit_strategy: null,
      proweniencja: { zrodlo: 'karta_producenta', odniesienie: 'karta PCS 2,5 MW', data: null },
    },
  ],
};

/** Ta sama topologia w obu wariantach; `pelne` dokłada parametry, katalogi i oznaczenia. */
function model(wariant: Wariant): EnergyNetworkModel {
  const p = wariant === 'pelne';
  const jesli = <T,>(wartosc: T): T | undefined => (p ? wartosc : undefined);
  const szyna = (ref_id: string, voltage_kv: number, name: string) => ({
    id: ref_id,
    ref_id,
    name: p ? name : '',
    voltage_kv: p ? voltage_kv : undefined,
    tags: [],
    meta: {},
  });
  const katalogLacznika = p
    ? {
        catalog_ref: 'vd4-24-630-20',
        source_mode: 'KATALOG',
        materialized_params: { u_n_kv: 24, i_n_a: 630, breaking_capacity_ka: 20, catalog_item_version: '2024.1' },
      }
    : {};
  return {
    header: { name: 'parytet karty' },
    buses: [
      szyna('bus-sn', 15, 'Szyna SN ST-01'),
      szyna('bus-nn', 0.4, 'Szyna nN ST-01'),
      szyna('bus-z-in', 15, 'Zacisk pola 01'),
      szyna('bus-z-tr', 15, 'Zacisk pola TR'),
      szyna('bus-z-oze', 15, 'Zacisk pola OZE'),
      szyna('bus-daleka', 15, 'Szyna SN ST-02'),
      szyna('bus-sekcja', 15, 'Szyna łącznika sekcyjnego'),
      szyna('bus-der-sn', 15, 'Szyna SN toru OZE'),
      szyna('bus-der-nn', 0.8, 'Szyna falownika'),
      szyna('bus-gpz', 15, 'Szyna GPZ'),
    ],
    substations: [
      {
        id: 'st-1',
        ref_id: 'st-1',
        name: p ? 'Stacja Kowalska' : '',
        station_type: 'mv_lv',
        designation: jesli('ST-01/2026'),
        construction_type: jesli('kontenerowa'),
        bus_refs: ['bus-sn', 'bus-nn'],
        transformer_refs: ['tr-1'],
        tags: [],
        meta: {},
      },
      {
        id: 'st-2',
        ref_id: 'st-2',
        name: p ? 'Stacja Leśna' : '',
        station_type: 'mv_lv',
        bus_refs: ['bus-daleka'],
        transformer_refs: [],
        tags: [],
        meta: {},
      },
      {
        id: 'gpz-1',
        ref_id: 'gpz-1',
        name: p ? 'GPZ Miasto' : '',
        station_type: 'gpz',
        bus_refs: ['bus-gpz'],
        transformer_refs: [],
        tags: [],
        meta: {},
      },
    ],
    bays: [
      {
        id: 'bay-in',
        ref_id: 'bay-in',
        name: p ? 'Pole liniowe 01' : '',
        bay_role: 'IN',
        bay_number: jesli('01'),
        substation_ref: 'st-1',
        bus_ref: 'bus-sn',
        terminal_bus_ref: 'bus-z-in',
        equipment_refs: ['cb-in'],
        primary_devices: [{ device_ref: 'cb-in', kind: 'CB', linked_ref: 'cb-in', catalog_ref: jesli('vd4-24-630-20') }],
        protection_codes: p ? ['50', '51'] : [],
        tags: [],
        meta: {},
      },
      {
        id: 'bay-tr',
        ref_id: 'bay-tr',
        name: p ? 'Pole transformatorowe' : '',
        bay_role: 'TR',
        substation_ref: 'st-1',
        bus_ref: 'bus-sn',
        terminal_bus_ref: 'bus-z-tr',
        equipment_refs: [],
        tags: [],
        meta: {},
      },
      {
        id: 'bay-oze',
        ref_id: 'bay-oze',
        name: p ? 'Pole źródłowe OZE' : '',
        bay_role: 'OZE',
        substation_ref: 'st-1',
        bus_ref: 'bus-sn',
        terminal_bus_ref: 'bus-z-oze',
        equipment_refs: [],
        tags: [],
        meta: {},
      },
      {
        id: 'bay-nn',
        ref_id: 'bay-nn',
        name: p ? 'Odpływ nN 1' : '',
        bay_role: 'FEEDER',
        substation_ref: 'st-1',
        bus_ref: 'bus-nn',
        equipment_refs: [],
        tags: [],
        meta: {},
      },
    ],
    branches: [
      { id: 'cb-in', ref_id: 'cb-in', name: p ? 'Wyłącznik Q01' : '', type: 'breaker', from_bus_ref: 'bus-sn', to_bus_ref: 'bus-z-in', status: 'closed', tags: [], meta: {}, ...katalogLacznika },
      {
        id: 'kab-1',
        ref_id: 'kab-1',
        name: p ? 'Kabel ST-01 – ST-02' : '',
        type: 'cable',
        from_bus_ref: 'bus-z-in',
        to_bus_ref: 'bus-daleka',
        status: p ? 'closed' : undefined,
        length_km: jesli(1.25),
        r_ohm_per_km: jesli(0.253),
        x_ohm_per_km: jesli(0.112),
        cross_section_mm2: jesli(120),
        conductor_material: jesli('AL'),
        insulation: jesli('XLPE'),
        rating: p ? { in_a: 280 } : undefined,
        catalog_ref: jesli('xruhakxs-120'),
        source_mode: jesli('KATALOG'),
        materialized_params: p ? { trade_name: 'XRUHAKXS 1×120/50 12/20 kV', catalog_item_version: '2024.1' } : undefined,
        tags: [],
        meta: {},
      },
      {
        id: 'kab-oze',
        ref_id: 'kab-oze',
        name: p ? 'Kabel toru OZE' : '',
        type: 'cable',
        from_bus_ref: 'bus-z-oze',
        to_bus_ref: 'bus-der-sn',
        length_km: jesli(0.4),
        materialized_params: p ? { trade_name: 'XRUHAKXS 1×70/25 12/20 kV' } : undefined,
        tags: [],
        meta: {},
      },
      { id: 'sw-1', ref_id: 'sw-1', name: p ? 'Łącznik sekcyjny Ł1' : '', type: 'switch', from_bus_ref: 'bus-daleka', to_bus_ref: 'bus-sekcja', status: 'open', tags: [], meta: {}, ...katalogLacznika },
    ],
    transformers: [
      {
        id: 'tr-1',
        ref_id: 'tr-1',
        name: p ? 'T1 630 kVA' : '',
        hv_bus_ref: 'bus-z-tr',
        lv_bus_ref: 'bus-nn',
        sn_mva: jesli(0.63),
        uhv_kv: jesli(15),
        ulv_kv: jesli(0.4),
        uk_percent: jesli(6),
        pk_kw: jesli(6.5),
        p0_kw: jesli(0.8),
        i0_percent: jesli(0.5),
        vector_group: jesli('Dyn11'),
        tap_position: jesli(0),
        tap_min: jesli(-2),
        tap_max: jesli(2),
        tap_step_percent: jesli(2.5),
        lv_earthing_system: jesli('TN-C'),
        catalog_ref: jesli('tr-630-15-04'),
        source_mode: jesli('KATALOG'),
        tags: [],
        meta: {},
      },
      {
        id: 'tr-der',
        ref_id: 'tr-der',
        name: p ? 'Transformator blokowy OZE' : '',
        hv_bus_ref: 'bus-der-sn',
        lv_bus_ref: 'bus-der-nn',
        sn_mva: jesli(2.5),
        uhv_kv: jesli(15),
        ulv_kv: jesli(0.8),
        tags: [],
        meta: {},
      },
    ],
    loads: [{ id: 'load-1', ref_id: 'load-1', name: p ? 'Odbiór nN 1' : '', bus_ref: 'bus-nn', p_mw: jesli(0.12), q_mvar: 0, model: 'pq', tags: [], meta: {} }],
    generators: [
      {
        id: 'gen-sn',
        ref_id: 'gen-sn',
        name: p ? 'Magazyn BESS 2,5 MW' : '',
        gen_type: 'bess',
        station_ref: 'st-1',
        bus_ref: 'bus-der-nn',
        p_mw: jesli(2.5),
        q_mvar: 0,
        quantity: jesli(1),
        connection_variant: 'block_transformer',
        blocking_transformer_ref: 'tr-der',
        nc_rfg_module: jesli('B'),
        catalog_ref: jesli('conv-bess-2500'),
        source_mode: jesli('KATALOG'),
        // Tabliczka w kształcie zapisu backendu: wiązania profili w `profiles`, model
        // dynamiczny i zamiar ochrony płasko (`set_der_catalog_bindings`, `_materialize_nn_source`).
        materialized_params: p
          ? {
              catalog_item_id: 'conv-bess-2500',
              control_mode: 'Q_U_DROOP',
              dynamic_model_ref: 'dyn-bess',
              profiles: { nc_rfg_profile_ref: 'pse', lvrt_curve_ref: 'pse', hvrt_curve_ref: 'pse', pf_curve_ref: 'pf-1' },
              protection_intent: {
                breaker_role: 'wyłącznik źródła BESS',
                device_label: 'Zabezpieczenie źródła BESS',
                protected_object: 'przekształtnik BESS i kabel SN',
                analysis_scope: 'nadprądowe i ziemnozwarciowe',
              },
            }
          : undefined,
        tags: [],
        meta: { der_mv_field_ref: 'bay-oze', der_mv_cable_ref: 'kab-oze', ...(p ? { control_mode: 'Q_U_DROOP' } : {}) },
      },
      {
        id: 'gen-nn',
        ref_id: 'gen-nn',
        name: p ? 'Układ PV 0,5 MW' : '',
        gen_type: 'pv_inverter',
        station_ref: 'st-1',
        bus_ref: 'bus-nn',
        p_mw: jesli(0.5),
        q_mvar: 0,
        connection_variant: 'nn_side',
        tags: [],
        meta: {},
      },
    ],
    sources: [
      {
        id: 'src-1',
        ref_id: 'src-1',
        name: p ? 'Sieć zasilająca 110 kV' : '',
        bus_ref: 'bus-gpz',
        substation_ref: 'gpz-1',
        model: jesli('short_circuit_power'),
        sk3_mva: jesli(250),
        ik3_ka: jesli(9.62),
        rx_ratio: jesli(0.1),
        sk3_min_mva: jesli(180),
        ik3_min_ka: jesli(6.93),
        rx_ratio_min: jesli(0.12),
        u_set_pu: jesli(1.05),
        catalog_ref: jesli('siec-110-250'),
        tags: [],
        meta: {},
      },
    ],
    measurements: p
      ? [{ id: 'ct-1', ref_id: 'ct-1', name: 'CT pola 01', bay_ref: 'bay-in', measurement_type: 'CT', rating: { ratio_primary: 200, ratio_secondary: 5, accuracy_class: '5P20' }, tags: [], meta: {} },
         { id: 'vt-1', ref_id: 'vt-1', name: 'VT pola 01', bay_ref: 'bay-in', measurement_type: 'VT', rating: { ratio_primary: 15000, ratio_secondary: 100, accuracy_class: '0.5' }, tags: [], meta: {} }]
      : [],
    protection_assignments: p
      ? [{ id: 'pa-1', ref_id: 'pa-1', name: 'Zabezpieczenie pola 01', breaker_ref: 'cb-in', device_type: 'overcurrent', tags: [], meta: {} }]
      : [],
  } as unknown as EnergyNetworkModel;
}

/** Obiekt karty każdego rodzaju — wskazanie takie, jakie daje `buildDaneElementuKanwy`. */
const WSKAZANIE: Readonly<Record<RodzajKarty, Pick<DaneElementuKanwy, 'kind' | 'elementId'>>> = {
  stacja: { kind: 'station', elementId: 'st-1' },
  pole: { kind: 'apparatus', elementId: 'bay-in' },
  aparat: { kind: 'apparatus', elementId: 'cb-in' },
  lacznik: { kind: 'apparatus', elementId: 'sw-1' },
  transformator: { kind: 'transformer', elementId: 'tr-1' },
  odcinek: { kind: 'cable_run', elementId: 'kab-1' },
  zrodlo: { kind: 'generator', elementId: 'gen-sn' },
  siec_zasilajaca: { kind: 'grid_source', elementId: 'src-1' },
  szyna: { kind: 'bus', elementId: 'bus-sn' },
};

/**
 * Pola wyprowadzone z topologii albo z rodzaju obiektu — mają wartość także bez parametrów
 * (np. rodzaj stacji z pól, rola pola, lista pól na szynie). Każda pozycja to świadoma
 * decyzja: brak parametru nie usuwa wiedzy o połączeniach.
 */
const Z_TOPOLOGII: Readonly<Record<RodzajKarty, readonly string[]>> = {
  stacja: ['rodzaj', 'podstawa_rodzaju', 'sekcje_sn', 'tabela:pola_sn', 'nn_sekcje', 'nn_odplywy', 'nn_odbiory', 'nn_zrodla', 'tabela:przylaczenia', 'nazwa_naglowka'],
  // „przekladniki" to lista z modelu: pole bez przekładnika to fakt „brak w modelu", nie luka.
  pole: ['rola', 'stacja', 'szyna', 'tabela:aparaty', 'przylaczenie', 'przekladniki'],
  aparat: ['nazwa', 'rodzaj', 'pole', 'stacja', 'stan'],
  lacznik: ['rodzaj', 'polaczenie', 'stan'],
  transformator: ['rola', 'stacja'],
  odcinek: ['rodzaj', 'od', 'do'],
  zrodlo: ['rodzaj', 'stacja', 'wariant', 'szyna_przylaczenia', 'pole_zrodlowe', 'tr_blokowy', 'kabel_sn'],
  siec_zasilajaca: ['stacja', 'szyna'],
  szyna: ['stacja', 'pola', 'galezie'],
};

function karta(rodzaj: RodzajKarty, wariant: Wariant): KartaTechniczna {
  const snapshot = model(wariant);
  const wynik = buildKartaTechniczna(snapshot, WSKAZANIE[rodzaj] as DaneElementuKanwy, wariant === 'pelne' ? KATALOGI : undefined);
  expect(wynik, `karta ${rodzaj} (${wariant})`).not.toBeNull();
  expect(wynik!.rodzaj).toBe(rodzaj);
  return wynik!;
}

function wiersze(k: KartaTechniczna): Map<string, WierszKarty> {
  return new Map(k.sekcje.flatMap((s) => s.wiersze.map((w) => [w.klucz, w] as const)));
}

function tabele(k: KartaTechniczna) {
  return new Map(k.sekcje.flatMap((s) => (s.tabele ?? []).map((t) => [`tabela:${t.klucz}`, t] as const)));
}

afterEach(cleanup);

describe('karta techniczna — parytet rodzaj × dane {pełne, brak}', () => {
  it('każdy rodzaj karty ma przypadek w iloczynie', () => {
    expect([...RODZAJE_KARTY].sort()).toEqual(Object.keys(WSKAZANIE).sort());
    expect([...RODZAJE_KARTY].sort()).toEqual(Object.keys(WYMAGANE_POLA_KARTY).sort());
  });

  describe.each(RODZAJE_KARTY.map((r) => [r] as const))('%s', (rodzaj) => {
    it('dane pełne: każde pole wymagane ma wartość (lista z pozycją, tabela z wierszem)', () => {
      const k = karta(rodzaj, 'pelne');
      const w = wiersze(k);
      const t = tabele(k);
      const klucze = kluczeKarty(k);
      for (const pole of WYMAGANE_POLA_KARTY[rodzaj]) {
        expect(klucze, `${rodzaj}: brak pola ${pole}`).toContain(pole);
        if (pole.startsWith('tabela:')) {
          expect(t.get(pole as `tabela:${string}`)!.wiersze.length, `${rodzaj}: pusta ${pole}`).toBeGreaterThan(0);
          continue;
        }
        const wiersz = w.get(pole)!;
        expect(wiersz.wartosc, `${rodzaj}: ${pole} bez wartości`).not.toBeNull();
        if (wiersz.lista) expect(wiersz.lista.length, `${rodzaj}: pusta lista ${pole}`).toBeGreaterThan(0);
      }
    });

    it('brak danych: pole wymagane jest na karcie i pokazuje „brak danych" (poza polami z topologii)', () => {
      const k = karta(rodzaj, 'brak');
      const w = wiersze(k);
      const klucze = kluczeKarty(k);
      render(<KartaTechnicznaElementu karta={k} onEdytuj={null} />);
      for (const pole of WYMAGANE_POLA_KARTY[rodzaj]) {
        expect(klucze, `${rodzaj}: brak pola ${pole}`).toContain(pole);
        if (pole.startsWith('tabela:')) continue;
        const wiersz = w.get(pole)!;
        const element = screen.getByTestId(`inspektor-karta-pole-${pole}`);
        if (Z_TOPOLOGII[rodzaj].includes(pole)) {
          expect(wiersz.wartosc, `${rodzaj}: ${pole} z topologii bez wartości`).not.toBeNull();
          continue;
        }
        expect(wiersz.wartosc, `${rodzaj}: ${pole} ma wartość zastępczą „${wiersz.wartosc}"`).toBeNull();
        expect(element).toHaveAttribute('data-brak', 'true');
        // Karty pola i stacji: każdy brak nazywa, czego brakuje i jak to uzupełnić — nigdy ogólne
        // „brak danych” (decyzja architekta pkt 3). Pozostałe rodzaje: opis braku, gdy model go
        // podaje, inaczej „brak danych”.
        if (rodzaj === 'pole' || rodzaj === 'stacja') {
          expect(wiersz.brakPl, `${rodzaj}: ${pole} bez opisu braku`).toBeTruthy();
          expect(wiersz.brakPl).not.toMatch(/brak danych/u);
        }
        expect(within(element).getByTestId(`inspektor-karta-wartosc-${pole}`)).toHaveTextContent(wiersz.brakPl ?? BRAK_DANYCH_PL);
      }
    });
  });

  // Tabela pól stacji jest ZWARTA (§10 kontraktu prezentacji, decyzja architekta 2026-11-04):
  // jedno pole = jeden wiersz mieszczący się w szerokości inspektora — pole, nr, rola i stan
  // (rola ważniejsza dla inżyniera niż rodzaj aparatu głównego — decyzja architekta pkt 1).
  // Aparaty i ich znamiona, zabezpieczenie i przekładniki mówi karta pola, typ katalogowy
  // aparatu — karta aparatu (jedna informacja w jednym miejscu) — przypięte niżej.
  it('stacja, dane pełne: zwarta tabela pól — pole, nr, rola, stan; reszta na karcie pola i aparatu', () => {
    const k = karta('stacja', 'pelne');
    const pola = tabele(k).get('tabela:pola_sn')!;
    expect(pola.kolumny.map((c) => c.etykieta)).toEqual(['Nr', 'Pole', 'Rola', 'Stan']);
    expect(pola.zrodloPl ?? null).toBeNull();
    const pole01 = pola.wiersze.find((r) => r.klucz === 'bay-in')!;
    expect(pole01.komorki).toEqual({
      nr: '01',
      pole: 'Pole liniowe 01',
      rola: 'Pole liniowe wejściowe',
      stan: 'zamknięty',
    });
    // Rola słowami kanonu ról pól, także dla pola bez aparatu w modelu.
    const poleTr = pola.wiersze.find((r) => r.klucz === 'bay-tr')!;
    expect(poleTr.komorki.rola).toBe('Pole transformatorowe');
    // Znamiona i zabezpieczenie pola z tabeli stacji są na karcie pola.
    const pole = wiersze(karta('pole', 'pelne'));
    expect(pole.get('rola')!.wartosc).toBeTruthy();
    // Jedno źródło zabezpieczenia pola (`zabezpieczeniePola`): sterownik przypisany (tu przez
    // wyłącznik pola) z funkcjami z nastaw, obok funkcje wymagane przez wzorzec pola.
    expect(pole.get('zabezpieczenie')!.wartosc).toBe('Zabezpieczenie pola 01: bez nastaw funkcji');
    expect(pole.get('funkcje_wymagane')!.wartosc).toBe('50, 51');
    const aparaty = tabele(karta('pole', 'pelne')).get('tabela:aparaty')!;
    expect(aparaty.wiersze.find((r) => r.klucz === 'cb-in')!.komorki).toMatchObject({ ur: '24', ir: '630', ik: '20' });
    expect(wiersze(karta('aparat', 'pelne')).get('typ')?.wartosc).toBe('VD4 24 kV 630 A 20 kA');
    const tr = wiersze(k);
    expect(tr.get('tr_typ')!.wartosc).toBe('TNOSCT 630 kVA 15/0,4 kV');
    expect(k.sekcje.find((s) => s.id === 'transformator')!.zrodloPl).toBe('katalog: TNOSCT 630 kVA 15/0,4 kV');
  });

  // Iloczyn rodzaju przekładnika {prądowy · napięciowy}: lista pola pokazuje oba z polską
  // nazwą (bez kodu CT/VT).
  it('przekładniki pola: oba rodzaje z polską nazwą', () => {
    const lista = wiersze(karta('pole', 'pelne')).get('przekladniki')!.lista;
    expect(lista).toEqual(['przekładnik prądowy 200/5 A · kl. 5P20', 'przekładnik napięciowy 15 000/100 V · kl. 0.5']);
    expect(lista!.join(' ')).not.toMatch(/\b(CT|VT)\b/);
  });

  it('kolejność sekcji stacji: Identyfikacja, Rozdzielnica SN, Transformator, Strona nN, Przyłączenia', () => {
    expect(karta('stacja', 'pelne').sekcje.map((s) => s.id)).toEqual([
      'identyfikacja',
      'rozdzielnica_sn',
      'transformator',
      'strona_nn',
      'przylaczenia',
    ]);
  });

  it('źródło OZE: typ i producent z katalogu, zgodność NC RfG/FRT i zabezpieczenie z pól modelu', () => {
    const w = wiersze(karta('zrodlo', 'pelne'));
    expect(w.get('typ')!.wartosc).toBe('PCS BESS 2,5 MW / 0,8 kV');
    expect(w.get('producent')!.wartosc).toBe('Producent PCS');
    expect(w.get('profil_ncrfg')!.wartosc).toBe('PSE — Polskie Sieci Elektroenergetyczne');
    expect(w.get('zakres_q')!.wartosc).toBe('od -33 % do 33 % mocy znamionowej');
    expect(w.get('cos_phi_min')!.wartosc).toBe('0,95');
    expect(w.get('krzywa_pf')!.wartosc).toBe('Charakterystyka P(f) operatora');
    expect(w.get('lvrt')!.wartosc).toBe('PSE — Polskie Sieci Elektroenergetyczne · liczba punktów obwiedni: 1');
    expect(w.get('model_dynamiczny')!.wartosc).toContain('Profil BESS grid-following');
    expect(w.get('zab_urzadzenie')!.wartosc).toBe('Zabezpieczenie źródła BESS');
    expect(w.get('zab_zakres')!.wartosc).toBe('nadprądowe i ziemnozwarciowe');
  });

  /**
   * Iloczyn: wiązanie w modelu {jest, brak} × katalog {zna pozycję, nie zna (niewczytany albo
   * pozycja spoza katalogu)} dla KAŻDEGO wiersza karty źródła i sieci czytającego katalog.
   * Wiązanie + katalog zna → nazwa; wiązanie + katalog nie zna → opis jawny (nigdy
   * identyfikator); brak wiązania → „brak danych”.
   */
  it.each([
    ['zrodlo', 'typ', POZYCJA_KATALOGU_BEZ_NAZWY_PL],
    ['zrodlo', 'profil_ncrfg', 'profil spoza katalogu profili operatorów'],
    ['zrodlo', 'krzywa_pf', 'charakterystyka spoza katalogu charakterystyk P(f)'],
    ['zrodlo', 'lvrt', 'obwiednia spoza katalogu profili operatorów'],
    ['zrodlo', 'hvrt', 'obwiednia spoza katalogu profili operatorów'],
    ['zrodlo', 'model_dynamiczny', 'profil spoza katalogu modeli dynamicznych'],
    ['siec_zasilajaca', 'typ', POZYCJA_KATALOGU_BEZ_NAZWY_PL],
  ] as const)('%s.%s: katalog nie zna wiązania — opis jawny, nie identyfikator', (rodzaj, klucz, opis) => {
    const k = buildKartaTechniczna(model('pelne'), WSKAZANIE[rodzaj] as DaneElementuKanwy, KATALOGI_PUSTE)!;
    expect(wiersze(k).get(klucz)!.wartosc).toBe(opis);
    expect(wiersze(karta(rodzaj, 'pelne')).get(klucz)!.wartosc).not.toBe(opis);
    expect(wiersze(karta(rodzaj, 'brak')).get(klucz)!.wartosc).toBeNull();
  });

  /** Żaden wiersz żadnej karty nie pokazuje identyfikatora pozycji katalogu ani wiązania
   *  profilu — ani z katalogami, ani bez nich (katalog niewczytany). */
  it.each(RODZAJE_KARTY.map((r) => [r] as const))('%s: identyfikatory katalogu nie trafiają na kartę', (rodzaj) => {
    const KODY = ['vd4-24-630-20', 'tr-630-15-04', 'conv-bess-2500', 'siec-110-250', 'pse', 'pf-1', 'dyn-bess'];
    for (const katalogi of [KATALOGI, KATALOGI_PUSTE]) {
      const k = buildKartaTechniczna(model('pelne'), WSKAZANIE[rodzaj] as DaneElementuKanwy, katalogi)!;
      const teksty = k.sekcje.flatMap((s) => [
        s.zrodloPl ?? '',
        ...s.wiersze.flatMap((w) => [w.wartosc ?? '', w.zrodloPl ?? '', ...(w.lista ?? [])]),
        ...(s.tabele ?? []).flatMap((t) => t.wiersze.flatMap((r) => Object.values(r.komorki).map((v) => v ?? ''))),
      ]);
      for (const kod of KODY) {
        expect(teksty.filter((t) => t === kod || t.includes(`${kod} `) || t.endsWith(` ${kod}`) || t.includes(`: ${kod}`)), `${rodzaj}: ${kod}`).toEqual([]);
      }
    }
  });

  it('sieć zasilająca: typ z katalogu sieci i model zastępczy nazwą ze słownika zamkniętego', () => {
    const w = wiersze(karta('siec_zasilajaca', 'pelne'));
    expect(w.get('typ')!.wartosc).toBe('Sieć 110 kV · Sₖ″ 250 MVA');
    expect(w.get('model')!.wartosc).toBe('moc zwarciowa i stosunek R/X');
    const nieznany = { ...model('pelne'), sources: [{ ...model('pelne').sources![0], model: 'toString' }] } as unknown as EnergyNetworkModel;
    const k = buildKartaTechniczna(nieznany, WSKAZANIE.siec_zasilajaca as DaneElementuKanwy, KATALOGI)!;
    expect(wiersze(k).get('model')!.wartosc).toBe('model zastępczy spoza słownika aplikacji');
  });

  it('źródło OZE po stronie SN: tor przyłączenia (pole SN, transformator blokowy, kabel) i tryb regulacji ze źródłem', () => {
    const w = wiersze(karta('zrodlo', 'pelne'));
    expect(w.get('pole_zrodlowe')!.wartosc).toBe('Pole źródłowe OZE');
    expect(w.get('tr_blokowy')!.wartosc).toBe('Transformator blokowy OZE · 2,5 MVA · 15 kV/0,8 kV');
    expect(w.get('kabel_sn')!.wartosc).toBe('XRUHAKXS 1×70/25 12/20 kV · 0,4 km');
    expect(w.get('tryb_regulacji')!.wartosc).toBe('Regulacja Q(U) — charakterystyka opadająca');
    expect(w.get('tryb_regulacji')!.zrodloPl).toBe('katalog przekształtnika');
  });

  it('odcinek kablowy: materiał żyły i izolacja nazwą z jednego słownika wartości kodowych, nie kodem', () => {
    const w = wiersze(karta('odcinek', 'pelne'));
    expect(w.get('material')!.wartosc).toBe('aluminium (Al)');
    expect(w.get('izolacja')!.wartosc).toBe('polietylen usieciowany (XLPE)');
    expect(wiersze(karta('odcinek', 'brak')).get('material')!.wartosc).toBeNull();
  });

  // Iloczyn: KAŻDY rodzaj rekordu aparatu pola (`BayPrimaryDeviceKind`, rejestr zamknięty
  // `satisfies Record<…>`) × karta aparatu. Rola techniczna pochodzi z JEDNEGO słownika
  // symboli kanwy (`ROLA_SYMBOLU_PL`) przez symbol, którym scena rysuje rekord
  // (`symbolIdForPrimaryDeviceKind`); rekord bez symbolu na kanwie nie dostaje roli zastępczej.
  it.each(Object.keys(RODZAJE_REKORDU) as BayPrimaryDeviceKind[])(
    'aparat pola z rekordu %s: rola techniczna z rodzaju symbolu kanwy albo brak wiersza',
    (kind) => {
      const snapshot = model('pelne');
      const zRekordem = {
        ...snapshot,
        bays: snapshot.bays.map((b) =>
          b.ref_id === 'bay-in'
            ? { ...b, primary_devices: [{ device_ref: 'dev-x', kind, symbol_ref: 'x', placement: 'MIDSTREAM', is_controllable: false }] }
            : b,
        ),
      } as EnergyNetworkModel;
      const k = buildKartaTechniczna(zRekordem, { kind: 'apparatus', elementId: 'dev-x' } as DaneElementuKanwy, KATALOGI);
      expect(k?.rodzaj).toBe('aparat');
      const symbol = symbolIdForPrimaryDeviceKind(kind);
      const rola = wiersze(k!).get('rola');
      if (symbol === null) {
        expect(rola).toBeUndefined();
        return;
      }
      expect(rola?.wartosc).toBe(ROLA_SYMBOLU_PL[symbol]);
    },
  );

  it('stacja bez transformatora w modelu: jawny stan pusty sekcji, nie tabliczka zastępcza', () => {
    const snapshot = model('pelne');
    const bezTr = { ...snapshot, transformers: [], substations: snapshot.substations.map((s) => ({ ...s, transformer_refs: [] })) };
    const k = buildKartaTechniczna(bezTr as EnergyNetworkModel, { kind: 'station', elementId: 'st-1' } as DaneElementuKanwy, KATALOGI)!;
    const sekcja = k.sekcje.find((s) => s.id === 'transformator')!;
    expect(sekcja.pustaPl).toBe('Stacja nie ma transformatora w modelu.');
    expect(sekcja.wiersze).toHaveLength(0);
  });
});
