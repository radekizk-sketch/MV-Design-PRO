/**
 * Karta 1 — Dane podstawowe (PR-8a, brief 2 §8 karta 1).
 *
 * Pakiet H: wybór typu uziemienia neutralnego SN z `MV_NEUTRAL_GROUNDING_CATALOG`
 * (Naprawa B.1 — wymagane do walidacji 67N i SC1F oraz VT voltage_factor eng.20).
 */

import { MV_NEUTRAL_GROUNDING_CATALOG } from '../../station-der/catalogs';
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
  /** Pakiet H: catalog_ref do typu uziemienia neutralnego SN. */
  readonly mvNeutralGroundingRef?: string | null;
  readonly onChange?: (changes: Partial<{
    stationName: string;
    designation: string;
    constructionType: StationConstructionType;
    owner: string;
    location: string;
    mvNeutralGroundingRef: string | null;
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
    snVoltageKv, nnVoltageLevels, owner, location, mvNeutralGroundingRef, onChange,
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
        {/* Pakiet H: typ uziemienia neutralnego SN (z katalogu). */}
        <label className="flex flex-col">
          <span className="text-scada-muted">Uziemienie neutralne SN (z katalogu)</span>
          <select
            data-testid="station-mv-neutral-grounding"
            value={mvNeutralGroundingRef ?? ''}
            onChange={(e) =>
              onChange?.({ mvNeutralGroundingRef: e.target.value || null })
            }
            className="rounded border border-scada-border bg-scada-bg px-2 py-1 text-scada-text"
          >
            <option value="">— wybierz —</option>
            {MV_NEUTRAL_GROUNDING_CATALOG.map((g) => (
              <option key={g.id} value={g.id}>{g.label_pl}</option>
            ))}
          </select>
          {mvNeutralGroundingRef && (() => {
            const g = MV_NEUTRAL_GROUNDING_CATALOG.find((x) => x.id === mvNeutralGroundingRef);
            if (!g) return null;
            const requires67N = g.grounding_type === 'isolated' || g.grounding_type === 'petersen_coil';
            return (
              <div className="mt-1 rounded bg-scada-panel-raised px-2 py-1 text-[10px] text-scada-text">
                Typ: {g.grounding_type} · I_k1 [{g.typical_ik1_a_range.min}-{g.typical_ik1_a_range.max} A]
                · Wymagane 67N: {requires67N ? 'tak' : 'nie'}
              </div>
            );
          })()}
        </label>
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
