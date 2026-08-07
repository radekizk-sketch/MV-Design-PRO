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
 */

import type { RodzajAnalizy } from './api';

// ---------------------------------------------------------------------------
// Definicje pól
// ---------------------------------------------------------------------------

/** Rodzaj kontrolki pola parametru. */
export type RodzajPola = 'liczba' | 'tekst' | 'wybor' | 'metody';

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

/** Sposób uziemienia punktu neutralnego — lista ZAMKNIĘTA tabelą decyzyjną solvera. */
const OPCJE_UZIEMIENIA: readonly OpcjaPola[] = [
  { wartosc: 'isolated', etykieta: 'sieć izolowana' },
  { wartosc: 'petersen_tuned', etykieta: 'dławik gaszący dostrojony' },
  { wartosc: 'petersen_detuned', etykieta: 'dławik gaszący rozstrojony' },
  { wartosc: 'resistor', etykieta: 'rezystor uziemiający' },
  { wartosc: 'solid', etykieta: 'uziemienie bezpośrednie' },
];

/** Schemat doboru uziemienia punktu neutralnego (rozgałęzienie `_neutral_earthing_design`). */
const OPCJE_SCHEMATU_NEUTRALNEGO: readonly OpcjaPola[] = [
  { wartosc: 'petersen_coil', etykieta: 'dławik gaszący (Petersen)' },
  { wartosc: 'resistor_grounded', etykieta: 'rezystor uziemiający (NER)' },
];

/** Metody detekcji doziemienia dostępne w przekaźniku (`relay_methods`). */
export const METODY_DETEKCJI: readonly OpcjaPola[] = [
  { wartosc: 'wattmetric', etykieta: 'wattmetryczna' },
  { wartosc: 'admittance', etykieta: 'admitancyjna' },
  { wartosc: 'transient_directional', etykieta: 'kierunkowa przejściowa' },
  { wartosc: 'fifth_harmonic', etykieta: '5. harmoniczna' },
];

