/**
 * MODEL KONFIGURATORA ROZDZIELNICY SN/RMU — kontrakt czystej warstwy kroku
 * „Pola rozdzielnicy SN" (etap S3, kanon `KONFIGURATOR_ROZDZIELNIC_SN_RMU.md`).
 *
 * CZEGO PILNUJĄ TE TESTY (reguła KLASA, NIE INSTANCJA):
 *  1. odwzorowania są DWUSTRONNIE KOMPLETNE — brak wpisu w tablicy oznaczałby
 *     cichy domyślny rodzaj pola albo kod backendu na ekranie projektanta,
 *  2. predykaty chodzą PARAMI — zbiór aparatów, dla których pokazujemy
 *     kontrolkę doposażenia, jest DOKŁADNIE zbiorem, który operacja stacyjna
 *     umie przyjąć (inaczej powstaje przełącznik bez skutku w modelu),
 *  3. jeden fakt katalogowy ma JEDNĄ postać na ekranie — nagłówek rodziny
 *     w formularzu i nagłówek na rysunku muszą podawać te same wartości.
 */

import { describe, expect, it } from 'vitest';

import type { BayKind, CompleteMvBayTemplateSummary } from '../../../../ui/catalog/BayTemplatePicker';
import type { SwitchgearFamily } from '../../../../ui/catalog/SwitchgearFamilyPicker';
import { POLE_WPISU_WYPOSAZENIA } from '../KartaWyposazeniaPola';
import {
  KLUCZ_WYPOSAZENIA_Z_APARATU,
  NAZWY_APARATU_PL,
  NAZWY_IZOLACJI_PL,
  NAZWY_TORU_PL,
  ROLA_Z_FUNKCJI_POLA,
  aparaturaJednostkiPl,
  etykietaOfertyRodziny,
  listaZnamionRodziny,
  naglowekRodziny,
  ofertaRodzinProducenta,
  opisNapiecRodziny,
  polaZBloku,
  rodzinaObslugujeNapiecie,
  rozlozBlok,
  szerokoscBlokuPl,
  torRodziny,
  wyposazenieSzablonu,
  type BlokFabryczny,
} from '../konfiguratorRozdzielnicy';
import { zbudujPodglad } from '../podgladRozdzielnicy';
import { zbudujWyposazeniePolaDoPayloadu } from '../stacjaModel';
import { SZABLON_SAFERING_LINE_OUT } from './fixturySzablonowPol';

/** Komplet wartości `BayKind` kontraktu — spisany z typu, nie z pamięci. */
const FUNKCJE_POLA: readonly BayKind[] = [
  'liniowe_doplywowe',
  'liniowe_odplywowe',
  'transformatorowe',
  'pomiarowe',
  'sprzeglowe_podluzne',
  'sprzeglowe_poprzeczne',
  'sekcyjne',
  'potrzeb_wlasnych',
  'odgromnikowe',
  'pv',
  'bess',
  'fw',
  'rezerwowe',
  'kablowe',
  'napowietrzne',
  'nop_lacznikowe',
];

const RODZINA_MODULOWA: SwitchgearFamily = {
  switchgear_family_ref: 'ZPUE_WLOSZCZOWA__ROTOBLOK',
  manufacturer_ref: 'ZPUE_WLOSZCZOWA',
  family_name: 'Rotoblok',
  series_name: null,
  // Karta Rotobloka podaje OBIE wielkości osobno: sieci 15/20 kV przy klasach
  // urządzenia 17,5/24 kV (to ta para wymusiła rozdzielenie pól kontraktu).
  network_voltages_kv: [15, 20],
  um_classes_kv: [17.5, 24],
  rated_current_options: [630],
  short_time_current_options: [16],
  insulation_type: 'air',
  construction_type: 'wnetrzowa',
  tor_konfiguracji: 'MODULARNY',
  status: 'repo_verified',
  source_refs: ['https://zpue.pl'],
  notes_pl: null,
};

const RODZINA_RMU: SwitchgearFamily = {
  ...RODZINA_MODULOWA,
  switchgear_family_ref: 'ZPUE_WLOSZCZOWA__TPM_AIR',
  family_name: 'TPM Air',
  // Karta TPM Air podaje wyłącznie napięcie znamionowe SN (klasa urządzenia).
  network_voltages_kv: [],
  um_classes_kv: [24],
  short_time_current_options: [20],
  construction_type: 'RMU',
  tor_konfiguracji: 'BLOK_RMU',
};

