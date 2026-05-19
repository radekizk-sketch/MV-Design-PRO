/**
 * Readiness Matrix Contract — krok 17 Kreatora KOMPLETNEGO (finalny).
 *
 * Domknięcie wszystkich 17 kroków: 29-osiowa macierz gotowości
 * integrująca:
 *   - 22 osie z DER readiness (Obliczenia/OZE-NC RfG/Ochrona/Jakość/Raportowanie)
 *   - 7 osi specyficznych dla stacji (uziemienie/SCADA/konstrukcja/ppoż/etc.)
 *
 * Status każdej osi:
 *   ready       — wszystkie wejścia obecne, można uruchomić
 *   partial     — częściowe wejścia, niektóre defaults zastosowane
 *   blocked     — brakuje krytycznych wejść
 *   no_module   — funkcjonalność nie zaimplementowana w aplikacji (gap)
 */

import { DER_READINESS_AXES } from '../der-configurator-v2/derConfiguratorContract';

export type ReadinessStatus = 'ready' | 'partial' | 'blocked' | 'no_module';

/** Oś gotowości stacji (uzupełnia 22 osie DER readiness). */
export interface StationReadinessAxis {
  readonly id: string;
  readonly labelPl: string;
  readonly category: string;
}

export const STATION_READINESS_AXES: readonly StationReadinessAxis[] = [
  { id: 'cable_selection', labelPl: 'Dobór kabla SN', category: 'Infrastruktura' },
  { id: 'switchgear_choice', labelPl: 'Rozdzielnica SN (vendor + IAC/IP/LSC)', category: 'Infrastruktura' },
  { id: 'interlocking', labelPl: 'Matryca blokad BHP', category: 'Bezpieczeństwo' },
  { id: 'transformer_choice', labelPl: 'Transformator (vector group + cooling)', category: 'Stacja' },
  { id: 'earthing', labelPl: 'Uziemienie (Rz + Ut/Us)', category: 'Bezpieczeństwo' },
  { id: 'scada_signals', labelPl: 'SCADA/RTU (IEC 61850 LN)', category: 'Komunikacja' },
  { id: 'construction', labelPl: 'Konstrukcja + ppoż', category: 'Infrastruktura' },
];

/** Łączna macierz: 22 DER + 7 station = 29 osi. */
export interface ReadinessMatrixAxis {
  readonly id: string;
  readonly labelPl: string;
  readonly category: string;
  readonly source: 'der' | 'station';
}

export function buildReadinessMatrix(): readonly ReadinessMatrixAxis[] {
  const derAxes: ReadinessMatrixAxis[] = DER_READINESS_AXES.map((a) => ({
    id: a.id,
    labelPl: a.label,
    category: a.group,
    source: 'der' as const,
  }));
  const stationAxes: ReadinessMatrixAxis[] = STATION_READINESS_AXES.map((a) => ({
    id: a.id,
    labelPl: a.labelPl,
    category: a.category,
    source: 'station' as const,
  }));
  return [...derAxes, ...stationAxes];
}

/** Stan pojedynczej osi w macierzy gotowości. */
export interface ReadinessAxisState {
  readonly axisId: string;
  readonly status: ReadinessStatus;
  readonly notesPl?: string;
}

/** Podsumowanie pełnej macierzy. */
export interface ReadinessSummary {
  readonly totalAxes: number;
  readonly readyCount: number;
  readonly partialCount: number;
  readonly blockedCount: number;
  readonly noModuleCount: number;
  readonly overallReadinessPct: number;
  /** Czy projekt może uruchomić wszystkie obliczenia. */
  readonly canRunAllAnalyses: boolean;
  /** Czy projekt może wygenerować raport OSD. */
  readonly canGenerateOsdReport: boolean;
}

export function summarizeReadiness(
  states: readonly ReadinessAxisState[],
): ReadinessSummary {
  const total = states.length;
  let ready = 0;
  let partial = 0;
  let blocked = 0;
  let noModule = 0;
  for (const s of states) {
    if (s.status === 'ready') ready++;
    else if (s.status === 'partial') partial++;
    else if (s.status === 'blocked') blocked++;
    else if (s.status === 'no_module') noModule++;
  }
  // Overall % = (ready × 1.0 + partial × 0.5) / total × 100.
  const score = (ready + partial * 0.5) / total;
  return {
    totalAxes: total,
    readyCount: ready,
    partialCount: partial,
    blockedCount: blocked,
    noModuleCount: noModule,
    overallReadinessPct: score * 100,
    canRunAllAnalyses: blocked === 0 && noModule === 0,
    canGenerateOsdReport: blocked === 0,
  };
}

/** Sprawdzenie czy wszystkie obowiązkowe kroki Kreatora są ukończone. */
export interface WizardStepCompletion {
  readonly stepId: string;
  readonly completed: boolean;
}

export const MANDATORY_WIZARD_STEPS: readonly string[] = [
  'cable', 'switchgear', 'bays', 'apparatus', 'ct', 'vt', 'meters',
  'trafo', 'earthing', 'nn', 'protection', 'readiness',
];

export function checkMandatoryStepsCompleted(
  completions: readonly WizardStepCompletion[],
): { readonly complete: boolean; readonly missing: ReadonlyArray<string> } {
  const completed = new Set(completions.filter((c) => c.completed).map((c) => c.stepId));
  const missing = MANDATORY_WIZARD_STEPS.filter((s) => !completed.has(s));
  return { complete: missing.length === 0, missing };
}
