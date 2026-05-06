/**
 * DerConfigurator — uniwersalny konfigurator DER (PV/BESS/FW) z 6-7 kartami.
 *
 * Brief 2 §10/11/12. Wspólna struktura:
 *  Karta 1: Dane podstawowe
 *  Karta 2: Topologia przyłączenia
 *  Karta 3: Falowniki / PCS / Turbiny (zależnie od typu)
 *  Karta 4: Generator / plant controller / Sieć kolektorowa (FW)
 *  Karta 5: FRT/LVRT/HVRT
 *  Karta 6: NC RfG / Zgodność przyłączeniowa
 *  Karta 7: Gotowość obliczeń (PV/BESS — FW pomija ten tab gdy brak modułów)
 *
 * Faza E: kontekst stacji.
 *  Konfigurator wyświetla breadcrumb `Projekt > GPZ > Ciąg > Stacja > DER`
 *  jeśli `stationContext` został podany. Breadcrumb klikalny — nawigacja do
 *  E-13 (stacja). Kontekst zawiera connection_side, pcc_ref, bay_ref,
 *  transformer_ref, lv_busbar_ref — dane pochodzą z `useStationDerStore`.
 */

import { useMemo, useState } from 'react';

export type DerKind = 'PV' | 'BESS' | 'FW';

export type DerCardId =
  | 'basic'
  | 'topology'
  | 'inverters'
  | 'plant-controller'
  | 'frt-hvrt'
  | 'ncrfg'
  | 'readiness';

export interface DerStationContext {
  readonly stationId: string;
  readonly stationName: string;
  readonly projectName?: string;
  readonly gpzName?: string;
  readonly trunkName?: string;
  readonly connectionSide?:
    | 'SN'
    | 'nN'
    | 'dedicated_transformer'
    | 'at_zksn'
    | 'at_branch_pole'
    | 'at_cable_joint';
  readonly pccRef?: string | null;
  readonly bayRef?: string | null;
  readonly transformerRef?: string | null;
  readonly lvBusbarRef?: string | null;
  /** Wywoływane przy kliknięciu breadcrumb-a aby wrócić do E-13. */
  readonly onNavigateToStation?: () => void;
}

export interface DerConfiguratorProps {
  readonly derId: string;
  readonly derKind: DerKind;
  readonly children?: Partial<Record<DerCardId, React.ReactNode>>;
  readonly defaultCard?: DerCardId;
  /** Kontekst stacji — gdy DER jest przyłączony do konkretnej stacji. */
  readonly stationContext?: DerStationContext;
}

const CARD_LABELS_BY_KIND: Record<DerKind, Partial<Record<DerCardId, string>>> = {
  PV: {
    basic: 'Dane podstawowe',
    topology: 'Topologia przyłączenia',
    inverters: 'Falowniki',
    'plant-controller': 'Plant controller',
    'frt-hvrt': 'FRT / LVRT / HVRT',
    ncrfg: 'Zgodność przyłączeniowa',
    readiness: 'Gotowość obliczeń',
  },
  BESS: {
    basic: 'Dane podstawowe',
    topology: 'Transformator i przyłącze',
    inverters: 'PCS / falowniki',
    'plant-controller': 'Bateria + tryby pracy',
    'frt-hvrt': 'FRT / HVRT',
    ncrfg: 'Zgodność przyłączeniowa',
    readiness: 'Gotowość obliczeń',
  },
  FW: {
    basic: 'Dane podstawowe',
    topology: 'Sieć wewnętrzna farmy',
    inverters: 'Turbiny',
    'plant-controller': 'Sterowanie i regulacja',
    'frt-hvrt': 'FRT / HVRT',
    ncrfg: 'Zgodność przyłączeniowa',
    readiness: 'Gotowość obliczeń',
  },
};

const DER_KIND_LABEL_PL: Record<DerKind, string> = {
  PV: 'PV / FV',
  BESS: 'BESS',
  FW: 'Farma wiatrowa',
};

const CONNECTION_SIDE_LABEL_PL: Record<NonNullable<DerStationContext['connectionSide']>, string> = {
  SN: 'po SN',
  nN: 'po nN',
  dedicated_transformer: 'transformator dedykowany',
  at_zksn: 'na ZK SN',
  at_branch_pole: 'na słupie rozgałęźnym',
  at_cable_joint: 'na mufie kablowej',
};

export function DerConfigurator(props: DerConfiguratorProps): JSX.Element {
  const { derId, derKind, children = {}, defaultCard = 'basic', stationContext } = props;
  const labels = useMemo(() => CARD_LABELS_BY_KIND[derKind], [derKind]);
  const [activeCard, setActiveCard] = useState<DerCardId>(defaultCard);
  const cardIds = Object.keys(labels) as DerCardId[];

  return (
    <div data-testid={`der-configurator-${derId}`} data-der-kind={derKind} className="flex h-full flex-col bg-scada-panel">
      {stationContext && (
        <div
          data-testid="der-breadcrumb"
          data-station-id={stationContext.stationId}
          className="flex flex-wrap items-center gap-1.5 border-b border-scada-border bg-scada-surface px-3 py-2 text-[11px]"
        >
          <span className="text-scada-muted">Kontekst:</span>
          {stationContext.projectName && (
            <>
              <span className="font-medium text-scada-text">{stationContext.projectName}</span>
              <span className="text-scada-muted">›</span>
            </>
          )}
          {stationContext.gpzName && (
            <>
              <span className="text-scada-text">{stationContext.gpzName}</span>
              <span className="text-scada-muted">›</span>
            </>
          )}
          {stationContext.trunkName && (
            <>
              <span className="text-scada-text">{stationContext.trunkName}</span>
              <span className="text-scada-muted">›</span>
            </>
          )}
          <button
            type="button"
            onClick={stationContext.onNavigateToStation}
            data-testid="der-breadcrumb-station"
            className="rounded px-1 py-0.5 font-medium text-scada-sn hover:bg-scada-hover-nav"
            disabled={!stationContext.onNavigateToStation}
          >
            {stationContext.stationName}
          </button>
          <span className="text-scada-muted">›</span>
          <span className="font-semibold text-scada-text">
            {DER_KIND_LABEL_PL[derKind]}
          </span>
          {stationContext.connectionSide && (
            <span className="ml-auto rounded border border-scada-border bg-scada-panel px-2 py-0.5 text-[10px] text-scada-muted">
              {CONNECTION_SIDE_LABEL_PL[stationContext.connectionSide]}
            </span>
          )}
        </div>
      )}
      <nav role="tablist" className="flex shrink-0 overflow-x-auto border-b border-scada-border bg-scada-surface">
        {cardIds.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            data-testid={`der-card-tab-${id}`}
            data-active={activeCard === id}
            aria-selected={activeCard === id}
            onClick={() => setActiveCard(id)}
            className={
              'whitespace-nowrap px-3 py-2 text-xs font-medium transition-colors '
              + (activeCard === id
                ? 'border-b-2 border-scada-sn text-scada-text'
                : 'border-b-2 border-transparent text-scada-muted hover:text-scada-text')
            }
          >
            {labels[id]}
          </button>
        ))}
      </nav>

      <div data-testid={`der-card-content-${activeCard}`} className="flex-1 overflow-y-auto p-3 text-xs">
        {children[activeCard] ?? (
          <div className="italic text-scada-muted">Brak danych w sekcji "{labels[activeCard]}".</div>
        )}
      </div>
    </div>
  );
}
