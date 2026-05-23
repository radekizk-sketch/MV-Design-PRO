/**
 * ProofPackFreshnessBadge — status uzasadnienia inżynierskiego względem snapshot
 * (Etap 12 z planu).
 *
 * Trzy stany:
 * - "świeży" (fresh) — uzasadnienie zgodne z aktualnym snapshot
 * - "przeterminowany" (stale) — model się zmienił od czasu wygenerowania
 * - "wygenerowany w {date}" — informacja o czasie generacji
 */

interface ProofPackFreshnessBadgeProps {
  generatedAt: string | null;
  snapshotFingerprint: string | null;
  currentSnapshotFingerprint: string | null;
  className?: string;
}

export function ProofPackFreshnessBadge({
  generatedAt,
  snapshotFingerprint,
  currentSnapshotFingerprint,
  className,
}: ProofPackFreshnessBadgeProps) {
  if (!generatedAt) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 ${className ?? ''}`}
        data-testid="proof-freshness-not-generated"
      >
        <span aria-hidden="true">○</span>
        Nie wygenerowano
      </span>
    );
  }

  const isStale =
    snapshotFingerprint !== null
    && currentSnapshotFingerprint !== null
    && snapshotFingerprint !== currentSnapshotFingerprint;

  if (isStale) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 ${className ?? ''}`}
        data-testid="proof-freshness-stale"
        title={`Model zmieniony od czasu wygenerowania uzasadnienia (${generatedAt})`}
      >
        <span aria-hidden="true">⚠</span>
        Przeterminowany
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 ${className ?? ''}`}
      data-testid="proof-freshness-fresh"
      title={`Wygenerowane: ${formatDate(generatedAt)}`}
    >
      <span aria-hidden="true">✓</span>
      Świeży
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pl-PL', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}
