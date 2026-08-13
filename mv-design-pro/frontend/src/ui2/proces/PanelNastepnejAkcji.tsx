/*
 * PANEL NASTĘPNEJ NAJLEPSZEJ AKCJI — prezentacja DOKŁADNIE JEDNEJ akcji
 * wyznaczonej regułą `wyznaczNastepnaAkcje`. Komponent sterowany propsami: nie
 * czyta store'ów, nie wybiera akcji, nie zna kolejności blokad. Cała decyzja
 * pochodzi z reguły — panel tylko ją pokazuje i wykonuje klik.
 *
 * Akcja jest ZAWSZE klikalna: dla „usun-blokade" prowadzi do konkretnego
 * zgłoszenia gotowości (przez `onNaprawa`, ta sama ścieżka co przycisk
 * „Napraw…" w panelu gotowości), dla pozostałych szczebli — do przestrzeni
 * etapu (przez `onNawiguj`). Sam tekst bez przycisku byłby ślepym zaułkiem.
 */

import './proces.css';
import type { SpaceId } from '../shell/spaces';
import type { ProblemGotowosci } from '../spaces/gotowosc/grupowanieCelow';
import { etapPoId } from './etapy';
import type { NastepnaAkcja } from './nastepnaAkcja';
import { PROCES_STRINGS } from './strings';

export interface PanelNastepnejAkcjiProps {
  akcja: NastepnaAkcja;
  /** Nawigacja do przestrzeni etapu (szczeble bez zgłoszenia gotowości). */
  onNawiguj: (przestrzen: SpaceId) => void;
  /** Wykonanie akcji naprawczej zgłoszenia gotowości (szczebel „usuń blokadę"). */
  onNaprawa: (problem: ProblemGotowosci) => void;
}

export function PanelNastepnejAkcji({ akcja, onNawiguj, onNaprawa }: PanelNastepnejAkcjiProps) {
  const etap = etapPoId(akcja.etap);

  const wykonaj = () => {
    if (akcja.problem) onNaprawa(akcja.problem);
    else onNawiguj(akcja.przestrzen);
  };

  return (
    <section
      className="mvd-nba"
      aria-label={PROCES_STRINGS.nbaEyebrow}
      data-testid="mvd-nba"
      data-rodzaj={akcja.rodzaj}
    >
      <div className="mvd-nba-tresc">
        <span className="mvd-nba-lbl">{PROCES_STRINGS.nbaEyebrow}</span>
        <p className="mvd-nba-tytul" data-testid="mvd-nba-tytul">
          {akcja.tytul}
        </p>
        <p className="mvd-nba-opis">{akcja.uzasadnienie}</p>
        <p className="mvd-nba-etap" data-testid="mvd-nba-etap">
          {PROCES_STRINGS.nbaEtapPrefiks} <span className="mvd-num">{etap.id}</span> ·{' '}
          {etap.nazwa}
        </p>
      </div>
      <button
        type="button"
        className="mvd-btn mvd-btn-primary mvd-nba-akcja"
        data-testid="mvd-nba-akcja"
        onClick={wykonaj}
      >
        {akcja.etykietaAkcji}
      </button>
    </section>
  );
}
