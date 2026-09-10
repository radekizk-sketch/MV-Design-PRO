/*
 * Model i adaptery ekranu „Stabilność dynamiczna" (E-32, karta P-3).
 * Czyste projekcje read-only — ZERO fizyki, ZERO pobrań, ZERO mutacji.
 *
 * ŹRÓDŁA DANYCH — realny kontrakt (mapowanie plik:linia, zero zgadywania):
 * - Wiersz wyniku: `build_dynamic_stability_results` (enm/canonical_analysis.py:
 *   2037-2059) → jeden wiersz = `DynamicStabilityResult.to_dict`
 *   (application/stability/dynamic_stability.py:119-140): status STABLE/UNSTABLE,
 *   stability_index, clearing_time_ms, max_clearing_time_ms, clearing_margin_ms,
 *   angle_swing_deg, post_fault_voltage_pu, post_fault_frequency_pu,
 *   limiting_factor, violated_checks, checks + werdykt raportowalności.
 *   Endpoint: `GET /analysis-runs/{id}/results/dynamic-stability`
 *   (api/analysis_runs.py:398-402).
 * - Ślad automatyki: `build_automation_trace_results` (canonical_analysis.py:
 *   2062-2072) → zdarzenia {event_seq, event_type, element_id, detail} +
 *   topology_effect (application/automation/trace.py:17-55).
 *   Endpoint: `GET /analysis-runs/{id}/results/automation-trace`.
 * - GAP (uczciwa granica): kontrakt NIE niesie szeregu czasowego przebiegu —
 *   sekcja wielkości prezentuje wartości skrajne/końcowe backendu z jawną notą.
 */

import type { ElementType } from '../../../ui/types';
import type { WierszZalozenia } from '../wzorzec';
import { kryteriumPL, STABILNOSC_STRINGS as T } from './strings';

// ---------------------------------------------------------------------------
// Kształty odpowiedzi backendu (lustro 1:1 pól konsumowanych)
// ---------------------------------------------------------------------------

/** Wiersz wyniku stabilności (pola opcjonalne — starsze zapisy bez pól → uczciwa kreska). */
export interface WierszStabilnosci {
  readonly scenario_id?: string;
  readonly source_id?: string;
  readonly faulted_element_id?: string;
  /** Rodzaj elementu ze snapshotu biegu (F-K4 faza 3) — bez niego nie da się
   *  zaznaczyć elementu w modelu; `null`/brak = nie ustalono (zero zgadywania). */
  readonly source_kind?: string | null;
  readonly faulted_element_kind?: string | null;
  readonly cleared_by_element_ids?: readonly string[];
  readonly stable?: boolean;
  readonly status?: string;
  readonly criteria_version?: string;
  readonly stability_index?: number;
  readonly clearing_time_ms?: number;
  readonly max_clearing_time_ms?: number;
  readonly clearing_margin_ms?: number;
  readonly angle_swing_deg?: number;
  readonly post_fault_voltage_pu?: number;
  readonly post_fault_frequency_pu?: number;
  readonly limiting_factor?: string;
  readonly violated_checks?: readonly string[];
  readonly checks?: Readonly<Record<string, boolean>>;
  readonly proof_ref?: string | null;
  readonly proof_status?: string | null;
  readonly proof_status_pl?: string | null;
  readonly reporting_status?: string | null;
  readonly reporting_status_pl?: string | null;
  readonly reporting_limitations?: readonly string[];
  /** Kryteria oceny progowej JAWNIE nazwane (karta W2 pkt 1) — etykieta PL,
   *  jednostka, wartość i nota o pochodzeniu (kryterium przyjęte w opcjach
   *  biegu, nie zaszyte). Starsze zapisy bez pola → uczciwy brak sekcji. */
  readonly threshold_criteria?: readonly KryteriumOcenyProgowej[];
}

/** Jedno kryterium oceny progowej — lustro `DynamicStabilityThresholds.kryteria_oceny_progowej`. */
export interface KryteriumOcenyProgowej {
  readonly key: string;
  readonly label_pl: string;
  readonly value: number;
  readonly unit: string;
  readonly source_pl: string;
}

export interface OdpowiedzStabilnosci {
  readonly run_id: string;
  readonly rows: readonly WierszStabilnosci[];
}

/** Zdarzenie śladu automatyki (AutomationTraceEvent.to_dict). */
export interface ZdarzenieAutomatyki {
  readonly event_seq: number;
  readonly event_type: string;
  readonly element_id?: string | null;
  readonly detail?: string;
}

