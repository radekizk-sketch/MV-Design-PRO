/**
 * SLD Snapshot Export Module
 *
 * Public API for SLD snapshot export functionality.
 */

// Types
export type {
  ExportFormat,
  PngScale,
  PdfPageSize,
  PdfOrientation,
  ExportScope,
  ExportThemeId,
  ExportLayerOptions,
  ExportMetadata,
  PngExportOptions,
  PdfExportOptions,
  SldExportOptions,
  ExportResult,
} from './types';

export {
  DEFAULT_LAYER_OPTIONS,
  SCOPE_LABELS_PL,
  LAYER_LABELS_PL,
  PNG_SCALE_LABELS_PL,
  PDF_PAGE_SIZE_LABELS_PL,
  PDF_ORIENTATION_LABELS_PL,
  generateExportFilename,
} from './types';

export {
  DEFAULT_EXPORT_THEME,
  applyExportTheme,
  resolveExportTheme,
} from './exportTheme';

// Export utilities
export { exportPng } from './exportPng';
export { exportPdf } from './exportPdf';

// Orchestration
export type { ExportContext } from './SldSnapshotExport';
export {
  calculateExportViewport,
  applyViewportToClone,
  createExportOptions,
  executeSldExport,
  getCurrentLayerState,
} from './SldSnapshotExport';

// UI Components
export { SldSnapshotExportDialog } from './SldSnapshotExportDialog';
export type { SldSnapshotExportDialogProps } from './SldSnapshotExportDialog';

// Presets
export type { ExportPresetId, ExportPreset } from './presets';
export {
  EXPORT_PRESETS,
  CUSTOM_PRESET,
  PRESET_OPTIONS,
  PRESET_LABELS_PL,
  EXPORT_PRESET_URL_PARAM,
  EXPORT_PRESET_STORAGE_KEY,
  readPresetFromUrl,
  readPresetFromStorage,
  readPersistedPreset,
  persistPreset,
  detectPresetFromLayers,
  getPresetLayers,
} from './presets';
