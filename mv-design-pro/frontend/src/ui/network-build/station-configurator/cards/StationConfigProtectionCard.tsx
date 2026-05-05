/**
 * Karta 8 — Zabezpieczenia i automatyka (PR-8a, brief §8 karta 8).
 */

export interface ProtectionRow {
  readonly relayId: string;
  readonly bayDesignation: string;
  readonly typePl: string;
  readonly functionsPl: readonly string[];  // np. ["50/51", "51N", "67"]
  readonly settingsCount: number;
  readonly selectivityStatus: 'kompletna' | 'częściowa' | 'błędna' | 'brak danych';
}

export interface AutomationFlag {
  readonly id: string;
  readonly labelPl: string;
  readonly enabled: boolean;
}

export interface StationConfigProtectionCardProps {
  readonly relays: readonly ProtectionRow[];
  readonly automation: readonly AutomationFlag[];
  readonly interlocksConfigured: boolean;
  readonly controlMode?: 'lokalne' | 'zdalne' | 'lokalne_zablokowane' | 'odstawione';
}

const SELECTIVITY_CLASS: Record<ProtectionRow['selectivityStatus'], string> = {
  kompletna: 'text-status-ok',
  'częściowa': 'text-status-warn',
  błędna: 'text-status-error',
  'brak danych': 'text-scada-muted',
};

export function StationConfigProtectionCard(
  props: StationConfigProtectionCardProps,
): JSX.Element {
  const { relays, automation, interlocksConfigured, controlMode } = props;

  return (
    <div data-testid="station-config-protection" className="flex flex-col gap-2 text-xs">
      <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
        Zabezpieczenia i automatyka
      </div>

      <div data-testid="protection-relays-list">
        <div className="text-[10px] font-medium text-scada-muted">Przekaźniki ({relays.length})</div>
        {relays.length === 0 ? (
          <div className="italic text-scada-muted">Brak zabezpieczeń.</div>
        ) : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-scada-border text-scada-muted">
                <th className="text-left">Pole</th>
                <th className="text-left">Typ</th>
                <th className="text-left">Funkcje</th>
                <th className="text-right">Nastawy</th>
                <th className="text-left">Selektywność</th>
              </tr>
            </thead>
            <tbody>
              {relays.map((r) => (
                <tr key={r.relayId} data-testid={`relay-row-${r.relayId}`} className="border-b border-scada-border/40">
                  <td className="font-mono">{r.bayDesignation}</td>
                  <td>{r.typePl}</td>
                  <td className="font-mono text-[10px]">{r.functionsPl.join(', ')}</td>
                  <td className="text-right font-mono">{r.settingsCount}</td>
                  <td className={SELECTIVITY_CLASS[r.selectivityStatus]}>
                    {r.selectivityStatus}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div data-testid="protection-automation">
        <div className="text-[10px] font-medium text-scada-muted">Automatyka</div>
        <div className="grid grid-cols-2 gap-1">
          {automation.map((a) => (
            <div
              key={a.id}
              data-testid={`automation-${a.id}`}
              className={`rounded border border-scada-border px-2 py-1 ${a.enabled ? 'text-status-ok' : 'text-scada-muted'}`}
            >
              {a.enabled ? '✓' : '○'} {a.labelPl}
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-between border-t border-scada-border pt-1.5 text-[11px]">
        <div>
          <span className="text-scada-muted">Blokady łączeniowe: </span>
          <span className={interlocksConfigured ? 'text-status-ok' : 'text-status-warn'}>
            {interlocksConfigured ? 'skonfigurowane' : 'brak'}
          </span>
        </div>
        <div>
          <span className="text-scada-muted">Sterowanie: </span>
          <span className="text-scada-text">{controlMode ?? '—'}</span>
        </div>
      </div>
    </div>
  );
}
