/**
 * Inspector Module (READ-ONLY Property Grid)
 *
 * Eksportuje komponenty inspektora do przeglądania właściwości elementów
 * w trybie read-only, zgodnie z Canonical UI parity.
 *
 * 100% POLISH UI
 */

// Components
export { InspectorPanel, InspectorPanelConnected } from './InspectorPanel';
export { ReadOnlyPropertyGrid } from './ReadOnlyPropertyGrid';
export { ProtectionSection } from './ProtectionSection';
export { DiagnosticsSection } from './DiagnosticsSection';

// Protection formatting (PF/CANONICAL parity)
export {
  formatProtectionFunction,
  formatAnsiCodes,
  getShortcutForAnsi,
  formatNumberPl,
  formatTimeDelay,
  formatComputedDisplay,
  ANSI_TO_SHORTCUT,
  type FormattedProtectionFunction,
} from './formatProtection';

// Types
export type {
  InspectorSection,
  InspectorField,
  InspectorElementData,
  BusResultData,
  BranchResultData,
  ShortCircuitResultData,
} from './types';

// Constants
export { INSPECTOR_SECTION_LABELS, FLAG_LABELS } from './types';