/** Rodzina bez zadeklarowanej konstrukcji — katalog nie wyznacza toru pracy. */
const RODZINA_BEZ_KONSTRUKCJI: SwitchgearFamily = {
  ...RODZINA_MODULOWA,
  switchgear_family_ref: 'BEZ_KONSTRUKCJI',
  family_name: 'Rodzina bez karty',
  network_voltages_kv: [],
  um_classes_kv: [],
  rated_current_options: [],
  short_time_current_options: [],
  insulation_type: 'unknown',
  construction_type: 'unknown',
  tor_konfiguracji: null,
};

const jednostka = (
  unit_code: string,
  bay_kind: BayKind,
  apparatus_kinds: BlokFabryczny['units'][number]['apparatus_kinds'],
  width_mm: number | null = null,
) => ({
  unit_code,
  unit_name_pl: `Jednostka ${unit_code}`,
  bay_kind,
  apparatus_kinds,
  width_mm,
});

const BLOK_LLT: BlokFabryczny = {
  configuration_ref: 'ZPUE_WLOSZCZOWA__TPM_AIR__LLT',
  switchgear_family_ref: 'ZPUE_WLOSZCZOWA__TPM_AIR',
  code: 'LLT',
  name_pl: 'Blok kabel-kabel-transformator',
  units: [
    jednostka('L', 'liniowe_odplywowe', ['switch_disconnector']),
    jednostka('L', 'liniowe_odplywowe', ['switch_disconnector']),
    jednostka('T', 'transformatorowe', ['switch_disconnector', 'fuse_set']),
  ],
  unit_sequence: 'L-L-T',
  total_width_mm: null,
  source_refs: ['https://zpue.pl/rozdzielnice-sn/tpm-air'],
  notes_pl: null,
};

describe('tor konfiguracji rodziny', () => {
  it('czyta tor WPROST z katalogu — modułowy i blokowy RMU', () => {
    expect(torRodziny(RODZINA_MODULOWA)).toBe('MODULARNY');
    expect(torRodziny(RODZINA_RMU)).toBe('BLOK_RMU');
  });

  it('rodzina bez zadeklarowanej konstrukcji NIE dostaje toru domyślnego', () => {
    expect(torRodziny(RODZINA_BEZ_KONSTRUKCJI)).toBeNull();
    expect(torRodziny(null)).toBeNull();
    // Rekord starszego katalogu, który pola w ogóle nie niesie — nadal brak,
    // nigdy „modułowy, bo tak najczęściej".
    const { tor_konfiguracji: _pominiete, ...bezPola } = RODZINA_MODULOWA;
    expect(torRodziny(bezPola as SwitchgearFamily)).toBeNull();
  });
});

