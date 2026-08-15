/*
 * Jawne przejście E2→E3 (karta K4-E2, KOLEJNOSC_KROKOW_E1_E8 §E2.7):
 * trwały, nienachalny „następny krok" w przestrzeni „Schemat" — gdy model
 * jest NIEPUSTY, pasek nad kanwą prowadzi jednym kliknięciem do przestrzeni
 * „Gotowość" (bramka z werdyktem należy do `PanelGotowosci`).
 *
 * ZERO fizyki i ZERO oceny gotowości w UI: warunek widoczności to werdykt
 * pustości modelu z JEDNEGO źródła (`ui/topology/pustoscModelu` — S9-11 /
 * P-8: ta sama prawda, którą montuje się stan pusty kanwy; dotąd pas liczył
 * pustość osobno licznikiem kafla pulpitu), a klik to sama nawigacja
 * (`przejdzDoPrzestrzeni` — ta sama
 * ścieżka co jawny wybór przestrzeni w AppShell, z czyszczeniem trasy
 * nadrzędnej `#sld`, bez którego przestrzeń „Gotowość" nie mogłaby się
 * wyrenderować — patrz `shell/przejsciaPrzestrzeni.ts`).
 *
 * Wzorzec wizualny: sekcja „Następny krok" F-E3 (`PanelGotowosci`) i F-E4
 * (`SzczegolyPrzebiegu`) — te same tokeny --mvd-*, ta sama gramatyka języka.
 *
 * S9-3 / W-6 (audyt `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md`): podpowiedź MUSI
 * reagować na stan biegu. Do tej karty pas głosił „bramka gotowości wskaże, czy
 * układ jest kompletny do obliczeń" także WTEDY, gdy obliczenia właśnie się
 * wykonały — projektant dostawał wskazanie kroku, który ma za sobą. Po
 * zakończonym biegu pas prowadzi do wyników i dowodu.
 *
 * JEDNO ŹRÓDŁO (bez czwartego wskaźnika stanu wyników — W-5): fakt „istnieje
 * zakończony bieg aktywnego zakresu" czytamy z REJESTRU PRZEBIEGÓW tą samą
 * funkcją, którą liczy go chrom powłoki (`ostatniZakonczonyPrzebiegPrzypadku`,
 * shell/shellStatus.ts). Pas NIE orzeka o świeżości wyniku — to należy do chipu
 * paska przypadku (`znacznikSwiezosci`).
 */

import { useMemo } from 'react';
import './schemat.css';

import { useAppStateStore } from '../../../ui/app-state';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { modelNiepusty as werdyktModelNiepusty } from '../../../ui/topology/pustoscModelu';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { przejdzDoPrzestrzeni } from '../../shell/przejsciaPrzestrzeni';
import { ostatniZakonczonyPrzebiegPrzypadku } from '../../shell/shellStatus';
import { SCHEMAT_STRINGS } from './strings';

export function NastepnyKrokSchematu() {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const runs = useExecutionRunsStore((s) => s.runs);
  const modelNiepusty = useMemo(() => werdyktModelNiepusty(snapshot), [snapshot]);
  const poBiegu = useMemo(
    () => ostatniZakonczonyPrzebiegPrzypadku(runs, activeCaseId) != null,
    [runs, activeCaseId],
  );

  if (!modelNiepusty) {
    // Pusta kanwa ma własny pierwszy krok (CTA „Wstaw GPZ") — pasek nie
    // konkuruje z nim o uwagę (uczciwy stan zerowy bez martwego wskazania).
    return null;
  }

  const opis = poBiegu ? SCHEMAT_STRINGS.nastepnyKrokPoBieguOpis : SCHEMAT_STRINGS.nastepnyKrokOpis;
  const etykietaAkcji = poBiegu
    ? SCHEMAT_STRINGS.nastepnyKrokPoBieguAkcja
    : SCHEMAT_STRINGS.nastepnyKrokAkcja;

  return (
    <section
      className="mvd-schemat-nastepny"
      aria-label={SCHEMAT_STRINGS.nastepnyKrokTytul}
      data-testid="mvd-schemat-nastepny"
      data-stan={poBiegu ? 'po-biegu' : 'przed-biegiem'}
    >
      <div className="mvd-schemat-nastepny-tresc">
        <span className="mvd-schemat-nastepny-lbl">{SCHEMAT_STRINGS.nastepnyKrokTytul}</span>
        <p className="mvd-schemat-nastepny-opis">{opis}</p>
      </div>
      <button
        type="button"
        className="mvd-schemat-nastepny-akcja"
        onClick={() => przejdzDoPrzestrzeni(poBiegu ? 'wyniki' : 'gotowosc')}
        data-testid="mvd-schemat-nastepny-akcja"
      >
        {etykietaAkcji}
      </button>
    </section>
  );
}
