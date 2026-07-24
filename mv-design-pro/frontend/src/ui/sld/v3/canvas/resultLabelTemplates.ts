/**
 * R1 (RECENZJA_WARSTWA_WYNIKOWA_2026-07 §wym.1–5, §11; program WYNIKI-SLD R1) —
 * UNIWERSALNY REJESTR SZABLONÓW treści etykiet wynikowych, kluczowany
 * (typ analizy × typ elementu). JEDNA architektura prezentacji wyników dla
 * WSZYSTKICH modułów obliczeniowych (uwaga strategiczna kanonu): tu wypełniona
 * analiza ROZPŁYW (`load_flow`); slot `short_circuit` zachowuje istniejące
 * odczyty węzła z W4 (Ik″/ip/Ith). Struktura przyjmuje przyszłe analizy
 * (SC pełny, termika, ΔU) BEZ przebudowy — ale w R1 ich NIE rozbudowujemy
 * (bez spekulacji).
 *
 * §0 ZERO fizyki w UI: każdy `code` mapuje 1:1 na istniejącą metrykę backendu
 * (`domain/result_builder_v1.py::_extract_element_metrics` `_METRIC_MAP` —
 * U_kV/V_PU/ANGLE_DEG/P_MW/Q_Mvar/S_MVA/LOADING_PCT/I_A/LOSSES_P_MW/COS_PHI/
 * DELTA_U_KV/DELTA_U_PCT/IK_3F_A/IP_A/ITH_A). Funkcje `format*` WYŁĄCZNIE
 * formatują (polski przecinek dziesiętny, jednostki, znak kierunku) — ŻADNEJ
 * arytmetyki wielkości. Brak metryki w payloadzie ⇒ linia pominięta (zero
 * placeholderów).
 *
 * KOLEJNOŚĆ specyfikacji = PRIORYTET informacji (wym. 2/5). Pierwsza pozycja to
 * „najważniejsza wartość" pokazywana na L1; L2 pokazuje 2–3 pierwsze
 * (`resultLabelLinesForLod`); L0 nie pokazuje nic. Znak (wym. 3): +P generacja
 * / −P pobór — `formatSignedScalar`.
 *
 * KONTRAKT LF DOMKNIĘTY (LF-KONTRAKT, V12K-161 — dawny rejestr braków R1
 * zamknięty): ścieżka PF (`canonical_analysis.py::build_execution_result_set`)
 * emituje teraz `element_results` również dla źródeł/DER (P/Q/S/cosφ = bilans
 * węzła źródłowego z FROZEN wyniku solvera), a `build_branch_results` niesie
 * straty czynne/bierne (LOSSES_P_MW/LOSSES_Q_Mvar — domknięcie ΔP transformatora)
 * oraz pochodne ΔU (DELTA_U_KV/DELTA_U_PCT) i cosφ (COS_PHI) linii/kabla. Wszystko
 * addytywnie, kontrakt FROZEN PowerFlowResult nietknięty. Kody ΔU/cosφ włączone
 * do rejestru poniżej — na kanwie widoczne top-N wg LOD (cap 3), pełny zestaw
 * dostępny w inspektorze/overlay.
 */
import type { RawMetricValue } from '../../../sld-overlay/rawResultOverlayStore';
import { formatMagnitudeKa } from '../../../sld-overlay/FaultContributionArrow';

/** Klasa elementu, do którego zakotwiczona jest etykieta (strategia kotwiczenia
 *  w rendererze: szyna/przęsło → środek biegu odcinka; TR/źródło → pod symbolem). */
export type ResultLabelKind = 'bus' | 'transformer' | 'source' | 'branch';

/** Rodzina analizy (klucz rejestru). R1 wypełnia `load_flow`; `short_circuit`
 *  zachowuje odczyt węzła z W4. Kolejne rodziny (termika/ΔU) dochodzą
 *  addytywnie, bez zmiany kształtu. */
export type ResultLabelAnalysis = 'load_flow' | 'short_circuit';

/** Poziom szczegółu (histereza S8, `SceneLod`): L0 bez etykiet, L1 jedna
 *  najważniejsza wartość, L2 2–3 wartości. */
export type ResultLabelLod = 0 | 1 | 2;

/** Jedna linia etykiety: prefiks wielkości (np. „U", „P", „obc.") + wartość
 *  sformatowana (1:1 ze źródła). */
export interface ResultLabelLine {
  readonly prefix: string;
  readonly text: string;
}

/** Specyfikacja jednej linii szablonu: kod metryki + prefiks + formater.
 *  `skipIfAnyPresent`: linia dodawana WYŁĄCZNIE, gdy żadna z tych metryk nie
 *  wystąpiła wcześniej (np. V_PU jako fallback U, gdy brak U_kV). */
