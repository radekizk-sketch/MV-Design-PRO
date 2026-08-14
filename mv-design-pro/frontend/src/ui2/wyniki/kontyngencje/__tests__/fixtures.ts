/*
 * Fikstury okna „Kontyngencje N-1" — PRZEPISANE Z REALNYCH ODPOWIEDZI BACKENDU,
 * nie wymyślone. Każdy kształt pochodzi ze zrzutu wykonanego przy tej karcie:
 *
 * - `ZAKRES` / `MACIERZ` — `build_kontyngencje_n1_zakres_view` i
 *   `build_kontyngencje_n1_view` na modelu `tests/cgmes/golden_enm.py` oraz na
 *   fiksturze `_promien_z_transformatorem` (element JUŻ WYŁĄCZONY w bazie —
 *   jedyne miejsce, w którym powstaje status `wykluczony` z `dotkliwosc` = null),
 * - `PRZECIAZENIE` — pozycja FAIL walidacji energetycznej (D2) ze zrzutu
 *   fikstury `_pierscien` (obciążenie 134,74 % przy granicy 100 %), razem z
 *   pełnym śladem WHITE BOX kryterium.
 *
 * DLACZEGO ZRZUT, A NIE WŁASNY KSZTAŁT: fikstura zmyślona sprawdza zgodność
 * okna z wyobrażeniem autora testu, a nie z kontraktem. Adapter przepuszczający
 * pole, którego backend nie ma (albo gubiący pole, które ma), przeszedłby taki
 * test na zielono.
 */

import type { MacierzResponse, PozycjaNaruszenia, ZakresResponse } from '../api';

/** Zapowiedź zakresu z modelem, w którym JEDEN element jest wykluczony. */
export const ZAKRES: ZakresResponse = {
  analysis: 'kontyngencje_n1_zakres',
  context: { run_id: 'pf-1', snapshot_hash: '1c95e2f3e6cc', case_id: 'c' },
  elementy: [
    {
      element_ref: 'ka_magistrala',
      element_name: 'Kabel magistralny',
      element_kind: 'cable',
      wykluczony: false,
      powod_pl: null,
    },
    {
      element_ref: 'ln_odg',
      element_name: 'Linia odgalezienia',
      element_kind: 'line_overhead',
      wykluczony: false,
      powod_pl: null,
    },
    {
      element_ref: 'ln_wyl',
      element_name: 'Linia rezerwowa (wylaczona)',
      element_kind: 'line_overhead',
      wykluczony: true,
      powod_pl:
        'Element jest już wyłączony w modelu bazowym (status open), '
        + 'więc jego wyłączenie nie jest kontyngencją.',
    },
    {
      element_ref: 'tr_sn_nn',
      element_name: 'TR 15/0,4',
      element_kind: 'transformer',
      wykluczony: false,
      powod_pl: null,
    },
  ],
  podsumowanie: { kontyngencji: 4, biegow_rozplywu: 3, wykluczonych: 1 },
};

/** Pozycja przekroczenia obciążalności — pełny kształt walidacji D2. */
export const PRZECIAZENIE: PozycjaNaruszenia = {
  check_type: 'BRANCH_LOADING',
  element_ref: 'ln_src_b',
  element_id: '0ab481f4-70af-5a44-ab14-3e963211f134',
  element_name: 'Linia GPZ-B',
  wartosc: 134.7433,
  granica_pct: 100.0,
  jednostka: '%',
  powod_pl: 'Obciazenie 134.74 % przekracza limit 100.0 %.',
  slad_kryterium: [
    { tekst: 'Wzor: obciazenie = |I| / I_n * 100%', latex: '\\varepsilon' },
    { tekst: 'Werdykt: PRZEKROCZENIE', latex: null },
  ],
};

