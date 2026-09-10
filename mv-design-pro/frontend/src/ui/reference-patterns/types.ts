/**
 * Reference Patterns Types — Wzorce odniesienia
 *
 * CANONICAL ALIGNMENT:
 * - NOT-A-SOLVER: Reference patterns are INTERPRETATION layer
 * - Polish labels (100% PL UI)
 * - READ-ONLY: No mutations, no physics
 *
 * Types for reference pattern validation display.
 *
 * UWAGA: Mapowanie werdyktów na komunikaty UI:
 * - ZGODNE → "Zgodne"
 * - GRANICZNE → "Na granicy dopuszczalności"
 * - NIEZGODNE → "Wymaga korekty"
 */

import {
  VERDICT_UI_LABELS,
  VERDICT_UI_DESCRIPTIONS,
  VERDICT_UI_COLORS,
  VERDICT_UI_BADGE_COLORS,
} from '../shared/verdict-messages';

// =============================================================================
// Verdict Types
// =============================================================================

export type ReferenceVerdict = 'ZGODNE' | 'GRANICZNE' | 'NIEZGODNE';

export type CheckStatus = 'PASS' | 'FAIL' | 'WARN' | 'INFO';

// =============================================================================
// Pattern Metadata
// =============================================================================

export interface PatternMetadata {
  pattern_id: string;
  name_pl: string;
  description_pl: string;
}

export interface FixtureMetadata {
  fixture_id: string;
  filename: string;
  description: string | null;
  expected_verdict: ReferenceVerdict | null;
  notes_pl: string | null;
}

// =============================================================================
// Check Result
// =============================================================================

export interface CheckResult {
  name_pl: string;
  status: CheckStatus;
  status_pl: string;
  description_pl: string;
  details?: Record<string, number | string | boolean | null>;
}

// =============================================================================
// Trace Step
// =============================================================================

export interface TraceStep {
  step: string;
  description_pl: string;
  inputs: Record<string, number | string | boolean | null>;
  formula?: string;
  calculation?: Record<string, number | string | boolean | null>;
  outputs?: Record<string, number | string | boolean | null>;
}

// =============================================================================
// Pattern Result Artifacts
// =============================================================================

export interface PatternArtifacts {
  tk_total_s?: number;
  ithn_a?: number | null;
  ithdop_a?: number;
  i_min_sel_primary_a?: number;
  i_max_sens_primary_a?: number;
  i_max_th_primary_a?: number;
  window_i_min_primary_a?: number;
  window_i_max_primary_a?: number;
  window_valid?: boolean;
  limiting_criterion_min?: string;
  limiting_criterion_max?: string;
  /**
   * Zalecana nastawa I>> — silnik Hoppla (karta W3-C2) nie modeluje strony
   * wtórnej/przekładni CT (inaczej niż dawny FIX-12D), więc pole zastąpiło
   * `recommended_setting_secondary_a`.
   */
  recommended_setting_primary_a?: number;
  /** Tekst konfliktu okna nastaw (null gdy okno prawidłowe) — rozszerzenie W3-C2. */
  window_conflict_pl?: string | null;
  /** Rekomendacje okna nastaw (dopasowanie do parametrów Hoppla) — rozszerzenie W3-C2. */
  window_recommendations_pl?: string[];
  /** Analiza cieplna pełnego cyklu SPZ (`_analyze_spz`, już kanon). */
  spz_i_th_required_a?: number;
  spz_allowed?: boolean;
  /** false gdy SPZ wyłączone dla tego wejścia. */
  spz_enabled?: boolean;
  /** Diagnostyka generacji lokalnej (E-L) — rozszerzenie W3-C2. */
  generacja_lokalna_aktywna?: boolean;
  generacja_lokalna_wklad_el_a?: number;
  generacja_lokalna_wklad_systemu_a?: number;
  generacja_lokalna_udzial_el?: number | null;
  /** null = NIEDOSTĘPNY (brak jawnie podanego progu udziału E-L). */
  generacja_lokalna_ryzyko_zsz?: boolean | null;
}

// =============================================================================
// Pattern Run Result
// =============================================================================

export interface PatternRunResult {
  run_id: string;
  pattern_id: string;
  name_pl: string;
  verdict: ReferenceVerdict;
  verdict_description_pl: string;
  summary_pl: string;
  checks: CheckResult[];
  trace: TraceStep[];
  artifacts: PatternArtifacts;
}

// =============================================================================
// API Responses
// =============================================================================

export interface PatternListResponse {
  patterns: PatternMetadata[];
}

export interface FixtureListResponse {
  pattern_id: string;
  fixtures: FixtureMetadata[];
}

// =============================================================================
// UI State Types
// =============================================================================

export type ReferencePatternsTab = 'WYNIK' | 'CHECKI' | 'WARTOSCI' | 'SLAD';

export type PanelSection = 'PATTERNS' | 'FIXTURES';

// =============================================================================
// Polish Labels (100% PL)
// =============================================================================

/**
 * Etykiety werdyktów UI — przyjazne dla użytkownika.
 * Mapowanie: ZGODNE → "Zgodne", GRANICZNE → "Na granicy dopuszczalności", NIEZGODNE → "Wymaga korekty"
 */
export const VERDICT_LABELS_PL: Record<ReferenceVerdict, string> = VERDICT_UI_LABELS;

/**
 * Opisy werdyktów UI — techniczne, bez wyrokowego charakteru.
 */
export const VERDICT_DESCRIPTIONS_PL: Record<ReferenceVerdict, string> = VERDICT_UI_DESCRIPTIONS;

/**
 * Kolory werdyktów UI — łagodniejsze tony dla "Wymaga korekty" (orange zamiast rose).
 */
export const VERDICT_COLORS: Record<ReferenceVerdict, string> = VERDICT_UI_COLORS;

/**
 * Kolory badge werdyktów UI.
 */
export const VERDICT_BADGE_COLORS: Record<ReferenceVerdict, string> = VERDICT_UI_BADGE_COLORS;

export const CHECK_STATUS_LABELS_PL: Record<CheckStatus, string> = {
  PASS: 'Spełnione',
  FAIL: 'Niespełnione',
  WARN: 'Ostrzeżenie',
  INFO: 'Informacja',
};

export const CHECK_STATUS_COLORS: Record<CheckStatus, string> = {
  PASS: 'bg-emerald-100 text-emerald-700',
  FAIL: 'bg-rose-100 text-rose-700',
  WARN: 'bg-amber-100 text-amber-700',
  INFO: 'bg-slate-100 text-slate-600',
};

export const CHECK_STATUS_DOT_COLORS: Record<CheckStatus, string> = {
  PASS: 'bg-emerald-500',
  FAIL: 'bg-rose-500',
  WARN: 'bg-amber-500',
  INFO: 'bg-slate-400',
};

export const TAB_LABELS_PL: Record<ReferencePatternsTab, string> = {
  WYNIK: 'Wynik',
  CHECKI: 'Checki',
  WARTOSCI: 'Wartości pośrednie',
  SLAD: 'Ślad obliczeń',
};
