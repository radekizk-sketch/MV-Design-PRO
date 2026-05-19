/**
 * Fault Scenarios Panel — PR-24
 * All labels in Polish. No project codenames.
 */

import { useCallback, useEffect } from 'react';
import { useFaultScenariosStore, useSelectedScenario, useScenarioEligibility } from './store';
import { FAULT_TYPE_LABELS, FAULT_MODE_LABELS, type FaultTypeValue, type FaultModeValue } from './types';

interface FaultScenariosPanelProps {
  studyCaseId: string | null;
  onHighlightElement?: (elementRef: string) => void;
}

export function FaultScenariosPanel({ studyCaseId, onHighlightElement }: FaultScenariosPanelProps) {
  const {
    scenarios,
    selectedScenarioId,
    isLoading,
    error,
    setStudyCaseId,
    selectScenario,
    openModal,
    deleteScenario,
    createRun,
  } = useFaultScenariosStore();

  const selectedScenario = useSelectedScenario();
  const eligibility = useScenarioEligibility();

  useEffect(() => {
    setStudyCaseId(studyCaseId);
  }, [studyCaseId, setStudyCaseId]);

  const handleSelect = useCallback(
    (scenarioId: string) => {
      selectScenario(scenarioId);
      const scenario = scenarios.find((s) => s.scenario_id === scenarioId);
      if (scenario && onHighlightElement) {
        onHighlightElement(scenario.location.element_ref);
      }
    },
    [selectScenario, scenarios, onHighlightElement],
  );

  const handleDelete = useCallback(
    async (scenarioId: string) => { await deleteScenario(scenarioId); },
    [deleteScenario],
  );

  const handleRun = useCallback(
    async (scenarioId: string) => {
      try { await createRun(scenarioId); } catch { /* Error via store */ }
    },
    [createRun],
  );

  if (!studyCaseId) {
    return (
      <div className="p-4 text-sm text-slate-500" data-testid="fault-scenarios-no-case">
        Wybierz wariant pracy, aby zarządzać scenariuszami zwarć.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="fault-scenarios-panel">
      <div className="flex items-center justify-between p-3 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-700">Scenariusze zwarciowe</h2>
        <button
          onClick={() => openModal()}
          className="px-3 py-1.5 text-xs font-medium rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
          data-testid="fault-scenarios-add-btn"
        >
          Dodaj scenariusz
        </button>
      </div>

      {error && (
        <div className="p-2 mx-3 mt-2 text-xs rounded bg-rose-50 text-rose-700 border border-rose-200" data-testid="fault-scenarios-error">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="p-4 text-xs text-slate-500" data-testid="fault-scenarios-loading">
          Ładowanie scenariuszy...
        </div>
      )}

      {!isLoading && scenarios.length === 0 && (
        <div className="p-4 text-xs text-slate-500" data-testid="fault-scenarios-empty">
          Brak scenariuszy zwarciowych. Kliknij „Dodaj scenariusz", aby utworzyć pierwszy.
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {scenarios.map((scenario) => (
          <div
            key={scenario.scenario_id}
            data-testid={`fault-scenario-item-${scenario.scenario_id}`}
            className={`p-3 border-b border-slate-100 cursor-pointer transition-colors ${
              selectedScenarioId === scenario.scenario_id
                ? 'bg-blue-50 border-l-2 border-l-blue-500'
                : 'hover:bg-slate-50'
            }`}
            onClick={() => handleSelect(scenario.scenario_id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800 truncate">{scenario.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {FAULT_TYPE_LABELS[scenario.fault_type as FaultTypeValue] ?? scenario.fault_type}
                  {scenario.fault_mode && scenario.fault_mode !== 'METALLIC' && (
                    <> · {FAULT_MODE_LABELS[scenario.fault_mode as FaultModeValue] ?? scenario.fault_mode}</>
                  )}
                  {' · '}
                  {scenario.location.element_ref}
                  {scenario.location.location_type === 'BRANCH_POINT' && scenario.location.position != null && (
                    <> (α={scenario.location.position})</>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2">
                <button
                  onClick={(e) => { e.stopPropagation(); openModal(scenario.scenario_id); }}
                  className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-600 hover:bg-slate-100"
                  data-testid={`fault-scenario-edit-${scenario.scenario_id}`}
                >
                  Edytuj
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleRun(scenario.scenario_id); }}
                  className="px-2 py-1 text-xs rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  data-testid={`fault-scenario-run-${scenario.scenario_id}`}
                >
                  Uruchom
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(scenario.scenario_id); }}
                  className="px-2 py-1 text-xs rounded border border-rose-200 text-rose-600 hover:bg-rose-50"
                  data-testid={`fault-scenario-delete-${scenario.scenario_id}`}
                >
                  Usuń
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedScenario && eligibility && (
        <div className="border-t border-slate-200 p-3" data-testid="fault-scenario-eligibility">
          <div className="text-xs font-medium text-slate-600 mb-1">Kontrola analizy</div>
          <div className={`text-xs font-medium ${eligibility.status === 'ELIGIBLE' ? 'text-emerald-700' : 'text-rose-700'}`}>
            {eligibility.status === 'ELIGIBLE' ? 'Analiza dostępna' : 'Analiza zablokowana'}
          </div>
          {eligibility.blockers.length > 0 && (
            <ul className="mt-1 space-y-1">
              {eligibility.blockers.map((issue, idx) => (
                <li key={`${issue.code}-${idx}`} className="text-xs text-rose-600">
                  {issue.message_pl}
                  {issue.fix_action && (
                    <span className="ml-1 text-blue-600 underline cursor-pointer">
                      {issue.fix_action.action_type === 'OPEN_MODAL' && 'Otwórz formularz'}
                      {issue.fix_action.action_type === 'NAVIGATE_TO_ELEMENT' && 'Przejdź do elementu'}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