describe('dobór rodziny do napięcia szyny — iloczyn cech (lustro reguły katalogu)', () => {
  /**
   * ILOCZYN CECH: (rodzaj deklaracji rodziny) × (napięcie szyny). Ta sama
   * tablica przypadków co w backendzie (`test_switchgear_napiecia_rodzin.py`),
   * bo UI ma UPRZEDZAĆ werdykt walidatora, a nie proponować własny. Rozjazd
   * którejkolwiek komórki znaczy, że kreator pokaże rodzinę, którą backend
   * odrzuci (albo ukryje tę, którą przyjmie).
   */
  const PRZYPADKI: ReadonlyArray<
    readonly [string, readonly number[], readonly number[], number, boolean]
  > = [
    // rodzina SIECIOWA — rozstrzyga lista sieci, nie zapas izolacji
    ['sieciowa: szyna z listy', [15, 20], [17.5, 24], 15, true],
    ['sieciowa: szyna z listy (górna)', [15, 20], [17.5, 24], 20, true],
    ['sieciowa: szyna pod klasą, ale spoza listy sieci', [15, 20], [17.5, 24], 12, false],
    ['sieciowa: szyna równa najwyższej klasie Um', [15, 20], [17.5, 24], 24, false],
    ['sieciowa: szyna ponad wszystkim', [15, 20], [17.5, 24], 30, false],
    // rodzina KLASOWA — wystarczy klasa Um >= napięcie szyny
    ['klasowa: szyna pod klasą', [], [12, 24], 6, true],
    ['klasowa: szyna między klasami', [], [12, 24], 17.5, true],
    ['klasowa: szyna równa klasie', [], [12, 24], 24, true],
    ['klasowa: szyna ponad najwyższą klasą', [], [12, 24], 25, false],
    // rodzina BEZ DANYCH — brak deklaracji to nie jest zgoda
    ['bez danych: szyna typowa', [], [], 15, false],
    // szyna bez napięcia — nie ma czego porównać
    ['szyna bez napięcia', [15, 20], [17.5, 24], 0, true],
  ];

  it.each(PRZYPADKI)('%s', (_nazwa, siec, um, napiecieSzyny, oczekiwane) => {
    const rodzina: SwitchgearFamily = {
      ...RODZINA_MODULOWA,
      network_voltages_kv: siec,
      um_classes_kv: um,
    };
    expect(rodzinaObslugujeNapiecie(rodzina, napiecieSzyny)).toBe(oczekiwane);
  });

  it('opis napięć nazywa KAŻDĄ wielkość, którą karta deklaruje', () => {
    expect(opisNapiecRodziny({ ...RODZINA_MODULOWA })).toBe(
      'sieć 15 / 20 kV · urządzenie 17,5 / 24 kV',
    );
    expect(
      opisNapiecRodziny({ ...RODZINA_MODULOWA, network_voltages_kv: [], um_classes_kv: [24] }),
    ).toBe('urządzenie 24 kV');
    expect(
      opisNapiecRodziny({ ...RODZINA_MODULOWA, network_voltages_kv: [20], um_classes_kv: [] }),
    ).toBe('sieć 20 kV');
    // Rodzina bez deklaracji daje JAWNY BRAK, nie pusty łańcuch ani „0 kV".
    expect(
      opisNapiecRodziny({ ...RODZINA_MODULOWA, network_voltages_kv: [], um_classes_kv: [] }),
    ).toBeNull();
    expect(opisNapiecRodziny(null)).toBeNull();
  });
});

