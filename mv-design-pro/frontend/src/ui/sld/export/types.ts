/**
 * SLD Snapshot Export Types
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: PF/CANONICAL-grade export options
 * - SLD_UI_ARCHITECTURE.md: Layer visibility controls
 *
 * FEATURES:
 * - PNG export (1×, 2×)
 * - PDF export (A4, A3, auto orientation)
 * - Scope: viewport vs fit-to-network
 * - Layer toggles: legend, results, diagnostics, energization, CT/VT labels
 *
 * 100% POLISH UI
 */

/**
 * Export format type.
 */
export type ExportFormat = 'png' | 'pdf';

/**
 * PNG resolution scale.
 */
export type PngScale = 1 | 2;

/**
 * PDF page size.
 */
export type PdfPageSize = 'A4' | 'A3';

/**
 * PDF orientation (auto = determined by content aspect ratio).
 */
export type PdfOrientation = 'portrait' | 'landscape' | 'auto';

/**
 * Export scope — what area to capture.
 */
export type ExportScope = 'viewport' | 'fit';

/**
 * Layer visibility options for export.
 * Matches SLD UI layer structure.
 */
export interface ExportLayerOptions {
  /** Include switching state legend (base layer) */
  include_legend: boolean;
  /** Include results overlay (voltage, current, loading) */
  include_results_overlay: boolean;
  /** Include diagnostics overlay (error/warning markers) */
  include_diagnostics_overlay: boolean;
  /** Include energization layer (grayed out de-energized elements) */
  include_energization_layer: boolean;
  /** Include measurement labels (CT/VT) */
  include_measurement_labels: boolean;
}

/**
 * Export metadata for header/footer.
 */
export interface ExportMetadata {
  /** Project name */
  projectName: string;
  /** Case name */
  caseName: string;
  /** Run ID (if results are shown) */
  runId?: string;
  /** Current zoom level (for reference) */
  zoomPercent: number;
  /** Export timestamp (ISO string) */
  timestamp: string;
}

/**
 * PNG export options.
 */
export interface PngExportOptions {
  format: 'png';
  /** Resolution scale: 1× or 2× */
  scale: PngScale;
  /** Export scope: viewport or fit-to-network */
  scope: ExportScope;
  /** Layer visibility options */
  layers: ExportLayerOptions;
  /** Metadata for filename */
  metadata: ExportMetadata;
}

/**
 * PDF export options.
 */
export interface PdfExportOptions {
  format: 'pdf';
  /** Page size: A4 or A3 */
  pageSize: PdfPageSize;
  /** Orientation: portrait, landscape, or auto */
  orientation: PdfOrientation;
  /** Export scope: viewport or fit-to-network */
  scope: ExportScope;
  /** Layer visibility options */
  layers: ExportLayerOptions;
  /** Metadata for header/footer */
  metadata: ExportMetadata;
}

/**
 * Union type for all export options.
 */
export type SldExportOptions = PngExportOptions | PdfExportOptions;

/**
 * Export result — returned by export functions.
 */
export interface ExportResult {
  /** Whether export succeeded */
  success: boolean;
  /** Generated filename */
  filename?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Default layer options — matches current UI state.
 * Export does NOT modify the UI state, only reads from it.
 */
export const DEFAULT_LAYER_OPTIONS: ExportLayerOptions = {
  include_legend: true,
  include_results_overlay: true,
  include_diagnostics_overlay: true,
  include_energization_layer: true,
  include_measurement_labels: true,
};

/**
 * Polish labels for export scope options.
 */
export const SCOPE_LABELS_PL: Record<ExportScope, string> = {
  viewport: 'Widoczny obszar',
  fit: 'Cała sieć',
};

/**
 * Polish labels for layer options.
 */
export const LAYER_LABELS_PL: Record<keyof ExportLayerOptions, string> = {
  include_legend: 'Legenda',
  include_results_overlay: 'Nakładka wyników',
  include_diagnostics_overlay: 'Nakładka diagnostyki',
  include_energization_layer: 'Warstwa energizacji',
  include_measurement_labels: 'Etykiety CT/VT',
};

/**
 * Polish labels for PNG scale options.
 */
export const PNG_SCALE_LABELS_PL: Record<PngScale, string> = {
  1: '1× (standardowa)',
  2: '2× (wysoka rozdzielczość)',
};

/**
 * Polish labels for PDF page size options.
 */
export const PDF_PAGE_SIZE_LABELS_PL: Record<PdfPageSize, string> = {
  A4: 'A4',
  A3: 'A3',
};

/**
 * Polish labels for PDF orientation options.
 */
export const PDF_ORIENTATION_LABELS_PL: Record<PdfOrientation, string> = {
  portrait: 'Pionowa',
  landscape: 'Pozioma',
  auto: 'Automatyczna',
};

/**
 * Generate export filename based on metadata and format.
 * Pattern: sld_{projectName}_{caseName}_{timestamp}.{format}
 */
export function generateExportFilename(
  metadata: ExportMetadata,
  format: ExportFormat
): string {
  const sanitize = (str: string): string =>
    str.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 32);

  const project = sanitize(metadata.projectName || 'projekt');
  const caseStr = sanitize(metadata.caseName || 'wariant');
  const timestamp = metadata.timestamp
    .replace(/[:.]/g, '-')
    .substring(0, 19);

  return `sld_${project}_${caseStr}_${timestamp}.${format}`;
}
