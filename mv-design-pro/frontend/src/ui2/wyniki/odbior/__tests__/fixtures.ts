/*
 * Fixture'y okna „Zgodność powykonawcza" (karta U4 P45) — 1:1 z kontraktem
 * odpowiedzi `build_zgodnosc_powykonawcza_view`
 * (`backend/src/application/analyses/zgodnosc_powykonawcza.py`). Wiersze
 * posortowane po (element_ref, wielkość) — jak w backendzie.
 */

import type { WidokZgodnosci } from '../api';

/** Pełny raport z pięcioma werdyktami (w tolerancji / poza / brak odpow. / brak wyniku /
 * brak miejsca pomiaru — decyzja O-51: pomiar mocy gałęzi bez zacisku). */
export function widokZgodnosciFixture(): WidokZgodnosci {
  return {
    analysis_id: 'run-lf-1',
    input_hash: 'zgodnosc-hash-abc',
    tolerancje: { napiecie_pct: 5, moc_pct: 10 },
    zrodlo_tolerancji: { napiecie_pct: 'jawna (żądanie)', moc_pct: 'jawna (żądanie)' },
    zalozenia_pl: [
      'Porównanie 1:1 pomiar–model (wynik rozpływu tylko do odczytu, bez '
      + 'modyfikacji); bez estymacji stanu i bez korekt modelu.',
      'Napięcie przeliczane na kV z wartości względnej przez napięcie '
      + 'znamionowe węzła: $U = u \\cdot U_{n}$.',
      'Moce P/Q odczytywane na zacisku gałęzi wskazanym w rekordzie pomiaru '
      + '(zacisk początkowy albo końcowy); pomiar mocy gałęzi bez zacisku nie jest '
      + 'porównywany z żadnym końcem gałęzi — dostaje odmowę nazwaną.',
      'Konwencja znaku mocy biernej nierozstrzygnięta w danych pomiarowych: '
      + 'Q porównywane po wartości bezwzględnej $|Q|$; znak odchyłki nie jest '
      + 'interpretowany.',
      'Tolerancje wyłącznie jawne (z żądania); brak udokumentowanego źródła '
      + 'normatywnego dla wartości domyślnych, więc domyślnych nie przyjęto.',
    ],
    podsumowanie: {
      liczba_punktow: 5,
      w_tolerancji: 1,
      poza_tolerancja: 1,
      brak_odpowiednika: 1,
      brak_wyniku: 1,
      brak_miejsca_pomiaru: 1,
      najwieksza_odchylka_pct: 12.5,
      najwieksza_odchylka_element_ref: 'LINE-2',
      najwieksza_odchylka_wielkosc: 'P',
    },
    wiersze: [
      {
        element_ref: 'BUS-1',
        wielkosc: 'U',
        jednostka: 'kV',
        wartosc_pomiar: 15.3,
        wartosc_model: 15.15,
        odchylka_bezwzgledna: 0.15,
        odchylka_pct: 0.99,
        tolerancja_pct: 5,
        werdykt: 'w tolerancji',
        zacisk: null,
        miejsce_pomiaru_pl: null,
        kod_odmowy: null,
        slad_pl: [
          'Model U = u_pu × U_n = 1.010000 × 15.000000 = 15.150000 kV',
          'Pomiar U = 15.300000 kV',
          'Odchyłka = pomiar − model = 0.150000 kV (0.990099%)',
          'Tolerancja = ±5.000000%',
          'Werdykt: w tolerancji',
        ],
      },
      {
        element_ref: 'LINE-2',
        wielkosc: 'P',
        jednostka: 'MW',
        wartosc_pomiar: 4.5,
        wartosc_model: 4.0,
        odchylka_bezwzgledna: 0.5,
        odchylka_pct: 12.5,
        tolerancja_pct: 10,
        werdykt: 'poza tolerancją',
        zacisk: 'od',
        miejsce_pomiaru_pl: 'Zacisk początkowy — szyna GPZ SN',
        kod_odmowy: null,
        slad_pl: [
          'Model P na zacisku od (Zacisk początkowy — szyna GPZ SN) = 4.000000 MW',
          'Pomiar P = 4.500000 MW',
          'Odchyłka = pomiar − model = 0.500000 MW (12.500000%)',
          'Tolerancja = ±10.000000%',
          'Werdykt: poza tolerancją',
        ],
      },
      {
        element_ref: 'NIEZNANY-3',
        wielkosc: 'U',
        jednostka: 'kV',
        wartosc_pomiar: 10.0,
        wartosc_model: null,
        odchylka_bezwzgledna: null,
        odchylka_pct: null,
        tolerancja_pct: null,
        werdykt: 'brak odpowiednika w modelu',
        zacisk: null,
        miejsce_pomiaru_pl: null,
        kod_odmowy: null,
        slad_pl: ['Pomiar wskazuje element spoza modelu sieci biegu — nie występuje on jako węzeł w wyniku rozpływu.'],
      },
      {
        element_ref: 'TRAFO-4',
        wielkosc: 'P',
        jednostka: 'MW',
        wartosc_pomiar: 0.8,
        wartosc_model: null,
        odchylka_bezwzgledna: null,
        odchylka_pct: null,
        tolerancja_pct: null,
        werdykt: 'brak miejsca pomiaru',
        zacisk: null,
        miejsce_pomiaru_pl: null,
        kod_odmowy: 'analysis.as_built_measurement_terminal_missing',
        slad_pl: [
          'Pomiar mocy gałęzi bez miejsca pomiaru — wskaż zacisk gałęzi (gałąź '
          + "'TRAFO-4', wielkość P).",
        ],
      },
      {
        element_ref: 'TRAFO-4',
        wielkosc: 'Q',
        jednostka: 'Mvar',
        wartosc_pomiar: 1.2,
        wartosc_model: null,
        odchylka_bezwzgledna: null,
        odchylka_pct: null,
        tolerancja_pct: null,
        werdykt: 'brak wyniku dla elementu',
        zacisk: 'do',
        miejsce_pomiaru_pl: 'Zacisk końcowy — szyna Stacja 4 nN',
        kod_odmowy: null,
        slad_pl: ["Brak wyniku Q na zacisku do (Zacisk końcowy — szyna Stacja 4 nN) gałęzi 'TRAFO-4'."],
      },
    ],
  };
}