describe('oferta rodzin producenta', () => {
  const WYMAGA_KARTY: SwitchgearFamily = {
    ...RODZINA_MODULOWA,
    switchgear_family_ref: 'ABB__UNISEC',
    family_name: 'UniSec',
    network_voltages_kv: [],
    um_classes_kv: [24],
    status: 'requires_catalog',
    source_refs: [],
  };
  const WYCOFANA: SwitchgearFamily = {
    ...RODZINA_MODULOWA,
    switchgear_family_ref: 'ZPUE__STARA',
    family_name: 'Seria wycofana',
    status: 'deprecated',
  };
  /**
   * Rodzina o klasie NIŻSZEJ niż szyna — jedyny przypadek, w którym klasa
   * napięciowa realnie dyskwalifikuje wyrób. Klasa WYŻSZA (np. 24 kV na szynie
   * 15 kV) pokrywa napięcie szyny i pozostaje do wyboru — to ta sama zasada
   * „znamionowe pokrywa robocze", którą stosuje picker aparatu pola.
   */
  const INNA_KLASA: SwitchgearFamily = {
    ...RODZINA_MODULOWA,
    switchgear_family_ref: 'ZPUE__NA_6KV',
    family_name: 'Seria 6 kV',
    network_voltages_kv: [],
    um_classes_kv: [6],
  };
  const WYZSZA_KLASA: SwitchgearFamily = {
    ...RODZINA_MODULOWA,
    switchgear_family_ref: 'ZPUE__NA_24KV',
    family_name: 'Seria 24 kV',
    network_voltages_kv: [],
    um_classes_kv: [24],
  };
  const OBCY_PRODUCENT: SwitchgearFamily = {
    ...RODZINA_MODULOWA,
    switchgear_family_ref: 'SIEMENS__8DJH',
    family_name: '8DJH',
    manufacturer_ref: 'SIEMENS',
  };

  const KATALOG = [
    RODZINA_MODULOWA,
    RODZINA_RMU,
    WYMAGA_KARTY,
    WYCOFANA,
    INNA_KLASA,
    WYZSZA_KLASA,
    OBCY_PRODUCENT,
  ];

  it('pokazuje CAŁE portfolio producenta, nie tylko rodziny gotowe do użycia', () => {
    const oferta = ofertaRodzinProducenta(KATALOG, 'ZPUE_WLOSZCZOWA', 15);
    // Sześć rodzin producenta; rodzina innego producenta poza listą.
    expect(oferta).toHaveLength(6);
    expect(oferta.map((p) => p.rodzina.switchgear_family_ref)).not.toContain('SIEMENS__8DJH');
  });

  it('nazywa POWÓD niedostępności zamiast ukrywać rodzinę', () => {
    const oferta = ofertaRodzinProducenta(KATALOG, 'ZPUE_WLOSZCZOWA', 15);
    const wgRefu = Object.fromEntries(oferta.map((p) => [p.rodzina.switchgear_family_ref, p.powod]));

    expect(wgRefu['ZPUE_WLOSZCZOWA__ROTOBLOK']).toBeNull();
    expect(wgRefu['ZPUE_WLOSZCZOWA__TPM_AIR']).toBeNull();
    expect(wgRefu['ABB__UNISEC']).toBe('WYMAGA_KARTY');
    expect(wgRefu['ZPUE__STARA']).toBe('WYCOFANA');
    expect(wgRefu['ZPUE__NA_6KV']).toBe('INNA_KLASA_NAPIECIOWA');
    // Klasa wyższa POKRYWA napięcie szyny — zostaje do wyboru.
    expect(wgRefu['ZPUE__NA_24KV']).toBeNull();
  });

  it('status potwierdzony BEZ źródeł to nadal brak karty (polityka proweniencji)', () => {
    const bezZrodel: SwitchgearFamily = { ...RODZINA_MODULOWA, source_refs: [] };
    const [pozycja] = ofertaRodzinProducenta([bezZrodel], 'ZPUE_WLOSZCZOWA', 15);
    expect(pozycja.powod).toBe('WYMAGA_KARTY');
  });

  it('rodzina bez ŻADNEJ deklaracji napięciowej jest niedostępna z jawnym powodem', () => {
    // ZMIANA KANONU (karta K-J). Wcześniej brak deklaracji znaczył „brak
    // przeciwwskazania" i rodzina zostawała wybieralna. Backend po włączeniu
    // walidacji odrzuca taką rodzinę twardym błędem (nie ma czym potwierdzić
    // zgodności z żadną szyną), więc pokazanie jej jako wybieralnej byłoby
    // zielonym światłem do ściany. Intencja pierwotna — „nie usuwaj rodziny
    // z listy po cichu" — zostaje spełniona inaczej i MOCNIEJ: pozycja jest
    // widoczna, tylko z jawnym powodem niedostępności.
    const bezNapiec: SwitchgearFamily = {
      ...RODZINA_MODULOWA,
      network_voltages_kv: [],
      um_classes_kv: [],
    };
    const [pozycja] = ofertaRodzinProducenta([bezNapiec], 'ZPUE_WLOSZCZOWA', 15);
    expect(pozycja.powod).toBe('INNA_KLASA_NAPIECIOWA');
  });

  it('napięcie szyny NIEZNANE nie odrzuca żadnej rodziny', () => {
    // Dopóki napięcie szyny nie jest znane, nie ma czego porównać — brak danych
    // o szynie nie może udawać niezgodności rodziny.
    const [pozycja] = ofertaRodzinProducenta([RODZINA_MODULOWA], 'ZPUE_WLOSZCZOWA', 0);
    expect(pozycja.powod).toBeNull();
  });

  it('rodzina z napięciami SIECI odrzuca szynę spoza listy, choć klasa Um by ją objęła', () => {
    // Komórka dyskryminująca reguły: Rotoblok deklaruje sieci 15/20 kV przy
    // klasach 17,5/24 kV. Szyna 12 kV mieści się pod klasą 17,5 kV, ale karta
    // producenta nie oferuje wyrobu do sieci 12 kV — i to karta rozstrzyga.
    const [pozycja] = ofertaRodzinProducenta([RODZINA_MODULOWA], 'ZPUE_WLOSZCZOWA', 12);
    expect(pozycja.powod).toBe('INNA_KLASA_NAPIECIOWA');
  });

  it('etykieta pozycji niedostępnej niesie powód, dostępnej — samą nazwę', () => {
    const oferta = ofertaRodzinProducenta(KATALOG, 'ZPUE_WLOSZCZOWA', 15);
    const wgRefu = Object.fromEntries(
      oferta.map((p) => [p.rodzina.switchgear_family_ref, etykietaOfertyRodziny(p)]),
    );
    expect(wgRefu['ZPUE_WLOSZCZOWA__ROTOBLOK']).toBe('Rotoblok');
    expect(wgRefu['ABB__UNISEC']).toContain('wymaga karty katalogowej');
    expect(wgRefu['ZPUE__NA_6KV']).toContain('inna klasa napięciowa');
  });
});

