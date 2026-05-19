/**
 * Uniwersalny konfigurator DER dla E-21/E-22/E-23.
 *
 * Karty są inżynierskie: pokazują falownik lub PCS, punkt przyłączenia,
 * wymagania NC RfG, FRT/HVRT, kontrolę obliczeń i zabezpieczenia. Brak danych
 * jest jawnie nazwany, nigdy nie jest zastępowany zerem.
 */

import { useMemo, useState, type ReactNode } from 'react';

import type { GeneratorConnectionVariant } from '../../../types/enm';

import { DerPccVariantInfo } from './DerPccVariantInfo';

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
  readonly onNavigateToStation?: () => void;
}

export interface DerConfiguratorProps {
  readonly derId: string;
  readonly derKind: DerKind;
  readonly children?: Partial<Record<DerCardId, ReactNode>>;
  readonly defaultCard?: DerCardId;
  readonly stationContext?: DerStationContext;
  /** Wariant przyłączenia DER do PCC (goal §13). null → blocker
   *  `generator.connection_variant_missing` widoczny w karcie „Tor przyłączenia". */
  readonly connectionVariant?: GeneratorConnectionVariant | null;
  /** Referencja stacji (wymagana dla wariantów nn_side / LV_BEHIND_STATION_TRANSFORMER). */
  readonly stationRef?: string | null;
  /** Referencja transformatora blokowego (wymagana dla block_transformer). */
  readonly blockingTransformerRef?: string | null;
}

const CARD_LABELS_BY_KIND: Record<DerKind, Partial<Record<DerCardId, string>>> = {
  PV: {
    basic: 'Dane podstawowe',
    topology: 'Tor przyłączenia',
    inverters: 'Falownik z katalogu',
    'plant-controller': 'Regulacja PV',
    'frt-hvrt': 'FRT / LVRT / HVRT',
    ncrfg: 'Zgodność przyłączeniowa',
    readiness: 'Zakres obliczeń',
  },
  BESS: {
    basic: 'Dane podstawowe',
    topology: 'Transformator i przyłącze',
    inverters: 'PCS / falowniki',
    'plant-controller': 'Bateria i tryby pracy',
    'frt-hvrt': 'FRT / HVRT',
    ncrfg: 'Zgodność przyłączeniowa',
    readiness: 'Zakres obliczeń',
  },
  FW: {
    basic: 'Dane podstawowe',
    topology: 'Sieć wewnętrzna farmy',
    inverters: 'Turbiny',
    'plant-controller': 'Sterowanie i regulacja',
    'frt-hvrt': 'FRT / HVRT',
    ncrfg: 'Zgodność przyłączeniowa',
    readiness: 'Zakres obliczeń',
  },
};

const DER_KIND_LABEL_PL: Record<DerKind, string> = {
  PV: 'PV / FV',
  BESS: 'BESS',
  FW: 'Farma wiatrowa',
};

const CONNECTION_SIDE_LABEL_PL: Record<NonNullable<DerStationContext['connectionSide']>, string> = {
  SN: 'po stronie SN',
  nN: 'po stronie nN',
  dedicated_transformer: 'transformator dedykowany',
  at_zksn: 'na ZK SN',
  at_branch_pole: 'na słupie rozgałęźnym',
  at_cable_joint: 'na mufie kablowej',
};

const DEFAULT_CARD_HINTS: Record<DerKind, Record<DerCardId, readonly string[]>> = {
  PV: {
    basic: [
      'Wybierz falownik PV z katalogu i określ moc AC instalacji.',
      'Wskaż, czy PV pracuje po stronie nN za transformatorem SN/nN, po SN, czy przez transformator dedykowany.',
    ],
    topology: [
      'Powiąż PCC z szyną, polem SN albo szyną nN stacji.',
      'Dla PV po nN wymagany jest tor: pole SN, transformator SN/nN, szyna nN, wyłącznik nN, zabezpieczenie i falownik.',
    ],
    inverters: [
      'Falownik musi pochodzić z katalogu: producent, moc, napięcie AC i wkład zwarciowy.',
      'Nie wpisuj parametrów z ręki, jeżeli istnieje pozycja katalogowa.',
    ],
    'plant-controller': [
      'Ustaw Q(U), P(f), cos phi i ewentualne ograniczenie eksportu.',
      'Regulacja ma być zgodna z wybranym profilem operatora.',
    ],
    'frt-hvrt': [
      'Wybierz krzywe LVRT i HVRT oraz model dynamiczny falownika.',
      'Skonfiguruj model dynamiczny, aby wykonać pełną ocenę FRT/HVRT.',
    ],
    ncrfg: [
      'Wybierz profil NC RfG operatora i moduł A/B/C/D.',
      'Sprawdź minimalną moc zwarciową w PCC oraz wymagania Q(U) i P(f).',
    ],
    readiness: [
      'Kontrola wymaga PCC, falownika, profilu NC RfG, FRT/HVRT, danych zwarciowych i zabezpieczenia.',
      'Wskazania prowadzą do konkretnego pola konfiguracji.',
    ],
  },
  BESS: {
    basic: [
      'Wybierz PCS i baterię z katalogu.',
      'Określ moc ładowania, moc rozładowania, pojemność i SoC.',
    ],
    topology: [
      'Powiąż PCS z PCC i właściwym poziomem napięcia.',
      'Wariant nN wymaga szyny nN i wyłącznika źródłowego.',
    ],
    inverters: [
      'PCS musi mieć napięcie zgodne z punktem przyłączenia.',
      'Tryb grid-forming musi pochodzić z katalogu PCS.',
    ],
    'plant-controller': [
      'Wybierz tryby pracy BESS: ładowanie, rozładowanie, czuwanie, FCR lub Q(U).',
    ],
    'frt-hvrt': ['Wybierz FRT/HVRT i model dynamiczny PCS.'],
    ncrfg: ['Wybierz profil NC RfG operatora i sprawdź zakres pracy P/Q.'],
    readiness: ['Wybierz PCS, baterię, PCC i profil NC RfG, aby uruchomić obliczenia.'],
  },
  FW: {
    basic: [
      'Wybierz turbinę i liczbę jednostek z katalogu.',
      'Określ moc farmy i punkt przyłączenia.',
    ],
    topology: ['Powiąż farmę z polem SN, transformatorem albo siecią kolektorową.'],
    inverters: ['Turbina musi mieć katalogowy model generatora i wkład zwarciowy.'],
    'plant-controller': ['Wybierz regulator farmy, Q(U), P(f) i ograniczenia mocy.'],
    'frt-hvrt': ['Wybierz FRT/HVRT i model dynamiczny PMSG/DFIG/SCIG.'],
    ncrfg: ['Wybierz profil NC RfG oraz moduł B/C/D według mocy.'],
    readiness: ['Wybierz turbinę, PCC, model dynamiczny i zabezpieczenia, aby uruchomić pełną analizę.'],
  },
};

