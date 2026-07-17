/*
 * Fixture'y okna „Zgodność powykonawcza" (karta U4 P45) — 1:1 z kontraktem
 * odpowiedzi `build_zgodnosc_powykonawcza_view`
 * (`backend/src/application/analyses/zgodnosc_powykonawcza.py`). Wiersze
 * posortowane po (element_ref, wielkość) — jak w backendzie.
 */

import type { WidokZgodnosci } from '../api';

/** Pełny raport z czterema werdyktami (w tolerancji / poza / brak odpow. / brak wyniku). */
export function widokZgodnosciFixture(): WidokZgodnosci {
  return {
    analysis_id: 'run-lf-1',
    input_hash: 'zgodnosc-hash-abc',
    tolerancje: { napiecie_pct: 5, moc_pct: 10 },
    zrodlo_tolerancji: { napiecie_pct: 'jawna (żądanie)', moc_pct: 'jawna (żądanie)' },
    zalozenia_pl: [
      'Porównanie 1:1 pomiar–model (wynik rozpływu FROZEN); bez estymacji stanu '
      + '(solver WLS istnieje, ale nie jest używany) i bez korekt modelu.',
      'Napięcie U przeliczane na kV z u_pu przez napięcie znamionowe węzła (U = u_pu · U_n).',
      'Moce P/Q odczytywane z gałęzi w kierunku „from" (p_from_mw / q_from_mvar).',
      'Konwencja znaku Q nierozstrzygnięta (V12K-027): Q porównywane po wartości '
      + 'bezwzględnej |Q|; znak odchyłki nie jest interpretowany.',
      'Tolerancje wyłącznie jawne (z żądania); brak udokumentowanego źródła '
      + 'normatywnego dla wartości domyślnych, więc domyślnych nie przyjęto.',
    ],
    podsumowanie: {
      liczba_punktow: 4,
      w_tolerancji: 1,
      poza_tolerancja: 1,
      brak_odpowiednika: 1,
      brak_wyniku: 1,
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
        slad_pl: [
          'Model P_from = 4.000000 MW',
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
        slad_pl: ['Element „NIEZNANY-3" nie występuje jako węzeł w wyniku rozpływu.'],
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
        slad_pl: ['Brak wyniku Q (kierunek „from") dla gałęzi „TRAFO-4".'],
      },
    ],
  };
}