describe('odwzorowanie funkcji pola na rolę operacji (dwustronne)', () => {
  it('pokrywa KOMPLET funkcji pola kontraktu — żadna nie wpada w domysł', () => {
    expect(Object.keys(ROLA_Z_FUNKCJI_POLA).sort()).toEqual([...FUNKCJE_POLA].sort());
  });

  it('funkcje ciągu liniowego, transformatorowa i sprzęgłowe mają role operacji', () => {
    expect(ROLA_Z_FUNKCJI_POLA.liniowe_doplywowe).toBe('LINIA_IN');
    expect(ROLA_Z_FUNKCJI_POLA.liniowe_odplywowe).toBe('LINIA_OUT');
    expect(ROLA_Z_FUNKCJI_POLA.transformatorowe).toBe('TRANSFORMATOROWE');
    expect(ROLA_Z_FUNKCJI_POLA.sprzeglowe_podluzne).toBe('SPRZEGLO');
    expect(ROLA_Z_FUNKCJI_POLA.sprzeglowe_poprzeczne).toBe('SPRZEGLO');
  });

  it('funkcja bez odpowiednika w kontrakcie daje JAWNY BRAK, nie pole zastępcze', () => {
    // `kablowe`/`napowietrzne` opisują medium przyłącza, nie kierunek pola —
    // wyprowadzenie z nich roli byłoby zgadywaniem projektu.
    expect(ROLA_Z_FUNKCJI_POLA.kablowe).toBeNull();
    expect(ROLA_Z_FUNKCJI_POLA.napowietrzne).toBeNull();
    expect(ROLA_Z_FUNKCJI_POLA.pomiarowe).toBeNull();
    expect(ROLA_Z_FUNKCJI_POLA.rezerwowe).toBeNull();
  });
});

describe('słowniki nazw PL (komplet kontraktu)', () => {
  it('nazywa KAŻDY rodzaj aparatu kompozycji — zero kodów backendu na ekranie', () => {
    const rodzaje = Object.keys(NAZWY_APARATU_PL);
    expect(rodzaje).toHaveLength(18);
    for (const nazwa of Object.values(NAZWY_APARATU_PL)) {
      expect(nazwa).not.toMatch(/[a-z]+_[a-z]+/);
      expect(nazwa.trim()).not.toBe('');
    }
  });

  it('nazywa KAŻDĄ izolację i KAŻDY tor konfiguracji', () => {
    expect(Object.keys(NAZWY_IZOLACJI_PL).sort()).toEqual(
      ['air', 'mixed', 'sf6', 'unknown', 'vacuum'].sort(),
    );
    expect(Object.keys(NAZWY_TORU_PL).sort()).toEqual(['BLOK_RMU', 'MODULARNY']);
  });
});

describe('doposażenie sterowalne — predykaty parami', () => {
  /**
   * Zbiór „aparat dostaje kontrolkę" i zbiór „operacja stacyjna przyjmuje
   * wyposażenie" muszą być tym samym zbiorem. Sprawdzamy go z TRZECH stron:
   * tablicy rodzajów, tablicy pól wpisu i BLOKÓW, które realnie powstają
   * w payloadzie operacji.
   */
  it('klucze wyposażenia = klucze bloków payloadu = klucze pól wpisu', () => {
    const zRodzajow = new Set(Object.values(KLUCZ_WYPOSAZENIA_Z_APARATU));
    const zPolWpisu = new Set(Object.keys(POLE_WPISU_WYPOSAZENIA));

    const payload = zbudujWyposazeniePolaDoPayloadu(
      {
        ct_catalog_ref: 'ct-1',
        vt_catalog_ref: 'vt-1',
        relay_catalog_ref: 'relay-1',
        relay_type: 'NADPRADOWY',
        ct_dlugosc_m: null,
        ct_przekroj_mm2: null,
        ct_moc_aparatow_va: null,
        vt_dlugosc_m: null,
        vt_przekroj_mm2: null,
        vt_moc_aparatow_va: null,
        vt_uzwojenie: 'POMIAROWE',
      },
      [{ id: 'ct-1', ratio_primary_a: 400, ratio_secondary_a: 5 }],
      [{ id: 'vt-1', ratio_primary_v: 15000, ratio_secondary_v: 100 }],
    );
    const zPayloadu = new Set(Object.keys(payload ?? {}));

    expect([...zRodzajow].sort()).toEqual([...zPayloadu].sort());
    expect([...zPolWpisu].sort()).toEqual([...zPayloadu].sort());
  });

  it('rodzaj bez pola w operacji NIE trafia do tablicy sterowalnych', () => {
    // Ogranicznik przepięć i wskaźnik napięcia bywają doposażeniem karty
    // katalogowej, ale operacja budowy stacji nie ma dla nich pola — kontrolka
    // byłaby przełącznikiem bez skutku w modelu.
    expect(KLUCZ_WYPOSAZENIA_Z_APARATU.surge_arrester).toBeUndefined();
    expect(KLUCZ_WYPOSAZENIA_Z_APARATU.voltage_indicator).toBeUndefined();
    expect(KLUCZ_WYPOSAZENIA_Z_APARATU.circuit_breaker).toBeUndefined();
  });
});

