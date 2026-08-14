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

import { EnmInspectorPage } from '../../../ui/enm-inspector';
import { StationTemplateWizard } from '../../../ui/network-build/station-templates';
import { SldCanvasV3Workspace } from '../../../ui/sld/v3/canvas/SldCanvasV3Workspace';
import { useAppStateStore } from '../../../ui/app-state';
import { useShellStore } from '../../shell/useShellStore';
import { PrzegladarkaSzablonow } from './szablony';
import { WlasciwosciModelu } from './WlasciwosciModelu';
import { KatalogPanel } from './katalog';
import type { ElementUzycia } from './katalog';
import { NnStudioWarsztat } from './nn-studio';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { emituj } from '../../events';
import { MODEL_WARSZTAT_STRINGS as T } from './strings';
import './modelWarsztat.css';

/**
 * KD-4 (rozstrzygnięcie karty dla luki L-8): inspektor modelu ENM to zdolność
 * DIAGNOSTYCZNA — wchodzi do powłoki jako zakładka trybu EKSPERCKIEGO, bez
 * flagi środowiskowej. Dotąd żył wyłącznie na trasie mostu `#enm-inspector`
 * za flagą domyślnie OFF, czyli był praktycznie nieosiągalny w aplikacji.
 */
const ZAKLADKI = [
  { id: 'schemat', etykieta: T.zakladkaSchemat, tylkoEkspercki: false },
  { id: 'wlasciwosci', etykieta: T.zakladkaWlasciwosci, tylkoEkspercki: false },
  { id: 'szablony', etykieta: T.zakladkaSzablony, tylkoEkspercki: false },
  { id: 'katalog', etykieta: T.zakladkaKatalog, tylkoEkspercki: false },
  // P0.9: nN STUDIO — ogólnodostępna (nie tylko tryb ekspercki), bo dobór
  // kabli/aparatów nN i sprawdzenie SWZ jest pracą podstawową, nie diagnostyką.
  { id: 'nn-studio', etykieta: T.zakladkaNnStudio, tylkoEkspercki: false },
  { id: 'diagnostyka', etykieta: T.zakladkaDiagnostyka, tylkoEkspercki: true },
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
  const trybEkspercki = useShellStore((s) => s.advancementMode === 'expert');
  const zakladki = useMemo(
    () => ZAKLADKI.filter((z) => !z.tylkoEkspercki || trybEkspercki),
    [trybEkspercki],
  );
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const uzycia = useMemo(() => zbierzUzycia(snapshot), [snapshot]);
  const [kreatorOtwarty, setKreatorOtwarty] = useState(false);
  const [wybranySzablonId, setWybranySzablonId] = useState<string | null>(null);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);

  return (
    <div className="mvd-model-warsztat" data-testid="mvd-model-warsztat">
      <div role="tablist" aria-label={T.ariaZakladki} className="mvd-model-zakladki">
        {zakladki.map((z) => (
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
                const idx = zakladki.findIndex((x) => x.id === zakladka);
                const krok = e.key === 'ArrowRight' ? 1 : zakladki.length - 1;
                setZakladka(zakladki[(idx + krok) % zakladki.length].id);
              }
            }}
          >
            {z.etykieta}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mvd-model-tresc">
        {/* Wyjście z trybu eksperckiego przy otwartej diagnostyce nie może
            zostawić pustego panelu — wracamy na widok domyślny. */}
        {zakladka === 'diagnostyka' && !trybEkspercki && <SldCanvasV3Workspace />}
        {zakladka === 'diagnostyka' && trybEkspercki && <EnmInspectorPage />}
        {zakladka === 'schemat' && <SldCanvasV3Workspace />}
        {zakladka === 'wlasciwosci' && <WlasciwosciModelu />}
        {zakladka === 'szablony' && (
          <PrzegladarkaSzablonow
            onZastosuj={(idSzablonu) => {
              setWybranySzablonId(idSzablonu);
              setKreatorOtwarty(true);
            }}
          />
        )}
        {zakladka === 'nn-studio' && <NnStudioWarsztat />}
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
