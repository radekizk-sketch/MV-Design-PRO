/**
 * SLD Overlay Runtime Module — PR-16
 *
 * Public API for the SLD Overlay Runtime Engine.
 *
 * EXPORTS:
 * - Types: OverlayPayloadV1, OverlayElement, etc.
 * - Store: useOverlayStore
 * - Adapters: ShortCircuitFlow, RawToTyped
 *
 * Karta AB-1a Pakiet L (2026-09-23): silnik stylow (`OverlayEngine`), hak
 * `useOverlayRuntime`, legenda `OverlayLegend` oraz adaptery LoadFlow/ZeroSequence/
 * Oltc skasowane (LEGACY_USUNAC E23 — domyslne 'OK' przy zbieznosci, brak
 * konsumenta produkcyjnego); `VISUAL_STATE_STYLE` i `ProtectionCoverageOverlayBadges`
 * (E22) razem z nimi.
 */

// Types
export type {
  OverlayVisualState,
  OverlayElement,
  OverlayLegendEntry,
  OverlayPayloadV1,
  OverlayAnalysisType,
  PowerFlowOverlayBadges,
  ShortCircuitOverlayBadges,
  VariantDeltaOverlayBadges,
} from './overlayTypes';

export { OVERLAY_ANALYSIS_LABELS } from './overlayTypes';

// Store
export { useOverlayStore, ALL_OVERLAY_KINDS } from './overlayStore';
export type { OverlayKind } from './overlayStore';

// Adapters
export {
  adaptShortCircuitFlowToOverlay,
  faultFlowColorTokenForWeight,
  faultTypeToOverlayAnalysisType,
  relativeFlowWeight,
} from './ShortCircuitFlowOverlayAdapter';
export type {
  FaultFlowColorToken,
  ShortCircuitBranchFlowV1,
  ShortCircuitFlowOverlayInput,
} from './ShortCircuitFlowOverlayAdapter';
export { adaptRawOverlayToTyped } from './RawToTypedOverlayAdapter';