describe('wyposażenie katalogowego pola', () => {
  const szablonZeSkladem: CompleteMvBayTemplateSummary = {
    ...SZABLON_SAFERING_LINE_OUT,
    device_instances: [
      {
        device_template_ref: 'dev-ct',
        apparatus_kind: 'current_transformer',
        label: 'T1',
        position_in_bay: 3,
        electrical_side: 'line_side',
        status_wyposazenia: 'OPCJA',
      },
      {
        device_template_ref: 'dev-q1',
        apparatus_kind: 'switch_disconnector',
        label: 'Q1',
        position_in_bay: 1,
        electrical_side: 'busbar_side',
        status_wyposazenia: 'FABRYCZNY',
      },
      {
        device_template_ref: 'dev-sa',
        apparatus_kind: 'surge_arrester',
        label: 'F1',
        position_in_bay: 2,
        electrical_side: 'earthing_branch',
        status_wyposazenia: 'OPCJA',
      },
    ],
  };

  it('podaje skład w kolejności montażowej, z oznaczeniami operatorskimi', () => {
    const pozycje = wyposazenieSzablonu(szablonZeSkladem);
    expect(pozycje.map((p) => p.oznaczenie)).toEqual(['Q1', 'F1', 'T1']);
    expect(pozycje.map((p) => p.nazwa)).toEqual([
      'rozłącznik',
      'ogranicznik przepięć',
      'przekładnik prądowy',
    ]);
  });

  it('rozróżnia FABRYCZNY od OPCJI i wskazuje, która opcja jest sterowalna', () => {
    const pozycje = wyposazenieSzablonu(szablonZeSkladem);
    const wgRefu = Object.fromEntries(pozycje.map((p) => [p.ref, p]));

    expect(wgRefu['dev-q1'].status).toBe('FABRYCZNY');
    expect(wgRefu['dev-q1'].kluczWyposazenia).toBeNull();

    expect(wgRefu['dev-ct'].status).toBe('OPCJA');
    expect(wgRefu['dev-ct'].kluczWyposazenia).toBe('ct');

    // OPCJA bez dostawcy w operacji — status widoczny, kontrolki nie będzie.
    expect(wgRefu['dev-sa'].status).toBe('OPCJA');
    expect(wgRefu['dev-sa'].kluczWyposazenia).toBeNull();
  });

  it('szablon bez kompozycji daje pusty skład, a nie dorysowane aparaty', () => {
    expect(wyposazenieSzablonu(SZABLON_SAFERING_LINE_OUT)).toEqual([]);
    expect(wyposazenieSzablonu(null)).toEqual([]);
  });
});

