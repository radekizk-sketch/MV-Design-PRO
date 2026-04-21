import { useMemo } from 'react';

import { isOperationalBus } from '../shared/enmVisibility';
import { useSnapshotStore } from './snapshotStore';

/**
 * Kanoniczne statystyki modelu dla shell-a V12.5.
 * Bez zależności od legacy drzewa projektu.
 */
export function useNetworkStats(): { nodeCount: number; branchCount: number } {
  const snapshot = useSnapshotStore((state) => state.snapshot);

  return useMemo(() => {
    if (!snapshot) {
      return { nodeCount: 0, branchCount: 0 };
    }

    return {
      nodeCount: (snapshot.buses ?? []).filter((bus) => isOperationalBus(bus)).length,
      branchCount: (snapshot.branches ?? []).length + (snapshot.transformers ?? []).length,
    };
  }, [snapshot]);
}

export default useNetworkStats;
