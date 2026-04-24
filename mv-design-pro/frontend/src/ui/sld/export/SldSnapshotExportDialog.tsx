/**
 * SLD Snapshot Export Dialog
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: PF/CANONICAL-grade export dialog
 * - SLD_UI_ARCHITECTURE.md: Layer visibility options
 *
 * FEATURES:
 * - Format selection: PNG (1×/2×) / PDF (A4/A3)
 * - Scope: viewport vs fit-to-network
 * - Layer checkboxes (legend, results, diagnostics, energization, CT/VT)
 * - Export preview info
 *
 * 100% POLISH UI
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import type {
  ExportFormat,
  ExportScope,
  ExportLayerOptions,
  PngScale,
  PdfPageSize,
  PdfOrientation,
  ExportMetadata,
} from './types';
import {
  SCOPE_LABELS_PL,
  LAYER_LABELS_PL,
  PNG_SCALE_LABELS_PL,
  PDF_PAGE_SIZE_LABELS_PL,
  PDF_ORIENTATION_LABELS_PL,
  DEFAULT_LAYER_OPTIONS,
} from './types';
import type { ExportPresetId } from './presets';
import {
  PRESET_OPTIONS,
  PRESET_LABELS_PL,
  readPersistedPreset,
  persistPreset,
  detectPresetFromLayers,
  getPresetLayers,
} from './presets';

/**
 * Dialog props.
 */
export interface SldSnapshotExportDialogProps {
  /** Whether dialog is open */
  isOpen: boolean;
  /** Close dialog handler */
  onClose: () => void;
  /** Export handler */
  onExport: (
    format: ExportFormat,
    options: {
      scale?: PngScale;
      pageSize?: PdfPageSize;
      orientation?: PdfOrientation;
      scope: ExportScope;
      layers: ExportLayerOptions;
    }
  ) => Promise<void>;
  /** Current layer state from UI */
  currentLayerState: ExportLayerOptions;
  /** Export metadata */
  metadata: ExportMetadata;
  /** Whether results overlay is available */
  hasResultsOverlay: boolean;
  /** Whether diagnostics overlay is available */
  hasDiagnosticsOverlay: boolean;
  /** Whether export is in progress */
  isExporting?: boolean;
}

/**
 * SLD Snapshot Export Dialog component.
 */
