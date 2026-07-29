/*
 * Fixtures okna „Krzywe zdolności P–Q" (karta P41). Kształty 1:1 z serializacją
 * `application/analyses/pq_coverage.py::build_pq_coverage_view`, katalogiem
 * konwerterów (`ConverterType.to_dict`) i katalogiem NC RfG (`operators[]`).
 * Deterministyczne, bez losowości. Liczby odwzorowują central PV Sungrow
 * SG3150U-MV (Pn 3,15 MW; krzywa ±0,6·Sn ze zwężeniem przy p_max) vs operator
 * PSE (udział Q ±0,33·Pn ⇒ wymaganie ±1,0395 Mvar) — punkt p_max niepokryty.
 */

import type { OdpowiedzKatalogNcRfg, RekordKonwertera, WidokPokryciaPQ } from '../../api';

/** Katalog konwerterów: jeden typ z krzywą producenta, jeden bez krzywej. */
export function rekordyKonwerterowFixture(): RekordKonwertera[] {
  return [
    {
      id: 'conv-pv-card-sungrow-sg3150u-mv',
      name: 'Karta falownika central PV Sungrow SG3150U-MV 3.15 MW / 0.69 kV',
      kind: 'PV',
      un_kv: 0.69,
      sn_mva: 3.15,
      pmax_mw: 3.15,
      qmin_mvar: -1.89,
      qmax_mvar: 1.89,
      cosphi_min: 0.8,
      cosphi_max: 1.0,
      e_kwh: null,
      control_mode: 'Q_OF_U',
      pq_curve: [
        [0.0, -1.89, 1.89],
        [1.575, -1.89, 1.89],
        [2.52, -1.89, 1.89],
        [3.15, -0.63, 0.63],
      ],
    },
    {
      id: 'conv-pv-generic-1mw',
      name: 'Falownik PV generyczny 1 MW / 0.4 kV',
      kind: 'PV',
      un_kv: 0.4,
      sn_mva: 1.0,
      pmax_mw: 1.0,
      qmin_mvar: -0.4,
      qmax_mvar: 0.4,
      cosphi_min: 0.9,
      cosphi_max: 1.0,
      e_kwh: null,
      control_mode: null,
      // brak pola pq_curve ⇒ „brak krzywej producenta"
    },
  ];
}

/** Katalog NC RfG: dwóch operatorów (progi klas nieistotne dla okna P–Q). */
export function katalogNcRfgFixture(): OdpowiedzKatalogNcRfg {
  return {
    operators: [
      {
        operator_id: 'pse',
        operator_name_pl: 'PSE — Polskie Sieci Elektroenergetyczne',
        module_types: [],
      },
      {
        operator_id: 'pge',
        operator_name_pl: 'PGE Dystrybucja',
        module_types: [],
      },
    ],
  };
}

/**
 * Widok pokrycia 1:1 z backendem: 3 z 4 punktów pokrytych; punkt p_max (3,15 MW)
 * niepokryty (deficyt 0,4095 Mvar po stronie górnej/indukcyjnej) — werdykt NIEPOKRYTE.
 */
