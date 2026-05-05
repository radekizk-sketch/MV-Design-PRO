/**
 * ActionsList
 *
 * Renders POST /snapshots/{id}/actions response 1:1.
 * Shows ALL actions. Never hides BLOCKED actions.
 *
 * CANONICAL RULES:
 * - BLOCKED actions: visible, disabled RUN, show reason from API
 * - ALLOWED actions: visible, enabled RUN button
 * - RUN button only enabled if status === 'ALLOWED'
 */

import type { ActionItem } from './types';

interface Props {
  actions: ActionItem[] | null;
  loading: boolean;
  error: string | null;
  onRunAction: (actionId: string) => void;
  runningAction: string | null;
}

export function ActionsList({ actions, loading, error, onRunAction, runningAction }: Props) {
  if (loading) {
    return <div className="p-4 text-gray-600">Loading actions...</div>;
  }

  if (error) {
    return (
      <div className="p-4 border rounded bg-red-50 border-red-200">
        <h2 className="text-lg font-semibold text-red-800 mb-2">Actions Error</h2>
        <pre className="text-sm text-red-700 whitespace-pre-wrap break-words">
          {error}
        </pre>
      </div>
    );
  }

  if (!actions) {
    return <div className="p-4 text-gray-500">No actions loaded</div>;
  }

  if (actions.length === 0) {
    return (
      <div className="p-4 border rounded bg-white">
        <h2 className="text-lg font-semibold mb-2">Actions</h2>
        <div className="text-gray-500">Brak dostępnych działań dla tej wersji modelu.</div>
      </div>
    );
  }

  return (
    <div className="p-4 border rounded bg-white">
      <h2 className="text-lg font-semibold mb-4">Actions</h2>

      <div className="space-y-3">
        {actions.map((action) => (
          <div
            key={action.action_id}
            className="p-3 border rounded bg-gray-50"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">{action.label}</span>
              <span
                className={`px-2 py-1 text-xs rounded ${
                  action.status === 'ALLOWED'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {action.status}
              </span>
            </div>

            <div className="text-xs text-gray-500 mb-1">
              action_id: {action.action_id}
            </div>
            <div className="text-xs text-gray-500 mb-2">
              action_type: {action.action_type}
            </div>

            {/* BLOCKED actions: show reason from API, RUN is disabled */}
            {action.status === 'BLOCKED' && action.blocked_reason && (
              <div className="text-sm text-red-700 bg-red-50 p-2 rounded mb-2">
                <div className="font-medium">blocked_reason:</div>
                <div>code: {action.blocked_reason.code}</div>
                <div>description: {action.blocked_reason.description}</div>
              </div>
            )}

            {/* RUN button: enabled only for ALLOWED, disabled during any action run */}
            <button
              onClick={() => onRunAction(action.action_id)}
              disabled={action.status === 'BLOCKED' || runningAction !== null}
              className={`px-3 py-1 text-white text-sm rounded ${
                action.status === 'ALLOWED'
                  ? 'bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {runningAction === action.action_id ? 'Running...' : 'RUN'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
