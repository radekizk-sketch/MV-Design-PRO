import { useAppStateStore } from '../../app-state/store';

const SLD_ACTIONS = [
  {
    id: 'show-topology',
    label: 'Pokaż topologię roboczą',
    description: 'Otwiera schemat jednokreskowy jako główne miejsce pracy.',
  },
  {
    id: 'show-normal-open-points',
    label: 'Pokaż punkty normalnie otwarte',
    description: 'Wskazuje rozcięcia i miejsca podziału sieci.',
  },
  {
    id: 'show-result-layers',
    label: 'Przejdź do nakładek wynikowych',
    description: 'Przenosi do obszaru wyników i analiz.',
  },
] as const;

export function SchematContextPanel() {
  const setActiveArea = useAppStateStore((s) => s.setActiveArea);
  const setActiveWorkMode = useAppStateStore((s) => s.setActiveWorkMode);

  return (
    <div
      data-testid="schemat-context-panel"
      className="flex h-full flex-col overflow-hidden bg-scada-panel"
    >
      <div className="border-b border-scada-border px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
          Schemat i topologia
        </span>
        <p className="mt-1 text-[11px] leading-snug text-scada-muted">
          Kanwa schematu jednokreskowego jest osią pracy. Wybierz obiekt na SLD,
          aby otworzyć Inspektor techniczny i menu właściwe dla typu obiektu.
        </p>
      </div>

      <div className="border-b border-scada-border bg-scada-bg px-3 py-2">
        <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
          Działania schematu
        </div>
        <div className="mt-2 flex flex-col gap-1.5">
          {SLD_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              data-testid={`schemat-action-${action.id}`}
              onClick={() => {
                if (action.id === 'show-topology') setActiveWorkMode('TE');
                if (action.id === 'show-normal-open-points') setActiveWorkMode('TP');
                if (action.id === 'show-result-layers') setActiveArea('WYNIKI_ANALIZY');
              }}
              className="rounded border border-scada-border bg-scada-surface px-2 py-1.5 text-left transition-colors hover:border-scada-sn hover:bg-scada-hover-nav"
            >
              <span className="block text-[11px] font-semibold text-scada-text">{action.label}</span>
              <span className="mt-0.5 block text-[10px] leading-snug text-scada-muted">{action.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3 text-[11px] text-scada-muted">
        <div className="rounded border border-scada-border bg-scada-surface p-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
            Stan pustej kanwy
          </div>
          <p className="mt-1 leading-snug">
            Jeżeli schemat nie ma elementów, rozpocznij od obszaru Model sieci i utwórz
            Główny Punkt Zasilający z szyną SN oraz pierwszym polem SN.
          </p>
          <button
            type="button"
            data-testid="schemat-action-go-model"
            onClick={() => setActiveArea('MODEL_SIECI')}
            className="mt-2 rounded border border-scada-sn px-2 py-1 text-[11px] font-semibold text-scada-sn hover:bg-scada-active"
          >
            Przejdź do modelu sieci
          </button>
        </div>
      </div>
    </div>
  );
}
