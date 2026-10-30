/*
 * Parametry projektowe analiz akademickich (ui2/wyniki/akademickie).
 *
 * ZASADA ZERO FABRYKACJI: każde pole odpowiada DOKŁADNIE jednemu kluczowi, który
 * solver realnie czyta (`network_model/solvers/v126_academic.py` — mapowanie klucz
 * → miejsce odczytu podane przy definicji). Żadna wartość nie jest podstawiana
 * przez okno: pole puste = klucz nieprzekazany = udokumentowana wartość domyślna
 * solvera. Powierzchnia zastana robiła odwrotnie — `defaultParameters()` wysyłała
 * ZAszyte dane (silnik „MOTOR_SN_1" 630 kW na węźle „BUS_SN", którego w modelu nie
 * ma; sposób uziemienia punktu neutralnego „petersen_tuned" niezależnie od modelu),
 * więc projektant oglądał wynik dla sieci, której nie zaprojektował.
 *
 * Lista pól jest ZAMKNIĘTA kontraktem solvera: strażnikiem drugiego końca pary jest
 * test CI `backend/tests/ci/test_v126_rodzaje_parytet.py` (klucz czytany przez
 * solver i nieobsłużony tutaj = czerwony test).
 *
 * WYJĄTEK JAWNY (karta W2-C): `harmonic_spectra` (rodzaj `power_quality_harmonics`,
 * `POLA_WIDMA`) nie jest czytany przez SOLVER — jest czytany przez MOST
 * (`solver_input/v126_contracts.py::build_v126_input_from_enm`), warstwę PRZED
 * solverem, gdzie widmo harmoniczne staje się częścią `harmonic_sources`. Ta sama
 * zasada zero fabrykacji obowiązuje jeden krok wcześniej w łańcuchu — pole puste
 * = solver liczy wyłącznie ze źródeł, których karta katalogowa niesie widmo.
 *
 * DRUGI WYJĄTEK JAWNY (karta B-02): `customer_counts` (rodzaj
 * `reliability_contingency`, `POLA_ODBIORCOW`) — także czytany przez MOST
 * (`odbiorcy_z_parametrow` → `V126BusInput.customer_count`), bo model ENM nie
 * niesie liczby odbiorców zasilanych z szyny, a wskaźniki niezawodności są nią
 * ważone. Bez wpisu gotowość analizy odmawia uruchomienia (`parametr.customer_counts`)
 * zamiast liczyć wskaźniki z zerowej liczby odbiorców.
 *
 * TRZECI WYJĄTEK JAWNY (karta UX-04, odcinek 3): `reliability_data` (rodzaj
 * `reliability_contingency`, `POLA_NIEZAWODNOSCI`) — czytany przez MOST
 * (`niezawodnosc_z_parametrow` → `V126BranchInput.failure_rate_per_year/mttr_h`): model ENM
 * nie niesie danych niezawodnościowych elementów, więc most bierze wartości robocze rejestru
 * niezawodności (dane przyjęte ESTIMATED), a wiersz projektanta zastępuje je dla elementu.
 */

import type { RodzajAnalizy } from './api';

// ---------------------------------------------------------------------------
// Definicje pól
// ---------------------------------------------------------------------------

/** Rodzaj kontrolki pola parametru. */
/**
 * `szyna` — wybór szyny z migawki modelu; `przeksztaltnik` — wybór przekształtnika z listy,
 * którą podaje gotowość analizy z backendu (przekształtniki z kartą katalogową, dokładnie
 * zbiór wejścia solvera) — w obu przypadkach projektant wybiera NAZWĘ, referencja modelu
 * jest wyłącznie wartością opcji (karta #145).
 */
export type RodzajPola =
  | 'liczba'
  | 'tekst'
  | 'wybor'
  | 'metody'
  | 'szyna'
  | 'galaz'
  | 'przeksztaltnik';

