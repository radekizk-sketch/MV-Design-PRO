/**
 * Karta 6 — Rozdzielnica nN (multi-voltage, PR-8a brief §8 karta 6).
 */

export interface NnSwitchgearRow {
  readonly designation: string;
  readonly nnVoltageKv: number;
  readonly sectionsCount: number;
  readonly feedersCount: number;
  readonly loadsCount: number;
  readonly pvNnCount: number;
  readonly bessNnCount: number;
  readonly pBalanceMw?: number | null;
  readonly qBalanceMvar?: number | null;
  readonly statusPl: 'kompletne' | 'częściowe' | 'brak danych';
}

export interface StationConfigNnSwitchgearCardProps {
  readonly switchgears: readonly NnSwitchgearRow[];
}

const STATUS_CLASS: Record<NnSwitchgearRow['statusPl'], string> = {
  kompletne: 'text-status-ok',
  'częściowe': 'text-status-warn',
  'brak danych': 'text-status-error',
};

export function StationConfigNnSwitchgearCard(
  props: StationConfigNnSwitchgearCardProps,
): JSX.Element {
  const { switchgears } = props;

  return (
    <div data-testid="station-config-nn-switchgear" className="flex flex-col gap-2 text-xs">
      <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
        Rozdzielnice nN ({switchgears.length})
      </div>
      {switchgears.length === 0 ? (
        <div className="italic text-scada-muted">Brak rozdzielnic nN.</div>
      ) : (
        switchgears.map((sw) => (
          <div
            key={sw.designation}
            data-testid={`nn-switchgear-${sw.designation}`}
            className="rounded border border-scada-border bg-scada-bg p-2"
          >
            <div className="flex items-baseline justify-between">
              <span className="font-medium text-scada-text">{sw.designation}</span>
              <span className="font-mono text-scada-text">{sw.nnVoltageKv} kV</span>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
              <div><span className="text-scada-muted">Sekcje: </span>{sw.sectionsCount}</div>
              <div><span className="text-scada-muted">Odpływy: </span>{sw.feedersCount}</div>
              <div><span className="text-scada-muted">Odbiory: </span>{sw.loadsCount}</div>
              <div><span className="text-scada-muted">PV po nN: </span>{sw.pvNnCount}</div>
              <div><span className="text-scada-muted">BESS po nN: </span>{sw.bessNnCount}</div>
              <div>
                <span className="text-scada-muted">Status: </span>
                <span className={STATUS_CLASS[sw.statusPl]}>{sw.statusPl}</span>
              </div>
              {sw.pBalanceMw !== null && sw.pBalanceMw !== undefined && (
                <div className="col-span-2">
                  <span className="text-scada-muted">Bilans P/Q: </span>
                  <span className="font-mono">
                    {sw.pBalanceMw.toFixed(3)} MW / {(sw.qBalanceMvar ?? 0).toFixed(3)} Mvar
                  </span>
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