export function widokPokryciaFixture(): WidokPokryciaPQ {
  return {
    typ_katalogowy: {
      id: 'conv-pv-card-sungrow-sg3150u-mv',
      nazwa: 'Karta falownika central PV Sungrow SG3150U-MV 3.15 MW / 0.69 kV',
      kind: 'PV',
      pmax_mw: 3.15,
      sn_mva: 3.15,
    },
    operator: {
      id: 'pse',
      nazwa: 'PSE — Polskie Sieci Elektroenergetyczne',
      udzial_q_min_pct_pn: -0.33,
      udzial_q_max_pct_pn: 0.33,
    },
    wymaganie: {
      pn_mw: 3.15,
      q_wymagane_min_mvar: -1.0395,
      q_wymagane_max_mvar: 1.0395,
      opis:
        'Prostokatne wymaganie zakresu Q operatora: '
        + '[udzial_min * Pn, udzial_max * Pn] w kazdym punkcie pracy.',
    },
    punkty: [
      {
        p_mw: 0.0,
        q_min_mvar: -1.89,
        q_max_mvar: 1.89,
        q_wymagane_min_mvar: -1.0395,
        q_wymagane_max_mvar: 1.0395,
        zapas_dolny_mvar: 0.8505,
        zapas_gorny_mvar: 0.8505,
        margines_mvar: 0.8505,
        pokryty: true,
        uwaga: 'pokryty',
      },
      {
        p_mw: 1.575,
        q_min_mvar: -1.89,
        q_max_mvar: 1.89,
        q_wymagane_min_mvar: -1.0395,
        q_wymagane_max_mvar: 1.0395,
        zapas_dolny_mvar: 0.8505,
        zapas_gorny_mvar: 0.8505,
        margines_mvar: 0.8505,
        pokryty: true,
        uwaga: 'pokryty',
      },
      {
        p_mw: 2.52,
        q_min_mvar: -1.89,
        q_max_mvar: 1.89,
        q_wymagane_min_mvar: -1.0395,
        q_wymagane_max_mvar: 1.0395,
        zapas_dolny_mvar: 0.8505,
        zapas_gorny_mvar: 0.8505,
        margines_mvar: 0.8505,
        pokryty: true,
        uwaga: 'pokryty',
      },
      {
        p_mw: 3.15,
        q_min_mvar: -0.63,
        q_max_mvar: 0.63,
        q_wymagane_min_mvar: -1.0395,
        q_wymagane_max_mvar: 1.0395,
        zapas_dolny_mvar: -0.4095,
        zapas_gorny_mvar: -0.4095,
        margines_mvar: -0.4095,
        pokryty: false,
        uwaga: 'niepokryty: brak 0.4095 Mvar po stronie gornej (indukcyjnej)',
      },
    ],
    werdykt: {
      pokryty: false,
      liczba_punktow: 4,
      liczba_pokrytych: 3,
      min_margines_mvar: -0.4095,
      opis_pl:
        'Krzywa producenta NIE pokrywa wymagania operatora: 1 z 4 punktow niepokrytych; '
        + 'najwiekszy deficyt 0.4095 Mvar przy p=3.15 MW.',
    },
    slad_whitebox: {
      wzor:
        'punkt pokryty  <=>  q_min_prod <= q_wym_min  AND  q_max_prod >= q_wym_max; '
        + 'margines = min(q_wym_min - q_min_prod, q_max_prod - q_wym_max); '
        + 'q_wym_min = udzial_min * Pn, q_wym_max = udzial_max * Pn',
      dane: {
        pn_mw: 3.15,
        udzial_q_min_pct_pn: -0.33,
        udzial_q_max_pct_pn: 0.33,
        q_wymagane_min_mvar: -1.0395,
        q_wymagane_max_mvar: 1.0395,
        liczba_punktow_krzywej: 4,
      },
      podstawienie: [
        'p=0.0 MW: min(0.8505, 0.8505) = 0.8505 Mvar -> pokryty',
        'p=1.575 MW: min(0.8505, 0.8505) = 0.8505 Mvar -> pokryty',
        'p=2.52 MW: min(0.8505, 0.8505) = 0.8505 Mvar -> pokryty',
        'p=3.15 MW: min(-0.4095, -0.4095) = -0.4095 Mvar -> niepokryty',
      ],
      wynik: 'NIEPOKRYTE: 3/4 punktow.',
    },
  };
}

/** Wariant pełnego pokrycia (werdykt POKRYTE) — do testów banera werdyktu ok. */
export function widokPokryteFixture(): WidokPokryciaPQ {
  const bazowy = widokPokryciaFixture();
  return {
    ...bazowy,
    punkty: bazowy.punkty.map((pt) => ({
      ...pt,
      q_min_mvar: -1.89,
      q_max_mvar: 1.89,
      zapas_dolny_mvar: 0.8505,
      zapas_gorny_mvar: 0.8505,
      margines_mvar: 0.8505,
      pokryty: true,
      uwaga: 'pokryty',
    })),
    werdykt: {
      pokryty: true,
      liczba_punktow: 4,
      liczba_pokrytych: 4,
      min_margines_mvar: 0.8505,
      opis_pl:
        'Krzywa producenta pokrywa wymaganie operatora we wszystkich 4 punktach '
        + '(najmniejszy margines 0.8505 Mvar).',
    },
  };
}