/** Efekt topologiczny po wyłączeniu (PostFaultTopologyEffect.to_dict — pola konsumowane). */
export interface EfektTopologii {
  readonly network_state?: string;
  readonly outage_scope?: string;
  readonly opened_element_ids?: readonly string[];
}

export interface OdpowiedzSladuAutomatyki {
  readonly run_id: string;
  readonly topology_effect?: EfektTopologii | null;
  readonly rows: readonly ZdarzenieAutomatyki[];
}

// ---------------------------------------------------------------------------
// Szereg czasowy przebiegu (U(t)/f(t)) — endpoint results/dynamic-stability/time-series
// ---------------------------------------------------------------------------

/** Metadana wielkości przebiegu (klucz pola w punkcie + jednostka z backendu). */
export interface WielkoscPrzebiegu {
  readonly key: string;
  readonly label_pl?: string;
  readonly unit: string;
}

/** Pojedynczy punkt przebiegu — mirror VoltageTrajectoryPoint.to_dict. */
export interface PunktPrzebiegu {
  readonly t_s: number;
  readonly voltage_pu?: number;
  readonly frequency_pu?: number;
}

/** Odpowiedź endpointu szeregu czasowego (na żądanie). */
export interface OdpowiedzPrzebieguStabilnosci {
  readonly run_id: string;
  readonly has_time_series: boolean;
  readonly time_unit: string;
  readonly criteria_version?: string | null;
  readonly quantities: readonly WielkoscPrzebiegu[];
  readonly points: readonly PunktPrzebiegu[];
}

// ---------------------------------------------------------------------------
// Formularz scenariusza wyłączenia zwarcia (karta W2 pkt 1, zero fabrykacji)
// ---------------------------------------------------------------------------

/**
 * Pola formularza scenariusza — DOKŁADNIE kontrakt opcji biegu
 * (`enm/canonical_analysis.py::_POLA_SCENARIUSZA_STABILNOSCI_DYNAMICZNEJ`, ten
 * sam klucz w `run.options`, ten sam komplet dziewięciu pól, ten sam powód
 * odmowy przy braku). `typ` steruje WYŁĄCZNIE walidacją i parsowaniem w tym
 * pliku — backend jest jedynym źródłem prawdy o tym, co pole znaczy fizycznie.
 */
export type TypPolaScenariusza = 'tekst' | 'liczba' | 'lista';

export interface PoleScenariusza {
  readonly klucz: string;
  readonly etykieta: string;
  readonly jednostka?: string;
  readonly typ: TypPolaScenariusza;
  /** Wartość musi być > 0 (kontrakt: `clearing_time_ms`/`recovery_time_constant_s`
   *  wchodzą jako dzielnik/czas dodatni — backend odrzuca <= 0 albo dzieli przez τ). */
  readonly wymagaDodatniej?: boolean;
}

export const POLA_SCENARIUSZA_STABILNOSCI: readonly PoleScenariusza[] = [
  { klucz: 'faulted_element_id', etykieta: T.poleElement, typ: 'tekst' },
  {
    klucz: 'clearing_time_ms',
    etykieta: T.poleCzasWylaczenia,
    jednostka: T.jednMs,
    typ: 'liczba',
    wymagaDodatniej: true,
  },
  { klucz: 'cleared_by_element_ids', etykieta: T.poleElementyWylaczajace, typ: 'lista' },
  { klucz: 'pre_fault_angle_deg', etykieta: T.poleKatPrzed, jednostka: T.jednDeg, typ: 'liczba' },
  {
    klucz: 'during_fault_angle_deg',
    etykieta: T.poleKatWCzasie,
    jednostka: T.jednDeg,
    typ: 'liczba',
  },
  { klucz: 'post_fault_angle_deg', etykieta: T.poleKatPo, jednostka: T.jednDeg, typ: 'liczba' },
  {
    klucz: 'post_fault_voltage_pu',
    etykieta: T.poleNapiecie,
    jednostka: T.jednPu,
    typ: 'liczba',
  },
  {
    klucz: 'post_fault_frequency_pu',
    etykieta: T.poleCzestotliwosc,
    jednostka: T.jednPu,
    typ: 'liczba',
  },
  {
    klucz: 'recovery_time_constant_s',
    etykieta: T.poleStalaCzasowa,
    jednostka: T.jednS,
    typ: 'liczba',
    wymagaDodatniej: true,
  },
] as const;

