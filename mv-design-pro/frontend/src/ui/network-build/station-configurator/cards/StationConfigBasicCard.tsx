/**
 * Karta 1 — Dane podstawowe (PR-8a, brief 2 §8 karta 1).
 */

import type { CompletenessStatus } from '../../../inspector/v2/InspectorStickyHeader';

export type StationTopologicalType = 'końcowa' | 'przelotowa' | 'odgałęźna' | 'sekcyjna';
export type StationConstructionType = 'wnetrzowa' | 'kontenerowa' | 'slupowa' | 'prefabrykowana' | 'inna';

export interface StationConfigBasicCardProps {
  readonly stationName: string;
  readonly designation?: string;
  readonly topologicalType: StationTopologicalType;
  readonly constructionType?: StationConstructionType | null;
  readonly snVoltageKv: number;
  readonly nnVoltageLevels: readonly number[];
  readonly owner?: string;
  readonly location?: string;
  readonly completeness: CompletenessStatus;
  readonly onChange?: (changes: Partial<{
    stationName: string;
    designation: string;
    constructionType: StationConstructionType;
    owner: string;
    location: string;
  }>) => void;
}

const CONSTRUCTION_LABEL_PL: Record<StationConstructionType, string> = {
  wnetrzowa: 'wnętrzowa',
  kontenerowa: 'kontenerowa',
  slupowa: 'słupowa',
  prefabrykowana: 'prefabrykowana',
  inna: 'inna',
};

export function StationConfigBasicCard(props: StationConfigBasicCardProps): JSX.Element {
  const {
    stationName, designation, topologicalType, constructionType,
    snVoltageKv, nnVoltageLevels, owner, location, onChange,
  } = props;

  return (
    <div data-testid="station-config-basic" className="flex flex-col gap-2 text-xs">
      <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
        Dane podstawowe
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="flex flex-col">
          <span className="text-scada-muted">Nazwa stacji</span>
          <input
            data-testid="station-name-input"
            value={stationName}
            onChange={(e) => onChange?.({ stationName: e.target.value })}
            className="rounded border border-scada-border bg-scada-bg px-2 py-1 text-scada-text"
          />
        </label>
        <label className="flex flex-col">
          <span className="text-scada-muted">Oznaczenie ruchowe</span>
          <input
            data-testid="station-designation-input"
            value={designation ?? ''}
            onChange={(e) => onChange?.({ designation: e.target.value })}
            className="rounded border border-scada-border bg-scada-bg px-2 py-1 text-scada-text"
          />
        </label>
        <div>
          <span className="text-scada-muted">Typ topologiczny: </span>
          <span data-testid="station-topological-type" className="text-scada-text">{topologicalType}</span>
          <span className="ml-2 text-[10px] text-scada-muted">(wynika z portów — brief 2 §6 pkt 7)</span>
        </div>
        <label className="flex flex-col">
          <span className="text-scada-muted">Typ konstrukcyjny</span>
          <select
            data-testid="station-construction-type"
            value={constructionType ?? ''}
            onChange={(e) => onChange?.({ constructionType: e.target.value as StationConstructionType })}
            className="rounded border border-scada-border bg-scada-bg px-2 py-1 text-scada-text"
          >
            <option value="">— wybierz —</option>
            {(Object.keys(CONSTRUCTION_LABEL_PL) as StationConstructionType[]).map((t) => (
              <option key={t} value={t}>{CONSTRUCTION_LABEL_PL[t]}</option>
            ))}
          </select>
        </label>
        <div>
          <span className="text-scada-muted">Napięcie SN: </span>
          <span data-testid="station-sn-voltage" className="font-mono text-scada-text">{snVoltageKv} kV</span>
        </div>
        <div>
          <span className="text-scada-muted">Poziomy nN: </span>
          {nnVoltageLevels.length > 0 ? (
            <span data-testid="station-nn-voltages" className="font-mono text-scada-text">
              {nnVoltageLevels.join(' / ')} kV
            </span>
          ) : (
            <span className="italic text-scada-muted">—</span>
          )}
          {nnVoltageLevels.length > 1 && (
            <span className="ml-2 text-[10px] text-status-ok">
              ● multi-voltage (briefa §13)
            </span>
          )}
        </div>
        <label className="flex flex-col">
          <span className="text-scada-muted">Operator / obszar</span>
          <input
            value={owner ?? ''}
            onChange={(e) => onChange?.({ owner: e.target.value })}
            className="rounded border border-scada-border bg-scada-bg px-2 py-1 text-scada-text"
          />
        </label>
        <label className="flex flex-col">
          <span className="text-scada-muted">Lokalizacja</span>
          <input
            value={location ?? ''}
            onChange={(e) => onChange?.({ location: e.target.value })}
            className="rounded border border-scada-border bg-scada-bg px-2 py-1 text-scada-text"
          />
        </label>
      </div>
    </div>
  );
}
