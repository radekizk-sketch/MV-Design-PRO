/**
 * SnapshotView
 *
 * Renders GET /snapshots/{id} response 1:1.
 * No interpretation. Shows exactly what backend returns.
 *
 * CANONICAL FLOW: snapshot is the context for all actions.
 */

import type { Snapshot } from './types';

interface Props {
  snapshot: Snapshot | null;
  loading: boolean;
  error: string | null;
}

export function SnapshotView({ snapshot, loading, error }: Props) {
  if (loading) {
    return <div className="p-4 text-gray-600">Ladowanie migawki modelu...</div>;
  }

  if (error) {
    return (
      <div className="p-4 border rounded bg-red-50 border-red-200">
        <h2 className="text-lg font-semibold text-red-800 mb-2">Blad migawki modelu</h2>
        <pre className="text-sm text-red-700 whitespace-pre-wrap break-words">
          {error}
        </pre>
      </div>
    );
  }

  if (!snapshot) {
    return <div className="p-4 text-gray-500">Nie zaladowano migawki modelu</div>;
  }

  return (
    <div className="p-4 border rounded bg-white">
      <h2 className="text-lg font-semibold mb-4">Stan modelu</h2>

      <div className="space-y-4">
        <div>
          <h3 className="font-medium text-gray-700">meta</h3>
          <pre className="bg-gray-100 p-2 rounded text-sm overflow-auto max-h-40">
            {JSON.stringify(snapshot.meta, null, 2)}
          </pre>
        </div>

        <div>
          <h3 className="font-medium text-gray-700">graph</h3>
          <pre className="bg-gray-100 p-2 rounded text-sm overflow-auto max-h-60">
            {JSON.stringify(snapshot.graph, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

/**
 * @deprecated Use SnapshotView instead. Kept for backwards compatibility.
 */
export const ProjectStateView = SnapshotView;
