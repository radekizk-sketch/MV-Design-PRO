/**
 * ExpertOverrides — panel nadpisań katalogowych w trybie EKSPERT.
 *
 * Wymaga jawnego włączenia przełącznikiem.
 * Wyświetla diff: wartość katalogowa vs override.
 * Audytowalny: każdy override wymaga powodu.
 * BINDING: PL labels, no codenames.
 */

import { useCallback, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OverrideEntry {
  key: string;
  value: number | string;
  reason: string;
}

interface ExpertOverridesProps {
  isExpertMode: boolean;
  onToggleExpert: (enabled: boolean) => void;
  overrides: OverrideEntry[];
  onOverridesChange: (overrides: OverrideEntry[]) => void;
  availableKeys: Array<{ key: string; label: string; catalogValue: string | number; unit?: string }>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExpertOverrides({
  isExpertMode,
  onToggleExpert,
  overrides,
  onOverridesChange,
  availableKeys,
}: ExpertOverridesProps) {
  const [showWarning, setShowWarning] = useState(false);

  const handleToggle = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        setShowWarning(true);
      } else {
        onToggleExpert(false);
        onOverridesChange([]);
        setShowWarning(false);
      }
    },
    [onToggleExpert, onOverridesChange],
  );

  const confirmExpert = useCallback(() => {
    onToggleExpert(true);
    setShowWarning(false);
  }, [onToggleExpert]);

  const cancelExpert = useCallback(() => {
    setShowWarning(false);
  }, []);

  const addOverride = useCallback(
    (key: string) => {
      const catalogEntry = availableKeys.find((k) => k.key === key);
      if (!catalogEntry) return;
      if (overrides.some((o) => o.key === key)) return;
      onOverridesChange([
        ...overrides,
        { key, value: catalogEntry.catalogValue, reason: '' },
      ]);
    },
    [overrides, onOverridesChange, availableKeys],
  );

  const updateOverride = useCallback(
    (index: number, field: 'value' | 'reason', val: string | number) => {
      const updated = [...overrides];
      updated[index] = { ...updated[index], [field]: val };
      onOverridesChange(updated);
    },
    [overrides, onOverridesChange],
  );

  const removeOverride = useCallback(
    (index: number) => {
      onOverridesChange(overrides.filter((_, i) => i !== index));
    },
    [overrides, onOverridesChange],
  );

  const unusedKeys = availableKeys.filter(
    (k) => !overrides.some((o) => o.key === k.key),
  );

  return (
    <div className="border-t border-gray-200 pt-4" data-testid="expert-overrides">
      {/* Toggle */}
      <div className="flex items-center gap-2 mb-3">
        <input
          type="checkbox"
          checked={isExpertMode}
          onChange={(e) => handleToggle(e.target.checked)}
          className="h-4 w-4 text-sygnal-uwaga border-gray-300 rounded"
          data-testid="expert-mode-toggle"
        />
        <label className="text-sm font-medium text-gray-700">
          Tryb EKSPERT (nadpisania katalogowe)
        </label>
      </div>

      {/* Warning dialog */}
      {showWarning && (
        <div className="mb-3 p-3 bg-sygnal-uwaga-tlo border border-sygnal-uwaga/40 rounded-md" data-testid="expert-warning">
          <p className="text-sm text-sygnal-uwaga-tusz font-medium mb-2">
            Tryb EKSPERT pozwala na nadpisanie parametrów katalogowych.
          </p>
          <p className="text-xs text-sygnal-uwaga mb-3">
            Wszystkie zmiany wymagają podania powodu i zostaną zapisane w historii audytu.
            Nadpisania nie zmieniają struktury elementu ani nie dodają nowych parametrów.
          </p>
          <div className="flex gap-2">
            <button
              onClick={confirmExpert}
              className="px-3 py-1 text-xs font-medium text-white bg-amber-700 rounded hover:bg-amber-800"
              data-testid="expert-confirm"
            >
              Włącz tryb EKSPERT
            </button>
            <button
              onClick={cancelExpert}
              className="px-3 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
            >
              Anuluj
            </button>
          </div>
        </div>
      )}

      {/* Overrides list */}
      {isExpertMode && (
        <div className="space-y-2">
          {overrides.map((override, idx) => {
            const keyInfo = availableKeys.find((k) => k.key === override.key);
            return (
              <div
                key={override.key}
                className="p-2 bg-sygnal-uwaga-tlo border border-sygnal-uwaga/40 rounded text-sm"
                data-testid={`override-${override.key}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-700">
                    {keyInfo?.label ?? override.key}
                  </span>
                  <button
                    onClick={() => removeOverride(idx)}
                    className="text-xs text-sygnal-blokada hover:text-sygnal-blokada-tusz"
                  >
                    Usuń
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">
                      Katalog: {keyInfo?.catalogValue}{keyInfo?.unit ? ` ${keyInfo.unit}` : ''}
                    </label>
                    <input
                      type="text"
                      value={override.value}
                      onChange={(e) => updateOverride(idx, 'value', e.target.value)}
                      className="w-full px-2 py-1 border border-sygnal-uwaga/40 rounded text-xs"
                      data-testid={`override-value-${override.key}`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Powód nadpisania</label>
                    <input
                      type="text"
                      value={override.reason}
                      onChange={(e) => updateOverride(idx, 'reason', e.target.value)}
                      placeholder="Wymagane"
                      className="w-full px-2 py-1 border border-sygnal-uwaga/40 rounded text-xs"
                      data-testid={`override-reason-${override.key}`}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add override */}
          {unusedKeys.length > 0 && (
            <div>
              <select
                onChange={(e) => {
                  if (e.target.value) addOverride(e.target.value);
                  e.target.value = '';
                }}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs text-gray-600"
                defaultValue=""
                data-testid="add-override-select"
              >
                <option value="">+ Dodaj nadpisanie parametru\u2026</option>
                {unusedKeys.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label} (katalog: {k.catalogValue}{k.unit ? ` ${k.unit}` : ''})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
