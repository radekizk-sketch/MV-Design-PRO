/**
 * Karta 5 — Transformator SN/nN (multi-voltage nN, PR-8a brief §8 karta 5 + §13).
 */

export interface StationConfigTransformerRow {
  readonly transformerId: string;
  readonly designation: string;
  readonly snMva: number | null;
  readonly uhvKv: number;
  readonly ulvKv: number;
  readonly vectorGroup?: string | null;
  readonly ukPercent?: number | null;
  readonly pkKw?: number | null;
  readonly p0Kw?: number | null;
  readonly tapPosition?: number | null;
  readonly tapMin?: number | null;
  readonly tapMax?: number | null;
  readonly hvNeutralLabelPl?: string | null;
  readonly lvNeutralLabelPl?: string | null;
  readonly statusForSc: 'gotowe' | 'częściowe' | 'brak danych';
  readonly statusForPf: 'gotowe' | 'częściowe' | 'brak danych';
  readonly statusForAsymmetry: 'gotowe' | 'częściowe' | 'brak danych';
}

export interface StationConfigTransformerCardProps {
  readonly transformers: readonly StationConfigTransformerRow[];
  readonly availableLvVoltages: readonly number[];  // Multi-voltage briefa §13
  readonly onChange?: (transformerId: string, changes: Partial<StationConfigTransformerRow>) => void;
}

const STATUS_CLASS: Record<'gotowe' | 'częściowe' | 'brak danych', string> = {
  gotowe: 'text-status-ok',
  'częściowe': 'text-status-warn',
  'brak danych': 'text-status-error',
};

export function StationConfigTransformerCard(
  props: StationConfigTransformerCardProps,
): JSX.Element {
  const { transformers, availableLvVoltages, onChange } = props;

  return (
    <div data-testid="station-config-transformer" className="flex flex-col gap-3 text-xs">
      <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
        Transformatory SN/nN ({transformers.length})
      </div>

      {availableLvVoltages.length > 1 && (
        <div data-testid="multi-voltage-info" className="rounded border border-scada-border bg-scada-panel-raised px-2 py-1">
          <span className="text-status-ok">● Multi-voltage nN aktywny:</span>{' '}
          dostępne poziomy {availableLvVoltages.join(' / ')} kV (briefa §13).
        </div>
      )}

      {transformers.length === 0 ? (
        <div className="italic text-scada-muted">Brak transformatorów w stacji.</div>
      ) : (
        transformers.map((tr) => (
          <div
            key={tr.transformerId}
            data-testid={`transformer-row-${tr.transformerId}`}
            className="rounded border border-scada-border bg-scada-bg p-2"
          >
            <div className="font-medium text-scada-text">{tr.designation}</div>
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
              <label className="flex flex-col">
                <span className="text-scada-muted">Sn [MVA]</span>
                <input
                  type="number"
                  step="0.1"
                  data-testid={`tr-sn-${tr.transformerId}`}
                  value={tr.snMva ?? ''}
                  onChange={(e) => onChange?.(tr.transformerId, { snMva: Number(e.target.value) })}
                  className="rounded border border-scada-border bg-scada-bg px-1 py-0.5"
                />
              </label>
              <div>
                <span className="text-scada-muted">U_HV / U_LV: </span>
                <span className="font-mono">{tr.uhvKv} / {tr.ulvKv} kV</span>
              </div>
              <label className="flex flex-col">
                <span className="text-scada-muted">U_LV (multi-voltage)</span>
                <select
                  data-testid={`tr-ulv-${tr.transformerId}`}
                  value={tr.ulvKv}
                  onChange={(e) => onChange?.(tr.transformerId, { ulvKv: Number(e.target.value) })}
                  className="rounded border border-scada-border bg-scada-bg px-1 py-0.5"
                >
                  {availableLvVoltages.map((v) => (
                    <option key={v} value={v}>{v} kV</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col">
                <span className="text-scada-muted">Grupa połączeń</span>
                <input
                  data-testid={`tr-vector-${tr.transformerId}`}
                  value={tr.vectorGroup ?? ''}
                  onChange={(e) => onChange?.(tr.transformerId, { vectorGroup: e.target.value })}
                  className="rounded border border-scada-border bg-scada-bg px-1 py-0.5 font-mono"
                />
              </label>
              <label className="flex flex-col">
                <span className="text-scada-muted">u_k [%]</span>
                <input
                  type="number"
                  step="0.1"
                  data-testid={`tr-uk-${tr.transformerId}`}
                  value={tr.ukPercent ?? ''}
                  onChange={(e) => onChange?.(tr.transformerId, { ukPercent: Number(e.target.value) })}
                  className="rounded border border-scada-border bg-scada-bg px-1 py-0.5"
                />
              </label>
              <label className="flex flex-col">
                <span className="text-scada-muted">P_k [kW]</span>
                <input
                  type="number"
                  step="0.1"
                  value={tr.pkKw ?? ''}
                  onChange={(e) => onChange?.(tr.transformerId, { pkKw: Number(e.target.value) })}
                  className="rounded border border-scada-border bg-scada-bg px-1 py-0.5"
                />
              </label>
              <label className="flex flex-col">
                <span className="text-scada-muted">P_0 [kW]</span>
                <input
                  type="number"
                  step="0.01"
                  value={tr.p0Kw ?? ''}
                  onChange={(e) => onChange?.(tr.transformerId, { p0Kw: Number(e.target.value) })}
                  className="rounded border border-scada-border bg-scada-bg px-1 py-0.5"
                />
              </label>
              <label className="flex flex-col">
                <span className="text-scada-muted">Pozycja zaczepu</span>
                <input
                  type="number"
                  value={tr.tapPosition ?? ''}
                  onChange={(e) => onChange?.(tr.transformerId, { tapPosition: Number(e.target.value) })}
                  className="rounded border border-scada-border bg-scada-bg px-1 py-0.5"
                />
              </label>
              <div className="col-span-2 mt-1 grid grid-cols-3 gap-1 text-[10px]">
                <div>
                  <span className="text-scada-muted">Zwarcia: </span>
                  <span className={STATUS_CLASS[tr.statusForSc]}>{tr.statusForSc}</span>
                </div>
                <div>
                  <span className="text-scada-muted">Rozpływ: </span>
                  <span className={STATUS_CLASS[tr.statusForPf]}>{tr.statusForPf}</span>
                </div>
                <div>
                  <span className="text-scada-muted">Asymetria: </span>
                  <span className={STATUS_CLASS[tr.statusForAsymmetry]}>{tr.statusForAsymmetry}</span>
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
