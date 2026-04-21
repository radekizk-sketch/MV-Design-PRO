/**
 * SLD Read-Only Viewer Module
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md: SLD ↔ selection synchronization
 * - ui_canonical_parity.md: Canonical-like presentation
 *
 * Exports read-only SLD viewer components.
 * For editing, use sld-editor module instead.
 */

// Main components
export { SLDView } from './SLDView';
export { SLDViewCanvas } from './SLDViewCanvas';
export { SLDViewPage } from './SLDViewPage';
export { SldEditorPage } from './SldEditorPage';
export type { SldEditorPageProps } from './SldEditorPage';

// Overlay components
export { ResultsOverlay } from './ResultsOverlay';
export type { ResultsOverlayProps } from './ResultsOverlay';
export { DiagnosticsOverlay } from './DiagnosticsOverlay';
export type { DiagnosticsOverlayProps } from './DiagnosticsOverlay';
export { DiagnosticsLegend } from './DiagnosticsLegend';
export type { DiagnosticsLegendProps } from './DiagnosticsLegend';

// Diagnostics store
export {
  useDiagnosticsStore,
  useDiagnosticsVisible,
  useDiagnosticsFilter,
} from './diagnosticsStore';

// PR-SLD-06: SLD Mode store
export {
  useSldModeStore,
  useSldMode,
  useIsResultsMode,
  useIsEditMode,
  useDiagnosticLayerVisible,
  useSldModeLabel,
  SLD_MODE_LABELS_PL,
} from './sldModeStore';
export type { SldMode } from './sldModeStore';

// PR-SLD-06: Diagnostic Results Layer
export { DiagnosticResultsLayer } from './DiagnosticResultsLayer';
export type {
  DiagnosticResultsLayerProps,
  BusDiagnosticData,
  BranchDiagnosticData,
} from './DiagnosticResultsLayer';

// Types
export type { SLDViewProps, SLDViewCanvasProps, ViewportState } from './types';
export type { SLDViewPageProps } from './SLDViewPage';

// Utilities
export {
  DEFAULT_VIEWPORT,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEP,
  fitToContent,
  calculateSymbolsBounds,
} from './types';
export { enmSnapshotToSldSymbols, projectEnmSnapshotToSld } from './enmSnapshotToSldSymbols';

// Overlay utilities
export {
  mapPositionToScreen,
  buildOverlayPositionMaps,
  formatVoltageKv,
  formatVoltagePu,
  formatCurrentA,
  formatCurrentKa,
  formatPowerMw,
  formatPowerMvar,
  formatLoadingPct,
  getLoadingColorClass,
  getLoadingBgClass,
} from './overlayUtils';

// Legend components
export { LegendPanel } from './LegendPanel';
export type { LegendPanelProps } from './LegendPanel';

// Empty state overlay (Canonical/CANONICAL style)
export { SldEmptyOverlay } from './SldEmptyOverlay';
export type { SldEmptyOverlayProps, SldEmptyState } from './SldEmptyOverlay';

// Diagnostics panel (CANONICAL-grade topology diagnostics)
export { SldDiagnosticsPanel } from './SldDiagnosticsPanel';
export type { SldDiagnosticsPanelProps } from './SldDiagnosticsPanel';

// Scale utilities
export {
  calculateOverlayRanges,
  formatRange,
  formatVoltagePuRange,
  formatVoltageKvRange,
  formatCurrentRange,
  formatLoadingRange,
  formatPowerMwRange,
  formatPowerMvarRange,
  formatIkssRange,
} from './scale';
export type { ValueRange, OverlayRanges } from './scale';

// Voltage colors (PLANS STYLE) — legacy, prefer sldCanonicalStyle
export {
  VOLTAGE_COLORS,
  DEFAULT_VOLTAGE_COLOR,
  DEENERGIZED_COLOR,
  SELECTED_COLOR,
  getVoltageColor,
  getVoltageColorWithState,
  getVoltageLevel,
  getVoltageLevelLabel,
} from './voltageColors';

// PR-SLD-CANONICAL-STYLE-02: CANONICAL Visual Style System (canonical)
export {
  CANONICAL_STROKE,
  CANONICAL_STROKE_SELECTED,
  CANONICAL_VOLTAGE_COLORS,
  CANONICAL_VOLTAGE_MAP,
  CANONICAL_STATE_COLORS,
  CANONICAL_FILL_COLORS,
  CANONICAL_TYPOGRAPHY,
  CANONICAL_LABEL_ANCHORS,
  CANONICAL_LINE_LABEL,
  CANONICAL_CALLOUT,
  CANONICAL_CALLOUT_ANCHORS,
  CANONICAL_SYMBOL_SIZES,
  CANONICAL_CANVAS,
  CANONICAL_GRID,
  getCanonicalVoltageColor,
  getCanonicalStrokeColor,
  getCanonicalFillColor,
  getCanonicalOpacity,
  getCanonicalLabelAnchor,
  getCanonicalSymbolSize,
  getCanonicalStrokeWidth,
} from './sldCanonicalStyle';
export type { CanonicalLabelAnchor } from './sldCanonicalStyle';

// PR-SLD-CANONICAL-STYLE-02: CANONICAL Callout Components
export { CanonicalCallout, CanonicalCalloutLayer } from './CanonicalCallout';
export type {
  CalloutResultData,
  CalloutPosition,
  CanonicalCalloutProps,
  CanonicalCalloutLayerProps,
} from './CanonicalCallout';

// UX 10/10: Operational mode store (NORMALNY/AWARYJNY/ZWARCIE)
export {
  useOperationalModeStore,
  useOperationalMode,
  useIsFaultMode,
  useIsEmergencyMode,
} from './operationalModeStore';
export type {
  OperationalMode,
  FaultType,
  ScOverlayField,
} from './operationalModeStore';

// UX 10/10: Operational mode toolbar
export { OperationalModeToolbar } from './OperationalModeToolbar';

// UX 10/10: SLD Mode Interaction Handler
export {
  resolveClickAction,
  executeClickAction,
  isElementOutOfService,
  getElementModeOverlay,
} from './SldModeInteractionHandler';
export type {
  SldClickContext,
  SldClickResult,
  EmergencyToggleResult,
  ModeOverlayStyle,
} from './SldModeInteractionHandler';

// UX 10/10: SLD Results Access panel
export { SldResultsAccess } from './SldResultsAccess';
export type { SldResultsAccessProps } from './SldResultsAccess';

// UX 10/10: Label layer utilities
export {
  buildLabelsForSymbol,
  buildMinimalLabels,
  buildTechnicalLabels,
  buildAnalyticalLabels,
} from './sldLabelLayer';
export type {
  LabelMode,
  LabelLine,
  ElementLabel,
  BranchResultData,
  BusResultData,
  ProtectionSettingData,
} from './sldLabelLayer';

// UX 10/10: Label mode store
export {
  useLabelModeStore,
  useLabelMode,
} from './labelModeStore';

// UX 10/10: Label mode toolbar
export { LabelModeToolbar } from './LabelModeToolbar';