export const SldSnapshotExportDialog: React.FC<SldSnapshotExportDialogProps> = ({
  isOpen,
  onClose,
  onExport,
  currentLayerState,
  metadata,
  hasResultsOverlay,
  hasDiagnosticsOverlay,
  isExporting = false,
}) => {
  // State
  const [format, setFormat] = useState<ExportFormat>('png');
  const [pngScale, setPngScale] = useState<PngScale>(1);
  const [pdfPageSize, setPdfPageSize] = useState<PdfPageSize>('A4');
  const [pdfOrientation, setPdfOrientation] = useState<PdfOrientation>('auto');
  const [scope, setScope] = useState<ExportScope>('viewport');
  const [layers, setLayers] = useState<ExportLayerOptions>(() => ({
    ...DEFAULT_LAYER_OPTIONS,
    ...currentLayerState,
  }));
  const [selectedPreset, setSelectedPreset] = useState<ExportPresetId>(() =>
    readPersistedPreset()
  );

  // Layer availability
  const layerAvailability = useMemo(
    () => ({
      include_legend: true,
      include_results_overlay: hasResultsOverlay,
      include_diagnostics_overlay: hasDiagnosticsOverlay,
      include_energization_layer: true,
      include_measurement_labels: true,
    }),
    [hasResultsOverlay, hasDiagnosticsOverlay]
  );

  // Apply preset layers on preset change
  const handlePresetChange = useCallback(
    (presetId: ExportPresetId) => {
      setSelectedPreset(presetId);
      persistPreset(presetId);

      // Apply preset layers if not CUSTOM
      const presetLayers = getPresetLayers(presetId);
      if (presetLayers) {
        setLayers((prev) => ({
          ...prev,
          ...presetLayers,
        }));
      }
    },
    []
  );

  // Initialize layers from selected preset on dialog open
  useEffect(() => {
    if (isOpen && selectedPreset !== 'CUSTOM') {
      const presetLayers = getPresetLayers(selectedPreset);
      if (presetLayers) {
        setLayers((prev) => ({
          ...prev,
          ...presetLayers,
        }));
      }
    }
    // Only run when dialog opens — intentional mount-only dep array
  }, [isOpen]);

  // Update layer option — switches to CUSTOM if manual change
  const handleLayerChange = useCallback(
    (key: keyof ExportLayerOptions, value: boolean) => {
      setLayers((prev) => {
        const newLayers = { ...prev, [key]: value };
        // Detect if still matches a preset
        const detectedPreset = detectPresetFromLayers(newLayers, layerAvailability);
        if (detectedPreset !== selectedPreset) {
          setSelectedPreset(detectedPreset);
          persistPreset(detectedPreset);
        }
        return newLayers;
      });
    },
    [layerAvailability, selectedPreset]
  );

  // Handle export
  const handleExport = useCallback(async () => {
    const options = {
      scope,
      layers,
      ...(format === 'png' ? { scale: pngScale } : {}),
      ...(format === 'pdf' ? { pageSize: pdfPageSize, orientation: pdfOrientation } : {}),
    };

    await onExport(format, options);
  }, [format, pngScale, pdfPageSize, pdfOrientation, scope, layers, onExport]);

  // ESC key handler for closing dialog
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isExporting) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isExporting, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      data-testid="sld-export-dialog-backdrop"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4"
        data-testid="sld-export-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Eksportuj schemat
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            data-testid="sld-export-close-btn"
            disabled={isExporting}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-5">
          {/* View preset selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Profil widoku
            </label>
            <select
              value={selectedPreset}
              onChange={(e) => handlePresetChange(e.target.value as ExportPresetId)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="sld-export-preset"
            >
              {PRESET_OPTIONS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {PRESET_LABELS_PL[preset.id]}
                </option>
              ))}
            </select>
            {selectedPreset !== 'CUSTOM' && (
              <p className="mt-1 text-xs text-gray-500">
                {PRESET_OPTIONS.find((p) => p.id === selectedPreset)?.description}
              </p>
            )}
          </div>

          {/* Format selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Format
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setFormat('png')}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded border ${
                  format === 'png'
                    ? 'bg-blue-50 border-blue-500 text-blue-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
                data-testid="sld-export-format-png"
              >
                PNG
              </button>
              <button
                type="button"
                onClick={() => setFormat('pdf')}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded border ${
                  format === 'pdf'
                    ? 'bg-blue-50 border-blue-500 text-blue-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
                data-testid="sld-export-format-pdf"
              >
                PDF
              </button>
            </div>
          </div>

          {/* PNG options */}
          {format === 'png' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rozdzielczość
              </label>
              <select
                value={pngScale}
                onChange={(e) => setPngScale(Number(e.target.value) as PngScale)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                data-testid="sld-export-png-scale"
              >
                {(Object.keys(PNG_SCALE_LABELS_PL) as unknown as PngScale[]).map(
                  (scale) => (
                    <option key={scale} value={scale}>
                      {PNG_SCALE_LABELS_PL[scale]}
                    </option>
                  )
                )}
              </select>
            </div>
          )}

          {/* PDF options */}
          {format === 'pdf' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rozmiar strony
                </label>
                <select
                  value={pdfPageSize}
                  onChange={(e) => setPdfPageSize(e.target.value as PdfPageSize)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  data-testid="sld-export-pdf-size"
                >
                  {(Object.keys(PDF_PAGE_SIZE_LABELS_PL) as PdfPageSize[]).map(
                    (size) => (
                      <option key={size} value={size}>
                        {PDF_PAGE_SIZE_LABELS_PL[size]}
                      </option>
                    )
                  )}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Orientacja
                </label>
                <select
                  value={pdfOrientation}
                  onChange={(e) =>
                    setPdfOrientation(e.target.value as PdfOrientation)
                  }
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  data-testid="sld-export-pdf-orientation"
                >
                  {(Object.keys(PDF_ORIENTATION_LABELS_PL) as PdfOrientation[]).map(
                    (orientation) => (
                      <option key={orientation} value={orientation}>
                        {PDF_ORIENTATION_LABELS_PL[orientation]}
                      </option>
                    )
                  )}
                </select>
              </div>
            </>
          )}

          {/* Scope selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Zakres
            </label>
            <div className="flex gap-3">
              {(Object.keys(SCOPE_LABELS_PL) as ExportScope[]).map((scopeOption) => (
                <button
                  key={scopeOption}
                  type="button"
                  onClick={() => setScope(scopeOption)}
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded border ${
                    scope === scopeOption
                      ? 'bg-blue-50 border-blue-500 text-blue-700'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                  data-testid={`sld-export-scope-${scopeOption}`}
                >
                  {SCOPE_LABELS_PL[scopeOption]}
                </button>
              ))}
            </div>
          </div>

          {/* Layer options */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Warstwy
            </label>
            <div className="space-y-2">
              {(Object.keys(LAYER_LABELS_PL) as (keyof ExportLayerOptions)[]).map(
                (layerKey) => {
                  const isAvailable = layerAvailability[layerKey];
                  return (
                    <label
                      key={layerKey}
                      className={`flex items-center gap-2 ${
                        !isAvailable ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={layers[layerKey] && isAvailable}
                        onChange={(e) =>
                          handleLayerChange(layerKey, e.target.checked)
                        }
                        disabled={!isAvailable}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        data-testid={`sld-export-layer-${layerKey}`}
                      />
                      <span className="text-sm text-gray-700">
                        {LAYER_LABELS_PL[layerKey]}
                        {!isAvailable && (
                          <span className="text-gray-400 ml-1">(niedostępna)</span>
                        )}
                      </span>
                    </label>
                  );
                }
              )}
            </div>
          </div>

          {/* Metadata info */}
          <div className="bg-gray-50 rounded p-3 text-xs text-gray-600">
            <div className="font-medium text-gray-700 mb-1">Informacje o eksporcie</div>
            <div className="space-y-0.5">
              <div>Projekt: {metadata.projectName}</div>
              <div>Wariant pracy: {metadata.caseName}</div>
              <div>Skala: {metadata.zoomPercent}%</div>
              {metadata.runId && <div>Obliczenia: {metadata.runId.substring(0, 8)}...</div>}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            data-testid="sld-export-cancel-btn"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            data-testid="sld-export-confirm-btn"
          >
            {isExporting ? (
              <>
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Eksportowanie...
              </>
            ) : (
              `Eksportuj ${format.toUpperCase()}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
