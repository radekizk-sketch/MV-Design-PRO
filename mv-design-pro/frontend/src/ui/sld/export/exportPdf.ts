/**
 * SLD PDF Export Utility
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: PF/CANONICAL-grade PDF export
 * - SLD_UI_ARCHITECTURE.md: Layer visibility for export
 *
 * FEATURES:
 * - A4 and A3 page sizes
 * - Auto orientation based on content aspect ratio
 * - Metadata header with project/case/scale/date
 * - Polish footer
 * - Timestamp only in PDF metadata (not in image)
 *
 * IMPLEMENTATION:
 * - Uses html2canvas for capture
 * - Uses jsPDF for PDF generation
 * - Single page output
 */

import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { PdfExportOptions, ExportResult, ExportLayerOptions, PdfOrientation } from './types';
import { generateExportFilename } from './types';

/**
 * Page dimensions in mm (jsPDF uses mm by default).
 */
const PAGE_DIMENSIONS = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
} as const;

/**
 * Margins in mm.
 */
const MARGINS = {
  top: 20,
  bottom: 15,
  left: 15,
  right: 15,
} as const;

/**
 * Header height in mm.
 */
const HEADER_HEIGHT = 15;

/**
 * Footer height in mm.
 */
const FOOTER_HEIGHT = 10;

/**
 * Test IDs for layer elements.
 */
const LAYER_TEST_IDS: Record<keyof ExportLayerOptions, string[]> = {
  include_legend: ['sld-switching-legend', 'sld-legend-panel'],
  include_results_overlay: ['sld-results-overlay'],
  include_diagnostics_overlay: ['sld-diagnostics-overlay', 'sld-diagnostics-legend'],
  include_energization_layer: [],
  include_measurement_labels: ['sld-measurement-labels'],
};

/**
 * Apply layer visibility to a cloned container.
 */
