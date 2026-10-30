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

import type { EnergyNetworkModel } from '../../../../types/enm';
import { KartaTechnicznaElementu } from '../../../network-build/inspektor-elementu/KartaTechnicznaElementu';
import type { DaneElementuKanwy } from '../daneElementuKanwy';
import {
  BRAK_DANYCH_PL,
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
  szablonyPol: new Map(),
  rodzinyRozdzielnic: new Map(),
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
        stan_obiektu: jesli('PROJEKTOWANY'),
        primary_devices: [
          { device_ref: 'cb-in', kind: 'CB', linked_ref: 'cb-in', catalog_ref: jesli('vd4-24-630-20'), stan_obiektu: jesli('PROJEKTOWANY') },
        ],
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
      { id: 'sw-1', ref_id: 'sw-1', name: p ? 'Łącznik sekcyjny Ł1' : '', type: 'switch', from_bus_ref: 'bus-daleka', to_bus_ref: 'bus-sekcja', status: 'open', stan_obiektu: jesli('ISTNIEJACY'), tags: [], meta: {}, ...katalogLacznika },
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
        materialized_params: p ? { name: 'PCS BESS 2,5 MW / 0,8 kV', control_mode: 'Q_U_DROOP' } : undefined,
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
        sk3_mva: jesli(250),
        ik3_ka: jesli(9.62),
        rx_ratio: jesli(0.1),
        sk3_min_mva: jesli(180),
        ik3_min_ka: jesli(6.93),
        rx_ratio_min: jesli(0.12),
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
        expect(within(element).getByTestId(`inspektor-karta-wartosc-${pole}`)).toHaveTextContent(BRAK_DANYCH_PL);
      }
    });
  });

  it('stacja, dane pełne: tabela pól — nr, rola, aparat główny z katalogu, Uᵣ, Iᵣ, zdolność wyłączalna, stan, zabezpieczenie i CT', () => {
    const k = karta('stacja', 'pelne');
    const pola = tabele(k).get('tabela:pola_sn')!;
    const pole01 = pola.wiersze.find((r) => r.klucz === 'bay-in')!;
    expect(pole01.komorki).toEqual({
      nr: '01',
      pole: 'Pole liniowe 01',
      rola: expect.any(String),
      aparat: 'Wyłącznik · VD4 24 kV 630 A 20 kA',
      ur: '24 kV',
      ir: '630 A',
      ik: '20 kA',
      stan: 'zamknięty',
      zabezpieczenie: 'Zabezpieczenie pola 01 (nadprądowe) · funkcje 50, 51 · przekładnik prądowy 200/5 A · kl. 5P20',
    });
    // Pole bez aparatu w modelu: komórki aparatu „brak danych", nie aparat z konwencji.
    const poleTr = pola.wiersze.find((r) => r.klucz === 'bay-tr')!;
    expect(poleTr.komorki.aparat).toBeNull();
    expect(poleTr.komorki.ik).toBeNull();
    const tr = wiersze(k);
    expect(tr.get('tr_typ')!.wartosc).toBe('TNOSCT 630 kVA 15/0,4 kV');
    expect(k.sekcje.find((s) => s.id === 'transformator')!.zrodloPl).toBe('katalog: TNOSCT 630 kVA 15/0,4 kV');
  });

  // Stan obiektu (karta UX-04, korekta stanu obiektu): iloczyn nośnika {pole, rekord aparatu pola,
  // łącznik toru z własnym stanem, łącznik pola bez rekordu i bez stanu własnego → stan pola}.
  it('stan obiektu: pole, aparat pola, łącznik toru i łącznik pola dziedziczący stan pola', () => {
    expect(wiersze(karta('pole', 'pelne')).get('stan_obiektu')!.wartosc).toBe('projektowany');
    expect(tabele(karta('pole', 'pelne')).get('tabela:aparaty')!.wiersze[0].komorki.stan_obiektu).toBe('projektowany');
    expect(wiersze(karta('aparat', 'pelne')).get('stan_obiektu')!.wartosc).toBe('projektowany');
    expect(wiersze(karta('lacznik', 'pelne')).get('stan_obiektu')!.wartosc).toBe('istniejący');
    // Pole bez rekordów aparatów: łącznik z `equipment_refs` bez stanu własnego dziedziczy stan pola.
    const snapshot = model('pelne');
    const bay = snapshot.bays!.find((b) => b.ref_id === 'bay-in')!;
    bay.stan_obiektu = 'ISTNIEJACY';
    bay.primary_devices = [];
    const k = buildKartaTechniczna(snapshot, WSKAZANIE.pole as DaneElementuKanwy, KATALOGI)!;
    expect(tabele(k).get('tabela:aparaty')!.wiersze.find((r) => r.klucz === 'cb-in')!.komorki.stan_obiektu).toBe('istniejący');
    bay.stan_obiektu = null;
    const bez = buildKartaTechniczna(snapshot, WSKAZANIE.pole as DaneElementuKanwy, KATALOGI)!;
    expect(wiersze(bez).get('stan_obiektu')!.wartosc).toBeNull();
    expect(tabele(bez).get('tabela:aparaty')!.wiersze.find((r) => r.klucz === 'cb-in')!.komorki.stan_obiektu).toBeNull();
  });

  // Iloczyn rodzaju przekładnika {prądowy · napięciowy}: lista pola pokazuje oba z polską
  // nazwą (bez kodu CT/VT), komórka „Zabezpieczenie / przekładniki" tabeli pól — tylko prądowy
  // (predykat z pola modelu `measurement_type`, nie z napisu).
  it('przekładniki pola: oba rodzaje z polską nazwą; do komórki zabezpieczenia trafia tylko prądowy', () => {
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

  it('źródło OZE po stronie SN: tor przyłączenia (pole SN, transformator blokowy, kabel) i tryb regulacji ze źródłem', () => {
    const w = wiersze(karta('zrodlo', 'pelne'));
    expect(w.get('pole_zrodlowe')!.wartosc).toBe('Pole źródłowe OZE');
    expect(w.get('tr_blokowy')!.wartosc).toBe('Transformator blokowy OZE · 2,5 MVA · 15 kV/0,8 kV');
    expect(w.get('kabel_sn')!.wartosc).toBe('XRUHAKXS 1×70/25 12/20 kV · 0,4 km');
    expect(w.get('tryb_regulacji')!.wartosc).toBe('Regulacja Q(U) — charakterystyka opadająca');
    expect(w.get('tryb_regulacji')!.zrodloPl).toBe('katalog przekształtnika');
  });

  it('stacja bez transformatora w modelu: jawny stan pusty sekcji, nie tabliczka zastępcza', () => {
    const snapshot = model('pelne');
    const bezTr = { ...snapshot, transformers: [], substations: snapshot.substations.map((s) => ({ ...s, transformer_refs: [] })) };
    const k = buildKartaTechniczna(bezTr as EnergyNetworkModel, { kind: 'station', elementId: 'st-1' } as DaneElementuKanwy, KATALOGI)!;
    const sekcja = k.sekcje.find((s) => s.id === 'transformator')!;
    expect(sekcja.pustaPl).toBe('Stacja nie ma transformatora w modelu.');
    expect(sekcja.wiersze).toHaveLength(0);
  });
});