describe('blok fabryczny RMU → pola stacji', () => {
  it('rozkłada blok na jednostki w kolejności wyrobu, z rolami kontraktu', () => {
    const jednostki = rozlozBlok(BLOK_LLT);
    expect(jednostki.map((j) => j.jednostka.unit_code)).toEqual(['L', 'L', 'T']);
    expect(jednostki.map((j) => j.pozycja)).toEqual([1, 2, 3]);
    expect(jednostki.map((j) => j.rola)).toEqual(['LINIA_OUT', 'LINIA_OUT', 'TRANSFORMATOROWE']);
  });

  it('buduje pola z jednostek — stabilne, ROZRÓŻNIALNE klucze bliźniaczych jednostek', () => {
    const pola = polaZBloku(
      BLOK_LLT,
      (rola) => (rola === 'TRANSFORMATOROWE' ? 'tpl-t' : 'tpl-l'),
      (rola) => (rola === 'TRANSFORMATOROWE' ? 'apar-fuse' : 'apar-ds'),
    );
    expect(pola).toHaveLength(3);
    expect(new Set(pola.map((p) => p.id)).size).toBe(3);
    expect(pola.map((p) => p.field_role)).toEqual([
      'LINIA_OUT',
      'LINIA_OUT',
      'TRANSFORMATOROWE',
    ]);
    expect(pola.map((p) => p.bay_template_ref)).toEqual(['tpl-l', 'tpl-l', 'tpl-t']);
    expect(pola.map((p) => p.apparatus_catalog_ref)).toEqual([
      'apar-ds',
      'apar-ds',
      'apar-fuse',
    ]);
  });

  /**
   * Tożsamość WYROBU jedzie na wpisie pola, nie obok listy. Blok L-L-T ma dwie
   * jednostki „L" nierozróżnialne po roli ani po karcie katalogowej — dopiero
   * numer jednostki mówi, które pole bloku powstaje. Bez tej pary (ref bloku +
   * numer) operacja stacyjna odrzuca pole rodziny blokowej twardym błędem.
   */
  it('wpis pola niesie blok fabryczny I numer jednostki (1-based, kolejność wyrobu)', () => {
    const pola = polaZBloku(BLOK_LLT, () => 'tpl', () => 'apar');
    expect(pola.map((p) => p.factory_configuration_ref)).toEqual([
      BLOK_LLT.configuration_ref,
      BLOK_LLT.configuration_ref,
      BLOK_LLT.configuration_ref,
    ]);
    expect(pola.map((p) => p.factory_unit_index)).toEqual([1, 2, 3]);
  });

  it('numer jednostki pomija jednostki BEZ roli, ale nie przenumerowuje wyrobu', () => {
    // Jednostka pomiarowa stoi PRZED transformatorową: gdyby numer liczył pola
    // (a nie jednostki bloku), pole TR dostałoby numer 3 i wskazywałoby cudzą
    // jednostkę wyrobu.
    const blokZPomiarem: BlokFabryczny = {
      ...BLOK_LLT,
      units: [
        BLOK_LLT.units[0],
        BLOK_LLT.units[1],
        jednostka('M', 'pomiarowe', ['voltage_transformer']),
        BLOK_LLT.units[2],
      ],
      unit_sequence: 'L-L-M-T',
    };
    const pola = polaZBloku(blokZPomiarem, () => 'tpl', () => 'apar');
    expect(pola.map((p) => p.field_role)).toEqual(['LINIA_OUT', 'LINIA_OUT', 'TRANSFORMATOROWE']);
    expect(pola.map((p) => p.factory_unit_index)).toEqual([1, 2, 4]);
  });

  it('jednostka bez roli w kontrakcie ZOSTAJE w składzie, ale NIE daje pola', () => {
    const blokZPomiarem: BlokFabryczny = {
      ...BLOK_LLT,
      units: [...BLOK_LLT.units, jednostka('M', 'pomiarowe', ['voltage_transformer'])],
      unit_sequence: 'L-L-T-M',
    };
    expect(rozlozBlok(blokZPomiarem)).toHaveLength(4);
    expect(rozlozBlok(blokZPomiarem)[3].rola).toBeNull();
    // Pole z takiej jednostki NIE powstaje — kreator nie zapisuje funkcji,
    // której kontrakt operacji nie zna, i nie podmienia jej na inną.
    expect(polaZBloku(blokZPomiarem, () => 'tpl', () => 'apar')).toHaveLength(3);
  });

  it('brak wybranego bloku = zero pól (rodzina RMU nie jest pustą rozdzielnicą)', () => {
    expect(polaZBloku(null, () => 'tpl', () => 'apar')).toEqual([]);
    expect(rozlozBlok(null)).toEqual([]);
  });

  it('opisuje aparaturę jednostki po polsku — to ona odróżnia jednostki wyrobu', () => {
    expect(aparaturaJednostkiPl(BLOK_LLT.units[0])).toBe('rozłącznik');
    expect(aparaturaJednostkiPl(BLOK_LLT.units[2])).toBe('rozłącznik + zestaw bezpieczników');
  });

  it('szerokość niepodana w karcie zostaje BRAKIEM, nigdy zerem milimetrów', () => {
    expect(szerokoscBlokuPl(BLOK_LLT)).toBeNull();
    expect(szerokoscBlokuPl({ ...BLOK_LLT, total_width_mm: 1500 })).toBe('1500 mm');
  });
});

