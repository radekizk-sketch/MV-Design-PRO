/**
 * DerConfigurator — uniwersalny konfigurator DER (PV/BESS/FW) z 6-7 kartami (PR-9/10/11).
 *
 * Brief 2 §10/11/12. Wspólna struktura:
 *  Karta 1: Dane podstawowe
 *  Karta 2: Topologia przyłączenia
 *  Karta 3: Falowniki / PCS / Turbiny (zależnie od typu)
 *  Karta 4: Generator / plant controller / Sieć kolektorowa (FW)
 *  Karta 5: FRT/LVRT/HVRT
 *  Karta 6: NC RfG / Zgodność przyłączeniowa
 *  Karta 7: Gotowość obliczeń (PV/BESS — FW pomija ten tab gdy brak modułów)
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

export interface DerConfiguratorProps {
  readonly derId: string;
  readonly derKind: DerKind;
  readonly children?: Partial<Record<DerCardId, React.ReactNode>>;
  readonly defaultCard?: DerCardId;
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

export function DerConfigurator(props: DerConfiguratorProps): JSX.Element {
  const { derId, derKind, children = {}, defaultCard = 'basic' } = props;
  const labels = useMemo(() => CARD_LABELS_BY_KIND[derKind], [derKind]);
  const [activeCard, setActiveCard] = useState<DerCardId>(defaultCard);
  const cardIds = Object.keys(labels) as DerCardId[];

  return (
    <div data-testid={`der-configurator-${derId}`} data-der-kind={derKind} className="flex h-full flex-col bg-scada-panel">
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