/** Opcja pola wyboru (wartość kontraktu + etykieta PL). */
export interface OpcjaPola {
  readonly wartosc: string;
  readonly etykieta: string;
}

/** Definicja pojedynczego pola parametru projektowego. */
export interface DefinicjaPola {
  /** Klucz w `V126RunRequest.parameters` (albo pole obiektu `earthing`/wiersza listy). */
  readonly klucz: string;
  readonly etykieta: string;
  readonly rodzaj: RodzajPola;
  readonly jednostka?: string;
  readonly opis?: string;
  readonly opcje?: readonly OpcjaPola[];
}

/**
 * Funkcje detekcji doziemień dostępne w przekaźniku (`relay_methods`) — komplet słownika
 * solvera `METODY_DETEKCJI_KOMPLET` (metody proste i funkcje składowe metod złożonych
 * 51N+67N, 51N/50N; parytet pilnowany testem
 * `backend/tests/ci/test_v126_rodzaje_parytet.py::test_funkcje_detekcji_formularza_sa_slownikiem_solvera`).
 */
export const METODY_DETEKCJI: readonly OpcjaPola[] = [
  { wartosc: 'wattmetric', etykieta: 'watometryczna' },
  { wartosc: 'admittance', etykieta: 'admitancyjna' },
  { wartosc: 'transient_directional', etykieta: 'kierunkowa stanów przejściowych' },
  { wartosc: 'fifth_harmonic', etykieta: '5. harmoniczna' },
  { wartosc: '51N', etykieta: 'nadprądowa ziemnozwarciowa zwłoczna 51N' },
  { wartosc: '67N', etykieta: 'kierunkowa ziemnozwarciowa 67N' },
  { wartosc: '50N', etykieta: 'nadprądowa ziemnozwarciowa bezzwłoczna 50N' },
];

/** Pola obiektu `earthing` (`V126EarthingInput`) — wejście uziomu stacji. */
export const POLA_UZIOMU: readonly DefinicjaPola[] = [
  {
    klucz: 'bus_ref',
    etykieta: 'Szyna stacji',
    rodzaj: 'szyna',
    opis: 'Szyna stacji w modelu — z niej solver bierze sieci SN i WN stacji, których zwarcie doziemne odprowadza uziom.',
  },
  { klucz: 'rho1_ohm_m', etykieta: 'Rezystywność warstwy górnej', rodzaj: 'liczba', jednostka: 'Ω·m' },
  { klucz: 'rho2_ohm_m', etykieta: 'Rezystywność warstwy dolnej', rodzaj: 'liczba', jednostka: 'Ω·m' },
  { klucz: 'h1_m', etykieta: 'Grubość warstwy górnej', rodzaj: 'liczba', jednostka: 'm' },
  { klucz: 'length_m', etykieta: 'Długość uziomu', rodzaj: 'liczba', jednostka: 'm' },
  { klucz: 'width_m', etykieta: 'Szerokość uziomu', rodzaj: 'liczba', jednostka: 'm' },
  { klucz: 'mesh_spacing_m', etykieta: 'Rozstaw oczek siatki', rodzaj: 'liczba', jednostka: 'm' },
  { klucz: 'buried_depth_m', etykieta: 'Głębokość ułożenia', rodzaj: 'liczba', jednostka: 'm' },
  { klucz: 'rods_total_length_m', etykieta: 'Sumaryczna długość prętów', rodzaj: 'liczba', jednostka: 'm' },
  { klucz: 'split_factor', etykieta: 'Współczynnik podziału prądu', rodzaj: 'liczba' },
  {
    klucz: 'fault_current_ka',
    etykieta: 'Prąd zwarcia doziemnego (nadpisanie)',
    rodzaj: 'liczba',
    jednostka: 'kA',
    opis: 'Puste — prąd z modelu wg sposobu pracy punktu neutralnego (EN 50522 tab. 1); wpisana wartość zastępuje go jako dana przyjęta.',
  },
  { klucz: 'fault_clearing_time_s', etykieta: 'Czas wyłączenia zwarcia', rodzaj: 'liczba', jednostka: 's' },
  {
    klucz: 'surface_layer_rho_ohm_m',
    etykieta: 'Rezystywność warstwy powierzchniowej',
    rodzaj: 'liczba',
    jednostka: 'Ω·m',
  },
  {
    klucz: 'surface_layer_derating',
    etykieta: 'Współczynnik redukcji warstwy powierzchniowej',
    rodzaj: 'liczba',
  },
];

