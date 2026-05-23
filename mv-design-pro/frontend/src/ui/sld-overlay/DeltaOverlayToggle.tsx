/**
 * Delta Overlay Toggle -- PR-21
 *
 * Toggle button for delta overlay on SLD.
 * Allows selecting a comparison and enabling/disabling the delta overlay.
 *
 * 100% Polish UI. No project codenames.
 * Integrates with sldDeltaOverlayStore and comparisonStore.
 */

import React, { useCallback } from 'react';
import { useSldDeltaOverlayStore } from './sldDeltaOverlayStore';
import type { SCComparison } from '../comparison/sldDeltaOverlay.types';

// ---------------------------------------------------------------------------
// Toggle component
// ---------------------------------------------------------------------------

export interface DeltaOverlayToggleProps {
  /** Available comparisons to choose from */
  comparisons: SCComparison[];
  /** Currently selected comparison ID (from URL or state) */
  selectedComparisonId?: string | null;
  /** Callback when comparison selection changes */
  onComparisonSelect?: (comparisonId: string | null) => void;
}

export const DeltaOverlayToggle: React.FC<DeltaOverlayToggleProps> =
  React.memo(({ comparisons, selectedComparisonId, onComparisonSelect }) => {
    const {
      activeComparisonId,
      enabled,
      isLoading,
      error,
      loadDeltaOverlay,
      clearDeltaOverlay,
      toggleDeltaOverlay,
    } = useSldDeltaOverlayStore();

    const _isActive = activeComparisonId !== null && enabled;
    void _isActive;

    const handleComparisonChange = useCallback(
      (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        if (value === '') {
          clearDeltaOverlay();
          onComparisonSelect?.(null);
        } else {
          loadDeltaOverlay(value);
          onComparisonSelect?.(value);
        }
      },
      [clearDeltaOverlay, loadDeltaOverlay, onComparisonSelect]
    );

    const handleToggle = useCallback(() => {
      toggleDeltaOverlay();
    }, [toggleDeltaOverlay]);

    return (
      <div
        data-testid="delta-overlay-toggle"
        className="flex items-center gap-2 bg-white/95 backdrop-blur-sm rounded-lg border border-slate-200 shadow-sm px-3 py-2"
      >
        {/* Label */}
        <span className="text-xs font-medium text-slate-600">
          Roznice
        </span>

        {/* Comparison selector */}
        <select
          data-testid="delta-overlay-comparison-select"
          value={selectedComparisonId || activeComparisonId || ''}
          onChange={handleComparisonChange}
          className="text-xs border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-700 max-w-[180px]"
          disabled={isLoading}
        >
          <option value="">-- Wybierz porownanie --</option>
          {comparisons.map((comp) => (
            <option key={comp.comparison_id} value={comp.comparison_id}>
              {comp.analysis_type} {'\u2014'}{' '}
              {comp.input_hash.slice(0, 8)}
            </option>
          ))}
        </select>

        {/* Toggle button */}
        {activeComparisonId && (
          <button
            data-testid="delta-overlay-toggle-btn"
            onClick={handleToggle}
            className={`px-2 py-0.5 text-xs font-medium rounded border transition-colors ${
              enabled
                ? 'bg-blue-100 text-blue-700 border-blue-300'
                : 'bg-slate-100 text-slate-500 border-slate-300'
            }`}
          >
            {enabled ? 'Wlaczony' : 'Wylaczony'}
          </button>
        )}

        {/* Loading indicator */}
        {isLoading && (
          <span className="text-[10px] text-slate-400 animate-pulse">
            Ladowanie...
          </span>
        )}

        {/* Error */}
        {error && (
          <span className="text-[10px] text-rose-500 truncate max-w-[150px]">
            {error}
          </span>
        )}
      </div>
    );
  });

DeltaOverlayToggle.displayName = 'DeltaOverlayToggle';
