/*
 * Pulpit projektu (przestrzeń „Projekt", N1 → warsztat AppShell, okno W-101,
 * karta E2.1 + karta PULPIT-NBA / decyzja D5). Pierwszy ekran inżyniera
 * odpowiada na trzy pytania w tej kolejności:
 *   1. CO ZROBIĆ TERAZ — panel następnej najlepszej akcji (dokładnie jedna
 *      akcja, wyznaczona regułą kontraktową `ui2/proces/nastepnaAkcja.ts`);
 *   2. GDZIE JESTEM — mapa procesu na kanonicznej osi etapów E1–E8
 *      (`ui2/proces/etapy.ts`), z etapem bieżącym wskazanym przez tę samą regułę;
 *   3. JAK STOI PROJEKT — kafle stanu (model, gotowość, ostatni przebieg,
 *      spójność, warunki przyłączenia, archiwum, import z arkusza), każdy
 *      z własnym, mierzalnym źródłem.
 *
 * Warstwy: komponent czyta store'y WYŁĄCZNIE przez hooki `pulpitAdapter` oraz
 * `ui2/proces` (read-only), kafle są sterowane propsami. Zero wołań API, zero
 * mutacji, zero fizyki (warstwa prezentacji).
 *
 * Stany (karta §3): brak projektu (pusty + „Otwórz projekt" — to jest następna
 * akcja dla tego stanu, więc panel akcji się nie dubluje), ładowanie, gotowy.
 * ZERO ZAŚLEPEK: kafel „wkrótce" został usunięty razem z komponentem
 * `KafelWkrotce` (karta PULPIT-NBA §0.4, ZASADA NR 1 — zakaz zaślepek);
 * miejsce po nim zajmuje realna treść procesu, a nie obietnica.
 */

import { useState } from 'react';
import './pulpit.css';
import type { SpaceId } from '../../shell/spaces';
import type { ProblemGotowosci } from '../gotowosc/grupowanieCelow';
import { MapaProcesu, PanelNastepnejAkcji, useNastepnaAkcja } from '../../proces';
import { PULPIT_STRINGS } from './strings';
import { KafelModelu } from './KafelModelu';
import { KafelGotowosci } from './KafelGotowosci';
import { KafelOstatniegoPrzebiegu } from './KafelOstatniegoPrzebiegu';
import { KafelSpojnosci } from './KafelSpojnosci';
import { KafelArchiwum } from './KafelArchiwum';
import { KafelArkusza } from './KafelArkusza';
import { KafelPrzylaczenia } from './KafelPrzylaczenia';
import { ListaPrzypadkow } from './ListaPrzypadkow';
import {
  usePulpitStan,
  useModelKafel,
  useGotowoscKafel,
  useOstatniPrzebiegKafel,
  useSpojnoscKafel,
  usePrzylaczenieKafel,
  usePrzypadkiWiersze,
} from './pulpitAdapter';

export interface PulpitProjektuProps {
  /** Głęboki link do przestrzeni (gramatyka §2: kafel → nawigacja). */
  onNawiguj: (przestrzen: SpaceId) => void;
  /** Akcja stanu „brak projektu". */
  onOtworzProjekt: () => void;
  /** Klik wiersza przypadku = selekcja. */
  onZaznaczPrzypadek: (id: string) => void;
  /** 2× klik wiersza przypadku = otwarcie. */
  onOtworzPrzypadek: (id: string) => void;
  /** Otwarcie okna „Archiwum projektu (ZIP)" (etap przekazania projektu). */
  onOtworzArchiwum: () => void;
  /** Otwarcie okna „Import z arkusza (XLSX)" (etap danych wejściowych). */
  onOtworzImportArkusza: () => void;
  /**
   * Wykonanie akcji naprawczej zgłoszenia gotowości — TA SAMA ścieżka, którą
   * wykonuje przycisk „Napraw…" w panelu gotowości (integrator podaje jedną
   * implementację obu ekranom).
   */
  onAkcjaNaprawcza: (problem: ProblemGotowosci) => void;
}

export function PulpitProjektu({
  onNawiguj,
  onOtworzProjekt,
  onZaznaczPrzypadek,
  onOtworzPrzypadek,
  onOtworzArchiwum,
  onOtworzImportArkusza,
  onAkcjaNaprawcza,
}: PulpitProjektuProps) {
  const stan = usePulpitStan();
  const model = useModelKafel();
  const gotowosc = useGotowoscKafel();
  const ostatniPrzebieg = useOstatniPrzebiegKafel();
  const spojnosc = useSpojnoscKafel();
  const przylaczenie = usePrzylaczenieKafel();
  const wiersze = usePrzypadkiWiersze();
  const nastepnaAkcja = useNastepnaAkcja();
  const [zaznaczonyId, setZaznaczonyId] = useState<string | null>(null);

  const zaznacz = (id: string) => {
    setZaznaczonyId(id);
    onZaznaczPrzypadek(id);
  };

  if (stan === 'ladowanie') {
    return (
      <div className="mvd-pulpit">
        <div className="mvd-pulpit-state" role="status">
          <p className="mvd-pulpit-state-desc">{PULPIT_STRINGS.ladowanie}</p>
        </div>
      </div>
    );
  }

  if (stan === 'brak-projektu' || !model || !spojnosc) {
    return (
      <div className="mvd-pulpit">
        <div className="mvd-pulpit-state">
          <p className="mvd-pulpit-state-title">{PULPIT_STRINGS.brakProjektu}</p>
          <p className="mvd-pulpit-state-desc">{PULPIT_STRINGS.brakProjektuOpis}</p>
          <button type="button" className="mvd-btn mvd-btn-primary" onClick={onOtworzProjekt}>
            {PULPIT_STRINGS.otworzProjekt}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mvd-pulpit">
      <header className="mvd-pulpit-head">
        <h2 className="mvd-pulpit-title">{PULPIT_STRINGS.tytul}</h2>
        <p className="mvd-pulpit-sub">{PULPIT_STRINGS.podtytul}</p>
      </header>

      <PanelNastepnejAkcji
        akcja={nastepnaAkcja}
        onNawiguj={onNawiguj}
        onNaprawa={onAkcjaNaprawcza}
      />

      <MapaProcesu
        etapBiezacy={nastepnaAkcja.etap}
        onWybierzEtap={(przestrzen) => onNawiguj(przestrzen)}
      />

      <div className="mvd-pulpit-grid">
        <KafelModelu dane={model} onKlik={() => onNawiguj('model')} />
        <KafelGotowosci dane={gotowosc} onKlik={() => onNawiguj('gotowosc')} />
        <KafelOstatniegoPrzebiegu
          dane={ostatniPrzebieg}
          onKlik={() => onNawiguj('wyniki')}
        />
        <KafelSpojnosci dane={spojnosc} onKlik={() => onNawiguj('wyniki')} />
        {przylaczenie && <KafelPrzylaczenia dane={przylaczenie} />}
        <KafelArchiwum onKlik={onOtworzArchiwum} />
        <KafelArkusza onKlik={onOtworzImportArkusza} />
      </div>

      <ListaPrzypadkow
        wiersze={wiersze}
        zaznaczonyId={zaznaczonyId}
        onZaznaczPrzypadek={zaznacz}
        onOtworzPrzypadek={onOtworzPrzypadek}
      />
    </div>
  );
}
