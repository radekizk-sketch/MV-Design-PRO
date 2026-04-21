/**
 * FIX-12B — Protection Coordination Module
 *
 * Exports all protection coordination components and utilities.
 *
 * CANONICAL ALIGNMENT:
 * - 100% Polish labels
 * - READ-ONLY relative to solver results
 * - Canonical parity UX
 */

// Types and constants
export * from './types';

// API client
export * from './api';

// Components
export { ProtectionSettingsEditor } from './ProtectionSettingsEditor';
export { ProtectionCoordinationPage } from './ProtectionCoordinationPage';
export { TccChart, TccChartFromResult } from './TccChart';
export { TracePanel } from './TracePanel';
export {
  VerdictBadge,
  SensitivityTable,
  SelectivityTable,
  OverloadTable,
  SummaryCard,
} from './ResultsTables';
