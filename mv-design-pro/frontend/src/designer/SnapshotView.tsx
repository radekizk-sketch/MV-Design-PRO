/**
 * SnapshotView — UI_INTEGRATION_E2E Stub
 *
 * CANONICAL: Displays snapshot metadata.
 * This is a stub implementation for build compatibility.
 */

import type { Snapshot } from './types';

interface Props {
  snapshot: Snapshot | null;
  loading: boolean;
  error: string | null;
}

export function SnapshotView({ snapshot, loading, error }: Props) {
  if (loading) {
    return (
      <div className="p-4 border rounded bg-white">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border border-red-300 rounded bg-red-50 text-red-700">
        <div className="font-medium">Błąd ładowania migawki</div>
        <div className="text-sm mt-1">{error}</div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="p-4 border rounded bg-white text-gray-500">
        Wybierz migawkę, aby wyświetlić szczegóły.
      </div>
    );
  }

  return (
    <div className="p-4 border rounded bg-white">
      <h3 className="font-semibold text-gray-900 mb-2">Stan modelu</h3>
      <dl className="text-sm space-y-1">
        <div className="flex gap-2">
          <dt className="text-gray-500">ID:</dt>
          <dd className="font-mono text-xs">{snapshot.meta.snapshot_id}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-gray-500">Wersja schematu:</dt>
          <dd>{snapshot.meta.schema_version}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-gray-500">Utworzono:</dt>
          <dd>{new Date(snapshot.meta.created_at).toLocaleString('pl-PL')}</dd>
        </div>
        {snapshot.meta.parent_snapshot_id && (
          <div className="flex gap-2">
            <dt className="text-gray-500">Rodzic:</dt>
            <dd className="font-mono text-xs">{snapshot.meta.parent_snapshot_id}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