const KRYTERIA: MacierzResponse['parameters']['kryteria'] = {
  obciazenie: {
    granica_warn_pct: 80.0,
    granica_fail_pct: 100.0,
    zrodlo_progu_pl:
      'Progi walidacji energetycznej sieci: ostrzeżenie przy 80 % obciążenia, '
      + 'przekroczenie przy 100 %.',
    zrodlo_obciazalnosci_pl:
      'Gałąź: obciążalność długotrwała (prąd znamionowy odcinka) z danych elementu '
      + 'w modelu sieci. Transformator: moc znamionowa jednostki.',
  },
  napiecie: {
    granica_warn_pct: 5.0,
    granica_fail_pct: 10.0,
    zrodlo_progu_pl: 'Pasmo odchylenia napięcia: ostrzeżenie ±5 %, przekroczenie ±10 %.',
    zrodlo_napiecia_pl: 'Napięcie szyny z wyniku rozpływu wariantu.',
  },
  zasilanie: {
    zrodlo_pl:
      'Wyspa węzła bilansującego wyznaczona tą samą regułą, którą stosuje solver rozpływu.',
  },
  ocenione_kategorie: ['BRANCH_LOADING', 'TRANSFORMER_LOADING', 'VOLTAGE_DEVIATION'],
  poza_zakresem_pl:
    'Budżet strat sieciowych i bilans mocy biernej węzła bilansującego są kontrolami '
    + 'CAŁEJ SIECI, a nie kryteriami elementu.',
  ranking: {
    definicja_pl:
      'Dotkliwość = krotka liczników (odbiory bez zasilania, przeciążenia, naruszenia '
      + 'napięciowe). Bez wag, bez liczby złożonej.',
    kolejnosc_kategorii: ['odbiory_bez_zasilania', 'przeciazenia', 'naruszenia_napiecia'],
  },
};

/**
 * Macierz z KOMPLETEM stanów kontraktu: kontyngencja policzona z odciętymi
 * odbiorami, kontyngencja z przeciążeniem, kontyngencja WYKLUCZONA (liczniki
 * `null`) i kontyngencja NIEZBIEŻNA — czyli iloczyn cech, na którym okno musi
 * pokazać cztery różne prawdy, a nie jedną.
 */
