/**
 * Fault Scenario SLD Overlay Toggle — PR-24
 * All labels in Polish.
 */

import { useCallback } from 'react';
import { useFaultScenariosStore, useSelectedScenario, useScenarioSldOverlay } from './store';

interface FaultScenarioOverlayToggleProps {
  onOverlayToggle?: (enabled: boolean, overlay: unknown) => void;
}

export function FaultScenarioOverlayToggle({ onOverlayToggle }: FaultScenarioOverlayToggleProps) {
  const selectedScenario = useSelectedScenario();
  const sldOverlay = useScenarioSldOverlay();
  const { selectScenario, scenarios } = useFaultScenariosStore();

  const handleToggle = useCallback(() => {
    if (selectedScenario && sldOverlay) {
      selectScenario(null);
      onOverlayToggle?.(false, null);
    }
  }, [selectedScenario, sldOverlay, selectScenario, onOverlayToggle]);

  const handleSelectScenario = useCallback(
    (scenarioId: string) => {
      selectScenario(scenarioId);
      onOverlayToggle?.(true, null);
    },
    [selectScenario, onOverlayToggle],
  );

  if (scenarios.length === 0) return null;

  return (
    <div className="flex items-center gap-2 p-2 rounded border border-slate-200 bg-white" data-testid="fault-scenario-overlay-toggle">
      <label className="text-xs font-medium text-slate-600">Pokaż scenariusz na schemacie</label>
      {selectedScenario ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-sygnal-uwaga font-medium">{selectedScenario.name}</span>
          <button
            onClick={handleToggle}
            className="px-2 py-0.5 text-xs rounded border border-slate-300 text-slate-500 hover:bg-slate-100"
            data-testid="fault-scenario-overlay-hide"
          >
            Ukryj
          </button>
        </div>
      ) : (
        <select
          onChange={(e) => e.target.value && handleSelectScenario(e.target.value)}
          className="text-xs border border-slate-300 rounded px-2 py-1"
          data-testid="fault-scenario-overlay-select"
          value=""
        >
          <option value="">Wybierz scenariusz...</option>
          {scenarios.map((s) => (
            <option key={s.scenario_id} value={s.scenario_id}>{s.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}
