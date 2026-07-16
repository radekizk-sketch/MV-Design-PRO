/**
 * Warsztat przestrzeni „Wyniki" (scalenie U3 #1, zarządca) — początek wygaszania
 * mostu wyników: zakładka „Rozpływ mocy" to PIERWSZE okno wyników w nowej
 * powłoce (TabelaSzyn na wspólnym wzorcu ekranu analizy, karta E8.1);
 * „Pozostałe analizy" to slot mostu (powierzchnia trasowa #analysis — zwarcia,
 * zabezpieczenia, porównania do przejęcia kartami E8.2+/E9).
 *
 * Zakładka startowa: „Rozpływ mocy", gdy aktywny przebieg jest zakończonym
 * rozpływem; inaczej „Pozostałe analizy". Wyliczana przy montażu (przestrzeń
 * montuje się na wejściu — bez zaskakującego przełączania w trakcie pracy).
 * 2×klik na wartości z dowodem przełącza na most i deleguje do `onOtworzDowod`
 * (ślad obliczeń żyje dziś na powierzchni analiz).
 */
import { useState, type ReactNode } from 'react';

import type { AdvancementMode } from '../../shell/modeModel';
import { TabelaSzyn } from '../../wyniki/rozplyw';
import { useWpiecieRozplywu } from './useWpiecieRozplywu';
import { WYNIKI_WARSZTAT_STRINGS as T } from './strings';
import './wynikiWarsztat.css';

const ZAKLADKI = [
  { id: 'rozplyw', etykieta: T.zakladkaRozplyw },
  { id: 'pozostale', etykieta: T.zakladkaPozostale },
] as const;

type ZakladkaId = (typeof ZAKLADKI)[number]['id'];

export interface WynikiWarsztatProps {
  trybZaawansowania: AdvancementMode;
  /** Otwarcie dowodu/śladu obliczeń (nawigacja — decyzja AppRoot). */
  onOtworzDowod: (ref: string) => void;
  /** Zawartość zakładki „Pozostałe analizy" (most — LegacySurface). */
  pozostale: ReactNode;
}

export function WynikiWarsztat({ trybZaawansowania, onOtworzDowod, pozostale }: WynikiWarsztatProps) {
  const { aktywnyRozplyw } = useWpiecieRozplywu();
  const [zakladka, setZakladka] = useState<ZakladkaId>(aktywnyRozplyw ? 'rozplyw' : 'pozostale');

  return (
    <div className="mvd-wyniki-warsztat" data-testid="mvd-wyniki-warsztat">
      <div role="tablist" aria-label={T.ariaZakladki} className="mvd-wyniki-zakladki">
        {ZAKLADKI.map((z) => (
          <button
            key={z.id}
            role="tab"
            type="button"
            aria-selected={zakladka === z.id}
            tabIndex={zakladka === z.id ? 0 : -1}
            className={zakladka === z.id ? 'mvd-wyniki-zakladka mvd-on' : 'mvd-wyniki-zakladka'}
            data-testid={`mvd-wyniki-zakladka-${z.id}`}
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
      <div role="tabpanel" className="mvd-wyniki-tresc">
        {zakladka === 'rozplyw' && (
          <TabelaSzyn
            trybZaawansowania={trybZaawansowania}
            onOtworzDowod={(ref) => {
              setZakladka('pozostale');
              onOtworzDowod(ref);
            }}
          />
        )}
        {zakladka === 'pozostale' && pozostale}
      </div>
    </div>
  );
}
