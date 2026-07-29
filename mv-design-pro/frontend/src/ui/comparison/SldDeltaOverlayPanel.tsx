/**
 * SC Comparison Panel -- PR-21
 *
 * Panel for viewing and creating SC comparisons.
 * Shows global deltas, per-element delta table, and integrates
 * with SLD delta overlay.
 *
 * 100% Polish UI. No project codenames.
 * CANONICAL-grade: consistent badges, number formatting, delta arrows.
 */

import React, { useEffect, useCallback, useMemo } from 'react';
import { useComparisonStore } from './sldDeltaOverlay.store';
import { useSldDeltaOverlayStore } from '../sld-overlay/sldDeltaOverlayStore';
import type { SCComparison, NumericDelta, ElementDelta } from './sldDeltaOverlay.types';
import {
  GLOBAL_DELTA_KEY_LABELS,
  getDeltaDirection,
  DELTA_DIRECTION_ARROWS,
  DELTA_DIRECTION_STYLES,
} from './sldDeltaOverlay.types';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Format a numeric value for display.
 * Deterministic fixed-point formatting.
 */
function formatValue(value: number | null | undefined, decimals = 3): string {
  if (value === null || value === undefined) return '\u2014';
  return value.toFixed(decimals);
}

/**
 * Format relative delta as percentage.
 */
function formatPercent(rel: number | null | undefined): string {
  if (rel === null || rel === undefined) return '\u2014';
  return `${(rel * 100).toFixed(2)}%`;
}

interface GlobalDeltaRowProps {
  label: string;
  delta: NumericDelta;
}

const GlobalDeltaRow: React.FC<GlobalDeltaRowProps> = React.memo(
  ({ label, delta }) => {
    const direction = getDeltaDirection(delta);
    const arrow = DELTA_DIRECTION_ARROWS[direction];
    const colorClass = DELTA_DIRECTION_STYLES[direction];

    return (
      <div className="grid grid-cols-5 gap-2 items-center text-xs py-1 border-b border-slate-100 last:border-0">
        <span className="col-span-2 text-slate-600 truncate" title={label}>
          {label}
        </span>
        <span className="font-mono text-right">{formatValue(delta.base)}</span>
        <span className="font-mono text-right">{formatValue(delta.other)}</span>
        <span className={`font-mono text-right font-medium ${colorClass}`}>
          {arrow} {formatValue(delta.abs)}
          {delta.rel !== null && (
            <span className="text-[10px] ml-1 opacity-70">
              ({formatPercent(delta.rel)})
            </span>
          )}
        </span>
      </div>
    );
  }
);

GlobalDeltaRow.displayName = 'GlobalDeltaRow';

// ---------------------------------------------------------------------------
// Per-element delta table
// ---------------------------------------------------------------------------

interface ElementDeltaTableProps {
  title: string;
  elements: ElementDelta[];
  onElementClick?: (elementRef: string) => void;
}

