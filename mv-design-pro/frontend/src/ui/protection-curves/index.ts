/**
 * FIX-06 — Protection Curves Editor Module
 *
 * CANONICAL ALIGNMENT:
 * - SYSTEM_SPEC.md: Analysis layer visualization
 * - PROTECTION_CURVES_IT_SUPERIOR_CONTRACT.md: UI contract
 * - 100% Polish UI labels
 *
 * This module provides time-current (I-t) curve visualization
 * and editing for overcurrent protection coordination.
 */

// Chart component. Curve points are computed authoritatively by the backend
// (protection/curves modules); the frontend only renders them — single truth (Z15).
export { TimeCurrentChart } from './TimeCurrentChart';

// Types
export type {
  CurveStandard,
  IECCurveType,
  IEEECurveType,
  CurveType,
  CurvePoint,
  FaultMarker,
  ProtectionCurve,
  CoordinationStatus,
  CoordinationResult,
  TimeCurrentChartConfig,
  ProtectionCurvesEditorState,
  CurveAnalysisResponse,
  FaultAnalysisResult,
} from './types';

// Constants
export {
  DEFAULT_CHART_CONFIG,
  PROTECTION_CURVES_LABELS,
  COORDINATION_STATUS_COLORS,
  CURVE_COLORS,
  IEC_CURVE_OPTIONS,
  IEEE_CURVE_OPTIONS,
} from './types';
