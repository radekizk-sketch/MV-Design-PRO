/**
 * HiContextPanel — Panel kontekstu obszaru HI (Historia/Audyt).
 *
 * Wyświetla:
 *  - Historię uruchomień obliczeń (RunHistoryPanel)
 *  - Aktywny run + hash solver_input
 *  - Skrót do migawek (Snapshot history)
 *
 * Catalog-first, no codenames, dark SCADA palette.
 */

import { RunHistoryPanel } from '../../study-cases/RunHistoryPanel';
import { useAppStateStore } from '../../app-state/store';

export function HiContextPanel() {
  const activeRunId = useAppStateStore((s) => s.activeRunId);
  const activeSnapshotId = useAppStateStore((s) => s.activeSnapshotId);

  return (
    <div
      data-testid="hi-context-panel"
      className="flex h-full flex-col overflow-hidden bg-scada-panel"
    >
      <div className="border-b border-scada-border px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
          Historia i audyt
        </span>
        <div className="mt-1 grid grid-cols-1 gap-0.5 text-[11px] text-scada-text">
          <div data-testid="hi-active-run">
            <span className="text-scada-muted">Aktywne uruchomienie: </span>
            <span className="font-mono">{activeRunId ?? '—'}</span>
          </div>
          <div data-testid="hi-active-snapshot">
            <span className="text-scada-muted">Migawka: </span>
            <span className="font-mono">{activeSnapshotId ?? '—'}</span>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto" data-testid="hi-run-history">
        <RunHistoryPanel selectedRunId={activeRunId} />
      </div>

      <div className="shrink-0 border-t border-scada-border bg-scada-bg p-2 text-[10px] text-scada-muted">
        Każde uruchomienie ma deterministyczny hash wejścia (SHA-256). Audyt obejmuje
        wszystkie operacje na modelu — pełna ścieżka WHITE BOX.
      </div>
    </div>
  );
}
