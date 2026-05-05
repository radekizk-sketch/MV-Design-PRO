/**
 * SLD Overlay Runtime Hook — PR-16
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § B: Results as Overlay (never modifies model)
 * - SYSTEM_SPEC.md: Overlay = pure projection of ResultSet
 *
 * PURPOSE:
 * Connects overlay store + overlay engine for use in SLD components.
 * Provides memoized style map that updates ONLY when overlay data changes.
 *
 * INVARIANTS:
 * - NO physics calculations
 * - NO model mutations
 * - Stable references (memo prevents unnecessary re-renders)
 * - Resets automatically when run_id changes
 */

import { useMemo } from 'react';
import type { ResolvedOverlayStyle, OverlayPayloadV1 } from './overlayTypes';
import { useOverlayStore } from './overlayStore';
import { applyOverlayToSymbols, getElementOverlayStyle } from './OverlayEngine';

/**
 * Return type for useOverlayRuntime hook.
 */
export interface OverlayRuntimeResult {
  /** Whether overlay is active and visible */
  isActive: boolean;

  /** Currently active run ID (null if no overlay) */
  activeRunId: string | null;

  /** Full overlay payload (null if not loaded) */
  overlay: OverlayPayloadV1 | null;

  /** Pre-computed style map (elementId → ResolvedOverlayStyle) */
  styleMap: Map<string, ResolvedOverlayStyle>;

  /** Get style for a specific element (convenience wrapper) */
  getStyle: (elementId: string) => ResolvedOverlayStyle | undefined;

  /** Load overlay payload */
  loadOverlay: (payload: OverlayPayloadV1) => void;

  /** Clear overlay */
  clearOverlay: () => void;

  /** Toggle overlay visibility */
  toggleOverlay: (forced?: boolean) => void;
}

/**
 * Empty style map (stable reference for when overlay is inactive).
 */
const EMPTY_STYLE_MAP = new Map<string, ResolvedOverlayStyle>();

/**
 * Hook: SLD Overlay Runtime.
 *
 * Provides memoized overlay styles for SLD symbols.
 * Only re-computes when overlay payload or symbols change.
 *
 * @param symbols - Current SLD symbols (for element matching)
 * @returns Overlay runtime state and actions
 */
export function useOverlayRuntime(
  symbols: readonly unknown[]
): OverlayRuntimeResult {
  const activeRunId = useOverlayStore((state) => state.activeRunId);
  const overlay = useOverlayStore((state) => state.overlay);
  const enabled = useOverlayStore((state) => state.enabled);
  const loadOverlay = useOverlayStore((state) => state.loadOverlay);
  const clearOverlay = useOverlayStore((state) => state.clearOverlay);
  const toggleOverlay = useOverlayStore((state) => state.toggleOverlay);

  const isActive = enabled && overlay !== null;

  // Memoize style map — only recompute when overlay or symbols change
  const styleMap = useMemo(() => {
    if (!overlay || !enabled) return EMPTY_STYLE_MAP;
    return applyOverlayToSymbols(symbols, overlay);
  }, [overlay, symbols, enabled]);

  // Memoize getStyle callback — stable reference when styleMap is stable
  const getStyle = useMemo(
    () => (elementId: string) => getElementOverlayStyle(styleMap, elementId),
    [styleMap]
  );

  return {
    isActive,
    activeRunId,
    overlay,
    styleMap,
    getStyle,
    loadOverlay,
    clearOverlay,
    toggleOverlay,
  };
}
