/**
 * Koordynacja zabezpieczeń nadprądowych (E-28) — kontrakt wyniku backendu.
 *
 * Karta BIEG-ZABEZPIECZEN-Z-MODELU (D-21): urządzenia i nastawy pochodzą z MODELU sieci, prądy
 * z biegów (zwarciowy maksymalny i minimalny, rozpływ). Żądanie niesie wyłącznie
 * identyfikatory biegów, opcjonalne pary stopniowania i kryteria — dawne urządzenia ekranu
 * (szablony, nastawy w konfiguracji przypadku, prądy z żądania) skasowane. READ-ONLY.
 *
 * Zakaz P-06 (`docs/analysis/PROTECTION_CANONICAL_ARCHITECTURE.md` §3): koordynacja NIE wydaje
 * werdyktów — każde sprawdzenie niesie liczby (prądy, czasy, odstęp, iloraz) obok wartości
 * wymaganej z kryteriów i zdanie backendu z tymi liczbami. Dawne statusy PASS/MARGINAL/FAIL/
 * ERROR, werdykt ogólny i ich etykiety/kolory w interfejsie skasowane.
 */

import type { BrakNastaw, NastawyUrzadzeniaWidok } from '../protection/nastawyModelu';

/**
 * Fakt pary w punkcie zwarcia — kto zadziała (backend `StanPary`), nie ocena. Opis po polsku
 * przychodzi z backendu (`stan_pl`); interfejs nie ma własnej mapy stanów.
 */
export type StanPary =
  | 'ODSTEP'
  | 'NADRZEDNE_NIE_POBUDZA'
  | 'PODRZEDNE_NIE_ZADZIALA'
  | 'ZADNE_NIE_ZADZIALA'
  | 'BEZ_PUNKTOW';

// =============================================================================
// Urządzenia wyniku (z modelu)
// =============================================================================

/** Strefa urządzenia z topologii modelu (backend `StrefaUrzadzenia.to_dict`). */
export interface StrefaUrzadzenia {
  wezly_strefy: string[];
  wezly_strefy_nazwy_pl: string[];
  klaster_zacisku: string[];
  wezel_zacisku: string;
  punkty_innego_poziomu_napiecia?: { punkt_ref: string; nazwa_pl: string; powod_pl: string }[];
}

/** Urządzenie wyniku koordynacji — przekaźnik z modelu albo bezpiecznik modelu. */
export interface CoordinationDevice {
  id: string;
  name: string;
  device_type: 'RELAY' | 'FUSE';
  breaker_ref?: string | null;
  /** Nastawy rozwiązane jedną ścieżką oceny (przekaźnik) — `null` dla bezpiecznika. */
  nastawy: NastawyUrzadzeniaWidok | null;
  strefa: StrefaUrzadzenia | null;
}

/** Urządzenie, którego ocena jest wstrzymana (nazwane braki z akcją naprawczą). */
export interface OdmowaUrzadzenia {
  urzadzenie_ref: string;
  nazwa_pl: string;
  breaker_ref: string;
  braki: BrakNastaw[];
  kandydaci_naprawy: string[];
}

/** Urządzenie pominięte (ocena nadprądowa go nie dotyczy) z przyczyną. */
export interface PominieteUrzadzenie {
  urzadzenie_ref: string;
  nazwa_pl: string;
  kod: string;
  powod_pl: string;
}

/** Para stopniowania (nadrzędne, podrzędne) — z topologii albo wskazana i sprawdzona. */
export interface ParaSelektywnosci {
  nadrzedne_ref: string;
  podrzedne_ref: string;
}

/** Nazwana odmowa pary (niejednoznaczna, sprzeczna z topologią, bez oceny). */
export interface OdmowaPary {
  podrzedne_ref: string;
  kandydaci_nadrzedne: string[];
  kod: string;
  powod_pl: string;
}

// =============================================================================
// Sprawdzenia (liczby `null` = wartości nie wyznaczono — nigdy liczba zastępcza)
// =============================================================================

/** Czułość: iloraz I_min/I_s (bieg minimalny) obok wymaganego z kryteriów. */
export interface SensitivityCheck {
  device_id: string;
  i_fault_min_a: number | null;
  i_pickup_a: number | null;
  ratio: number | null;
  margin_percent: number | null;
  required_ratio: number;
  notes_pl: string;
  punkt_ref?: string | null;
  nazwa_punktu_pl?: string | null;
  stopien?: string | null;
}

export interface SelectivityCheck {
  upstream_device_id: string;
  downstream_device_id: string;
  analysis_current_a: number | null;
  i_upstream_a?: number | null;
  t_upstream_s: number | null;
  t_downstream_s: number | null;
  margin_s: number | null;
  required_margin_s: number;
  stan: StanPary;
  stan_pl: string;
  notes_pl: string;
  punkt_ref?: string | null;
  nazwa_punktu_pl?: string | null;
}

