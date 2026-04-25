/**
 * SLD PNG Export Utility
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: PF/CANONICAL-grade PNG export
 * - SLD_UI_ARCHITECTURE.md: Layer visibility for export
 *
 * FEATURES:
 * - 1× and 2× resolution
 * - Viewport or fit-to-network scope
 * - Layer visibility control (without modifying UI state)
 * - Deterministic output
 *
 * IMPLEMENTATION:
 * - Uses html2canvas for capture
 * - Creates off-screen clone for layer manipulation
 * - Downloads via blob URL
 */

import html2canvas from 'html2canvas';
import type { PngExportOptions, ExportResult, ExportLayerOptions } from './types';
import { generateExportFilename } from './types';
import { applyExportTheme, resolveExportTheme } from './exportTheme';

/**
 * Test IDs for layer elements.
 * These map to data-testid attributes in the SLD view.
 */
const LAYER_TEST_IDS: Record<keyof ExportLayerOptions, string[]> = {
  include_legend: ['sld-switching-legend', 'sld-legend-panel'],
  include_results_overlay: ['sld-results-overlay'],
  include_diagnostics_overlay: ['sld-diagnostics-overlay', 'sld-diagnostics-legend'],
  include_energization_layer: [], // Energization is baked into symbol rendering, handled differently
  include_measurement_labels: ['sld-measurement-labels'],
};

/**
 * Apply layer visibility to a cloned container.
 * This modifies the clone, NOT the original DOM.
 */
function applyLayerVisibility(
  container: HTMLElement,
  layers: ExportLayerOptions
): void {
  // Hide layers that should not be included
  for (const [layerKey, testIds] of Object.entries(LAYER_TEST_IDS)) {
    const shouldInclude = layers[layerKey as keyof ExportLayerOptions];

    for (const testId of testIds) {
      const element = container.querySelector(`[data-testid="${testId}"]`);
      if (element instanceof HTMLElement) {
        element.style.display = shouldInclude ? '' : 'none';
      }
    }
  }

  // Handle energization layer specially - it affects symbol opacity
  // When include_energization_layer is false, we need to make all symbols fully opaque
  if (!layers.include_energization_layer) {
    const deEnergizedElements = container.querySelectorAll('[data-energized="false"]');
    deEnergizedElements.forEach((el) => {
      if (el instanceof HTMLElement || el instanceof SVGElement) {
        el.style.opacity = '1';
      }
    });
  }
}

/**
 * Create a deep clone of the SLD container for export.
 * The clone is positioned off-screen for rendering.
 */
function createExportClone(
  originalContainer: HTMLElement,
  width: number,
  height: number,
  theme: PngExportOptions['theme']
): HTMLElement {
  const clone = originalContainer.cloneNode(true) as HTMLElement;

  // Position off-screen but visible for html2canvas
  clone.style.position = 'absolute';
  clone.style.left = '-9999px';
  clone.style.top = '0';
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.overflow = 'hidden';
  clone.style.backgroundColor = '#ffffff';

  // Remove toolbar and status bar from export (they have specific test IDs)
  const toolbar = clone.querySelector('[data-testid="sld-view-toolbar"]');
  const statusBar = clone.querySelector('[data-testid="sld-view-status"]');
  toolbar?.remove();
  statusBar?.remove();

  applyExportTheme(clone, resolveExportTheme(theme));

  return clone;
}

/**
 * Download canvas as PNG file.
 */
function downloadPng(canvas: HTMLCanvasElement, filename: string): void {
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export SLD view as PNG.
 *
 * @param containerElement - The SLD view container element (data-testid="sld-view")
 * @param options - PNG export options
 * @returns Export result with success status and filename
 */
export async function exportPng(
  containerElement: HTMLElement,
  options: PngExportOptions
): Promise<ExportResult> {
  try {
    // Get canvas dimensions from the actual canvas element
    const canvasElement = containerElement.querySelector('[data-testid="sld-view-canvas"]');
    if (!canvasElement) {
      return {
        success: false,
        error: 'Nie znaleziono elementu canvas SLD',
      };
    }

    // Determine export dimensions
    const canvasRect = canvasElement.getBoundingClientRect();
    const exportWidth = canvasRect.width;
    const exportHeight = canvasRect.height;

    // For 'fit' scope, we would need to recalculate viewport
    // But this is handled by the orchestrator passing the correct viewport state
    // Here we just capture what's rendered

    // Create clone for export manipulation
    const clone = createExportClone(
      containerElement,
      exportWidth,
      exportHeight,
      options.theme
    );
    document.body.appendChild(clone);

    try {
      // Apply layer visibility to clone
      applyLayerVisibility(clone, options.layers);

      // Configure html2canvas options for determinism
      const html2canvasOptions: Parameters<typeof html2canvas>[1] = {
        scale: options.scale,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        // Determinism: disable animations and use consistent rendering
        logging: false,
        // Use the clone's dimensions
        width: exportWidth,
        height: exportHeight,
        // Prevent any offset randomization
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
      };

      // Find the canvas container within the clone (the flex-1 overflow-hidden div)
      const canvasContainer = clone.querySelector('.flex-1.overflow-hidden');
      if (!canvasContainer) {
        return {
          success: false,
          error: 'Nie znaleziono kontenera canvas w klonie',
        };
      }

      // Capture to canvas
      const canvas = await html2canvas(canvasContainer as HTMLElement, html2canvasOptions);

      // Generate filename and download
      const filename = generateExportFilename(options.metadata, 'png');
      downloadPng(canvas, filename);

      return {
        success: true,
        filename,
      };
    } finally {
      // Always clean up the clone
      document.body.removeChild(clone);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Nieznany błąd eksportu PNG';
    return {
      success: false,
      error: errorMessage,
    };
  }
}
