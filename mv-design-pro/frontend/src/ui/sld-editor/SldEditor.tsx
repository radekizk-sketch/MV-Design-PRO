/**
 * P30b — SLD Editor Main Component
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md: Full SLD editing experience
 * - ui_canonical_parity.md: ≥110% Canonical UX
 * - P30a: Full UNDO/REDO integration
 *
 * FEATURES:
 * - Multi-select (Shift+click, Ctrl+click, lasso)
 * - Drag single/group symbols
 * - Copy/paste/duplicate
 * - Align & distribute
 * - Snap-to-grid + grid toggle
 * - Full UNDO/REDO integration
 * - Mode gating (blocked in CASE_CONFIG/RESULT_VIEW)
 * - 100% Polish UI
 */

import React, { useEffect } from 'react';
import { SldCanvas } from './SldCanvas';
import { SldToolbar } from './SldToolbar';
import { useSldEditorStore } from './SldEditorStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useIsMutationBlocked, useModeLabel } from '../selection/store';
import { UndoRedoButtons } from '../history/UndoRedoButtons';
import { useSldModeStore, SLD_MODE_LABELS_PL } from '../sld/sldModeStore';
import { DiagnosticResultsLayer } from '../sld/DiagnosticResultsLayer';
import type { AnySldSymbol } from './types';
import { featureFlags } from '../config/featureFlags';
import { useOverlayRuntime, OverlayLegend } from '../sld-overlay';
import { ProjectModeToolbar } from '../sld/ProjectModeToolbar';
import { useIsProjectMode } from '../sld/sldProjectModeStore';
import { useSldDragCad } from './hooks/useSldDragCad';

/**
 * SLD Editor props.
 */
export interface SldEditorProps {
  /** Initial symbols to display */
  initialSymbols?: AnySldSymbol[];

  /** Project ID (for loading symbols from backend) */
  projectId?: string;

  /** Diagram ID (for loading symbols from backend) */
  diagramId?: string;

  /** Show toolbar */
  showToolbar?: boolean;

  /** Show UNDO/REDO buttons */
  showUndoRedo?: boolean;

  /** Callback when symbols change */
  onSymbolsChange?: (symbols: AnySldSymbol[]) => void;
}

/**
 * Main SLD Editor component.
 */