export function DerConfigurator(props: DerConfiguratorProps): JSX.Element {
  const {
    derId,
    derKind,
    children = {},
    defaultCard = 'basic',
    stationContext,
    connectionVariant,
    stationRef,
    blockingTransformerRef,
  } = props;
  const labels = useMemo(() => CARD_LABELS_BY_KIND[derKind], [derKind]);
  const [activeCard, setActiveCard] = useState<DerCardId>(defaultCard);
  const cardIds = Object.keys(labels) as DerCardId[];

  const hasPccProps =
    connectionVariant !== undefined
    || stationRef !== undefined
    || blockingTransformerRef !== undefined;
  const showPccInfo = activeCard === 'topology' && hasPccProps && !children.topology;

  return (
    <div
      data-testid={`der-configurator-${derId}`}
      data-der-kind={derKind}
      className="flex h-full flex-col bg-scada-panel"
    >
      {stationContext && <DerBreadcrumb stationContext={stationContext} derKind={derKind} />}

      <nav
        role="tablist"
        className="flex shrink-0 overflow-x-auto border-b border-scada-border bg-scada-surface"
      >
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
        {showPccInfo && (
          <DerPccVariantInfo
            connectionVariant={connectionVariant ?? null}
            stationRef={stationRef ?? null}
            blockingTransformerRef={blockingTransformerRef ?? null}
            className="mb-3"
          />
        )}
        {children[activeCard] ?? <DefaultCard derKind={derKind} cardId={activeCard} />}
      </div>
    </div>
  );
}

function DerBreadcrumb({
  stationContext,
  derKind,
}: {
  readonly stationContext: DerStationContext;
  readonly derKind: DerKind;
}) {
  return (
    <div
      data-testid="der-breadcrumb"
      data-station-id={stationContext.stationId}
      className="flex flex-wrap items-center gap-1.5 border-b border-scada-border bg-scada-surface px-3 py-2 text-[11px]"
    >
      <span className="text-scada-muted">Kontekst:</span>
      {stationContext.projectName && (
        <>
          <span className="font-medium text-scada-text">{stationContext.projectName}</span>
          <span className="text-scada-muted">{'>'}</span>
        </>
      )}
      {stationContext.gpzName && (
        <>
          <span className="text-scada-text">{stationContext.gpzName}</span>
          <span className="text-scada-muted">{'>'}</span>
        </>
      )}
      {stationContext.trunkName && (
        <>
          <span className="text-scada-text">{stationContext.trunkName}</span>
          <span className="text-scada-muted">{'>'}</span>
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
      <span className="text-scada-muted">{'>'}</span>
      <span className="font-semibold text-scada-text">
        {DER_KIND_LABEL_PL[derKind]}
      </span>
      {stationContext.connectionSide && (
        <span className="ml-auto rounded border border-scada-border bg-scada-panel px-2 py-0.5 text-[10px] text-scada-muted">
          {CONNECTION_SIDE_LABEL_PL[stationContext.connectionSide]}
        </span>
      )}
    </div>
  );
}

function DefaultCard({
  derKind,
  cardId,
}: {
  readonly derKind: DerKind;
  readonly cardId: DerCardId;
}) {
  return (
    <div
      data-testid="der-card-engineering-guidance"
      className="rounded border border-scada-border bg-scada-surface p-3 text-scada-text"
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-scada-muted">
        Dane wymagane
      </div>
      <ul className="mt-2 space-y-1.5 text-[12px] leading-5">
        {DEFAULT_CARD_HINTS[derKind][cardId].map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-scada-sn" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default DerConfigurator;