export interface ResultLabelLineSpec {
  readonly code: string;
  readonly prefix: string;
  readonly format: (m: RawMetricValue) => string;
  readonly skipIfAnyPresent?: readonly string[];
}

// ---------------------------------------------------------------------------
// Formatowanie (spec §10 / §0: formatowanie dozwolone, fizyka nie).
// ---------------------------------------------------------------------------

/** Polski zapis liczby wg `format_hint` metryki (`fixed0/1/2/4`) — WYŁĄCZNIE
 *  formatowanie, wartość źródłowa bez zmian; przecinek dziesiętny. */
export function formatMetricValuePl(metric: RawMetricValue): string {
  const hint = metric.format_hint ?? 'fixed2';
  const value = metric.value as number;
  let decimals: number;
  if (hint === 'fixed0') decimals = 0;
  else if (hint === 'fixed1') decimals = 1;
  else if (hint === 'fixed4') decimals = 4;
  else decimals = 2;
  return value.toFixed(decimals).replace('.', ',');
}

/** Skalar z jednostką, np. „15,02 kV", „182,0 A". */
export function formatScalar(metric: RawMetricValue): string {
  return `${formatMetricValuePl(metric)} ${metric.unit}`;
}

/** Skalar ZE ZNAKIEM (wym. 3: znak reprezentuje kierunek — „+" generacja/
 *  wtłaczanie, „−"/„-" pobór). Dodatnie dostają jawny „+"; format i jednostka
 *  jak `formatScalar`. Wartość 0 bez znaku (kierunek nieokreślony). */
export function formatSignedScalar(metric: RawMetricValue): string {
  const value = metric.value as number;
  const body = formatScalar(metric);
  if (value > 0) return `+${body}`;
  return body; // ujemne niesie własny „-"; zero bez znaku
}

/** Wielkość bezwymiarowa (cosφ) — sam sformatowany skalar, BEZ jednostki (unit
 *  metryki COS_PHI jest pustym łańcuchem, więc `formatScalar` zostawiłby wiszącą
 *  spację). WYŁĄCZNIE formatowanie (polski przecinek dziesiętny). */
export function formatDimensionless(metric: RawMetricValue): string {
  return formatMetricValuePl(metric);
}

/** Prąd zwarciowy [kA] przez istniejący `formatMagnitudeKa` (<0,1 kA ⇒ ampery).
 *  Payload emituje IK/IP/ITH albo w kA (`ikss_ka`, hint fixed2), albo w A
 *  (`ikss_a`, hint fixed0) — normalizacja do kA (A ⇒ /1000) zachowuje wartość
 *  źródłową, a `formatMagnitudeKa` sam wybiera prezentację kA/A. */
export function formatCurrent(metric: RawMetricValue): string {
  const value = metric.value as number;
  const ka = metric.unit === 'A' ? value / 1000 : value;
  return formatMagnitudeKa(ka);
}

// ---------------------------------------------------------------------------
// REJESTR SZABLONÓW: (analiza × klasa elementu) → uporządkowane specyfikacje.
// Kolejność = priorytet informacji (L1 = pierwsza; L2 = 2–3 pierwsze).
// ---------------------------------------------------------------------------

/** Rozpływ — szyna (węzeł): napięcie najważniejsze (L1), kąt δ drugorzędny. */
const LF_BUS: readonly ResultLabelLineSpec[] = [
  { code: 'U_kV', prefix: 'U', format: formatScalar },
  { code: 'V_PU', prefix: 'U', format: formatScalar, skipIfAnyPresent: ['U_kV'] },
  { code: 'ANGLE_DEG', prefix: 'δ', format: formatScalar },
];

/** Rozpływ — transformator: obciążenie [%] najważniejsze (L1, wym. 5), potem
 *  moc pozorna S i straty ΔP. Pozycja zaczepu = ISTNIEJĄCY badge OLTC (nie
 *  dublujemy tutaj — §0.5). */
const LF_TRANSFORMER: readonly ResultLabelLineSpec[] = [
  { code: 'LOADING_PCT', prefix: 'obc.', format: formatScalar },
  { code: 'S_MVA', prefix: 'S', format: formatScalar },
  { code: 'LOSSES_P_MW', prefix: 'ΔP', format: formatScalar },
];

/** Rozpływ — źródło/DER: moc czynna P (L1, ZE ZNAKIEM), moc bierna Q
 *  (wym. 4 — obowiązkowo dostępna), moc pozorna S, współczynnik mocy cosφ
 *  (LF-KONTRAKT V12K-161 — pochodna |P|/|S| z bilansu węzła źródłowego). */
const LF_SOURCE: readonly ResultLabelLineSpec[] = [
  { code: 'P_MW', prefix: 'P', format: formatSignedScalar },
  { code: 'Q_Mvar', prefix: 'Q', format: formatSignedScalar },
  { code: 'S_MVA', prefix: 'S', format: formatScalar },
  { code: 'COS_PHI', prefix: 'cosφ', format: formatDimensionless },
];