/** Pola wiersza silnika (`V126MotorInput`) — dane spoza modelu sieci. */
export const POLA_SILNIKA: readonly DefinicjaPola[] = [
  { klucz: 'ref', etykieta: 'Oznaczenie', rodzaj: 'tekst' },
  { klucz: 'bus_ref', etykieta: 'Szyna przyłączenia', rodzaj: 'szyna' },
  { klucz: 'rated_kw', etykieta: 'Moc znamionowa', rodzaj: 'liczba', jednostka: 'kW' },
  { klucz: 'rated_voltage_kv', etykieta: 'Napięcie znamionowe', rodzaj: 'liczba', jednostka: 'kV' },
  { klucz: 'locked_rotor_multiplier', etykieta: 'Krotność prądu rozruchowego', rodzaj: 'liczba' },
  { klucz: 'start_power_factor', etykieta: 'Współczynnik mocy przy rozruchu', rodzaj: 'liczba' },
  { klucz: 'start_time_s', etykieta: 'Czas rozruchu', rodzaj: 'liczba', jednostka: 's' },
  {
    klucz: 'allowable_locked_rotor_time_s',
    etykieta: 'Dopuszczalny czas utyku',
    rodzaj: 'liczba',
    jednostka: 's',
  },
  { klucz: 'max_torque_pu', etykieta: 'Moment maksymalny', rodzaj: 'liczba', jednostka: 'j.w.' },
  { klucz: 'critical_slip', etykieta: 'Poślizg krytyczny', rodzaj: 'liczba' },
  { klucz: 'load_start_torque_pu', etykieta: 'Moment obciążenia przy rozruchu', rodzaj: 'liczba', jednostka: 'j.w.' },
  {
    klucz: 'rated_power_factor',
    etykieta: 'Znamionowy współczynnik mocy $\\cos\\varphi_n$',
    rodzaj: 'liczba',
    opis: 'Z tabliczki maszyny. Puste = wartość robocza rejestru maszyn (dana przyjęta w wyniku).',
  },
  {
    klucz: 'rated_efficiency',
    etykieta: 'Sprawność znamionowa $\\eta_n$',
    rodzaj: 'liczba',
    opis: 'Z tabliczki maszyny. Puste = wartość robocza rejestru maszyn (dana przyjęta w wyniku).',
  },
];

/**
 * Pola wiersza jawnego widma harmonicznego (`harmonic_spectra`, karta W2-C).
 * Kształt WEJŚCIA solvera niesie tu WYJĄTEK od reguły „każde pole = klucz
 * czytany przez solver" z nagłówka pliku: `harmonic_spectra` jest czytany
 * przez MOST (`solver_input/v126_contracts.py::build_v126_input_from_enm`),
 * o warstwę PRZED solverem — solver widzi już gotowe `harmonic_sources`. Wiersz
 * (generator, rząd, %) jest agregowany do zagnieżdżonej mapy
 * `{generator_ref: {rząd: %}}` w `zbudujParametry` (nie jest to lista płaska,
 * jak `motors`/`benchmark_references`).
 */
export const POLA_WIDMA: readonly DefinicjaPola[] = [
  { klucz: 'generator_ref', etykieta: 'Oznaczenie przekształtnika', rodzaj: 'tekst' },
  {
    klucz: 'rzad',
    etykieta: 'Rząd harmonicznej',
    rodzaj: 'liczba',
    opis: 'Liczba całkowita w zakresie 2–50.',
  },
  {
    klucz: 'procent',
    etykieta: 'Udział w prądzie znamionowym',
    rodzaj: 'liczba',
    jednostka: '%',
    opis: 'Zakres 0–100 %.',
  },
];

