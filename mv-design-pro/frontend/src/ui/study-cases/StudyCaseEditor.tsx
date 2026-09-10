/**
 * StudyCaseEditor — PR-14: Panel edycji przypadku obliczeniowego
 *
 * Combines:
 * - Study case configuration display
 * - Run controls (RunButton per analysis type)
 * - Run history (RunHistoryPanel)
 *
 * INVARIANTS:
 * - 100% PL etykiety
 * - NO physics, NO model mutation
 * - Disabled state when not ready
 */

import React, { useCallback } from 'react';
import { RunButton } from './RunButton';
import { RunHistoryPanel } from './RunHistoryPanel';
import { useExecutionRunsStore } from './runStore';
import {
  CONFIG_FIELD_LABELS,
  RESULT_STATUS_LABELS,
  type StudyCase,
  type StudyCaseConfig,
  type ExecutionAnalysisType,
} from './types';

interface StudyCaseEditorProps {
  /** The study case to display/edit. */
  studyCase: StudyCase;
  /** Whether the network is ready for calculations. */
  readinessReady: boolean;
  /** Handler called when results should be viewed for a run. */
  onViewResults?: (runId: string) => void;
}

/**
 * Format a config value for display.
 */
function formatConfigValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Tak' : 'Nie';
  if (typeof value === 'number') {
    if (value < 0.001) return value.toExponential(1);
    return value.toLocaleString('pl-PL');
  }
  return String(value ?? '—');
}

/**
 * Config section: displays study case configuration parameters.
 */
const ConfigSection: React.FC<{ config: StudyCaseConfig }> = ({ config }) => {
  const fields = Object.entries(CONFIG_FIELD_LABELS) as [
    keyof StudyCaseConfig,
    string,
  ][];

  return (
    <div className="border rounded mb-4">
      <div className="bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 border-b">
        Parametry konfiguracji
      </div>
      <div className="p-3 grid grid-cols-2 gap-2">
        {fields.map(([key, label]) => (
          <div key={key} className="flex justify-between text-sm">
            <span className="text-gray-600">{label}</span>
            <span className="font-medium">
              {formatConfigValue(config[key])}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Study case editor panel with run controls and history.
 */
export const StudyCaseEditor: React.FC<StudyCaseEditorProps> = ({
  studyCase,
  readinessReady,
  onViewResults,
}) => {
  const { createAndExecuteRun, setActiveRun } = useExecutionRunsStore();
  const activeRunId = useExecutionRunsStore((state) => state.activeRunId);

  const handleRun = useCallback(
    async (analysisType: ExecutionAnalysisType) => {
      try {
        await createAndExecuteRun(studyCase.id, {
          analysis_type: analysisType,
          solver_input: {},
        });
      } catch {
        // Error already handled in store
      }
    },
    [studyCase.id, createAndExecuteRun]
  );

  const handleSelectRun = useCallback(
    (runId: string) => {
      setActiveRun(runId);
      onViewResults?.(runId);
    },
    [setActiveRun, onViewResults]
  );

  const statusLabel =
    RESULT_STATUS_LABELS[studyCase.result_status] ||
    studyCase.result_status;
  const statusColor =
    studyCase.result_status === 'FRESH'
      ? 'text-green-600'
      : studyCase.result_status === 'OUTDATED'
        ? 'text-orange-500'
        : 'text-gray-500';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{studyCase.name}</h3>
          {studyCase.description && (
            <p className="text-sm text-gray-500">{studyCase.description}</p>
          )}
        </div>
        {/* CV-2-W: przyczyna statusu (`result_status_reason_pl`) pochodzi z
            backendu — ekran jej nie tłumaczy ani nie uzupełnia. */}
        <div className={`text-sm font-medium ${statusColor}`} title={studyCase.result_status_reason_pl}>
          {statusLabel}
        </div>
      </div>

      {/* Config display */}
      <ConfigSection config={studyCase.config} />

      {/* Run controls */}
      <div className="border rounded p-3">
        <div className="text-sm font-medium text-gray-700 mb-3">
          Uruchom obliczenie
        </div>
        {!readinessReady && (
          <div className="text-sm text-orange-600 mb-2">
            Sieć nie jest gotowa do obliczeń. Sprawdź panel gotowości.
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <RunButton
            readinessReady={readinessReady}
            analysisType="SC_3F"
            onRun={handleRun}
          />
          <RunButton
            readinessReady={readinessReady}
            analysisType="SC_1F"
            onRun={handleRun}
          />
          <RunButton
            readinessReady={readinessReady}
            analysisType="LOAD_FLOW"
            onRun={handleRun}
          />
        </div>
      </div>

      {/* Run history */}
      <RunHistoryPanel
        onSelectRun={handleSelectRun}
        selectedRunId={activeRunId}
      />
    </div>
  );
};