export const SldEditor: React.FC<SldEditorProps> = ({
  initialSymbols = [],
  projectId,
  diagramId,
  showToolbar = true,
  showUndoRedo = true,
  onSymbolsChange,
}) => {
  const sldStore = useSldEditorStore();
  const isMutationBlocked = useIsMutationBlocked();
  const modeLabel = useModeLabel();
  const cadOverridesStatus = useSldEditorStore((state) => state.cadOverridesStatus);
  const geometryMode = useSldEditorStore((state) => state.geometryMode);
  const setGeometryMode = useSldEditorStore((state) => state.setGeometryMode);

  // PR-SLD-06: SLD Mode integration
  const sldMode = useSldModeStore((state) => state.mode);
  const diagnosticLayerVisible = useSldModeStore((state) => state.diagnosticLayerVisible);
  const setMode = useSldModeStore((state) => state.setMode);
  const isResultsMode = sldMode === 'WYNIKI';
  const cadStatusLabel = cadOverridesStatus?.status
    ? {
      VALID: 'Geometria CAD zgodna z modelem',
      STALE: 'Geometria CAD może być nieaktualna względem modelu',
      CONFLICT: 'Konflikt geometrii CAD — część nadpisań nie pasuje do modelu',
    }[cadOverridesStatus.status]
    : null;

  // PR-16: Overlay Runtime Engine
  const currentSymbols = Array.from(sldStore.symbols.values());
  const overlayRuntime = useOverlayRuntime(currentSymbols);

  // RUN #3H: Project mode + CAD drag
  const _isProjectMode = useIsProjectMode();
  void _isProjectMode;
  const _cadDrag = useSldDragCad();
  void _cadDrag;

  // Combine mutation blocking with results mode
  const isEditBlocked = isMutationBlocked || isResultsMode;

  // Initialize symbols
  useEffect(() => {
    if (initialSymbols.length > 0) {
      sldStore.setSymbols(initialSymbols);
    }
  }, [initialSymbols, sldStore]);

  // P30c: Load symbols from backend API (if projectId/diagramId provided)
  useEffect(() => {
    if (!projectId || !diagramId) return;

    let cancelled = false;
    const endpoint = `/api/projects/${encodeURIComponent(projectId)}/sld/${encodeURIComponent(diagramId)}/symbols`;

    fetch(endpoint)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`SLD fetch failed: ${res.status} ${res.statusText}`);
        }
        return res.json() as Promise<{ symbols?: AnySldSymbol[] }>;
      })
      .then((data) => {
        if (!cancelled && data.symbols && data.symbols.length > 0) {
          sldStore.setSymbols(data.symbols);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.warn('[SldEditor] Could not load symbols from backend:', err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, diagramId, sldStore]);

  // Notify parent of symbol changes
  useEffect(() => {
    if (onSymbolsChange) {
      const symbols = Array.from(sldStore.symbols.values());
      onSymbolsChange(symbols);
    }
  }, [sldStore.symbols, onSymbolsChange]);

  // Setup keyboard shortcuts (disabled in WYNIKI mode)
  useKeyboardShortcuts({
    enableCopyPaste: !isResultsMode,
    enableUndoRedo: !isResultsMode,
    enableSelection: !isResultsMode,
  });

  return (
    <div className="flex flex-col h-full bg-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-300">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Edytor SLD</h2>
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span>
              Tryb: <span className="font-medium">{modeLabel}</span>
            </span>
            {/* PR-SLD-06: Mode indicator */}
            <span
              data-testid="sld-editor-mode-indicator"
              className={`rounded px-2 py-0.5 font-medium ${
                isResultsMode
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              {SLD_MODE_LABELS_PL[sldMode]}
            </span>
            {featureFlags.sldCadEditingEnabled && cadStatusLabel && (
              <span
                data-testid="sld-editor-cad-status"
                className={`rounded px-2 py-0.5 font-medium ${
                  cadOverridesStatus?.status === 'VALID'
                    ? 'bg-emerald-100 text-emerald-700'
                    : cadOverridesStatus?.status === 'STALE'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {cadStatusLabel}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {featureFlags.sldCadEditingEnabled && (
            <label className="flex items-center gap-2 text-xs text-gray-600">
              Tryb geometrii
              <select
                className="border border-gray-300 rounded px-2 py-1 text-xs"
                value={geometryMode}
                onChange={(event) => setGeometryMode(event.target.value as typeof geometryMode)}
              >
                <option value="AUTO">AUTO</option>
                <option value="CAD">CAD</option>
                <option value="HYBRID">HYBRID</option>
              </select>
            </label>
          )}
          {/* PR-SLD-06: Mode toggle button */}
          <button
            type="button"
            onClick={() => setMode(isResultsMode ? 'EDYCJA' : 'WYNIKI')}
            className={`px-3 py-1 text-xs rounded ${
              isResultsMode
                ? 'bg-gray-800 text-white hover:bg-gray-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            title={isResultsMode ? 'Przelacz na tryb Edycja' : 'Przelacz na tryb Wyniki'}
            data-testid="sld-editor-mode-toggle"
          >
            {isResultsMode ? 'Tryb: Wyniki' : 'Tryb: Edycja'}
          </button>
          {showUndoRedo && !isResultsMode && (
            <UndoRedoButtons />
          )}
        </div>
      </div>

      {/* Toolbar (hidden in WYNIKI mode) */}
      {showToolbar && !isResultsMode && <SldToolbar />}

      {/* RUN #3H: Project Mode Toolbar */}
      {!isResultsMode && (
        <ProjectModeToolbar caseId={projectId ?? null} />
      )}

      {/* Canvas */}
      <div className="flex-1 overflow-auto p-4 relative">
        <SldCanvas />
        {/* PR-SLD-06: Diagnostic layer overlay in WYNIKI mode */}
        {isResultsMode && diagnosticLayerVisible && (
          <DiagnosticResultsLayer
            symbols={currentSymbols}
            viewport={{ offsetX: 0, offsetY: 0, zoom: 1 }}
            visible={diagnosticLayerVisible}
          />
        )}
        {/* PR-16: Overlay Runtime Legend */}
        {overlayRuntime.isActive && (
          <OverlayLegend
            overlay={overlayRuntime.overlay}
            visible={overlayRuntime.isActive}
          />
        )}
      </div>

      {/* Footer / Status bar */}
      <div className="px-4 py-2 bg-white border-t border-gray-300">
        <div className="flex items-center justify-between text-xs text-gray-600">
          <div>
            {!isResultsMode && (
              <>
                Siatka: {sldStore.gridConfig.visible ? 'Widoczna' : 'Ukryta'} | Przyciąganie:{' '}
                {sldStore.gridConfig.snapEnabled ? 'Włączone' : 'Wyłączone'}
              </>
            )}
            {isResultsMode && (
              <span data-testid="sld-editor-results-mode-status">
                Tryb WYNIKI: schemat w trybie tylko do odczytu
              </span>
            )}
          </div>
          <div>
            {isEditBlocked && (
              <span
                data-testid="sld-editor-edit-blocked"
                className="text-gray-700 font-medium"
              >
                {isResultsMode
                  ? 'Tryb WYNIKI - edycja zablokowana'
                  : 'Edycja zablokowana (tryb tylko do odczytu)'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