/**
 * Pola wiersza liczby odbiorców (`customer_counts`, karta B-02): szyna modelu +
 * liczba odbiorców zasilanych z tej szyny. Agregowane do mapy `{ref szyny: liczba}`
 * w `zbudujParametry` — kształt czytany przez most `odbiorcy_z_parametrow`.
 */
export const POLA_ODBIORCOW: readonly DefinicjaPola[] = [
  { klucz: 'bus_ref', etykieta: 'Szyna zasilająca odbiorców', rodzaj: 'szyna' },
  {
    klucz: 'liczba',
    etykieta: 'Liczba odbiorców',
    rodzaj: 'liczba',
    opis: 'Liczba całkowita nieujemna — odbiorcy zasilani z tej szyny.',
  },
];

/**
 * Pola wiersza danych niezawodności elementu (`reliability_data`, karta UX-04 odcinek 3):
 * gałąź modelu + całkowita intensywność uszkodzeń elementu [1/rok] i czas odnowy [h].
 * Agregowane do mapy `{ref gałęzi: {failure_rate_per_year, mttr_h}}` w `zbudujParametry` —
 * kształt czytany przez most `niezawodnosc_z_parametrow`. Pole puste = wartość robocza
 * rejestru niezawodności dla tej wielkości.
 */
export const POLA_NIEZAWODNOSCI: readonly DefinicjaPola[] = [
  { klucz: 'element_ref', etykieta: 'Element sieci', rodzaj: 'galaz' },
  {
    klucz: 'failure_rate_per_year',
    etykieta: 'Intensywność uszkodzeń elementu',
    rodzaj: 'liczba',
    jednostka: '1/rok',
    opis: 'Całkowita dla elementu (nie na km). Puste = wartość robocza rejestru niezawodności.',
  },
  {
    klucz: 'mttr_h',
    etykieta: 'Czas odnowy zasilania',
    rodzaj: 'liczba',
    jednostka: 'h',
    opis: 'Puste = wartość robocza rejestru niezawodności.',
  },
];

/** Pola wiersza referencji benchmarkowej (`benchmark_references`). */
export const POLA_REFERENCJI: readonly DefinicjaPola[] = [
  { klucz: 'network', etykieta: 'Sieć odniesienia', rodzaj: 'tekst' },
  { klucz: 'test', etykieta: 'Badanie', rodzaj: 'tekst' },
  { klucz: 'reference', etykieta: 'Wartość referencyjna', rodzaj: 'liczba' },
  { klucz: 'calculated', etykieta: 'Wartość policzona', rodzaj: 'liczba' },
  { klucz: 'tolerance_percent', etykieta: 'Tolerancja', rodzaj: 'liczba', jednostka: '%' },
  { klucz: 'proof_type', etykieta: 'Rodzaj dowodu', rodzaj: 'tekst' },
];

/** Listy złożone obsługiwane przez formularz (poza polami prostymi). */
export type ListaZlozona =
  | 'motors'
  | 'benchmark_references'
  | 'harmonic_spectra'
  | 'customer_counts'
  | 'reliability_data';

/** Zestaw parametrów rodzaju analizy. */
export interface ZestawParametrow {
  /** Pola proste trafiające wprost do `parameters`. */
  readonly pola: readonly DefinicjaPola[];
  /** Czy rodzaj przyjmuje obiekt `earthing` (uziom stacji). */
  readonly uziom: boolean;
  /** Listy złożone przyjmowane przez rodzaj (każda z własnym formularzem wierszowym). */
  readonly listy: readonly ListaZlozona[];
  /** Czy rodzaj przyjmuje wybór metod detekcji (`relay_methods`). */
  readonly metodyDetekcji: boolean;
}

