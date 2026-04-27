/**
 * SettingsJustificationPanel — uzasadnienie nastaw zabezpieczeń (Pakiet G).
 *
 * 4 valid states (binding):
 *   A) ŚWIEŻY ŚLAD — nastawy z bieżącego runa (trace dostępny, wzór + dane)
 *   B) NIEAKTUALNY ŚLAD — trace istnieje, ale model się zmienił (banner + przelicz)
 *   C) RĘCZNA NASTAWA — operator wprowadził ręcznie (brak śladu)
 *   D) BRAK NASTAWY — empty state
 *
 * White box: Nigdy nie pokazujemy zmyślonego śladu — wymaga jawnego state.
 */

import { clsx } from 'clsx';

export type JustificationState =
  | { kind: 'fresh_trace'; trace_id: string; formula_latex: string; computed_at: string; margin_percent?: number }
  | { kind: 'outdated_trace'; trace_id: string; computed_at: string; on_recalculate?: () => void }
  | { kind: 'manual'; set_by: string; set_at: string; reason?: string }
  | { kind: 'empty'; on_configure?: () => void };

export interface SettingsJustificationPanelProps {
  device_id: string;
  setting_label_pl: string;
  setting_value_display: string;
  state: JustificationState;
}

function StateBadge({ state }: { state: JustificationState }) {
  const map = {
    fresh_trace: { text: 'Świeży ślad', cls: 'bg-green-700/30 text-green-300', testId: 'just-state-fresh' },
    outdated_trace: { text: 'Nieaktualny ślad', cls: 'bg-yellow-700/30 text-yellow-300', testId: 'just-state-outdated' },
    manual: { text: 'Ręczna nastawa', cls: 'bg-blue-700/30 text-blue-300', testId: 'just-state-manual' },
    empty: { text: 'Brak nastawy', cls: 'bg-scada-bg text-scada-muted', testId: 'just-state-empty' },
  };
  const m = map[state.kind];
  return (
    <span
      data-testid={m.testId}
      className={clsx('text-[10px] px-2 py-0.5 rounded uppercase tracking-wider', m.cls)}
    >
      {m.text}
    </span>
  );
}

export function SettingsJustificationPanel({
  device_id,
  setting_label_pl,
  setting_value_display,
  state,
}: SettingsJustificationPanelProps) {
  return (
    <div
      data-testid="settings-justification-panel"
      data-state-kind={state.kind}
      data-device-id={device_id}
      className="flex flex-col gap-2 p-3 bg-scada-surface border border-scada-border text-xs"
    >
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="font-semibold">{setting_label_pl}</span>
          <span className="text-scada-muted">{device_id}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-base font-bold" data-testid="just-value">
            {setting_value_display}
          </span>
          <StateBadge state={state} />
        </div>
      </div>

      {state.kind === 'fresh_trace' && (
        <div className="flex flex-col gap-1" data-testid="just-fresh-content">
          <p className="text-scada-muted">
            Wyliczono: {state.computed_at} (trace: <code>{state.trace_id}</code>)
          </p>
          <pre
            className="bg-scada-bg p-2 text-[11px] overflow-x-auto"
            data-testid="just-formula"
          >
            {state.formula_latex}
          </pre>
          {state.margin_percent !== undefined && (
            <p data-testid="just-margin">
              Margines: <strong>{state.margin_percent.toFixed(1)} %</strong>
            </p>
          )}
        </div>
      )}

      {state.kind === 'outdated_trace' && (
        <div className="flex flex-col gap-1" data-testid="just-outdated-content">
          <p className="border border-yellow-400/30 bg-yellow-700/10 p-2 rounded text-yellow-300">
            Wyniki nieaktualne — model został zmieniony po obliczeniu nastaw.
          </p>
          <p className="text-scada-muted">
            Ostatnie obliczenie: {state.computed_at} (trace: <code>{state.trace_id}</code>)
          </p>
          {state.on_recalculate && (
            <button
              type="button"
              onClick={state.on_recalculate}
              className="self-start text-xs px-3 py-1 border border-scada-border hover:bg-scada-hover-nav"
              data-testid="just-recalculate"
            >
              Przelicz nastawy
            </button>
          )}
        </div>
      )}

      {state.kind === 'manual' && (
        <div className="flex flex-col gap-1" data-testid="just-manual-content">
          <p className="text-scada-muted">
            Wprowadzono ręcznie przez: <strong>{state.set_by}</strong> ({state.set_at})
          </p>
          <p className="text-scada-muted italic">
            Brak uzasadnienia obliczeniowego — sprawdzenie audytora wymagane.
          </p>
          {state.reason && (
            <p data-testid="just-manual-reason">
              Powód: {state.reason}
            </p>
          )}
        </div>
      )}

      {state.kind === 'empty' && (
        <div className="flex flex-col gap-2" data-testid="just-empty-content">
          <p className="text-scada-muted">
            Brak nastawy. Skonfiguruj w SettingsEditor lub uruchom analizę.
          </p>
          {state.on_configure && (
            <button
              type="button"
              onClick={state.on_configure}
              className="self-start text-xs px-3 py-1 border border-scada-border hover:bg-scada-hover-nav"
              data-testid="just-configure"
            >
              Konfiguruj nastawę
            </button>
          )}
        </div>
      )}
    </div>
  );
}
