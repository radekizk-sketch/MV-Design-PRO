/**
 * SLD Symbols Module — Unified symbol rendering for editor and viewer
 *
 * PR-SLD-04: Unifikacja symboli w edytorze do standardu CANONICAL
 *
 * This module provides:
 * - UnifiedSymbolRenderer: Main component for rendering symbols
 * - renderSymbol: Function-based API for symbol rendering
 * - SYMBOL_SIZES: Size configuration for each element type
 * - Helper types for visual state and interaction handlers
 */

export {
  UnifiedSymbolRenderer,
  renderSymbol,
  SYMBOL_SIZES,
  type SymbolVisualState,
  type SymbolInteractionHandlers,
  type UnifiedSymbolRendererProps,
} from './UnifiedSymbolRenderer';