function applyLayerVisibility(
  container: HTMLElement,
  layers: ExportLayerOptions
): void {
  for (const [layerKey, testIds] of Object.entries(LAYER_TEST_IDS)) {
    const shouldInclude = layers[layerKey as keyof ExportLayerOptions];

    for (const testId of testIds) {
      const element = container.querySelector(`[data-testid="${testId}"]`);
      if (element instanceof HTMLElement) {
        element.style.display = shouldInclude ? '' : 'none';
      }
    }
  }

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
 */
function createExportClone(
  originalContainer: HTMLElement,
  width: number,
  height: number
): HTMLElement {
  const clone = originalContainer.cloneNode(true) as HTMLElement;

  clone.style.position = 'absolute';
  clone.style.left = '-9999px';
  clone.style.top = '0';
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.overflow = 'hidden';
  clone.style.backgroundColor = '#ffffff';

  const toolbar = clone.querySelector('[data-testid="sld-view-toolbar"]');
  const statusBar = clone.querySelector('[data-testid="sld-view-status"]');
  toolbar?.remove();
  statusBar?.remove();

  return clone;
}

/**
 * Determine optimal orientation based on content aspect ratio.
 */
function determineOrientation(
  contentWidth: number,
  contentHeight: number,
  requestedOrientation: PdfOrientation
): 'portrait' | 'landscape' {
  if (requestedOrientation !== 'auto') {
    return requestedOrientation;
  }

  const aspectRatio = contentWidth / contentHeight;
  // If wider than tall, use landscape
  return aspectRatio > 1 ? 'landscape' : 'portrait';
}

/**
 * Format date for Polish locale.
 */
function formatDatePl(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

/**
 * Export SLD view as PDF.
 *
 * @param containerElement - The SLD view container element (data-testid="sld-view")
 * @param options - PDF export options
 * @returns Export result with success status and filename
 */
export async function exportPdf(
  containerElement: HTMLElement,
  options: PdfExportOptions
): Promise<ExportResult> {
  try {
    // Get canvas dimensions
    const canvasElement = containerElement.querySelector('[data-testid="sld-view-canvas"]');
    if (!canvasElement) {
      return {
        success: false,
        error: 'Nie znaleziono elementu canvas SLD',
      };
    }

    const canvasRect = canvasElement.getBoundingClientRect();
    const exportWidth = canvasRect.width;
    const exportHeight = canvasRect.height;

    // Create clone for export manipulation
    const clone = createExportClone(containerElement, exportWidth, exportHeight);
    document.body.appendChild(clone);

    try {
      // Apply layer visibility to clone
      applyLayerVisibility(clone, options.layers);

      // Capture to canvas with 2× scale for quality
      const canvasContainer = clone.querySelector('.flex-1.overflow-hidden');
      if (!canvasContainer) {
        return {
          success: false,
          error: 'Nie znaleziono kontenera canvas w klonie',
        };
      }

      const canvas = await html2canvas(canvasContainer as HTMLElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: exportWidth,
        height: exportHeight,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
      });

      // Determine PDF orientation
      const orientation = determineOrientation(exportWidth, exportHeight, options.orientation);

      // Get page dimensions
      const pageDims = PAGE_DIMENSIONS[options.pageSize];
      const pageWidth = orientation === 'landscape' ? pageDims.height : pageDims.width;
      const pageHeight = orientation === 'landscape' ? pageDims.width : pageDims.height;

      // Create PDF
      const pdf = new jsPDF({
        orientation,
        unit: 'mm',
        format: options.pageSize.toLowerCase() as 'a4' | 'a3',
      });

      // Calculate available space for image
      const availableWidth = pageWidth - MARGINS.left - MARGINS.right;
      const availableHeight =
        pageHeight - MARGINS.top - MARGINS.bottom - HEADER_HEIGHT - FOOTER_HEIGHT;

      // Calculate image dimensions to fit within available space
      const imageAspectRatio = canvas.width / canvas.height;
      const availableAspectRatio = availableWidth / availableHeight;

      let imgWidth: number;
      let imgHeight: number;

      if (imageAspectRatio > availableAspectRatio) {
        // Image is wider - fit to width
        imgWidth = availableWidth;
        imgHeight = availableWidth / imageAspectRatio;
      } else {
        // Image is taller - fit to height
        imgHeight = availableHeight;
        imgWidth = availableHeight * imageAspectRatio;
      }

      // Center image horizontally
      const imgX = MARGINS.left + (availableWidth - imgWidth) / 2;
      const imgY = MARGINS.top + HEADER_HEIGHT;

      // Add header
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('MV-DESIGN PRO — Schemat jednokreskowy', MARGINS.left, MARGINS.top);

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      const headerY = MARGINS.top + 6;

      const headerInfo = [
        `Projekt: ${options.metadata.projectName}`,
        `Wariant pracy: ${options.metadata.caseName}`,
        `Skala: ${options.metadata.zoomPercent}%`,
        `Data: ${formatDatePl(options.metadata.timestamp)}`,
      ];

      if (options.metadata.runId) {
        headerInfo.splice(2, 0, `Obliczenia: ${options.metadata.runId.substring(0, 8)}`);
      }

      pdf.text(headerInfo.join('  |  '), MARGINS.left, headerY);

      // Add separator line
      pdf.setDrawColor(200, 200, 200);
      pdf.line(MARGINS.left, headerY + 3, pageWidth - MARGINS.right, headerY + 3);

      // Add image
      const imageData = canvas.toDataURL('image/png');
      pdf.addImage(imageData, 'PNG', imgX, imgY, imgWidth, imgHeight);

      // Add footer
      const footerY = pageHeight - MARGINS.bottom;
      pdf.setFontSize(8);
      pdf.setTextColor(128, 128, 128);
      pdf.text('Wygenerowano przez MV-DESIGN PRO', MARGINS.left, footerY);
      pdf.text(
        `Strona 1 z 1`,
        pageWidth - MARGINS.right,
        footerY,
        { align: 'right' }
      );

      // Set PDF metadata (timestamp is here, not in the image)
      pdf.setProperties({
        title: `SLD - ${options.metadata.projectName} - ${options.metadata.caseName}`,
        subject: 'Schemat jednokreskowy',
        author: 'MV-DESIGN PRO',
        creator: 'MV-DESIGN PRO',
      });

      // Generate filename and download
      const filename = generateExportFilename(options.metadata, 'pdf');
      pdf.save(filename);

      return {
        success: true,
        filename,
      };
    } finally {
      // Always clean up the clone
      document.body.removeChild(clone);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Nieznany błąd eksportu PDF';
    return {
      success: false,
      error: errorMessage,
    };
  }
}
