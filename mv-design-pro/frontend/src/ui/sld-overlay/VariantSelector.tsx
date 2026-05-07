/**
 * Variant Selector — §7 UX 10/10
 *
 * Dropdown wyboru wariantu projektu z porównaniem.
 *
 * WYMAGANIA:
 * - Dropdown z listą wariantów
 * - Duplikacja wariantu (przycisk)
 * - Porównanie: wybierz drugi wariant → delta overlay
 * - Wskaźnik zmian (dodane/usunięte/zmienione)
 *
 * INVARIANTS:
 * - Read-only during comparison
 * - All labels Polish
 */

import React, { useState, useCallback } from 'react';
import { clsx } from 'clsx';
import {
  useVariantStore,
  DELTA_CHANGE_LABELS,
  DELTA_CHANGE_COLORS,
} from './variantStore';
import type { DeltaChangeType } from './variantStore';

// =============================================================================
// Props
// =============================================================================

export interface VariantSelectorProps {
  onVariantChange?: (variantId: string) => void;
  onDuplicate?: (variantId: string, name: string) => void;
}

// =============================================================================
// Component
// =============================================================================

export const VariantSelector: React.FC<VariantSelectorProps> = ({
  onVariantChange,
  onDuplicate,
}) => {
  const {
    variants,
    activeVariantId,
    setActiveVariant,
    compareMode,
    compareVariantId,
    startComparison,
    stopComparison,
    delta,
    deltaLoading,
    deltaOverlayVisible,
    toggleDeltaOverlay,
    duplicateVariant,
  } = useVariantStore();

  const [showDuplicate, setShowDuplicate] = useState(false);
  const [duplicateName, setDuplicateName] = useState('');

  const handleVariantChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const id = e.target.value;
      setActiveVariant(id);
      onVariantChange?.(id);
    },
    [setActiveVariant, onVariantChange],
  );

  const handleCompareSelect = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const id = e.target.value;
      if (id) {
        startComparison(id);
      } else {
        stopComparison();
      }
    },
    [startComparison, stopComparison],
  );

  const handleDuplicate = useCallback(async () => {
    if (activeVariantId && duplicateName.trim()) {
      await duplicateVariant(activeVariantId, duplicateName.trim());
      onDuplicate?.(activeVariantId, duplicateName.trim());
      setShowDuplicate(false);
      setDuplicateName('');
    }
  }, [activeVariantId, duplicateName, duplicateVariant, onDuplicate]);

  if (variants.length === 0) return null;

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-200"
      data-testid="variant-selector"
    >
      {/* Active variant selector */}
      <label className="text-xs text-gray-600 font-medium">Stan:</label>
      <select
        value={activeVariantId ?? ''}
        onChange={handleVariantChange}
        className="text-xs border border-gray-300 rounded px-2 py-1 bg-white min-w-[150px]"
        data-testid="variant-select"
      >
        {variants.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}{v.isActive ? ' (aktywny)' : ''}
          </option>
        ))}
      </select>

      {/* Duplicate button */}
      {!showDuplicate ? (
        <button
          onClick={() => setShowDuplicate(true)}
          className="text-xs text-blue-600 hover:underline"
          title="Duplikuj wariant"
        >
          Duplikuj
        </button>
      ) : (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={duplicateName}
            onChange={(e) => setDuplicateName(e.target.value)}
            placeholder="Nazwa nowego wariantu..."
            className="text-xs border border-gray-300 rounded px-2 py-0.5 w-[150px]"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleDuplicate();
              if (e.key === 'Escape') setShowDuplicate(false);
            }}
          />
          <button
            onClick={handleDuplicate}
            className="text-xs text-green-600 hover:underline"
          >
            OK
          </button>
          <button
            onClick={() => setShowDuplicate(false)}
            className="text-xs text-gray-400 hover:underline"
          >
            Anuluj
          </button>
        </div>
      )}

      {/* Separator */}
      <div className="w-px h-4 bg-gray-300 mx-1" />

      {/* Comparison selector */}
      <label className="text-xs text-gray-600 font-medium">Porównaj z:</label>
      <select
        value={compareVariantId ?? ''}
        onChange={handleCompareSelect}
        className="text-xs border border-gray-300 rounded px-2 py-1 bg-white min-w-[150px]"
        data-testid="compare-variant-select"
      >
        <option value="">— brak porównania —</option>
        {variants
          .filter((v) => v.id !== activeVariantId)
          .map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
      </select>

      {/* Comparison status */}
      {compareMode && (
        <div className="flex items-center gap-2">
          {deltaLoading ? (
            <span className="text-xs text-gray-400 animate-pulse">
              Obliczanie różnic...
            </span>
          ) : delta ? (
            <div className="flex items-center gap-2">
              <DeltaCountBadge type="ADDED" count={delta.addedCount} />
              <DeltaCountBadge type="REMOVED" count={delta.removedCount} />
              <DeltaCountBadge type="MODIFIED" count={delta.modifiedCount} />
              <button
                onClick={toggleDeltaOverlay}
                className={clsx(
                  'text-xs px-2 py-0.5 rounded border transition-colors',
                  deltaOverlayVisible
                    ? 'bg-violet-100 border-violet-300 text-violet-700'
                    : 'bg-white border-gray-300 text-gray-600',
                )}
                data-testid="delta-overlay-toggle"
              >
                {deltaOverlayVisible ? 'Ukryj overlay' : 'Pokaż overlay'}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Delta Count Badge
// =============================================================================

interface DeltaCountBadgeProps {
  type: DeltaChangeType;
  count: number;
}

const DeltaCountBadge: React.FC<DeltaCountBadgeProps> = ({ type, count }) => {
  if (count === 0) return null;
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded font-medium"
      style={{
        backgroundColor: `${DELTA_CHANGE_COLORS[type]}20`,
        color: DELTA_CHANGE_COLORS[type],
      }}
      title={DELTA_CHANGE_LABELS[type]}
    >
      {count} {DELTA_CHANGE_LABELS[type].toLowerCase()}
    </span>
  );
};

export default VariantSelector;
