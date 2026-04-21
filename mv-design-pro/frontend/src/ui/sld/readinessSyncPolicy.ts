export type ReadinessRefreshDecision =
  | { kind: 'by_revision'; revision: number }
  | { kind: 'fallback' }
  | { kind: 'skip' };

interface SnapshotHeaderLike {
  revision?: unknown;
}

interface SnapshotLike {
  header?: SnapshotHeaderLike | null;
}

/**
 * Kanoniczna decyzja, czy SLD ma odpytać backend gotowości po odświeżeniu snapshotu.
 * Brak snapshotu oznacza blokadę warsztatową, a nie błąd backend readiness.
 */
export function resolveReadinessRefreshDecision(
  snapshot: SnapshotLike | null | undefined,
): ReadinessRefreshDecision {
  if (!snapshot || typeof snapshot !== 'object') {
    return { kind: 'skip' };
  }

  const revision = snapshot.header?.revision;
  if (typeof revision === 'number') {
    return { kind: 'by_revision', revision };
  }

  return { kind: 'fallback' };
}