/** Przeciążalność: iloraz I_s/I_rob (bieg rozpływu) obok wymaganego z kryteriów. */
export interface OverloadCheck {
  device_id: string;
  i_operating_a: number | null;
  i_pickup_a: number | null;
  ratio: number | null;
  margin_percent: number | null;
  required_ratio: number;
  notes_pl: string;
}

// =============================================================================
// TCC
// =============================================================================

export interface TCCPoint {
  current_a: number;
  current_multiple: number;
  time_s: number;
}

/**
 * Kod podstawy krzywej: `KRZYWA_PRZEKAZNIKOWA` — czas najszybszego pobudzonego stopnia z
 * rdzenia IEC 60255; `BRAK_PASMA_BEZPIECZNIKA` — bezpiecznik bez pasma topikowego w katalogu
 * (`points` puste, próg i mnożnik `null`: bezpiecznik ich nie ma).
 */
export type PodstawaKrzywej = 'KRZYWA_PRZEKAZNIKOWA' | 'BRAK_PASMA_BEZPIECZNIKA';

export interface TCCCurve {
  device_id: string;
  device_name: string;
  curve_type: string;
  pickup_current_a: number | null;
  time_multiplier: number | null;
  points: TCCPoint[];
  color: string;
  podstawa_kod: PodstawaKrzywej;
  powod_pl?: string | null;
  /** Stopnie urządzenia w zdaniu (próg pierwotny, charakterystyka, TMS albo zwłoka). */
  opis_pl?: string | null;
}

/** Czy pozycja TCC niesie krzywą policzoną ze wzoru przekaźnikowego. */
export function maPodstawePrzekaznikowa(curve: TCCCurve): boolean {
  return curve.podstawa_kod === 'KRZYWA_PRZEKAZNIKOWA';
}

export interface FaultMarker {
  id: string;
  label_pl: string;
  current_a: number;
  fault_type: string;
  location: string;
}

// =============================================================================
// Wynik
// =============================================================================

export interface CoordinationConfig {
  breaker_time_s: number;
  relay_overtravel_s: number;
  safety_factor_s: number;
  sensitivity_ratio_required: number;
  overload_ratio_required: number;
}

/** Liczby zbiorcze — najmniejsze wartości i liczba sprawdzeń bez wartości (bez werdyktu). */
export interface CoordinationSummary {
  total_devices: number;
  total_checks: number;
  sensitivity: { sprawdzenia: number; najmniejszy_iloraz: number | null; bez_wartosci: number };
  selectivity: {
    sprawdzenia: number;
    najmniejszy_odstep_s: number | null;
    bez_odstepu: number;
  };
  overload: { sprawdzenia: number; najmniejszy_iloraz: number | null; bez_wartosci: number };
  odmowy_par: number;
  odmowy_urzadzen: number;
  kryteria: CoordinationConfig & { minimum_grading_margin_s: number };
}

export interface CoordinationResult {
  run_id: string;
  project_id: string;
  devices: CoordinationDevice[];
  sensitivity_checks: SensitivityCheck[];
  selectivity_checks: SelectivityCheck[];
  overload_checks: OverloadCheck[];
  tcc_curves: TCCCurve[];
  fault_markers: FaultMarker[];
  summary: CoordinationSummary;
  trace_steps: TraceStep[];
  odmowy_urzadzen: OdmowaUrzadzenia[];
  pominiete: PominieteUrzadzenie[];
  pary: ParaSelektywnosci[];
  odmowy_par: OdmowaPary[];
  pf_run_id?: string | null;
  sc_run_id?: string | null;
  sc_run_id_min?: string | null;
  created_at: string;
}

export interface TraceStep {
  step: string;
  description_pl: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
}

// =============================================================================
// Żądanie
// =============================================================================

/** Żądanie koordynacji — identyfikatory biegów, pary (opcjonalnie), kryteria (opcjonalnie). */
export interface RunCoordinationRequest {
  sc_run_id: string;
  sc_run_id_min: string;
  pf_run_id?: string;
  pary?: ParaSelektywnosci[];
  config?: CoordinationConfig;
}

export interface CoordinationSummaryResponse {
  run_id: string;
  project_id: string;
  total_devices: number;
  total_checks: number;
  najmniejszy_odstep_s: number | null;
  najmniejszy_iloraz_czulosci: number | null;
  najmniejszy_iloraz_przeciazalnosci: number | null;
}

export type AnalysisStatus = 'IDLE' | 'RUNNING' | 'SUCCESS' | 'ERROR';

// =============================================================================
// Polish Labels (100% PL)
// =============================================================================

