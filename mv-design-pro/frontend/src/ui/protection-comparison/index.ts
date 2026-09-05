/**
 * P15b — Protection Comparison Module
 *
 * `ProtectionComparisonPage` (UI) SKASOWANA (karta CV-3.3-B2, D3): martwa
 * strona bez montujących — realna ścieżka użytkownika to ekran ui2
 * (`ui2/wyniki/porownanie`, tryb „Zabezpieczenia"), reużywający klienta i
 * typy z tego modułu. Ten plik zostaje jako KLIENT ui2:
 * - API functions: createProtectionComparison, getProtectionComparisonTrace,
 *   getProtectionComparisonResults, fetchProtectionRuns
 * - Types: All TypeScript interfaces
 */

export {
  createProtectionComparison,
  getProtectionComparisonResults,
  getProtectionComparisonTrace,
  fetchProtectionRuns,
} from './api';
export type {
  ProtectionStateChange,
  IssueCode,
  IssueSeverity,
  ProtectionComparisonRow,
  RankingIssue,
  ProtectionComparisonSummary,
  ProtectionComparisonResult,
  ProtectionComparisonTraceStep,
  ProtectionComparisonTrace,
  ProtectionRunItem,
} from './types';
export { STATE_CHANGE_LABELS, ISSUE_CODE_LABELS } from './types';
