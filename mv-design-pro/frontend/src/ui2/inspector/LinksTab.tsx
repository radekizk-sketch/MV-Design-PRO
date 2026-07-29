/*
 * LinksTab — zakładka „Powiązania" (karta E1.3 §1; W-602: dwukierunkowa).
 *
 * Dwie listy nawigacyjne: Wchodzące (skąd można tu trafić) i Wychodzące (dokąd
 * prowadzi dalej) — zgodnie z SPEC_POWIAZANIA §4 („żadna warstwa nie jest ślepą
 * uliczką"). Klik pozycji → onNawiguj(cel). Zero fizyki, zero wołań API.
 */

import type { CelNawigacji, PowiazaniaObiektu, PozycjaPowiazania } from './inspectorModel';
import { INSPECTOR_STRINGS } from './strings';

interface LinksTabProps {
  powiazania: PowiazaniaObiektu;
  onNawiguj: (cel: CelNawigacji) => void;
}

function LinksGroup({
  naglowek,
  pozycje,
  kierunek,
  onNawiguj,
}: {
  naglowek: string;
  pozycje: PozycjaPowiazania[];
  kierunek: 'wchodzace' | 'wychodzace';
  onNawiguj: (cel: CelNawigacji) => void;
}) {
  return (
    <div className="mvd-insp-links-group" data-mvd-links={kierunek}>
      <h4 className="mvd-insp-links-head">{naglowek}</h4>
      <ul className="mvd-insp-links-list">
        {pozycje.map((poz, i) => (
          <li key={`${poz.cel.id}-${i}`}>
            <button
              type="button"
              className="mvd-insp-link"
              data-mvd-link-target={poz.cel.id}
              onClick={() => onNawiguj(poz.cel)}
            >
              <span className="mvd-insp-link-label">{poz.etykieta}</span>
              {poz.relacja && <span className="mvd-insp-link-rel">{poz.relacja}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LinksTab({ powiazania, onNawiguj }: LinksTabProps) {
  const pusty = powiazania.wchodzace.length === 0 && powiazania.wychodzace.length === 0;

  if (pusty) {
    return <p className="mvd-insp-empty">{INSPECTOR_STRINGS.brakPowiazan}</p>;
  }

  return (
    <div className="mvd-insp-links">
      {powiazania.wchodzace.length > 0 && (
        <LinksGroup
          naglowek={INSPECTOR_STRINGS.powiazaniaWchodzace}
          pozycje={powiazania.wchodzace}
          kierunek="wchodzace"
          onNawiguj={onNawiguj}
        />
      )}
      {powiazania.wychodzace.length > 0 && (
        <LinksGroup
          naglowek={INSPECTOR_STRINGS.powiazaniaWychodzace}
          pozycje={powiazania.wychodzace}
          kierunek="wychodzace"
          onNawiguj={onNawiguj}
        />
      )}
    </div>
  );
}