const PUSTY: ZestawParametrow = { pola: [], uziom: false, listy: [], metodyDetekcji: false };

/**
 * Parametry projektowe wg rodzaju analizy. Źródło każdej pozycji to miejsce odczytu
 * w solverze — komentarz przy zestawie podaje wiersz kontraktu.
 */
export const PARAMETRY_RODZAJU: Record<RodzajAnalizy, ZestawParametrow> = {
  // `build_v126_input_from_enm`: widmo źródeł harmonicznych z karty katalogowej
  // przekształtnika, ALBO z jawnego wejścia tutaj (`harmonic_spectra`, karta
  // W2-C) — proweniencja RECZNE nadpisuje proweniencję KATALOG. Puste = solver
  // liczy wyłącznie ze źródeł, których karta katalogowa niesie widmo.
  power_quality_harmonics: { pola: [], uziom: false, listy: ['harmonic_spectra'], metodyDetekcji: false },

  // `_ssci_impedance`: model.parameters["ssci_converter_ref"] — wskazanie przekształtnika.
  // Bez wskazania solver bierze PIERWSZY przekształtnik wejścia (`_ssci_select_converter`:
  // `model.converters[0]`, kolejność generatorów modelu) — opis mówi dokładnie to.
  ssci_impedance: {
    pola: [
      {
        klucz: 'ssci_converter_ref',
        etykieta: 'Badany przekształtnik',
        rodzaj: 'przeksztaltnik',
        opis: 'Puste = obliczenie bierze pierwszy przekształtnik z kartą katalogową w kolejności modelu.',
      },
    ],
    uziom: false,
    listy: [],
    metodyDetekcji: false,
  },

  voltage_stability: PUSTY,

  // Most `odbiorcy_z_parametrow` (karta B-02): liczba odbiorców per szyna —
  // model jej nie niesie, a wskaźniki SAIDI/SAIFI/CAIDI są nią ważone. Most
  // `niezawodnosc_z_parametrow`: dane niezawodności elementu zastępujące wartość roboczą.
  reliability_contingency: {
    pola: [],
    uziom: false,
    listy: ['customer_counts', 'reliability_data'],
    metodyDetekcji: false,
  },

  // `_earthing`: model.earthing albo model.parameters["earthing"].
  earthing_safety: { pola: [], uziom: true, listy: [], metodyDetekcji: false },

  // Ograniczniki pochodzą z aparatów pierwotnych modelu (most ENM) — bez formularza.
  insulation_coordination: PUSTY,

  // `_earth_fault_detection`: parameters["relay_methods"]. Sposób uziemienia punktu
  // neutralnego sieci SN NIE jest polem formularza — solver czyta go z zespołu
  // uziemiającego modelu (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 4).
  earth_fault_detection: {
    pola: [],
    uziom: false,
    listy: [],
    metodyDetekcji: true,
  },

  // `_transient`: breaker_rated_voltage_kv, trv_natural_frequency_hz, trv_tau_s,
  // inrush_multiple_in (uziemienie sieci do oceny ferrorezonansu — z modelu).
  transient_trv: {
    pola: [
      {
        klucz: 'breaker_rated_voltage_kv',
        etykieta: 'Napięcie znamionowe łącznika',
        rodzaj: 'liczba',
        jednostka: 'kV',
        opis: 'Puste = napięcie najwyższe urządzenia $U_m$ sieci SN modelu (IEC 60038 tab. 3–5; '
          + '$U_r$ aparatu równe $U_m$, IEC 62271-1).',
      },
      {
        klucz: 'trv_natural_frequency_hz',
        etykieta: 'Częstotliwość własna napięcia powrotnego',
        rodzaj: 'liczba',
        jednostka: 'Hz',
      },
      { klucz: 'trv_tau_s', etykieta: 'Stała czasowa napięcia powrotnego', rodzaj: 'liczba', jednostka: 's' },
      {
        klucz: 'inrush_multiple_in',
        etykieta: 'Krotność prądu załączania transformatora',
        rodzaj: 'liczba',
      },
    ],
    uziom: false,
    listy: [],
    metodyDetekcji: false,
  },

  // `_motor_starting`: model.motors (payload `motors` walidowany w API).
  motor_starting: { pola: [], uziom: false, listy: ['motors'], metodyDetekcji: false },

  // `_hosting_capacity`: parameters["hosting_monte_carlo_n"].
  hosting_capacity: {
    pola: [
      {
        klucz: 'hosting_monte_carlo_n',
        etykieta: 'Liczba losowań Monte Carlo',
        rodzaj: 'liczba',
      },
    ],
    uziom: false,
    listy: [],
    metodyDetekcji: false,
  },

  // `_opf_loss_lcc`: energy_price_pln_per_kwh, discount_rate, lcc_years,
  // loss_hours_per_year, co2_kg_per_kwh.
  opf_loss_lcc: {
    pola: [
      { klucz: 'energy_price_pln_per_kwh', etykieta: 'Cena energii', rodzaj: 'liczba', jednostka: 'zł/kWh' },
      { klucz: 'discount_rate', etykieta: 'Stopa dyskonta', rodzaj: 'liczba' },
      { klucz: 'lcc_years', etykieta: 'Horyzont cyklu życia', rodzaj: 'liczba', jednostka: 'lat' },
      {
        klucz: 'loss_hours_per_year',
        etykieta: 'Czas trwania strat w roku',
        rodzaj: 'liczba',
        jednostka: 'h',
      },
      { klucz: 'co2_kg_per_kwh', etykieta: 'Wskaźnik emisyjności energii', rodzaj: 'liczba', jednostka: 'kg/kWh' },
    ],
    uziom: false,
    listy: [],
    metodyDetekcji: false,
  },

  // `_benchmark_validation`: parameters["benchmark_references"].
  benchmark_validation: {
    pola: [],
    uziom: false,
    listy: ['benchmark_references'],
    metodyDetekcji: false,
  },

  uncertainty_sensitivity: PUSTY,

  // `_neutral_earthing_design` + `_petersen_design` + `_ner_design`. Schemat (dławik albo
  // rezystor) wynika z wariantu zespołu uziemiającego modelu, nie z formularza; rezystor
  // (R, prąd znamionowy, dopuszczalny czas przepływu) jest daną zespołu w modelu — dawne pola
  // „docelowy prąd doziemienia" i „wytrzymałość cieplna rezystora" nadpisywały model. Tak samo
  // dawne „stopień rozstrojenia" i „tłumienie prądu resztkowego": prąd resztkowy liczy się dla
  // DŁAWIKA MODELU (impedancje punktów neutralnych w ruchu), nie z liczb formularza.
  neutral_earthing_design: {
    pola: [
      {
        klucz: 'ner_clearing_time_s',
        etykieta: 'Czas wyłączenia zwarcia doziemnego (rezystor)',
        rodzaj: 'liczba',
        jednostka: 's',
      },
    ],
    uziom: false,
    listy: [],
    metodyDetekcji: false,
  },
};