describe('nagłówek rodziny', () => {
  it('podaje producenta, klasy znamionowe, technologię i tor konfiguracji', () => {
    const wiersze = naglowekRodziny(RODZINA_RMU, 'ZPUE Włoszczowa');
    const wgEtykiety = Object.fromEntries(wiersze.map((w) => [w.etykieta, w.wartosc]));
    expect(wgEtykiety.Producent).toBe('ZPUE Włoszczowa');
    // Nagłówek NAZYWA obie wielkości karty — sama liczba nie mówiłaby, czy to
    // napięcie sieci, czy klasa izolacji urządzenia.
    // Rodzina RMU (TPM Air) — karta podaje wyłącznie klasę urządzenia.
    expect(wgEtykiety['Napięcia katalogowe']).toBe('urządzenie 24 kV');
    expect(wgEtykiety['Prąd znamionowy szyn']).toBe('630 A');
    expect(wgEtykiety['Prąd zwarciowy 1 s']).toBe('20 kA');
    expect(wgEtykiety.Izolacja).toBe('powietrzna');
    expect(wgEtykiety.Konstrukcja).toBe('RMU');
    expect(wgEtykiety['Tor konfiguracji']).toContain('blokowy');
  });

  it('dana, której katalog nie niesie, zostaje JAWNYM BRAKIEM', () => {
    const wiersze = naglowekRodziny(RODZINA_BEZ_KONSTRUKCJI, 'ZPUE Włoszczowa');
    const wgEtykiety = Object.fromEntries(wiersze.map((w) => [w.etykieta, w.wartosc]));
    expect(wgEtykiety['Napięcia katalogowe']).toBeNull();
    expect(wgEtykiety['Prąd znamionowy szyn']).toBeNull();
    expect(wgEtykiety['Prąd zwarciowy 1 s']).toBeNull();
    expect(wgEtykiety['Tor konfiguracji']).toBeNull();
  });

  it('liczby czyta po polsku, z przecinkiem dziesiętnym', () => {
    expect(listaZnamionRodziny([12, 17.5, 24], 'kV')).toBe('12 / 17,5 / 24 kV');
    expect(listaZnamionRodziny([], 'kV')).toBeNull();
    expect(listaZnamionRodziny(undefined, 'kV')).toBeNull();
  });

  /**
   * ZAPADKA PRZECIW DWÓM ŚCIEŻKOM. Te same wartości rodziny pokazuje nagłówek
   * FORMULARZA i nagłówek RYSUNKU (`podgladRozdzielnicy`). Każdy z nich składa
   * napis własnym kodem, więc rozjazd byłby cichy — dopóki ktoś nie zauważy, że
   * formularz i schemat opisują rozdzielnicę inaczej.
   */
  it('podaje DOKŁADNIE te same wartości, co nagłówek rysunku rozdzielnicy', () => {
    const wiersze = naglowekRodziny(RODZINA_MODULOWA, 'ZPUE Włoszczowa');
    const wgEtykiety = Object.fromEntries(wiersze.map((w) => [w.etykieta, w.wartosc]));
    const naglowekRysunku = zbudujPodglad({
      snFields: [],
      aparaty: [],
      transformatory: [],
      transformatorRef: null,
      snVoltageKv: 15,
      rodzina: RODZINA_MODULOWA,
      producent: 'ZPUE Włoszczowa',
    }).naglowek;

    expect(wgEtykiety['Napięcia katalogowe']).toBe(naglowekRysunku.klasaNapiecia);
    expect(wgEtykiety['Prąd znamionowy szyn']).toBe(naglowekRysunku.pradSzyn);
    expect(wgEtykiety['Prąd zwarciowy 1 s']).toBe(naglowekRysunku.pradZwarciowy);
    expect(wgEtykiety.Konstrukcja).toBe(naglowekRysunku.konstrukcja);
    expect(wgEtykiety.Producent).toBe(naglowekRysunku.producent);
  });
});
