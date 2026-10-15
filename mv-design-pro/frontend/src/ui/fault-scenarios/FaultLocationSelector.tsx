/**
 * FaultLocationSelector — PR-19
 *
 * Allows selection of a fault location in the network.
 * SLD integration: click on BUS → BUS location, click on BRANCH → requires position.
 *
 * INVARIANTS:
 * - BUS location: position must be null
 * - BRANCH location: position must be in (0, 1)
 * - No guessing of position
 * - No default physical values
 * - All labels in Polish
 */

import { useState, useCallback } from 'react';
import type { FaultLocation, LocationType } from './types';
import { LOCATION_TYPE_LABELS } from './types';

interface FaultLocationSelectorProps {
  value: FaultLocation | null;
  onChange: (location: FaultLocation) => void;
}

export function FaultLocationSelector({
  value,
  onChange,
}: FaultLocationSelectorProps) {
  const [locationType, setLocationType] = useState<LocationType>(
    value?.location_type ?? 'BUS'
  );
  const [elementRef, setElementRef] = useState(value?.element_ref ?? '');
  const [position, setPosition] = useState<string>(
    value?.position?.toString() ?? ''
  );
  const [error, setError] = useState<string | null>(null);

  const handleApply = useCallback(() => {
    setError(null);

    if (!elementRef.trim()) {
      setError('Identyfikator elementu jest wymagany');
      return;
    }

    if (locationType === 'BUS') {
      onChange({
        element_ref: elementRef.trim(),
        location_type: 'BUS',
        position: null,
      });
    } else {
      const parsedPosition = parseFloat(position);
      if (isNaN(parsedPosition)) {
        setError('Pozycja na gałęzi jest wymagana (liczba)');
        return;
      }
      if (parsedPosition <= 0.0 || parsedPosition >= 1.0) {
        setError('Pozycja musi być w zakresie (0, 1)');
        return;
      }
      onChange({
        element_ref: elementRef.trim(),
        location_type: 'BRANCH',
        position: parsedPosition,
      });
    }
  }, [locationType, elementRef, position, onChange]);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Typ lokalizacji
        </label>
        <div className="flex gap-2">
          {(['BUS', 'BRANCH'] as const).map((lt) => (
            <button
              key={lt}
              className={`px-3 py-1 text-sm border rounded ${
                locationType === lt
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
              }`}
              onClick={() => {
                setLocationType(lt);
                setError(null);
              }}
            >
              {LOCATION_TYPE_LABELS[lt]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Identyfikator elementu
        </label>
        <input
          type="text"
          value={elementRef}
          onChange={(e) => setElementRef(e.target.value)}
          placeholder={
            locationType === 'BUS'
              ? 'np. BUS_SN_1'
              : 'np. CABLE_01'
          }
          className="w-full p-2 border border-gray-300 rounded text-sm"
        />
      </div>

      {locationType === 'BRANCH' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Pozycja na gałęzi (0...1)
          </label>
          <input
            type="number"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            min={0.01}
            max={0.99}
            step={0.01}
            placeholder="np. 0.50"
            className="w-full p-2 border border-gray-300 rounded text-sm"
          />
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600">{error}</div>
      )}

      <button
        onClick={handleApply}
        className="w-full bg-blue-600 text-white py-2 rounded text-sm hover:bg-blue-700"
      >
        Zatwierdź lokalizację
      </button>

      {value && (
        <div className="text-xs text-gray-500 mt-1">
          Wybrano: {LOCATION_TYPE_LABELS[value.location_type]} —{' '}
          <strong>{value.element_ref}</strong>
          {value.position !== null && ` (pozycja: ${value.position})`}
        </div>
      )}
    </div>
  );
}