/** Zestaw parametrów rodzaju; rodzaj spoza kontraktu okna → zestaw pusty. */
export function zestawParametrow(kod: string): ZestawParametrow {
  return (PARAMETRY_RODZAJU as Record<string, ZestawParametrow | undefined>)[kod] ?? PUSTY;
}

/** Czy rodzaj przyjmuje jakiekolwiek parametry projektowe. */
export function maParametry(kod: string): boolean {
  const zestaw = zestawParametrow(kod);
  return zestaw.pola.length > 0 || zestaw.uziom || zestaw.listy.length > 0 || zestaw.metodyDetekcji;
}

// ---------------------------------------------------------------------------
// Budowa ładunku `parameters`
// ---------------------------------------------------------------------------

/** Surowy stan formularza: klucz → tekst wpisany przez użytkownika. */
export type StanPol = Readonly<Record<string, string>>;

/** Wiersz listy złożonej (silnik / referencja): klucz pola → tekst. */
export type WierszListy = Readonly<Record<string, string>>;

function wartoscPola(definicja: DefinicjaPola, tekst: string | undefined): unknown {
  if (tekst === undefined) return undefined;
  const przyciety = tekst.trim();
  if (przyciety === '') return undefined;
  if (definicja.rodzaj !== 'liczba') return przyciety;
  const liczba = Number(przyciety.replace(',', '.'));
  return Number.isFinite(liczba) ? liczba : undefined;
}

