import { clsx } from 'clsx';
import { useAppStateStore } from '../../app-state/store';

function resultLabel(status: string): string {
  if (status === 'FRESH') return 'Wyniki aktualne';
  if (status === 'OUTDATED') return 'Wymaga ponownego obliczenia';
  return 'Wyniki nieuruchomione';
}

function resultScopeLabel(activeRunId: string | null, status: string): string {
  if (activeRunId && status === 'FRESH') return 'Aktywne wyniki obliczeń';
  if (activeRunId) return 'Wynik wybrany do analizy';
  return 'Nie wybrano wyniku';
}

export function WynikiContextPanel() {
  const activeRunId = useAppStateStore((s) => s.activeRunId);
  const resultStatus = useAppStateStore((s) => s.activeCaseResultStatus);
  const setActiveArea = useAppStateStore((s) => s.setActiveArea);
  const setActiveWorkMode = useAppStateStore((s) => s.setActiveWorkMode);
  const hasResults = resultStatus === 'FRESH' || Boolean(activeRunId);

  return (
    <div
      data-testid="wyniki-context-panel"
      className="flex h-full flex-col overflow-hidden bg-scada-panel"
    >
      <div className="border-b border-scada-border px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
          Wyniki i analizy
        </span>
        <div
          data-testid="wyniki-results-status"
          className={clsx(
            'mt-1 inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
            hasResults ? 'bg-scada-energized/15 text-scada-energized' : 'bg-scada-dead/15 text-scada-muted',
          )}
        >
          {resultLabel(resultStatus)}
        </div>
      </div>

      <div className="border-b border-scada-border bg-scada-bg px-3 py-2 text-[11px] text-scada-text">
        <div data-testid="wyniki-active-run">
          <span className="text-scada-muted">Zakres wyników: </span>
          <span data-testid="wyniki-active-run-label" className="font-semibold">
            {resultScopeLabel(activeRunId, resultStatus)}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 p-3">
        <button
          type="button"
          data-testid="wyniki-action-show-overlays"
          onClick={() => setActiveWorkMode('TW')}
          className="rounded border border-scada-border bg-scada-surface px-2 py-1.5 text-left hover:border-scada-sn hover:bg-scada-hover-nav"
        >
          <span className="block text-[11px] font-semibold text-scada-text">Pokaż nakładki wynikowe SLD</span>
          <span className="block text-[10px] text-scada-muted">Warstwa wartości i przekroczeń na schemacie jednokreskowym.</span>
        </button>
        <button
          type="button"
          data-testid="wyniki-action-proof"
          onClick={() => setActiveArea('RAPORTY_UZASADNIENIA')}
          className="rounded border border-scada-border bg-scada-surface px-2 py-1.5 text-left hover:border-scada-sn hover:bg-scada-hover-nav"
        >
          <span className="block text-[11px] font-semibold text-scada-text">Przejdź do uzasadnień i raportów</span>
          <span className="block text-[10px] text-scada-muted">Otwiera ślad obliczeń, raporty OSD i paczkę audytową.</span>
        </button>
      </div>

      {!hasResults && (
        <div className="mx-3 rounded border border-scada-border bg-scada-surface p-3 text-[11px] text-scada-muted">
          <div className="text-[10px] font-bold uppercase tracking-widest">Warunek przejścia</div>
          <p className="mt-1 leading-snug">
            Aby zobaczyć wyniki, wybierz zakres obliczeń i wykonaj analizę
            w obszarze Studia obliczeniowe.
          </p>
          <button
            type="button"
            data-testid="wyniki-action-go-studies"
            onClick={() => setActiveArea('STUDIA_OBLICZENIOWE')}
            className="mt-2 rounded border border-scada-sn px-2 py-1 text-[11px] font-semibold text-scada-sn hover:bg-scada-active"
          >
            Przejdź do studiów obliczeniowych
          </button>
        </div>
      )}
    </div>
  );
}