/** Rozpływ — linia/kabel: obciążenie [%] (L1, wym. 5), prąd I, moc czynna P
 *  (ZE ZNAKIEM), moc bierna Q, spadek napięcia ΔU% oraz cosφ (LF-KONTRAKT
 *  V12K-161 — pochodne z wyniku solvera; na kanwie top-N wg LOD, pełny zestaw
 *  w inspektorze). */
const LF_BRANCH: readonly ResultLabelLineSpec[] = [
  { code: 'LOADING_PCT', prefix: 'obc.', format: formatScalar },
  { code: 'I_A', prefix: 'I', format: formatScalar },
  { code: 'P_MW', prefix: 'P', format: formatSignedScalar },
  { code: 'Q_Mvar', prefix: 'Q', format: formatSignedScalar },
  { code: 'DELTA_U_PCT', prefix: 'ΔU', format: formatScalar },
  { code: 'COS_PHI', prefix: 'cosφ', format: formatDimensionless },
];

/** Zwarcie — szyna (zachowane z W4): Ik″/ip/Ith. Pozostałe klasy SC NIE
 *  rozbudowywane w R1 (bez spekulacji — struktura gotowa). */
const SC_BUS: readonly ResultLabelLineSpec[] = [
  { code: 'IK_3F_A', prefix: 'Ik″', format: formatCurrent },
  { code: 'IP_A', prefix: 'ip', format: formatCurrent },
  { code: 'ITH_A', prefix: 'Ith', format: formatCurrent },
];

/** Rejestr szablonów: `analysis → kind → specyfikacje`. Brak wpisu (analiza lub
 *  klasa nieobsłużona) ⇒ pusta lista ⇒ brak etykiety (zero atrap). */
export const RESULT_LABEL_TEMPLATES: Readonly<
  Record<ResultLabelAnalysis, Readonly<Partial<Record<ResultLabelKind, readonly ResultLabelLineSpec[]>>>>
> = {
  load_flow: {
    bus: LF_BUS,
    transformer: LF_TRANSFORMER,
    source: LF_SOURCE,
    branch: LF_BRANCH,
  },
  short_circuit: {
    bus: SC_BUS,
  },
};

/** Maksymalna liczba linii per poziom LOD (wym. 5). L0 = 0 (bez etykiet),
 *  L1 = 1 (najważniejsza wartość), L2 = 3 (2–3 wartości). */
export const RESULT_LABEL_MAX_LINES_BY_LOD: Readonly<Record<ResultLabelLod, number>> = {
  0: 0,
  1: 1,
  2: 3,
};

/**
 * Normalizuje `payload.analysis_type` (dowolna wielkość liter, aliasy) do
 * rodziny rejestru. Rozpoznane rozpływowe: load_flow/loadflow/lf/pf/
 * power_flow; zwarciowe: sc_3f/sc_1f/sc/short_circuit/shortcircuit. Nieznane ⇒
 * `null` (brak szablonu ⇒ brak etykiet, zero fabrykacji). */
export function normalizeResultLabelAnalysis(analysisType: string | undefined): ResultLabelAnalysis | null {
  if (!analysisType) return null;
  const a = analysisType.toLowerCase();
  if (a.includes('load_flow') || a === 'loadflow' || a === 'lf' || a === 'pf' || a.includes('power_flow')) {
    return 'load_flow';
  }
  if (a.startsWith('sc') || a.includes('short_circuit') || a === 'shortcircuit') {
    return 'short_circuit';
  }
  return null;
}

/** Specyfikacje dla (analiza × klasa) — pusta lista, gdy brak wpisu w rejestrze. */
export function selectResultLabelSpecs(
  analysis: ResultLabelAnalysis | null,
  kind: ResultLabelKind,
): readonly ResultLabelLineSpec[] {
  if (!analysis) return [];
  return RESULT_LABEL_TEMPLATES[analysis][kind] ?? [];
}

/**
 * Zwija linie do poziomu LOD (wym. 5) — CZYSTA funkcja (bez sceny/DOM). Linie są
 * uporządkowane priorytetem (patrz szablony), więc zwijanie = przycięcie od
 * początku: L0 ⇒ [], L1 ⇒ pierwsza, L2 ⇒ do trzech. Zwraca ten sam obiekt, gdy
 * przycięcie nic nie zmienia (stabilność referencji dla memoizacji). */
export function resultLabelLinesForLod(
  lines: readonly ResultLabelLine[],
  lod: ResultLabelLod,
): readonly ResultLabelLine[] {
  const max = RESULT_LABEL_MAX_LINES_BY_LOD[lod];
  if (lines.length <= max) return lines;
  return lines.slice(0, max);
}
