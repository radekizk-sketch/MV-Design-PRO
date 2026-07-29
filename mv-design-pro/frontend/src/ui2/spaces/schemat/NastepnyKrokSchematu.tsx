/*
 * Jawne przejście E2→E3 (karta K4-E2, KOLEJNOSC_KROKOW_E1_E8 §E2.7):
 * trwały, nienachalny „następny krok" w przestrzeni „Schemat" — gdy model
 * jest NIEPUSTY, pasek nad kanwą prowadzi jednym kliknięciem do przestrzeni
 * „Gotowość" (bramka z werdyktem należy do `PanelGotowosci`).
 *
 * ZERO fizyki i ZERO oceny gotowości w UI: warunek widoczności to wyłącznie
 * licznik elementów migawki (`mapujModel` — reużycie czystej projekcji
 * pulpitu E2.1), a klik to sama nawigacja (`przejdzDoPrzestrzeni` — ta sama
 * ścieżka co jawny wybór przestrzeni w AppShell, z czyszczeniem trasy
 * nadrzędnej `#sld`, bez którego przestrzeń „Gotowość" nie mogłaby się
 * wyrenderować — patrz `shell/przejsciaPrzestrzeni.ts`).
 *
 * Wzorzec wizualny: sekcja „Następny krok" F-E3 (`PanelGotowosci`) i F-E4
 * (`SzczegolyPrzebiegu`) — te same tokeny --mvd-*, ta sama gramatyka języka.
 */

import { useMemo } from 'react';
import './schemat.css';

import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { przejdzDoPrzestrzeni } from '../../shell/przejsciaPrzestrzeni';
import { mapujModel } from '../projekt/pulpitAdapter';
import { SCHEMAT_STRINGS } from './strings';

export function NastepnyKrokSchematu() {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const modelNiepusty = useMemo(
    () => (snapshot ? mapujModel(snapshot).elementow > 0 : false),
    [snapshot],
  );

  if (!modelNiepusty) {
    // Pusta kanwa ma własny pierwszy krok (CTA „Wstaw GPZ") — pasek nie
    // konkuruje z nim o uwagę (uczciwy stan zerowy bez martwego wskazania).
    return null;
  }

  return (
    <section
      className="mvd-schemat-nastepny"
      aria-label={SCHEMAT_STRINGS.nastepnyKrokTytul}
      data-testid="mvd-schemat-nastepny"
    >
      <div className="mvd-schemat-nastepny-tresc">
        <span className="mvd-schemat-nastepny-lbl">{SCHEMAT_STRINGS.nastepnyKrokTytul}</span>
        <p className="mvd-schemat-nastepny-opis">{SCHEMAT_STRINGS.nastepnyKrokOpis}</p>
      </div>
      <button
        type="button"
        className="mvd-schemat-nastepny-akcja"
        onClick={() => przejdzDoPrzestrzeni('gotowosc')}
        data-testid="mvd-schemat-nastepny-akcja"
      >
        {SCHEMAT_STRINGS.nastepnyKrokAkcja}
      </button>
    </section>
  );
}
