/**
 * StationConfigurator — 10-kartowy konfigurator stacji SN/nN (PR-8a).
 *
 * Brief 2 §8 — 10 kart prawa panelu dla wybranej stacji:
 *   1. Dane podstawowe (typ topologiczny + konstrukcyjny + napięcia)
 *   2. Topologia i porty (porty SN/nN + status end-to-end)
 *   3. Rozdzielnia SN
 *   4. Pola SN (lista)
 *   5. Transformator SN/nN (multi-voltage nN)
 *   6. Rozdzielnica nN (jeden lub wiele poziomów)
 *   7. Odbiory
 *   8. Zabezpieczenia i automatyka
 *   9. Pomiary
 *  10. Gotowość obliczeń (macierz 10 typów)
 */

import { useState } from 'react';

import {
  StationConfigBasicCard,
  type StationConfigBasicCardProps,
} from './cards/StationConfigBasicCard';
import {
  StationConfigTopologyCard,
  type StationConfigTopologyCardProps,
} from './cards/StationConfigTopologyCard';
import {
  StationConfigSnSwitchgearCard,
  type StationConfigSnSwitchgearCardProps,
} from './cards/StationConfigSnSwitchgearCard';
import {
  StationConfigBaysCard,
  type StationConfigBaysCardProps,
} from './cards/StationConfigBaysCard';
import {
  StationConfigTransformerCard,
  type StationConfigTransformerCardProps,
} from './cards/StationConfigTransformerCard';
import {
  StationConfigNnSwitchgearCard,
  type StationConfigNnSwitchgearCardProps,
} from './cards/StationConfigNnSwitchgearCard';
import {
  StationConfigLoadsCard,
  type StationConfigLoadsCardProps,
} from './cards/StationConfigLoadsCard';
import {
  StationConfigProtectionCard,
  type StationConfigProtectionCardProps,
} from './cards/StationConfigProtectionCard';
import {
  StationConfigMeasurementsCard,
  type StationConfigMeasurementsCardProps,
} from './cards/StationConfigMeasurementsCard';
import {
  StationConfigReadinessCard,
  type StationConfigReadinessCardProps,
} from './cards/StationConfigReadinessCard';

export type StationConfigCardId =
  | 'basic'
  | 'topology'
  | 'sn-switchgear'
  | 'bays'
  | 'transformer'
  | 'nn-switchgear'
  | 'loads'
  | 'protection'
  | 'measurements'
  | 'readiness';

export interface StationConfiguratorProps {
  readonly basic: StationConfigBasicCardProps;
  readonly topology: StationConfigTopologyCardProps;
  readonly snSwitchgear: StationConfigSnSwitchgearCardProps;
  readonly bays: StationConfigBaysCardProps;
  readonly transformer: StationConfigTransformerCardProps;
  readonly nnSwitchgear: StationConfigNnSwitchgearCardProps;
  readonly loads: StationConfigLoadsCardProps;
  readonly protection: StationConfigProtectionCardProps;
  readonly measurements: StationConfigMeasurementsCardProps;
  readonly readiness: StationConfigReadinessCardProps;
  readonly defaultCard?: StationConfigCardId;
}

const CARD_LABELS: Record<StationConfigCardId, string> = {
  basic: 'Podstawowe',
  topology: 'Topologia i porty',
  'sn-switchgear': 'Rozdzielnia SN',
  bays: 'Pola SN',
  transformer: 'Transformator SN/nN',
  'nn-switchgear': 'Rozdzielnica nN',
  loads: 'Odbiory',
  protection: 'Zabezpieczenia',
  measurements: 'Pomiary',
  readiness: 'Gotowość obliczeń',
};

export function StationConfigurator(props: StationConfiguratorProps): JSX.Element {
  const {
    basic, topology, snSwitchgear, bays, transformer, nnSwitchgear,
    loads, protection, measurements, readiness,
    defaultCard = 'basic',
  } = props;
  const [activeCard, setActiveCard] = useState<StationConfigCardId>(defaultCard);

  return (
    <div data-testid="station-configurator" className="flex h-full flex-col bg-scada-panel">
      <nav
        data-testid="station-config-nav"
        role="tablist"
        aria-label="Karty konfiguratora stacji"
        className="flex shrink-0 overflow-x-auto border-b border-scada-border bg-scada-surface"
      >
        {(Object.keys(CARD_LABELS) as StationConfigCardId[]).map((cardId) => (
          <button
            key={cardId}
            type="button"
            role="tab"
            data-testid={`station-config-tab-${cardId}`}
            data-active={activeCard === cardId}
            aria-selected={activeCard === cardId}
            onClick={() => setActiveCard(cardId)}
            className={
              'whitespace-nowrap px-3 py-2 text-xs font-medium transition-colors '
              + (activeCard === cardId
                ? 'border-b-2 border-scada-sn text-scada-text'
                : 'border-b-2 border-transparent text-scada-muted hover:text-scada-text')
            }
          >
            {CARD_LABELS[cardId]}
          </button>
        ))}
      </nav>

      <div
        data-testid={`station-config-content-${activeCard}`}
        role="tabpanel"
        className="flex-1 overflow-y-auto p-3"
      >
        {activeCard === 'basic' && <StationConfigBasicCard {...basic} />}
        {activeCard === 'topology' && <StationConfigTopologyCard {...topology} />}
        {activeCard === 'sn-switchgear' && <StationConfigSnSwitchgearCard {...snSwitchgear} />}
        {activeCard === 'bays' && <StationConfigBaysCard {...bays} />}
        {activeCard === 'transformer' && <StationConfigTransformerCard {...transformer} />}
        {activeCard === 'nn-switchgear' && <StationConfigNnSwitchgearCard {...nnSwitchgear} />}
        {activeCard === 'loads' && <StationConfigLoadsCard {...loads} />}
        {activeCard === 'protection' && <StationConfigProtectionCard {...protection} />}
        {activeCard === 'measurements' && <StationConfigMeasurementsCard {...measurements} />}
        {activeCard === 'readiness' && <StationConfigReadinessCard {...readiness} />}
      </div>
    </div>
  );
}
