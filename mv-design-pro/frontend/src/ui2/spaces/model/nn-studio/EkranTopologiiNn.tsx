/**
 * Zakładka TOPOLOGIA — drzewo sieci nN (adapter `nnStudioTreeAdapter`) + pasek
 * akcji budowy (kreatory odcinek/rozdzielnica/aparat, karta P0.9 plan F §1/§3).
 * Zaznaczenie w drzewie jest LOKALNE tej zakładki (kontekst dla „Dodaj…" —
 * NIE synchronizowane z globalnym `useSelectionStore`, świadome uproszczenie
 * P0.9 nazwane w meldunku karty: mapowanie węzeł→(ref, ElementType) dla
 * węzłów sekcji wymagałoby dodatkowego kanału danych poza zakresem tej karty).
 */

import { useState } from 'react';

import { useNetworkBuildStore } from '../../../../ui/network-build/networkBuildStore';
import { ContextTree } from '../../../nav/ContextTree';
import { useNnStudioTree } from '../../../nav/adapters/nnStudioTreeAdapter';
import { NN_STUDIO_STRINGS as T } from './strings';

/** Ref szyny dla akcji „Dodaj…" — TYLKO dla węzłów, których id niesie realny
 *  ref bezpośrednio (bus/transformator/stacja); węzły sekcji/liście
 *  odbioru-źródła nie dają bezpośredniego bus_ref z samego id (patrz komentarz
 *  modułu) i nie są tu rozwiązywane — akcja „Dodaj" jest wtedy nieaktywna. */
function busRefZWezla(id: string | null): string | null {
  if (!id) return null;
  if (id.startsWith('nn-bus-')) return id.slice('nn-bus-'.length);
  if (id.startsWith('nn-tr-')) return null; // korzeń transformatora nie jest szyną nN wprost
  if (id.startsWith('nn-station-')) return null; // rozwiązanie sekcji wymaga danych spoza id
  return null;
}

export function EkranTopologiiNn({ stationRef }: { stationRef: string | null }) {
  const drzewo = useNnStudioTree(stationRef);
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const [zaznaczonyId, setZaznaczonyId] = useState<string | null>(null);

  const busRef = busRefZWezla(zaznaczonyId);

  return (
    <div className="mvd-nn-studio-topologia" data-testid="mvd-nn-studio-topologia">
      <div className="mvd-nn-studio-pasek-akcji" role="toolbar" aria-label={T.ariaDrzewo}>
        <button
          type="button"
          className="mvd-nn-studio-btn"
          data-testid="mvd-nn-studio-dodaj-odcinek"
          disabled={!busRef}
          onClick={() => busRef && openOperationForm('add_nn_cable_segment', { bus_nn_ref: busRef })}
        >
          {T.dodajOdcinek}
        </button>
        <button
          type="button"
          className="mvd-nn-studio-btn"
          data-testid="mvd-nn-studio-dodaj-rozdzielnice"
          disabled={!busRef}
          onClick={() => busRef && openOperationForm('add_nn_distribution_board', { bus_nn_ref: busRef })}
        >
          {T.dodajRozdzielnice}
        </button>
        <button
          type="button"
          className="mvd-nn-studio-btn"
          data-testid="mvd-nn-studio-dodaj-aparat"
          disabled={!busRef}
          onClick={() => busRef && openOperationForm('add_nn_switch_device', { bus_nn_ref: busRef })}
        >
          {T.dodajAparat}
        </button>
      </div>
      {!busRef ? <p className="mvd-nn-studio-info">{T.wskazSzyneNajpierw}</p> : null}

      {drzewo.length === 0 ? (
        <div className="mvd-nn-studio-stan-pusty" data-testid="mvd-nn-studio-drzewo-puste">
          <h3>{T.drzewoPusteTytul}</h3>
          <p>{T.drzewoPusteOpis}</p>
        </div>
      ) : (
        <ContextTree
          wezly={drzewo}
          zaznaczonyId={zaznaczonyId}
          onZaznacz={(id) => setZaznaczonyId(id)}
          onOtworz={(id) => setZaznaczonyId(id)}
          filtrProblemy={false}
          etykietaDrzewa={T.ariaDrzewo}
        />
      )}
    </div>
  );
}
