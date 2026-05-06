/**
 * Karta 4 — Pola SN (lista) (PR-8a, brief 2 §8 karta 4).
 */

export type BayTypePl =
  | 'liniowe wejściowe'
  | 'liniowe wyjściowe'
  | 'transformatorowe'
  | 'pomiarowe'
  | 'sprzęgłowe'
  | 'sekcyjne'
  | 'PV/FV'
  | 'BESS'
  | 'FW'
  | 'rezerwowe'
  | 'potrzeb własnych';

export interface StationConfigBayRow {
  readonly bayId: string;
  readonly designation: string;
  readonly bayTypePl: BayTypePl;
  readonly attachedObjectPl?: string;
  readonly hasEquipment: boolean;
  readonly hasProtection: boolean;
  readonly hasMeasurements: boolean;
  readonly statusPl: 'kompletne' | 'częściowe' | 'brak danych';
}

export interface StationConfigBaysCardProps {
  readonly bays: readonly StationConfigBayRow[];
  readonly onOpenBay?: (bayId: string) => void;
  readonly onShowOnSld?: (bayId: string) => void;
  readonly onCopyConfig?: (bayId: string) => void;
  readonly onDeleteBay?: (bayId: string) => void;
}

const STATUS_CLASS: Record<StationConfigBayRow['statusPl'], string> = {
  kompletne: 'text-status-ok',
  'częściowe': 'text-status-warn',
  'brak danych': 'text-status-error',
};

export function StationConfigBaysCard(props: StationConfigBaysCardProps): JSX.Element {
  const { bays, onOpenBay, onShowOnSld, onCopyConfig, onDeleteBay } = props;

  return (
    <div data-testid="station-config-bays" className="flex flex-col gap-2 text-xs">
      <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
        Pola SN ({bays.length})
      </div>
      {bays.length === 0 ? (
        <div className="italic text-scada-muted">Brak pól w stacji.</div>
      ) : (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-scada-border text-scada-muted">
              <th className="text-left">Oznaczenie</th>
              <th className="text-left">Typ</th>
              <th className="text-left">Powiązany obiekt</th>
              <th className="text-center">A/Z/P</th>
              <th className="text-left">Status</th>
              <th className="text-right">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {bays.map((b) => (
              <tr
                key={b.bayId}
                data-testid={`station-config-bay-row-${b.bayId}`}
                className="border-b border-scada-border/40"
              >
                <td className="font-mono">{b.designation}</td>
                <td>{b.bayTypePl}</td>
                <td>{b.attachedObjectPl ?? <span className="italic text-scada-muted">—</span>}</td>
                <td className="text-center font-mono text-[10px]">
                  <span className={b.hasEquipment ? 'text-status-ok' : 'text-scada-muted'}>A</span>
                  /
                  <span className={b.hasProtection ? 'text-status-ok' : 'text-scada-muted'}>Z</span>
                  /
                  <span className={b.hasMeasurements ? 'text-status-ok' : 'text-scada-muted'}>P</span>
                </td>
                <td className={STATUS_CLASS[b.statusPl]}>{b.statusPl}</td>
                <td className="text-right">
                  <div className="flex justify-end gap-1">
                    {onOpenBay && (
                      <button
                        data-testid={`bay-open-${b.bayId}`}
                        onClick={() => onOpenBay(b.bayId)}
                        className="rounded border border-scada-border px-1 py-0.5 text-[10px] hover:bg-scada-active"
                      >
                        otwórz
                      </button>
                    )}
                    {onShowOnSld && (
                      <button
                        data-testid={`bay-show-sld-${b.bayId}`}
                        onClick={() => onShowOnSld(b.bayId)}
                        className="rounded border border-scada-border px-1 py-0.5 text-[10px] hover:bg-scada-active"
                      >
                        SLD
                      </button>
                    )}
                    {onCopyConfig && (
                      <button
                        data-testid={`bay-copy-${b.bayId}`}
                        onClick={() => onCopyConfig(b.bayId)}
                        className="rounded border border-scada-border px-1 py-0.5 text-[10px] hover:bg-scada-active"
                      >
                        kopiuj
                      </button>
                    )}
                    {onDeleteBay && (
                      <button
                        data-testid={`bay-delete-${b.bayId}`}
                        onClick={() => onDeleteBay(b.bayId)}
                        className="rounded border border-scada-border px-1 py-0.5 text-[10px] text-status-error hover:bg-scada-active"
                      >
                        usuń
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
