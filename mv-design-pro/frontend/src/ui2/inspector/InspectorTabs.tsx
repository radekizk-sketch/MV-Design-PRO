/*
 * InspectorTabs — pasek zakładek stałych (karta E1.3 §1/§4a).
 * Zawsze ten sam zestaw i kolejność: Właściwości · Wyniki · Dowód · Powiązania.
 * Semantyka WAI-ARIA: role="tablist"; nawigacja strzałkami ←/→ (z zawijaniem),
 * Home/End; aktywna zakładka `tabIndex=0`, pozostałe `-1` (wzorzec roving tabindex).
 */

import type { KeyboardEvent } from 'react';
import { ZAKLADKI, type ZakladkaInspektora } from './inspectorModel';
import { INSPECTOR_STRINGS } from './strings';

const ETYKIETY: Record<ZakladkaInspektora, string> = {
  wlasciwosci: INSPECTOR_STRINGS.tabWlasciwosci,
  wyniki: INSPECTOR_STRINGS.tabWyniki,
  dowod: INSPECTOR_STRINGS.tabDowod,
  powiazania: INSPECTOR_STRINGS.tabPowiazania,
};

interface InspectorTabsProps {
  aktywna: ZakladkaInspektora;
  onZmiana: (zakladka: ZakladkaInspektora) => void;
  /** Prefiks id — dla powiązania tab ↔ tabpanel przy podziale inspektora. */
  idPrefix: string;
  /** Dostępna nazwa listy zakładek (PL). */
  ariaLabel: string;
}

export function InspectorTabs({ aktywna, onZmiana, idPrefix, ariaLabel }: InspectorTabsProps) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = ZAKLADKI.indexOf(aktywna);
    let next = idx;
    if (e.key === 'ArrowRight') next = (idx + 1) % ZAKLADKI.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + ZAKLADKI.length) % ZAKLADKI.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = ZAKLADKI.length - 1;
    else return;
    e.preventDefault();
    onZmiana(ZAKLADKI[next]);
  };

  return (
    <div role="tablist" aria-label={ariaLabel} className="mvd-insp-tabs" onKeyDown={onKeyDown}>
      {ZAKLADKI.map((zakladka) => {
        const active = zakladka === aktywna;
        return (
          <button
            key={zakladka}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${zakladka}`}
            aria-selected={active}
            aria-controls={`${idPrefix}-panel-${zakladka}`}
            tabIndex={active ? 0 : -1}
            className={active ? 'mvd-insp-tab mvd-on' : 'mvd-insp-tab'}
            data-mvd-tab={zakladka}
            onClick={() => onZmiana(zakladka)}
          >
            {ETYKIETY[zakladka]}
          </button>
        );
      })}
    </div>
  );
}