/** Wartości formularza — wszystkie pola jako tekst wpisany przez inżyniera (kontrolowane inputy). */
export type WartosciFormularzaScenariusza = Record<string, string>;

/** Formularz startuje PUSTY — zero wartości podpowiadanych jako „typowe" (karta W2 pkt 1). */
export function pusteWartosciScenariusza(): WartosciFormularzaScenariusza {
  return Object.fromEntries(POLA_SCENARIUSZA_STABILNOSCI.map((pole) => [pole.klucz, '']));
}

/** Błąd walidacji jednego pola formularza (klucz pola → treść błędu PL). */
export type BledyFormularzaScenariusza = Record<string, string>;

/**
 * Waliduje formularz WYŁĄCZNIE względem tego, co kontrakt backendu faktycznie
 * sprawdza (`FaultClearScenario.__post_init__`: pole wymagane, `clearing_time_ms`
 * i `recovery_time_constant_s` > 0, `cleared_by_element_ids` niepuste) — zero
 * progów inżynierskich wymyślonych w UI (zakaz fizyki w interfejsie).
 */
export function walidujFormularzScenariusza(
  wartosci: WartosciFormularzaScenariusza,
): BledyFormularzaScenariusza {
  const bledy: BledyFormularzaScenariusza = {};
  for (const pole of POLA_SCENARIUSZA_STABILNOSCI) {
    const surowa = (wartosci[pole.klucz] ?? '').trim();
    if (pole.typ === 'lista') {
      const wpisy = surowa
        .split(',')
        .map((wpis) => wpis.trim())
        .filter((wpis) => wpis !== '');
      if (wpisy.length === 0) bledy[pole.klucz] = T.bladListaPusta;
      continue;
    }
    if (surowa === '') {
      bledy[pole.klucz] = T.bladWymagane;
      continue;
    }
    if (pole.typ === 'liczba') {
      const liczba = Number(surowa.replace(',', '.'));
      if (!Number.isFinite(liczba)) {
        bledy[pole.klucz] = T.bladWymagane;
      } else if (pole.wymagaDodatniej && liczba <= 0) {
        bledy[pole.klucz] = T.bladDodatnie;
      }
    }
  }
  return bledy;
}

/**
 * Buduje `options` biegu z formularza — 1:1 kontrakt opcji biegu backendu.
 * Wołający MUSI sprawdzić `walidujFormularzScenariusza` wcześniej (zero pól
 * pustych/błędnych trafia tu) — funkcja nie waliduje ponownie, tylko rzutuje.
 */
export function zbudujOpcjeScenariusza(
  wartosci: WartosciFormularzaScenariusza,
): Record<string, unknown> {
  const opcje: Record<string, unknown> = {};
  for (const pole of POLA_SCENARIUSZA_STABILNOSCI) {
    const surowa = wartosci[pole.klucz]?.trim() ?? '';
    if (pole.typ === 'lista') {
      opcje[pole.klucz] = surowa
        .split(',')
        .map((wpis) => wpis.trim())
        .filter((wpis) => wpis !== '');
    } else if (pole.typ === 'liczba') {
      opcje[pole.klucz] = Number(surowa.replace(',', '.'));
    } else {
      opcje[pole.klucz] = surowa;
    }
  }
  return opcje;
}

// ---------------------------------------------------------------------------
// Wybór przebiegu stabilności
// ---------------------------------------------------------------------------

const STATUS_ZAKONCZONY = 'DONE';
const TYP_STABILNOSCI = 'DYNAMIC_STABILITY';

export interface PrzebiegDoWyboru {
  readonly id: string;
  readonly analysis_type: string;
  readonly status: string;
  readonly finished_at?: string | null;
  readonly started_at?: string | null;
}

/**
 * Wybiera przebieg stabilności: aktywny, jeśli jest zakończoną analizą
 * stabilności; inaczej najnowszy zakończony przebieg DYNAMIC_STABILITY;
 * brak → null (uczciwy stan zerowy ekranu).
 */
export function wybierzPrzebiegStabilnosci<T extends PrzebiegDoWyboru>(
  przebiegi: readonly T[],
  activeRunId: string | null,
): T | null {
  const stabilnosciowe = przebiegi.filter(
    (r) => r.status === STATUS_ZAKONCZONY && r.analysis_type === TYP_STABILNOSCI,
  );
  if (stabilnosciowe.length === 0) return null;
  const aktywny = activeRunId ? stabilnosciowe.find((r) => r.id === activeRunId) : undefined;
  if (aktywny) return aktywny;
  return [...stabilnosciowe].sort((a, b) =>
    String(b.finished_at ?? b.started_at ?? '').localeCompare(
      String(a.finished_at ?? a.started_at ?? ''),
    ),
  )[0];
}

