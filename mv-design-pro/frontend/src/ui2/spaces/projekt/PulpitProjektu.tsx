/*
 * Pulpit projektu (przestrzeń „Projekt", N1 → warsztat AppShell, okno W-101,
 * karta E2.1). Pierwszy ekran inżyniera: jedno spojrzenie na stan (model,
 * gotowość, ostatni przebieg, spójność) + lista przypadków obliczeniowych.
 *
 * Warstwy: komponent czyta store'y WYŁĄCZNIE przez hooki `pulpitAdapter`
 * (read-only), kafle są sterowane propsami. Zero wołań API, zero mutacji, zero
 * fizyki (warstwa prezentacji). Wpięcie do AppRoot/AppShell = karta zarządcy.
 *
 * Stany (karta §3): brak projektu (pusty + „Otwórz projekt"), ładowanie, gotowy.
 * Kafle bez źródła danych („Postęp wg celu", „Bilans przyłączeniowy") = „wkrótce"
 * (TODO-KARTA w pulpitAdapter / KafelWkrotce).
 */

import { useState } from 'react';
import './pulpit.css';
import type { SpaceId } from '../../shell/spaces';
import { PULPIT_STRINGS } from './strings';
import { KafelModelu } from './KafelModelu';
import { KafelGotowosci } from './KafelGotowosci';
import { KafelOstatniegoPrzebiegu } from './KafelOstatniegoPrzebiegu';
import { KafelSpojnosci } from './KafelSpojnosci';
import { KafelWkrotce } from './KafelWkrotce';
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
}

export function PulpitProjektu({
  onNawiguj,
  onOtworzProjekt,
  onZaznaczPrzypadek,
  onOtworzPrzypadek,
}: PulpitProjektuProps) {
  const stan = usePulpitStan();
  const model = useModelKafel();
  const gotowosc = useGotowoscKafel();
  const ostatniPrzebieg = useOstatniPrzebiegKafel();
  const spojnosc = useSpojnoscKafel();
  const przylaczenie = usePrzylaczenieKafel();
  const wiersze = usePrzypadkiWiersze();
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

      <div className="mvd-pulpit-grid">
        <KafelModelu dane={model} onKlik={() => onNawiguj('model')} />
        <KafelGotowosci dane={gotowosc} onKlik={() => onNawiguj('gotowosc')} />
        <KafelOstatniegoPrzebiegu
          dane={ostatniPrzebieg}
          onKlik={() => onNawiguj('wyniki')}
        />
        <KafelSpojnosci dane={spojnosc} onKlik={() => onNawiguj('wyniki')} />
        {przylaczenie && (
          <KafelPrzylaczenia dane={przylaczenie} onKlik={() => onNawiguj('model')} />
        )}
        <KafelWkrotce tytul={PULPIT_STRINGS.celTytul} />
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