export const MACIERZ: MacierzResponse = {
  analysis: 'kontyngencje_n1',
  context: { run_id: 'pf-1', snapshot_hash: '1c95e2f3e6cc', case_id: 'c' },
  parameters: {
    element_refs: ['ka_magistrala', 'ln_odg', 'ln_wyl', 'tr_sn_nn'],
    kryteria: KRYTERIA,
  },
  input_hash: 'abc123',
  przypadek_bazowy: {
    status: 'zbiegl',
    powod_pl: 'Bieg rozpływu zbieżny — stan bazowy policzony.',
    przeciazenia: [],
    naruszenia_napiecia: [],
    kryteria_pominiete: [],
    odbiory_bez_zasilania: [],
    szyny_bez_zasilania: [],
    dotkliwosc: {
      odbiory_bez_zasilania: 0,
      moc_odciazona_mw: 0.0,
      przeciazenia: 0,
      naruszenia_napiecia: 0,
      kryteria_pominiete: 0,
    },
    bieg: {
      zbieznosc: true,
      iteracje: 3,
      tolerancja: 1e-8,
      metoda: 'newton-raphson',
      wezly_bez_rozwiazania: 0,
    },
  },
  kontyngencje: [
    {
      element_ref: 'ka_magistrala',
      element_name: 'Kabel magistralny',
      element_kind: 'cable',
      status: 'zbiegl',
      powod_pl: 'Bieg rozpływu zbieżny — skutki policzone.',
      przeciazenia: [PRZECIAZENIE],
      naruszenia_napiecia: [],
      kryteria_pominiete: [],
      odbiory_bez_zasilania: [],
      szyny_bez_zasilania: [],
      dotkliwosc: {
        odbiory_bez_zasilania: 0,
        moc_odciazona_mw: 0.0,
        przeciazenia: 1,
        naruszenia_napiecia: 0,
        kryteria_pominiete: 0,
      },
      slad: {
        element_wylaczony: {
          element_ref: 'ka_magistrala',
          element_kind: 'cable',
          kolekcja: 'branches',
        },
        wariant_wejscia: {
          mechanizm_pl:
            'Element usunięty z listy branches kopii migawki (wariant wejścia solvera); '
            + 'model bazowy nietknięty.',
          galezie_baza: 4,
          galezie_wariant: 3,
          transformatory_baza: 1,
          transformatory_wariant: 1,
        },
        bieg: {
          zbieznosc: true,
          iteracje: 4,
          tolerancja: 1e-8,
          metoda: 'newton-raphson',
          wezly_bez_rozwiazania: 0,
        },
        wyspa_zasilana: {
          wezel_bilansujacy_id: '80c21edb-e0ec-5378-acd6-e90f5ec0bc57',
          wezel_bilansujacy_ref: 'b_src',
          szyny_zasilane: 5,
          szyny_bez_zasilania: 0,
        },
      },
    },
    {
      element_ref: 'ln_odg',
      element_name: 'Linia odgalezienia',
      element_kind: 'line_overhead',
      status: 'niezbiegl',
      powod_pl:
        'Bieg rozpływu nie osiągnął zbieżności — przeciążeń i odchyleń napięć nie '
        + 'policzono (odbiory bez zasilania wynikają z topologii wariantu i są '
        + 'rozstrzygnięte).',
      przeciazenia: [],
      naruszenia_napiecia: [],
      kryteria_pominiete: [],
      odbiory_bez_zasilania: [],
      szyny_bez_zasilania: [],
      dotkliwosc: {
        odbiory_bez_zasilania: 0,
        moc_odciazona_mw: 0.0,
        przeciazenia: null,
        naruszenia_napiecia: null,
        kryteria_pominiete: null,
      },
      slad: {
        element_wylaczony: {
          element_ref: 'ln_odg',
          element_kind: 'line_overhead',
          kolekcja: 'branches',
        },
        wariant_wejscia: {
          mechanizm_pl: 'Element usunięty z listy branches kopii migawki.',
          galezie_baza: 4,
          galezie_wariant: 3,
          transformatory_baza: 1,
          transformatory_wariant: 1,
        },
        bieg: {
          zbieznosc: false,
          iteracje: null,
          tolerancja: null,
          metoda: null,
          wezly_bez_rozwiazania: null,
        },
        wyspa_zasilana: {
          wezel_bilansujacy_id: '80c21edb',
          wezel_bilansujacy_ref: 'b_src',
          szyny_zasilane: 5,
          szyny_bez_zasilania: 0,
        },
      },
    },
    {
      element_ref: 'ln_wyl',
      element_name: 'Linia rezerwowa (wylaczona)',
      element_kind: 'line_overhead',
      status: 'wykluczony',
      powod_pl:
        'Element jest już wyłączony w modelu bazowym (status open), '
        + 'więc jego wyłączenie nie jest kontyngencją.',
      przeciazenia: [],
      naruszenia_napiecia: [],
      kryteria_pominiete: [],
      odbiory_bez_zasilania: [],
      szyny_bez_zasilania: [],
      dotkliwosc: {
        odbiory_bez_zasilania: null,
        moc_odciazona_mw: null,
        przeciazenia: null,
        naruszenia_napiecia: null,
        kryteria_pominiete: null,
      },
      slad: {
        element_wylaczony: {
          element_ref: 'ln_wyl',
          element_kind: 'line_overhead',
          kolekcja: 'branches',
        },
        wariant_wejscia: null,
        bieg: {
          zbieznosc: false,
          iteracje: null,
          tolerancja: null,
          metoda: null,
          wezly_bez_rozwiazania: null,
        },
        wyspa_zasilana: null,
      },
    },
    {
      element_ref: 'tr_sn_nn',
      element_name: 'TR 15/0,4',
      element_kind: 'transformer',
      status: 'zbiegl',
      powod_pl: 'Bieg rozpływu zbieżny — skutki policzone.',
      przeciazenia: [],
      naruszenia_napiecia: [],
      kryteria_pominiete: [
        {
          check_type: 'BRANCH_LOADING',
          element_ref: 'ka_magistrala',
          element_id: '39aa2231-26fb-59c4-87e3-39a81c06367c',
          element_name: 'Kabel magistralny',
          powod_pl: 'Brak pradu galezi w wynikach PF.',
        },
      ],
      odbiory_bez_zasilania: [
        {
          load_ref: 'ld_nn',
          load_name: 'Odbior nN',
          bus_ref: 'b_nn',
          bus_name: 'Szyna nN',
          p_mw: 0.2,
          q_mvar: 0.05,
        },
      ],
      szyny_bez_zasilania: ['b_nn'],
      dotkliwosc: {
        odbiory_bez_zasilania: 1,
        moc_odciazona_mw: 0.2,
        przeciazenia: 0,
        naruszenia_napiecia: 0,
        kryteria_pominiete: 1,
      },
      slad: {
        element_wylaczony: {
          element_ref: 'tr_sn_nn',
          element_kind: 'transformer',
          kolekcja: 'transformers',
        },
        wariant_wejscia: {
          mechanizm_pl:
            'Element usunięty z listy transformers kopii migawki (wariant wejścia '
            + 'solvera); model bazowy nietknięty.',
          galezie_baza: 4,
          galezie_wariant: 4,
          transformatory_baza: 1,
          transformatory_wariant: 0,
        },
        bieg: {
          zbieznosc: true,
          iteracje: 3,
          tolerancja: 1e-8,
          metoda: 'newton-raphson',
          wezly_bez_rozwiazania: 1,
        },
        wyspa_zasilana: {
          wezel_bilansujacy_id: '80c21edb',
          wezel_bilansujacy_ref: 'b_src',
          szyny_zasilane: 4,
          szyny_bez_zasilania: 1,
        },
      },
    },
  ],
  ranking: [
    {
      pozycja: 1,
      element_ref: 'tr_sn_nn',
      element_name: 'TR 15/0,4',
      element_kind: 'transformer',
      dotkliwosc: {
        odbiory_bez_zasilania: 1,
        moc_odciazona_mw: 0.2,
        przeciazenia: 0,
        naruszenia_napiecia: 0,
        kryteria_pominiete: 1,
      },
    },
    {
      pozycja: 2,
      element_ref: 'ka_magistrala',
      element_name: 'Kabel magistralny',
      element_kind: 'cable',
      dotkliwosc: {
        odbiory_bez_zasilania: 0,
        moc_odciazona_mw: 0.0,
        przeciazenia: 1,
        naruszenia_napiecia: 0,
        kryteria_pominiete: 0,
      },
    },
  ],
  nierozstrzygniete: [
    {
      element_ref: 'ln_odg',
      element_name: 'Linia odgalezienia',
      element_kind: 'line_overhead',
      status: 'niezbiegl',
      powod_pl: 'Bieg rozpływu nie osiągnął zbieżności.',
    },
    {
      element_ref: 'ln_wyl',
      element_name: 'Linia rezerwowa (wylaczona)',
      element_kind: 'line_overhead',
      status: 'wykluczony',
      powod_pl:
        'Element jest już wyłączony w modelu bazowym (status open), '
        + 'więc jego wyłączenie nie jest kontyngencją.',
    },
  ],
  podsumowanie: {
    kontyngencji: 4,
    rozstrzygnietych: 2,
    nierozstrzygnietych: 2,
    z_przeciazeniem: 1,
    z_naruszeniem_napiecia: 0,
    z_odbiorami_bez_zasilania: 1,
  },
};

/** Macierz ze stanem bazowym MAJĄCYM naruszenia (substrat przeciążony w N-0). */
export const MACIERZ_Z_NARUSZENIEM_BAZOWYM: MacierzResponse = {
  ...MACIERZ,
  przypadek_bazowy: {
    ...MACIERZ.przypadek_bazowy,
    przeciazenia: [PRZECIAZENIE],
    dotkliwosc: {
      ...MACIERZ.przypadek_bazowy.dotkliwosc,
      przeciazenia: 1,
    },
  },
};