// ---------------------------------------------------------------------------
// Formaty deterministyczne (przecinek PL — czyste formatowanie prezentacji)
// ---------------------------------------------------------------------------

function fmtLiczba(n: number, miejsca: number): string {
  return n.toFixed(miejsca).replace('.', ',');
}

/** Czas [ms] — 1 miejsce po przecinku. */
export function fmtMs(n: number): string {
  return fmtLiczba(n, 1);
}

/** Czas [s] — 3 miejsca po przecinku (oś przebiegu). */
export function fmtS(n: number): string {
  return fmtLiczba(n, 3);
}

/** Kąt [°] — 1 miejsce po przecinku. */
export function fmtDeg(n: number): string {
  return fmtLiczba(n, 1);
}

/** Wielkość względna [p.u.] — 3 miejsca po przecinku. */
export function fmtPu(n: number): string {
  return fmtLiczba(n, 3);
}

/** Wskaźnik bezwymiarowy — 3 miejsca po przecinku. */
export function fmtWskaznik(n: number): string {
  return fmtLiczba(n, 3);
}

// ---------------------------------------------------------------------------
// Adaptery sekcji
// ---------------------------------------------------------------------------

/** ZAŁOŻENIA — scenariusz zakłócenia (część wyniku, W-602). */
export function naZalozeniaStabilnosci(row: WierszStabilnosci): WierszZalozenia[] {
  return [
    { etykieta: T.zalElement, wartosc: row.faulted_element_id ?? T.kreska },
    { etykieta: T.zalZrodlo, wartosc: row.source_id ?? T.kreska },
    {
      etykieta: T.zalCzasWylaczenia,
      wartosc: row.clearing_time_ms != null ? fmtMs(row.clearing_time_ms) : T.kreska,
      jednostka: row.clearing_time_ms != null ? T.jednMs : undefined,
    },
    {
      etykieta: T.zalWylaczaly,
      wartosc:
        row.cleared_by_element_ids && row.cleared_by_element_ids.length > 0
          ? row.cleared_by_element_ids.join(', ')
          : T.kreska,
    },
    {
      etykieta: T.zalMaksCzas,
      wartosc: row.max_clearing_time_ms != null ? fmtMs(row.max_clearing_time_ms) : T.kreska,
      jednostka: row.max_clearing_time_ms != null ? T.jednMs : undefined,
    },
    { etykieta: T.zalKryteria, wartosc: row.criteria_version ?? T.kreska },
  ];
}

/** Werdykt PL — wprost ze statusu backendu (STABLE/UNSTABLE), bez interpretacji. */
export function werdyktStabilnosciPL(row: WierszStabilnosci): string {
  if (row.status === 'STABLE') return T.werdyktStabilny;
  if (row.status === 'UNSTABLE') return T.werdyktNiestabilny;
  return row.status ?? T.kreska;
}

/** Naruszone kryteria (PL) — z pola `violated_checks` backendu. */
export function naruszoneKryteriaPL(row: WierszStabilnosci): string {
  const naruszone = row.violated_checks ?? [];
  if (naruszone.length === 0) return T.werdyktBrakNaruszen;
  return naruszone.map(kryteriumPL).join(', ');
}

/** Jedna pozycja tabeli wielkości po zakłóceniu. */
export interface PozycjaWielkosci {
  readonly klucz: string;
  readonly wielkosc: string;
  readonly wartosc: string;
  readonly jednostka: string;
  /** Status kryterium backendu (`checks[klucz]`); undefined = kontrakt bez wpisu. */
  readonly spelnione: boolean | undefined;
}

/**
 * Tabela wielkości po zakłóceniu — wartości i statusy kryteriów WPROST
 * z wiersza backendu (`checks`); zero progów i porównań w UI.
 */
export function naWielkosciStabilnosci(row: WierszStabilnosci): PozycjaWielkosci[] {
  const checks = row.checks ?? {};
  const pozycja = (
    klucz: string,
    wielkosc: string,
    wartosc: number | undefined,
    format: (n: number) => string,
    jednostka: string,
  ): PozycjaWielkosci => ({
    klucz,
    wielkosc,
    wartosc: wartosc != null ? format(wartosc) : T.kreska,
    jednostka,
    spelnione: klucz in checks ? checks[klucz] : undefined,
  });
  return [
    pozycja('clearing_time', T.wielkoscCzas, row.clearing_time_ms, fmtMs, T.jednMs),
    pozycja('angle_swing', T.wielkoscKat, row.angle_swing_deg, fmtDeg, T.jednDeg),
    pozycja('voltage_recovery', T.wielkoscNapiecie, row.post_fault_voltage_pu, fmtPu, T.jednPu),
    pozycja(
      'frequency_recovery',
      T.wielkoscCzestotliwosc,
      row.post_fault_frequency_pu,
      fmtPu,
      T.jednPu,
    ),
  ];
}

