/**
 * Warsztat przestrzeni „Model sieci" (scalenie U2 #2, zarządca).
 *
 * Dwa widoki przełączane zakładkami: „Sieć na schemacie" (most legacy — kanwa SLD,
 * własność wątku SLD) i „Szablony stacji" (nowe okno E3.1). „Zastosuj i edytuj"
 * otwiera ISTNIEJĄCY kreator zastosowania szablonu (StationTemplateWizard —
 * pełny przepływ: wybór wariantu → odcinek → parametry → apply na backendzie).
 *
 * MOST (rejestr wygaszania): preselekcja szablonu wybranego w przeglądarce wymaga
 * propa w StationTemplateWizard (modyfikacja ui/network-build) — karta E3.2;
 * do tego czasu kreator startuje od własnego wyboru (TODO-KARTA).
 */
import { useState } from 'react';

import { StationTemplateWizard } from '../../../ui/network-build/station-templates';
import { SldWorkspaceContainer } from '../../../ui/sld/v2/canvas/SldWorkspaceContainer';
import { useAppStateStore } from '../../../ui/app-state';
import { PrzegladarkaSzablonow } from './szablony';
import { MODEL_WARSZTAT_STRINGS as T } from './strings';
import './modelWarsztat.css';

const ZAKLADKI = [
  { id: 'schemat', etykieta: T.zakladkaSchemat },
  { id: 'szablony', etykieta: T.zakladkaSzablony },
] as const;

type ZakladkaId = (typeof ZAKLADKI)[number]['id'];

export function ModelWarsztat() {
  const [zakladka, setZakladka] = useState<ZakladkaId>('schemat');
  const [kreatorOtwarty, setKreatorOtwarty] = useState(false);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);

  return (
    <div className="mvd-model-warsztat" data-testid="mvd-model-warsztat">
      <div role="tablist" aria-label={T.ariaZakladki} className="mvd-model-zakladki">
        {ZAKLADKI.map((z) => (
          <button
            key={z.id}
            role="tab"
            type="button"
            aria-selected={zakladka === z.id}
            tabIndex={zakladka === z.id ? 0 : -1}
            className={zakladka === z.id ? 'mvd-model-zakladka mvd-on' : 'mvd-model-zakladka'}
            data-testid={`mvd-model-zakladka-${z.id}`}
            onClick={() => setZakladka(z.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                setZakladka(zakladka === 'schemat' ? 'szablony' : 'schemat');
              }
            }}
          >
            {z.etykieta}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mvd-model-tresc">
        {zakladka === 'schemat' ? (
          <SldWorkspaceContainer />
        ) : (
          <PrzegladarkaSzablonow onZastosuj={() => setKreatorOtwarty(true)} />
        )}
      </div>
      {kreatorOtwarty && (
        <div
          className="mvd-model-kreator-scrim"
          data-testid="mvd-model-kreator-scrim"
          onClick={() => setKreatorOtwarty(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={T.kreatorTytul}
            className="mvd-model-kreator-okno"
            onClick={(e) => e.stopPropagation()}
          >
            <StationTemplateWizard
              caseId={activeCaseId}
              onCancel={() => setKreatorOtwarty(false)}
              onAppliedSuccess={() => setKreatorOtwarty(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