const ElementDeltaTable: React.FC<ElementDeltaTableProps> = React.memo(
  ({ title, elements, onElementClick }) => {
    if (elements.length === 0) return null;

    return (
      <div className="mt-3">
        <h5 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
          {title}
        </h5>
        <div className="space-y-1">
          {elements.map((elem) => {
            const deltaKeys = Object.keys(elem.deltas).sort();
            const hasChanges = deltaKeys.some(
              (k) => elem.deltas[k] && elem.deltas[k].abs !== 0
            );

            return (
              <div
                key={elem.element_ref}
                data-testid={`element-delta-${elem.element_ref}`}
                role="button"
                tabIndex={0}
                onClick={() => onElementClick?.(elem.element_ref)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onElementClick?.(elem.element_ref);
                  }
                }}
                className={`px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                  hasChanges
                    ? 'bg-amber-50 border border-amber-200 hover:bg-amber-100'
                    : 'bg-slate-50 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono font-medium text-slate-700 truncate">
                    {elem.element_ref}
                  </span>
                  {hasChanges ? (
                    <span className="text-[10px] text-amber-600 font-medium">
                      Zmiana
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400">
                      Bez zmian
                    </span>
                  )}
                </div>
                {deltaKeys.map((key) => {
                  const d = elem.deltas[key];
                  if (!d) return null;
                  const dir = getDeltaDirection(d);
                  return (
                    <div
                      key={key}
                      className="grid grid-cols-4 gap-1 text-[10px] text-slate-500"
                    >
                      <span className="truncate">{key}</span>
                      <span className="text-right font-mono">
                        {formatValue(d.base, 2)}
                      </span>
                      <span className="text-right font-mono">
                        {formatValue(d.other, 2)}
                      </span>
                      <span
                        className={`text-right font-mono ${DELTA_DIRECTION_STYLES[dir]}`}
                      >
                        {DELTA_DIRECTION_ARROWS[dir]} {formatValue(d.abs, 2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);

ElementDeltaTable.displayName = 'ElementDeltaTable';

// ---------------------------------------------------------------------------
// Comparison Detail
// ---------------------------------------------------------------------------

interface ComparisonDetailProps {
  comparison: SCComparison;
  onElementClick?: (elementRef: string) => void;
}

const ComparisonDetail: React.FC<ComparisonDetailProps> = React.memo(
  ({ comparison, onElementClick }) => {
    const { loadDeltaOverlay, activeComparisonId, clearDeltaOverlay } =
      useSldDeltaOverlayStore();

    const isDeltaOverlayActive =
      activeComparisonId === comparison.comparison_id;

    const handleToggleOverlay = useCallback(() => {
      if (isDeltaOverlayActive) {
        clearDeltaOverlay();
      } else {
        loadDeltaOverlay(comparison.comparison_id);
      }
    }, [
      isDeltaOverlayActive,
      comparison.comparison_id,
      loadDeltaOverlay,
      clearDeltaOverlay,
    ]);

    const globalDeltaEntries = useMemo(() => {
      return Object.entries(comparison.deltas_global).sort(([a], [b]) =>
        a.localeCompare(b)
      );
    }, [comparison.deltas_global]);

    return (
      <div
        data-testid="comparison-detail"
        className="border-t border-slate-200 pt-3 mt-2"
      >
        {/* Header with overlay toggle */}
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Szczegoly porownania
          </h4>
          <button
            data-testid="toggle-delta-overlay"
            onClick={handleToggleOverlay}
            className={`px-2 py-1 text-xs font-medium rounded border transition-colors ${
              isDeltaOverlayActive
                ? 'bg-blue-100 text-blue-700 border-blue-300'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            {isDeltaOverlayActive ? 'Ukryj roznice' : 'Pokaz roznice na SLD'}
          </button>
        </div>

        {/* Meta info */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-3">
          <span className="text-slate-500">Typ analizy:</span>
          <span className="font-medium">{comparison.analysis_type}</span>
          <span className="text-slate-500">Scenariusz bazowy:</span>
          <span className="font-mono text-slate-600 truncate">
            {comparison.base_scenario_id.slice(0, 12)}...
          </span>
          <span className="text-slate-500">Scenariusz porownywany:</span>
          <span className="font-mono text-slate-600 truncate">
            {comparison.other_scenario_id.slice(0, 12)}...
          </span>
          <span className="text-slate-500">Odcisk wejścia:</span>
          <span className="font-mono text-slate-600 truncate">
            {comparison.input_hash.slice(0, 24)}...
          </span>
        </div>

        {/* Global deltas */}
        {globalDeltaEntries.length > 0 && (
          <div className="mb-3">
            <h5 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Delty globalne
            </h5>
            <div className="grid grid-cols-5 gap-2 text-[10px] text-slate-400 uppercase tracking-wider mb-1 px-0">
              <span className="col-span-2">Parametr</span>
              <span className="text-right">Bazowa</span>
              <span className="text-right">Porownywana</span>
              <span className="text-right">Delta</span>
            </div>
            {globalDeltaEntries.map(([key, delta]) => (
              <GlobalDeltaRow
                key={key}
                label={GLOBAL_DELTA_KEY_LABELS[key] || key}
                delta={delta}
              />
            ))}
          </div>
        )}

        {/* Per-element deltas */}
        <ElementDeltaTable
          title="Delty zrodel"
          elements={comparison.deltas_by_source}
          onElementClick={onElementClick}
        />
        <ElementDeltaTable
          title="Delty galezi"
          elements={comparison.deltas_by_branch}
          onElementClick={onElementClick}
        />
      </div>
    );
  }
);

ComparisonDetail.displayName = 'ComparisonDetail';

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export interface ComparisonPanelProps {
  studyCaseId: string | null;
  onElementSelect?: (elementRef: string) => void;
}

export const ComparisonPanel: React.FC<ComparisonPanelProps> = React.memo(
  ({ studyCaseId, onElementSelect }) => {
    const {
      comparisons,
      selectedComparisonId,
      selectedComparison,
      isLoading,
      error,
      loadComparisons,
      selectComparison,
      clearError,
    } = useComparisonStore();

    useEffect(() => {
      if (studyCaseId) {
        loadComparisons(studyCaseId);
      }
    }, [studyCaseId, loadComparisons]);

    const handleSelect = useCallback(
      (comparisonId: string) => {
        selectComparison(
          comparisonId === selectedComparisonId ? null : comparisonId
        );
      },
      [selectComparison, selectedComparisonId]
    );

    if (!studyCaseId) {
      return (
        <div
          data-testid="comparison-panel-empty"
          className="p-4 text-sm text-slate-400 text-center"
        >
          Wybierz wariant pracy
        </div>
      );
    }

    return (
      <div data-testid="comparison-panel" className="flex flex-col gap-2 p-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">
            Porownania wynikow
          </h3>
          {isLoading && (
            <span className="text-[10px] text-slate-400 animate-pulse">
              Ladowanie...
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div
            data-testid="comparison-panel-error"
            className="flex items-center justify-between text-xs text-rose-600 bg-rose-50 px-2 py-1 rounded"
          >
            <span>{error}</span>
            <button
              onClick={clearError}
              className="text-rose-400 hover:text-rose-600 ml-2"
            >
              {'\u2715'}
            </button>
          </div>
        )}

        {/* Comparison list */}
        {comparisons.length === 0 && !isLoading ? (
          <div className="text-xs text-slate-400 text-center py-4">
            Brak porownan
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {comparisons.map((comp) => {
              const isSelected = comp.comparison_id === selectedComparisonId;
              const formattedDate = new Date(comp.created_at).toLocaleString(
                'pl-PL',
                {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                }
              );

              return (
                <div
                  key={comp.comparison_id}
                  data-testid={`comparison-row-${comp.comparison_id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelect(comp.comparison_id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleSelect(comp.comparison_id);
                    }
                  }}
                  className={`flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-blue-50 border border-blue-200'
                      : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-slate-500 truncate">
                        {comp.input_hash.slice(0, 12)}
                      </span>
                      <span className="text-[10px] text-emerald-600 font-medium">
                        {comp.analysis_type}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-400">
                      <span>{formattedDate}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Detail panel */}
        {selectedComparison && (
          <ComparisonDetail
            comparison={selectedComparison}
            onElementClick={onElementSelect}
          />
        )}
      </div>
    );
  }
);

ComparisonPanel.displayName = 'ComparisonPanel';