/**
 * Kryteria oceny progowej do wyświetlenia — WPROST z wiersza backendu
 * (`threshold_criteria`), zero progów wymyślonych w UI. Starszy wiersz bez
 * pola → pusta lista (sekcja się nie renderuje, uczciwy brak zamiast zgadywania).
 */
export function naKryteriaOcenyProgowej(
  row: WierszStabilnosci,
): readonly KryteriumOcenyProgowej[] {
  return row.threshold_criteria ?? [];
}

/** Zdarzenia śladu automatyki posortowane deterministycznie po event_seq. */
export function naZdarzenia(rows: readonly ZdarzenieAutomatyki[]): ZdarzenieAutomatyki[] {
  return [...rows].sort(
    (a, b) => a.event_seq - b.event_seq || a.event_type.localeCompare(b.event_type),
  );
}

/** Jedna seria wykresu przebiegu (pole punktu → etykieta PL + jednostka). */
export interface SeriaPrzebiegu {
  readonly dataKey: 'voltage_pu' | 'frequency_pu';
  readonly nazwa: string;
  readonly jednostka: string;
}

/** Mapowanie kluczy backendu na etykiety PL serii przebiegu (read-only). */
const SERIA_PL: Record<string, { readonly nazwa: string; readonly klucz: SeriaPrzebiegu['dataKey'] }> =
  {
    voltage_pu: { nazwa: T.przebiegSeriaNapiecie, klucz: 'voltage_pu' },
    frequency_pu: { nazwa: T.przebiegSeriaCzestotliwosc, klucz: 'frequency_pu' },
  };

/**
 * Buduje listę serii przebiegu z metadanych `quantities` backendu — WYŁĄCZNIE
 * wielkości, które backend zadeklarował (zero fabrykacji). Kolejność stabilna
 * wg deklaracji backendu; wielkość nierozpoznana pomijana (bez fizyki w UI).
 */
export function naSeriePrzebiegu(
  quantities: readonly WielkoscPrzebiegu[],
): SeriaPrzebiegu[] {
  const serie: SeriaPrzebiegu[] = [];
  for (const q of quantities) {
    const mapa = SERIA_PL[q.key];
    if (!mapa) continue;
    serie.push({ dataKey: mapa.klucz, nazwa: mapa.nazwa, jednostka: q.unit });
  }
  return serie;
}

// ---------------------------------------------------------------------------
// Pętla decyzji (F-K4 faza 3): rodzaj domenowy z kontraktu → typ elementu UI
// ---------------------------------------------------------------------------

/**
 * Typ elementu interfejsu dla rodzaju z kontraktu backendu (`enm/element_kind.py`).
 * `null` = rodzaju nie ustalono albo nie mapuje się na element schematu — wtedy
 * akcji nie ma, bo prowadziłaby w nikąd.
 */
export function typElementuStabilnosci(rodzaj: string | null | undefined): ElementType | null {
  switch (rodzaj) {
    case 'szyna':
      return 'Bus';
    case 'galaz_liniowa':
      return 'LineBranch';
    case 'transformator':
      return 'TransformerBranch';
    case 'zrodlo':
      return 'Source';
    case 'generator':
      return 'Generator';
    default:
      return null;
  }
}

/** Element, do którego prowadzi werdykt niestabilności: najpierw miejsce zwarcia,
 *  potem źródło (to ono traci stabilność). `null` gdy kontrakt nie niesie rodzaju. */
export function elementWerdyktuStabilnosci(
  wiersz: WierszStabilnosci,
): { ref: string; typ: ElementType } | null {
  const kandydaci: readonly [string | undefined, string | null | undefined][] = [
    [wiersz.faulted_element_id, wiersz.faulted_element_kind],
    [wiersz.source_id, wiersz.source_kind],
  ];
  for (const [ref, rodzaj] of kandydaci) {
    const typ = typElementuStabilnosci(rodzaj);
    if (ref && typ) return { ref, typ };
  }
  return null;
}
