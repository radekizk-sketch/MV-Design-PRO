/**
 * Odbiory nN stacji — tabela odbiorów domeny nN z projekcji backendu (`stronaNnStacji.ts`).
 *
 * Kolumny wyłącznie z modelu: nazwa, szyna przyłączenia, P, Q. Dawne kolumny cos φ, kategorii
 * zasilania i statusu „P/U” nie miały źródła w modelu odbioru (`Load`) — usunięte (zero
 * fabrykacji); cos φ wyprowadzony z P i Q byłby obliczeniem w warstwie prezentacji.
 */

export interface LoadRow {
  readonly loadId: string;
  readonly name: string;
  readonly attachmentPointPl: string;
  readonly pMw: number;
  readonly qMvar: number;
}

export interface StationConfigLoadsCardProps {
  readonly loads: readonly LoadRow[];
  /** Komunikat zamiast pustej tabeli, gdy dane domeny nN nie są (jeszcze) dostępne. */
  readonly komunikatBrakuPl?: string;
}

export function StationConfigLoadsCard(props: StationConfigLoadsCardProps): JSX.Element {
  const { loads, komunikatBrakuPl } = props;

  return (
    <div data-testid="station-config-loads" className="flex flex-col gap-2 text-xs">
      <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
        Odbiory ({loads.length})
      </div>
      {loads.length === 0 ? (
        <div className="italic text-scada-muted">
          {komunikatBrakuPl ?? 'Domena nN tej stacji nie ma odbiorów — dodaj odbiór z menu odpływu nN.'}
        </div>
      ) : (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-scada-border text-scada-muted">
              <th className="text-left">Nazwa</th>
              <th className="text-left">Szyna przyłączenia</th>
              <th className="text-right">P [MW]</th>
              <th className="text-right">Q [Mvar]</th>
            </tr>
          </thead>
          <tbody>
            {loads.map((l) => (
              <tr key={l.loadId} data-testid={`load-row-${l.loadId}`} className="border-b border-scada-border/40">
                <td>{l.name}</td>
                <td>{l.attachmentPointPl}</td>
                <td className="text-right font-mono">{l.pMw.toFixed(3)}</td>
                <td className="text-right font-mono">{l.qMvar.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