/**
 * Agreguje wiersze (generator, rząd, %) do mapy `{generator_ref: {rząd: %}}`
 * oczekiwanej przez `V126RunRequest.parameters.harmonic_spectra` — kształt
 * ZAGNIEŻDŻONY, więc NIE reużywa `wierszDoObiektu` (ten buduje listę płaskich
 * obiektów, jak `motors`/`benchmark_references`). Wiersz z rzędem poza 2–50 albo
 * procentem poza 0–100 jest POMIJANY — okno nie fabrykuje widma z błędnego
 * wpisu, tak samo jak backend (`_widma_jawne_z_parametrow`).
 */
function wierszeWidmaDoMapy(
  wiersze: readonly WierszListy[],
): Record<string, Record<string, number>> | null {
  const mapa: Record<string, Record<string, number>> = {};
  wiersze.forEach((wiersz) => {
    const ref = (wiersz.generator_ref ?? '').trim();
    const rzadTekst = (wiersz.rzad ?? '').trim();
    const procentTekst = (wiersz.procent ?? '').trim();
    if (ref === '' || rzadTekst === '' || procentTekst === '') return;
    const rzad = Number(rzadTekst.replace(',', '.'));
    const procent = Number(procentTekst.replace(',', '.'));
    if (!Number.isInteger(rzad) || rzad < 2 || rzad > 50) return;
    if (!Number.isFinite(procent) || procent < 0 || procent > 100) return;
    mapa[ref] = { ...(mapa[ref] ?? {}), [String(rzad)]: procent };
  });
  return Object.keys(mapa).length === 0 ? null : mapa;
}

/**
 * Agreguje wiersze (szyna, liczba) do mapy `{ref szyny: liczba odbiorców}` oczekiwanej
 * przez most (`customer_counts`, karta B-02). Wiersz bez szyny albo bez liczby jest
 * POMIJANY (nic do przekazania); wartość liczbowa trafia tak, jak ją wpisano —
 * poprawność (całkowita, nieujemna, szyna w modelu) ocenia gotowość backendu
 * (`parametr.customer_counts`), która nazywa błędny wpis zamiast go cicho odrzucać.
 */
function wierszeOdbiorcowDoMapy(
  wiersze: readonly WierszListy[],
): Record<string, number> | null {
  const mapa: Record<string, number> = {};
  wiersze.forEach((wiersz) => {
    const ref = (wiersz.bus_ref ?? '').trim();
    const liczbaTekst = (wiersz.liczba ?? '').trim();
    if (ref === '' || liczbaTekst === '') return;
    const liczba = Number(liczbaTekst.replace(',', '.'));
    if (!Number.isFinite(liczba)) return;
    mapa[ref] = liczba;
  });
  return Object.keys(mapa).length === 0 ? null : mapa;
}

/**
 * Agreguje wiersze (element, λ, czas odnowy) do mapy `{ref elementu: {failure_rate_per_year,
 * mttr_h}}` oczekiwanej przez most (`reliability_data`). Wiersz bez elementu albo bez żadnej
 * z dwóch wielkości jest POMIJANY (nic do zastąpienia); wartość trafia tak, jak ją wpisano —
 * poprawność (liczba nieujemna) ocenia most, który nazywa błędny wpis odmową danych.
 */
