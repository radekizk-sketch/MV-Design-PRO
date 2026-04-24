/**
 * RunHistoryPanel — PR-14: Historia przebiegów obliczeniowych
 *
 * Displays the run history for the active study case.
 * Each row shows: analysis type, status, timestamp, hash (abbreviated).
 *
 * INVARIANTS:
 * - 100% PL etykiety
 * - NO physics, NO model mutation
 * - Deterministic ordering (newest first)
 */

import React from 'react';
import { useRuns } from './runStore';
import {
  ANALYSIS_TYPE_LABELS,
  RUN_STATUS_LABELS,
  RUN_STATUS_COLORS,
  type ExecutionRun,
} from './types';

interface RunHistoryPanelProps {
  /** Handler called when a run is selected for result viewing. */
  onSelectRun?: (runId: string) => void;
  /** Currently selected run ID. */
  selectedRunId?: string | null;
}

/**
 * Format a timestamp for display.
 */
function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  try {
    const date = new Date(iso);
    return date.toLocaleString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * Abbreviate a SHA-256 hash for display.
 */
function abbreviateHash(hash: string): string {
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}

/**
 * Single run row in the history panel.
 */
const RunRow: React.FC<{
  run: ExecutionRun;
  isSelected: boolean;
  onSelect?: (runId: string) => void;
}> = ({ run, isSelected, onSelect }) => {
  const statusLabel = RUN_STATUS_LABELS[run.status] || run.status;
  const statusColor = RUN_STATUS_COLORS[run.status] || 'text-gray-500';
  const analysisLabel = ANALYSIS_TYPE_LABELS[run.analysis_type] || run.analysis_type;
  const timestamp = formatTimestamp(run.started_at || run.finished_at);
  const hashAbbr = abbreviateHash(run.solver_input_hash);

  return (
    <tr
      className={`border-b cursor-pointer hover:bg-gray-50 ${
        isSelected ? 'bg-blue-50' : ''
      }`}
      onClick={() => onSelect?.(run.id)}
      title={
        run.error_message
          ? `Błąd: ${run.error_message}`
          : `Hash: ${run.solver_input_hash}`
      }
    >
      <td className="px-3 py-2 text-sm">{analysisLabel}</td>
      <td className={`px-3 py-2 text-sm font-medium ${statusColor}`}>
        {statusLabel}
      </td>
      <td className="px-3 py-2 text-sm text-gray-600">{timestamp}</td>
      <td className="px-3 py-2 text-sm font-mono text-gray-400">
        {hashAbbr}
      </td>
    </tr>
  );
};

/**
 * Run history panel showing all runs for the active study case.
 */
export const RunHistoryPanel: React.FC<RunHistoryPanelProps> = ({
  onSelectRun,
  selectedRunId = null,
}) => {
  const runs = useRuns();

  if (runs.length === 0) {
    return (
      <div className="p-4 text-sm text-gray-500 text-center">
        Brak wykonanych obliczeń.
        <br />
        Wykonaj obliczenie, aby zobaczyć historię.
      </div>
    );
  }

  return (
    <div className="border rounded overflow-hidden">
      <div className="bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 border-b">
        Historia obliczeń ({runs.length})
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Analiza
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Data
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Ślad techniczny
              </th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <RunRow
                key={run.id}
                run={run}
                isSelected={run.id === selectedRunId}
                onSelect={onSelectRun}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
