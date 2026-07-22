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

/** Zdarzenia śladu automatyki posortowane deterministycznie po event_seq. */
export function naZdarzenia(rows: readonly ZdarzenieAutomatyki[]): ZdarzenieAutomatyki[] {
  return [...rows].sort(
    (a, b) => a.event_seq - b.event_seq || a.event_type.localeCompare(b.event_type),
  );
}