function wierszeNiezawodnosciDoMapy(
  wiersze: readonly WierszListy[],
): Record<string, Record<string, number>> | null {
  const mapa: Record<string, Record<string, number>> = {};
  wiersze.forEach((wiersz) => {
    const ref = (wiersz.element_ref ?? '').trim();
    if (ref === '') return;
    const wpis: Record<string, number> = {};
    (['failure_rate_per_year', 'mttr_h'] as const).forEach((pole) => {
      const tekst = (wiersz[pole] ?? '').trim();
      if (tekst === '') return;
      const liczba = Number(tekst.replace(',', '.'));
      if (Number.isFinite(liczba)) wpis[pole] = liczba;
    });
    if (Object.keys(wpis).length > 0) mapa[ref] = { ...(mapa[ref] ?? {}), ...wpis };
  });
  return Object.keys(mapa).length === 0 ? null : mapa;
}

function wierszDoObiektu(
  definicje: readonly DefinicjaPola[],
  wiersz: WierszListy,
): Record<string, unknown> | null {
  const obiekt: Record<string, unknown> = {};
  definicje.forEach((definicja) => {
    const wartosc = wartoscPola(definicja, wiersz[definicja.klucz]);
    if (wartosc !== undefined) obiekt[definicja.klucz] = wartosc;
  });
  return Object.keys(obiekt).length === 0 ? null : obiekt;
}

/** Wejście budowy ładunku parametrów. */
export interface WejscieParametrow {
  readonly rodzaj: string;
  readonly pola: StanPol;
  readonly uziom: StanPol;
  readonly metody: readonly string[];
  /** Wiersze KAŻDEJ listy złożonej rodzaju (brak klucza = lista bez wierszy). */
  readonly wiersze: WierszeList;
}

/** Wiersze list złożonych formularza — osobno dla każdej listy. */
export type WierszeList = Readonly<Partial<Record<ListaZlozona, readonly WierszListy[]>>>;

/**
 * Buduje ładunek `V126RunRequest.parameters` ze stanu formularza. Pola puste są
 * POMIJANE (klucz nie trafia do żądania) — okno nie podstawia żadnej wartości
 * domyślnej za solver. Funkcja czysta i deterministyczna.
 */
export function zbudujParametry(wejscie: WejscieParametrow): Record<string, unknown> {
  const zestaw = zestawParametrow(wejscie.rodzaj);
  const parametry: Record<string, unknown> = {};

  zestaw.pola.forEach((definicja) => {
    const wartosc = wartoscPola(definicja, wejscie.pola[definicja.klucz]);
    if (wartosc !== undefined) parametry[definicja.klucz] = wartosc;
  });

  if (zestaw.uziom) {
    const uziom = wierszDoObiektu(POLA_UZIOMU, wejscie.uziom);
    if (uziom !== null) parametry.earthing = uziom;
  }

  if (zestaw.metodyDetekcji && wejscie.metody.length > 0) {
    parametry.relay_methods = [...wejscie.metody];
  }

  zestaw.listy.forEach((lista) => {
    const wiersze = wejscie.wiersze[lista] ?? [];
    if (lista === 'harmonic_spectra') {
      const mapa = wierszeWidmaDoMapy(wiersze);
      if (mapa !== null) parametry.harmonic_spectra = mapa;
    } else if (lista === 'customer_counts') {
      const mapa = wierszeOdbiorcowDoMapy(wiersze);
      if (mapa !== null) parametry.customer_counts = mapa;
    } else if (lista === 'reliability_data') {
      const mapa = wierszeNiezawodnosciDoMapy(wiersze);
      if (mapa !== null) parametry.reliability_data = mapa;
    } else {
      const definicje = lista === 'motors' ? POLA_SILNIKA : POLA_REFERENCJI;
      const obiekty = wiersze
        .map((wiersz) => wierszDoObiektu(definicje, wiersz))
        .filter((wiersz): wiersz is Record<string, unknown> => wiersz !== null);
      if (obiekty.length > 0) parametry[lista] = obiekty;
    }
  });

  return parametry;
}
