/**
 * Karta 7 — Odbiory (PR-8a, brief §8 karta 7).
 */

export interface LoadRow {
  readonly loadId: string;
  readonly name: string;
  readonly attachmentPointPl: string;
  readonly pMw: number | null;
  readonly qMvar: number | null;
  readonly cosPhi?: number | null;
  readonly priority?: 'I' | 'II' | 'III' | null;
  readonly statusForPf: 'gotowe' | 'częściowe' | 'brak danych';
  readonly statusForVoltage: 'gotowe' | 'częściowe' | 'brak danych';
}

export interface StationConfigLoadsCardProps {
  readonly loads: readonly LoadRow[];
}

const STATUS_CLASS: Record<'gotowe' | 'częściowe' | 'brak danych', string> = {
  gotowe: 'text-status-ok',
  'częściowe': 'text-status-warn',
  'brak danych': 'text-status-error',
};

export function StationConfigLoadsCard(props: StationConfigLoadsCardProps): JSX.Element {
  const { loads } = props;

  return (
    <div data-testid="station-config-loads" className="flex flex-col gap-2 text-xs">
      <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
        Odbiory ({loads.length})
      </div>
      {loads.length === 0 ? (
        <div className="italic text-scada-muted">
          Odbiory nN dodaje się z wariantu stacji albo z karty rozdzielnicy nN.
        </div>
      ) : (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-scada-border text-scada-muted">
              <th className="text-left">Nazwa</th>
              <th className="text-left">Punkt przyłączenia</th>
              <th className="text-right">P [MW]</th>
              <th className="text-right">Q [Mvar]</th>
              <th className="text-right">cos φ</th>
              <th className="text-center">Kat.</th>
              <th className="text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {loads.map((l) => (
              <tr key={l.loadId} data-testid={`load-row-${l.loadId}`} className="border-b border-scada-border/40">
                <td>{l.name}</td>
                <td>{l.attachmentPointPl}</td>
                <td className="text-right font-mono">{l.pMw !== null ? l.pMw.toFixed(3) : '—'}</td>
                <td className="text-right font-mono">{l.qMvar !== null ? l.qMvar.toFixed(3) : '—'}</td>
                <td className="text-right font-mono">{l.cosPhi !== null && l.cosPhi !== undefined ? l.cosPhi.toFixed(2) : '—'}</td>
                <td className="text-center">{l.priority ?? '—'}</td>
                <td>
                  <span className={STATUS_CLASS[l.statusForPf]}>P</span>
                  /
                  <span className={STATUS_CLASS[l.statusForVoltage]}>U</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
