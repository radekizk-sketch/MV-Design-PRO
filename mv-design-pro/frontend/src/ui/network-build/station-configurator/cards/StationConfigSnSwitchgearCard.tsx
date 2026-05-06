/**
 * Karta 3 — Rozdzielnia SN (PR-8a, brief 2 §8 karta 3).
 */

export type BusbarLayout = 'single_busbar' | 'sectioned_busbar' | 'simplified' | 'busbarless';

export interface StationConfigSnSwitchgearCardProps {
  readonly layout: BusbarLayout;
  readonly nominalVoltageKv: number;
  readonly nominalCurrentA?: number | null;
  readonly nominalShortCircuitKa?: number | null;
  readonly sectionsCount: number;
  readonly hasCoupler: boolean;
  readonly baysCount: number;
  readonly reservesCount: number;
  readonly readinessLabelPl: string;
  readonly onChange?: (changes: Partial<{
    layout: BusbarLayout;
    nominalCurrentA: number;
    nominalShortCircuitKa: number;
  }>) => void;
}

const LAYOUT_LABEL_PL: Record<BusbarLayout, string> = {
  single_busbar: 'Pojedynczy system szyn',
  sectioned_busbar: 'Sekcjonowany system szyn',
  simplified: 'Układ uproszczony',
  busbarless: 'Układ bezszynowy',
};

export function StationConfigSnSwitchgearCard(
  props: StationConfigSnSwitchgearCardProps,
): JSX.Element {
  const {
    layout, nominalVoltageKv, nominalCurrentA, nominalShortCircuitKa,
    sectionsCount, hasCoupler, baysCount, reservesCount, readinessLabelPl, onChange,
  } = props;

  return (
    <div data-testid="station-config-sn-switchgear" className="flex flex-col gap-2 text-xs">
      <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
        Rozdzielnia SN
      </div>

      <label className="flex flex-col">
        <span className="text-scada-muted">Typ układu</span>
        <select
          data-testid="sn-switchgear-layout"
          value={layout}
          onChange={(e) => onChange?.({ layout: e.target.value as BusbarLayout })}
          className="rounded border border-scada-border bg-scada-bg px-2 py-1 text-scada-text"
        >
          {(Object.keys(LAYOUT_LABEL_PL) as BusbarLayout[]).map((l) => (
            <option key={l} value={l}>{LAYOUT_LABEL_PL[l]}</option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-scada-muted">Napięcie znamionowe</div>
          <div className="font-mono text-scada-text">{nominalVoltageKv} kV</div>
        </div>
        <div>
          <div className="text-scada-muted">Prąd znamionowy</div>
          <input
            type="number"
            data-testid="sn-switchgear-in-a"
            value={nominalCurrentA ?? ''}
            onChange={(e) => onChange?.({ nominalCurrentA: Number(e.target.value) })}
            className="w-full rounded border border-scada-border bg-scada-bg px-2 py-0.5 text-scada-text"
          />
        </div>
        <div>
          <div className="text-scada-muted">Prąd zwarciowy znamionowy</div>
          <input
            type="number"
            step="0.1"
            data-testid="sn-switchgear-isc-ka"
            value={nominalShortCircuitKa ?? ''}
            onChange={(e) => onChange?.({ nominalShortCircuitKa: Number(e.target.value) })}
            className="w-full rounded border border-scada-border bg-scada-bg px-2 py-0.5 text-scada-text"
          />
          <span className="text-[10px] text-scada-muted">kA</span>
        </div>
        <div>
          <div className="text-scada-muted">Sekcje</div>
          <div className="font-mono text-scada-text">{sectionsCount}</div>
        </div>
        <div>
          <div className="text-scada-muted">Sprzęgło sekcyjne</div>
          <div className={hasCoupler ? 'text-status-ok' : 'text-scada-muted italic'}>
            {hasCoupler ? '✓ obecne' : 'brak'}
          </div>
        </div>
        <div>
          <div className="text-scada-muted">Pola</div>
          <div className="font-mono text-scada-text">{baysCount}</div>
        </div>
        <div>
          <div className="text-scada-muted">Rezerwy</div>
          <div className="font-mono text-scada-text">{reservesCount}</div>
        </div>
        <div>
          <div className="text-scada-muted">Status gotowości</div>
          <div className="text-scada-text">{readinessLabelPl}</div>
        </div>
      </div>
    </div>
  );
}
