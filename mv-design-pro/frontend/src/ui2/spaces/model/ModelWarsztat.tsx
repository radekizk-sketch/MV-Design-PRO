/**
 * Warsztat przestrzeni „Model sieci" (scalenie U2 #2, zarządca).
 *
 * Dwa widoki przełączane zakładkami: „Sieć na schemacie" (most legacy — kanwa SLD,
 * własność wątku SLD) i „Szablony stacji" (nowe okno E3.1). „Zastosuj i edytuj"
 * otwiera ISTNIEJĄCY kreator zastosowania szablonu (StationTemplateWizard —
 * pełny przepływ: wybór wariantu → odcinek → parametry → apply na backendzie),
 * z preselekcją szablonu wskazanego w przeglądarce (E3.2 — prop
 * `initialTemplateId`, kreator startuje z pominiętym krokiem wyboru).
 */
import { useMemo, useState } from 'react';

import { StationTemplateWizard } from '../../../ui/network-build/station-templates';
import { SldWorkspaceContainer } from '../../../ui/sld/v2/canvas/SldWorkspaceContainer';
import { useAppStateStore } from '../../../ui/app-state';
import { PrzegladarkaSzablonow } from './szablony';
import { WlasciwosciModelu } from './WlasciwosciModelu';
import { KatalogPanel } from './katalog';
import type { ElementUzycia } from './katalog';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { emituj } from '../../events';
import { MODEL_WARSZTAT_STRINGS as T } from './strings';
import './modelWarsztat.css';

const ZAKLADKI = [
  { id: 'schemat', etykieta: T.zakladkaSchemat },
  { id: 'wlasciwosci', etykieta: T.zakladkaWlasciwosci },
  { id: 'szablony', etykieta: T.zakladkaSzablony },
  { id: 'katalog', etykieta: T.zakladkaKatalog },
] as const;

type ZakladkaId = (typeof ZAKLADKI)[number]['id'];

/** Kolekcje modelu niosące catalog_ref (sekcja „Gdzie użyty" karty typu). */
const KOLEKCJE_UZYC = ['branches', 'transformers', 'sources', 'loads', 'generators'] as const;

function zbierzUzycia(snapshot: unknown): readonly ElementUzycia[] {
  if (!snapshot || typeof snapshot !== 'object') return [];
  const model = snapshot as Record<string, unknown>;
  const wynik: ElementUzycia[] = [];
  for (const kolekcja of KOLEKCJE_UZYC) {
    const lista = model[kolekcja];
    if (!Array.isArray(lista)) continue;
    for (const el of lista as Array<Record<string, unknown>>) {
      const ref = typeof el.ref_id === 'string' && el.ref_id ? el.ref_id : String(el.id ?? '');
      if (!ref) continue;
      wynik.push({
        ref,
        etykieta: typeof el.name === 'string' && el.name ? el.name : ref,
        catalog_ref: typeof el.catalog_ref === 'string' ? el.catalog_ref : null,
      });
    }
  }
  return wynik;
}

export function ModelWarsztat() {
  const [zakladka, setZakladka] = useState<ZakladkaId>('schemat');
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const uzycia = useMemo(() => zbierzUzycia(snapshot), [snapshot]);
  const [kreatorOtwarty, setKreatorOtwarty] = useState(false);
  const [wybranySzablonId, setWybranySzablonId] = useState<string | null>(null);
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
                const idx = ZAKLADKI.findIndex((x) => x.id === zakladka);
                const krok = e.key === 'ArrowRight' ? 1 : ZAKLADKI.length - 1;
                setZakladka(ZAKLADKI[(idx + krok) % ZAKLADKI.length].id);
              }
            }}
          >
            {z.etykieta}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mvd-model-tresc">
        {zakladka === 'schemat' && <SldWorkspaceContainer />}
        {zakladka === 'wlasciwosci' && <WlasciwosciModelu />}
        {zakladka === 'szablony' && (
          <PrzegladarkaSzablonow
            onZastosuj={(idSzablonu) => {
              setWybranySzablonId(idSzablonu);
              setKreatorOtwarty(true);
            }}
          />
        )}
        {zakladka === 'katalog' && (
          <KatalogPanel
            uzyciaSnapshot={uzycia}
            onPokazElement={(ref) => {
              // Nawigacja z karty typu: selekcja globalna + powrót na schemat.
              emituj({ typ: 'selekcja', obiektId: ref, zrodlo: 'katalog' });
              setZakladka('schemat');
            }}
          />
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
              initialTemplateId={wybranySzablonId}
              onCancel={() => setKreatorOtwarty(false)}
              onAppliedSuccess={() => setKreatorOtwarty(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