export const LABELS = {
  title: 'Koordynacja zabezpieczeń nadprądowych',
  subtitle: 'Czułość, selektywność i przeciążalność urządzeń z modelu sieci',

  devices: {
    title: 'Urządzenia zabezpieczeniowe z modelu',
    opis:
      'Urządzenia i nastawy pochodzą z modelu sieci. Nastawy edytujesz na ekranie '
      + '„Zabezpieczenia i automatyka" albo w karcie elementu.',
    brak: 'Wynik koordynacji pojawi się po uruchomieniu analizy.',
    odmowyTytul: 'Urządzenia bez oceny (nazwane braki)',
    pominieteTytul: 'Urządzenia, których ocena nadprądowa nie dotyczy',
    paryTytul: 'Pary stopniowania',
    odmowyParTytul: 'Pary nierozstrzygnięte',
    zmienNastawy: 'Zmień nastawy w modelu',
    nadrzedne: 'nadrzędne',
    podrzedne: 'podrzędne',
    bezpiecznik: 'Bezpiecznik',
    przekaznik: 'Przekaźnik nadprądowy',
    /** Urządzenie wskazane w sprawdzeniu, którego nie ma na liście urządzeń wyniku. */
    nieznaneUrzadzenie: 'Urządzenie spoza wyniku',
  },

  biegi: {
    tytul: 'Biegi wejściowe',
    max: 'Zwarcie — wariant maksymalny',
    min: 'Zwarcie — wariant minimalny',
    pf: 'Rozpływ mocy (prądy robocze)',
    brak: 'brak',
    brakMaxMin:
      'Koordynacja wymaga zakończonego biegu zwarciowego w wariancie maksymalnym i minimalnym '
      + '(ten sam model). Uruchom oba obliczenia zwarciowe.',
    brakPf:
      'Bez biegu rozpływu przeciążalność nie zostanie sprawdzona (nazwany brak w wyniku).',
  },

  context: {
    title: 'Kontekst analizy',
    project: 'Projekt',
    studyCase: 'Wariant pracy',
    snapshot: 'Stan modelu',
    noContext: 'Wybierz kontekst',
    selectCase: 'Wybierz wariant pracy',
    selectSnapshot: 'Wybierz stan modelu',
    bezNazwy: 'bez nazwy',
    stanModeluWczytany: 'wczytany',
    rewizjaModelu: (rewizja: number) => `rewizja ${rewizja}`,
    identyfikatorProjektu: 'Identyfikator projektu',
    identyfikatorWariantu: 'Identyfikator wariantu pracy',
    identyfikatorStanuModelu: 'Identyfikator stanu modelu',
  },

  checks: {
    sensitivity: {
      title: 'Czułość',
      subtitle:
        'Czy najczulszy stopień pobudzi się przy najmniejszym prądzie przekaźnika w strefie '
        + '(bieg zwarciowy minimalny, IEC 60909)',
      description: 'Weryfikacja działania zabezpieczenia przy minimalnym prądzie zwarciowym',
      iFaultMin: 'Najmniejszy prąd przekaźnika [A]',
      iPickup: 'Próg pierwotny [A]',
      ratio: 'Iloraz czułości',
      device: 'Urządzenie',
      notes: 'Uwagi',
      brak: 'Brak sprawdzeń czułości — żadne urządzenie nie zostało ocenione.',
    },
    selectivity: {
      title: 'Selektywność',
      subtitle:
        'Stopniowanie czasowe par w punktach strefy podrzędnej (bieg maksymalny, czasy z '
        + 'charakterystyk IEC 60255)',
      description: 'Weryfikacja prawidłowego stopniowania czasowego pomiędzy zabezpieczeniami',
      downstream: 'Podrzędne',
      upstream: 'Nadrzędne',
      tDownstream: 't_pod [s]',
      tUpstream: 't_nad [s]',
      deltaT: 'Odstęp czasowy [s]',
      requiredMargin: 'Wymagany odstęp [s]',
      stan: 'Kto zadziała',
      analysisCurrent: 'Prąd przekaźnika podrzędnego [A]',
      punkt: 'Punkt zwarcia (najmniejszy odstęp)',
      notes: 'Uwagi',
      minDevicesRequired: 'Brak par stopniowania — strefy urządzeń nie są zagnieżdżone',
      // Kolumna DZIALANIA (V12K-261): widoczny następny krok z każdego wiersza pary —
      // edycja nastaw w modelu (bez niego wiersz byłby ślepym zaułkiem, FLOW §0.2).
      action: 'Działanie',
      fixSettings: 'Zmień nastawy',
      fixSettingsTitle:
        'Otwórz edytor nastaw zabezpieczeń modelu (ekran „Zabezpieczenia i automatyka"). '
        + 'Odstęp czasowy pary zmienia się czasem zabezpieczenia nadrzędnego (rezerwowego) '
        + 'albo podrzędnego — podrzędne ma zadziałać pierwsze (stopniowanie CTI).',
    },
    overload: {
      title: 'Przeciążalność',
      subtitle:
        'Czy najczulszy stopień nie pobudzi się przy prądzie roboczym wyłącznika (bieg '
        + 'rozpływu)',
      description: 'Weryfikacja braku zadziałania przy normalnym prądzie roboczym',
      iOperating: 'Prąd roboczy [A]',
      iPickup: 'Próg pierwotny [A]',
      ratio: 'Iloraz przeciążalności',
      device: 'Urządzenie',
      notes: 'Uwagi',
      brak: 'Brak sprawdzeń przeciążalności — żadne urządzenie nie zostało ocenione.',
    },
  },

  tcc: {
    title: 'Wykres czasowo-prądowy (TCC)',
    subtitle: 'Charakterystyki zabezpieczeń w układzie log-log',
    xAxis: 'Prąd [A]',
    yAxis: 'Czas [s]',
    noData: 'Brak danych wykresu',
    curve: 'Krzywa',
    tripTime: 'Czas wyłączenia',
    faultCurrent: 'Prąd zwarciowy',
    operatingCurrent: 'Prąd roboczy',
    selectivityMargin: 'Odstęp selektywności',
    legend: 'Legenda',
    zoomIn: 'Przybliż',
    zoomOut: 'Oddal',
    resetView: 'Resetuj widok',
  },

  trace: {
    title: 'Ślad obliczeń',
    subtitle: 'Wszystkie kroki obliczeń do audytu',
    step: 'Krok',
    description: 'Opis',
    inputs: 'Wejścia',
    outputs: 'Wyjścia',
    zapisTechnicznyPodpis: 'dane wejściowe i wyjściowe kroku w zapisie silnika koordynacji',
    noSteps: 'Brak kroków obliczeniowych',
    timestamp: 'Znacznik czasu',
    identyfikatorObliczen: 'Identyfikator obliczeń',
    expandAll: 'Rozwiń wszystkie',
    collapseAll: 'Zwiń wszystkie',
  },

  /** Etykieta pozycji TCC bez podstawy (bezpiecznik bez pasma topikowego). */
  brakCharakterystyki: 'brak charakterystyki',
  /** Kod charakterystyki spoza słownika `curveTypes` — nazwany jawnie, bez kodu (karta #145). */
  charakterystykaNierozpoznana: 'charakterystyka spoza słownika',

  /** Słownik = `KrzywaNastawy` backendu (pełne kody nastaw modelu). */
  curveTypes: {
    DT: 'Czas niezależny (DT)',
    IEC_SI: 'Normalna odwrotna (SI), IEC',
    IEC_VI: 'Bardzo odwrotna (VI), IEC',
    IEC_EI: 'Ekstremalnie odwrotna (EI), IEC',
    IEC_LI: 'Długoczasowa odwrotna (LTI), IEC',
    IEEE_MI: 'Umiarkowanie odwrotna (MI), IEEE',
    IEEE_VI: 'Bardzo odwrotna (VI), IEEE',
    IEEE_EI: 'Ekstremalnie odwrotna (EI), IEEE',
  },

  actions: {
    runAnalysis: 'Wykonaj analizę koordynacji',
    exportPdf: 'Eksportuj PDF',
    exportDocx: 'Eksportuj DOCX',
  },

  status: {
    idle: 'Gotowe do analizy',
    running: 'Trwa analiza...',
    success: 'Analiza zakończona',
    error: 'Błąd analizy',
  },

  tabs: {
    summary: 'Podsumowanie',
    sensitivity: 'Czułość',
    selectivity: 'Selektywność',
    overload: 'Przeciążalność',
    tcc: 'Wykres TCC',
    trace: 'Ślad obliczeń',
  },

  summary: {
    title: 'Wynik analizy — liczby zbiorcze',
    opis:
      'Koordynacja nie wydaje werdyktu: liczby obok wartości wymaganych z kryteriów projektowych '
      + 'ocenia projektant.',
    totalDevices: 'Liczba urządzeń',
    totalChecks: 'Liczba sprawdzeń',
    najmniejszyOdstep: 'Najmniejszy odstęp czasowy par [s]',
    najmniejszyIlorazCzulosci: 'Najmniejszy iloraz czułości',
    najmniejszyIlorazPrzeciazalnosci: 'Najmniejszy iloraz przeciążalności',
    wymagany: 'wymagany',
    bezWartosci: 'bez wyznaczonej wartości',
    brak: '—',
  },

} as const;
