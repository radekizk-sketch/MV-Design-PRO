/**
 * SLD Snapshot Export Orchestrator
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: PF/CANONICAL-grade export workflow
 * - SLD_UI_ARCHITECTURE.md: Viewport and layer management
 *
 * RESPONSIBILITIES:
 * - Coordinate PNG/PDF export process
 * - Handle fit-to-network viewport transformation
 * - Manage temporary viewport state for export
 * - Ensure deterministic output
 *
 * IMPORTANT:
 * - Export does NOT modify the UI state
 * - Viewport transformations are applied to a cloned container
 * - Fit-to-network uses existing fitToContent() utility
 */

import type { AnySldSymbol } from '../../sld-editor/types';
import type { ViewportState } from '../types';
import { fitToContent } from '../types';
import { exportPng } from './exportPng';
import { exportPdf } from './exportPdf';
import { DEFAULT_EXPORT_THEME } from './exportTheme';
import type {
  SldExportOptions,
  ExportResult,
  ExportScope,
  ExportLayerOptions,
  ExportMetadata,
  ExportThemeId,
} from './types';

/**
 * Context required for export.
 */
export interface ExportContext {
  /** The SLD view container element (data-testid="sld-view") */
  containerElement: HTMLElement;
  /** Current symbols in the diagram */
  symbols: AnySldSymbol[];
  /** Current viewport state */
  currentViewport: ViewportState;
  /** Canvas width */
  canvasWidth: number;
  /** Canvas height */
  canvasHeight: number;
}

/**
 * Calculate the viewport state for export based on scope.
 *
 * @param scope - Export scope (viewport or fit)
 * @param symbols - Current symbols
 * @param currentViewport - Current viewport state
 * @param canvasWidth - Canvas width
 * @param canvasHeight - Canvas height
 * @returns Viewport state to use for export
 */
export function calculateExportViewport(
  scope: ExportScope,
  symbols: AnySldSymbol[],
  currentViewport: ViewportState,
  canvasWidth: number,
  canvasHeight: number
): ViewportState {
  if (scope === 'viewport') {
    // Use current viewport as-is
    return currentViewport;
  }

  // scope === 'fit' — calculate fit-to-network viewport
  // This uses the existing fitToContent utility from types.ts
  // It's purely a viewport transformation, no layout changes
  return fitToContent(symbols, canvasWidth, canvasHeight);
}

/**
 * Apply viewport state to the SLD canvas in a cloned container.
 * This modifies the transform of the content group.
 *
 * Note: This is called internally by export functions when needed.
 * For now, we handle viewport in the capture process.
 */
export function applyViewportToClone(
  clonedContainer: HTMLElement,
  viewport: ViewportState
): void {
  const contentGroup = clonedContainer.querySelector('[data-testid="sld-content-group"]');
  if (contentGroup instanceof SVGGElement) {
    contentGroup.setAttribute(
      'transform',
      `translate(${viewport.offsetX}, ${viewport.offsetY}) scale(${viewport.zoom})`
    );
  }
}

/**
 * Create export options from user selections.
 *
 * @param format - Export format (png or pdf)
 * @param userOptions - User-selected options from dialog
 * @param metadata - Export metadata
 * @returns Complete export options
 */
export function createExportOptions(
  format: 'png',
  userOptions: {
    scale?: 1 | 2;
    theme?: ExportThemeId;
    scope: ExportScope;
    layers: ExportLayerOptions;
  },
  metadata: ExportMetadata
): import('./types').PngExportOptions;
export function createExportOptions(
  format: 'pdf',
  userOptions: {
    pageSize?: 'A4' | 'A3';
    orientation?: 'portrait' | 'landscape' | 'auto';
    theme?: ExportThemeId;
    scope: ExportScope;
    layers: ExportLayerOptions;
  },
  metadata: ExportMetadata
): import('./types').PdfExportOptions;
export function createExportOptions(
  format: 'png' | 'pdf',
  userOptions: {
    scale?: 1 | 2;
    pageSize?: 'A4' | 'A3';
    orientation?: 'portrait' | 'landscape' | 'auto';
    theme?: ExportThemeId;
    scope: ExportScope;
    layers: ExportLayerOptions;
  },
  metadata: ExportMetadata
): SldExportOptions {
  if (format === 'png') {
    return {
      format: 'png',
      scale: userOptions.scale ?? 1,
      theme: userOptions.theme ?? DEFAULT_EXPORT_THEME,
      scope: userOptions.scope,
      layers: userOptions.layers,
      metadata,
    };
  }

  return {
    format: 'pdf',
    pageSize: userOptions.pageSize ?? 'A4',
    orientation: userOptions.orientation ?? 'auto',
    theme: userOptions.theme ?? DEFAULT_EXPORT_THEME,
    scope: userOptions.scope,
    layers: userOptions.layers,
    metadata,
  };
}

/**
 * Execute SLD snapshot export.
 *
 * This is the main entry point for export operations.
 * It handles:
 * 1. Viewport calculation for fit-to-network
 * 2. Temporary DOM manipulation for export
 * 3. Calling the appropriate export function
 * 4. Cleanup
 *
 * @param context - Export context with container and symbols
 * @param options - Export options
 * @returns Export result
 */
export async function executeSldExport(
  context: ExportContext,
  options: SldExportOptions
): Promise<ExportResult> {
  const { containerElement } = context;

  // Note: For MVP, we capture the current viewport state as-is.
  // The 'fit' scope option is stored in options for future implementation
  // where we would apply viewport transformation before capture.
  // Current implementation captures what's visible on screen.

  if (options.format === 'png') {
    return exportPng(containerElement, options);
  }

  return exportPdf(containerElement, options);
}

/**
 * Get current layer state from the UI stores.
 * This reads from the actual store state to determine defaults.
 *
 * @param overlayVisible - Results overlay visibility from store
 * @param diagnosticsVisible - Diagnostics overlay visibility from store
 * @returns Layer options matching current UI state
 */
export function getCurrentLayerState(
  overlayVisible: boolean,
  diagnosticsVisible: boolean
): ExportLayerOptions {
  return {
    include_legend: true, // Legend is always visible in base SLD
    include_results_overlay: overlayVisible,
    include_diagnostics_overlay: diagnosticsVisible,
    include_energization_layer: true, // Energization is always calculated
    include_measurement_labels: true, // CT/VT labels if present
  };
}