/** Pola obiektu `earthing` (`V126EarthingInput`) — wejście uziomu stacji. */
export const POLA_UZIOMU: readonly DefinicjaPola[] = [
  { klucz: 'gpz_ref', etykieta: 'Oznaczenie stacji', rodzaj: 'tekst' },
  { klucz: 'rho1_ohm_m', etykieta: 'Rezystywność warstwy górnej', rodzaj: 'liczba', jednostka: 'Ω·m' },
  { klucz: 'rho2_ohm_m', etykieta: 'Rezystywność warstwy dolnej', rodzaj: 'liczba', jednostka: 'Ω·m' },
  { klucz: 'h1_m', etykieta: 'Grubość warstwy górnej', rodzaj: 'liczba', jednostka: 'm' },
  { klucz: 'length_m', etykieta: 'Długość uziomu', rodzaj: 'liczba', jednostka: 'm' },
  { klucz: 'width_m', etykieta: 'Szerokość uziomu', rodzaj: 'liczba', jednostka: 'm' },
  { klucz: 'mesh_spacing_m', etykieta: 'Rozstaw oczek siatki', rodzaj: 'liczba', jednostka: 'm' },
  { klucz: 'buried_depth_m', etykieta: 'Głębokość ułożenia', rodzaj: 'liczba', jednostka: 'm' },
  { klucz: 'rods_total_length_m', etykieta: 'Sumaryczna długość prętów', rodzaj: 'liczba', jednostka: 'm' },
  { klucz: 'split_factor', etykieta: 'Współczynnik podziału prądu', rodzaj: 'liczba' },
  { klucz: 'fault_current_ka', etykieta: 'Prąd zwarcia doziemnego', rodzaj: 'liczba', jednostka: 'kA' },
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
  { klucz: 'bus_ref', etykieta: 'Węzeł przyłączenia', rodzaj: 'tekst' },
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
export type ListaZlozona = 'motors' | 'benchmark_references';

/** Zestaw parametrów rodzaju analizy. */
export interface ZestawParametrow {
  /** Pola proste trafiające wprost do `parameters`. */
  readonly pola: readonly DefinicjaPola[];
  /** Czy rodzaj przyjmuje obiekt `earthing` (uziom stacji). */
  readonly uziom: boolean;
  /** Lista złożona przyjmowana przez rodzaj (albo brak). */
  readonly lista: ListaZlozona | null;
  /** Czy rodzaj przyjmuje wybór metod detekcji (`relay_methods`). */
  readonly metodyDetekcji: boolean;
}

const PUSTY: ZestawParametrow = { pola: [], uziom: false, lista: null, metodyDetekcji: false };

/**
 * Parametry projektowe wg rodzaju analizy. Źródło każdej pozycji to miejsce odczytu
 * w solverze — komentarz przy zestawie podaje wiersz kontraktu.
 */
export const PARAMETRY_RODZAJU: Record<RodzajAnalizy, ZestawParametrow> = {
  // Liczy wprost z modelu (źródła harmoniczne z ENM).
  power_quality_harmonics: PUSTY,

  // `_ssci_impedance`: model.parameters["ssci_converter_ref"] — wskazanie przekształtnika.
  ssci_impedance: {
    pola: [
      {
        klucz: 'ssci_converter_ref',
        etykieta: 'Oznaczenie przekształtnika',
        rodzaj: 'tekst',
        opis: 'Puste = solver wybiera przekształtnik sam (największa moc znamionowa).',
      },
    ],
    uziom: false,
    lista: null,
    metodyDetekcji: false,
  },

  voltage_stability: PUSTY,
  reliability_contingency: PUSTY,

  // `_earthing`: model.earthing albo model.parameters["earthing"].
  earthing_safety: { pola: [], uziom: true, lista: null, metodyDetekcji: false },

  // Ograniczniki pochodzą z aparatów pierwotnych modelu (most ENM) — bez formularza.
  insulation_coordination: PUSTY,

  // `_earth_fault_detection`: parameters["neutral_grounding"], parameters["relay_methods"].
  earth_fault_detection: {
    pola: [
      {
        klucz: 'neutral_grounding',
        etykieta: 'Sposób uziemienia punktu neutralnego',
        rodzaj: 'wybor',
        opcje: OPCJE_UZIEMIENIA,
      },
    ],
    uziom: false,
    lista: null,
    metodyDetekcji: true,
  },

  // `_transient`: breaker_rated_voltage_kv, trv_natural_frequency_hz, trv_tau_s,
  // inrush_multiple_in, neutral_grounding.
  transient_trv: {
    pola: [
      {
        klucz: 'breaker_rated_voltage_kv',
        etykieta: 'Napięcie znamionowe łącznika',
        rodzaj: 'liczba',
        jednostka: 'kV',
        opis: 'Puste = najwyższe napięcie znamionowe szyny modelu.',
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
      {
        klucz: 'neutral_grounding',
        etykieta: 'Sposób uziemienia punktu neutralnego',
        rodzaj: 'wybor',
        opcje: OPCJE_UZIEMIENIA,
      },
    ],
    uziom: false,
    lista: null,
    metodyDetekcji: false,
  },

  // `_motor_starting`: model.motors (payload `motors` walidowany w API).
  motor_starting: { pola: [], uziom: false, lista: 'motors', metodyDetekcji: false },

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
    lista: null,
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
    lista: null,
    metodyDetekcji: false,
  },

  // `_benchmark_validation`: parameters["benchmark_references"].
  benchmark_validation: {
    pola: [],
    uziom: false,
    lista: 'benchmark_references',
    metodyDetekcji: false,
  },

  uncertainty_sensitivity: PUSTY,

  // `_neutral_earthing_design` + `_petersen_design` + `_ner_design`.
  neutral_earthing_design: {
    pola: [
      {
        klucz: 'neutral_earthing_type',
        etykieta: 'Schemat uziemienia punktu neutralnego',
        rodzaj: 'wybor',
        opcje: OPCJE_SCHEMATU_NEUTRALNEGO,
      },
      { klucz: 'petersen_detuning', etykieta: 'Stopień rozstrojenia dławika', rodzaj: 'liczba' },
      {
        klucz: 'petersen_residual_damping',
        etykieta: 'Składowa tłumienia prądu resztkowego',
        rodzaj: 'liczba',
      },
      {
        klucz: 'ner_target_earth_fault_current_a',
        etykieta: 'Docelowy prąd doziemienia (rezystor)',
        rodzaj: 'liczba',
        jednostka: 'A',
      },
      {
        klucz: 'ner_clearing_time_s',
        etykieta: 'Czas wyłączenia (rezystor)',
        rodzaj: 'liczba',
        jednostka: 's',
      },
      {
        klucz: 'ner_energy_rating_j',
        etykieta: 'Wytrzymałość cieplna rezystora',
        rodzaj: 'liczba',
        jednostka: 'J',
      },
    ],
    uziom: false,
    lista: null,
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
  return zestaw.pola.length > 0 || zestaw.uziom || zestaw.lista !== null || zestaw.metodyDetekcji;
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
  readonly wiersze: readonly WierszListy[];
}

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

  if (zestaw.lista !== null) {
    const definicje = zestaw.lista === 'motors' ? POLA_SILNIKA : POLA_REFERENCJI;
    const wiersze = wejscie.wiersze
      .map((wiersz) => wierszDoObiektu(definicje, wiersz))
      .filter((wiersz): wiersz is Record<string, unknown> => wiersz !== null);
    if (wiersze.length > 0) parametry[zestaw.lista] = wiersze;
  }

  return parametry;
}
