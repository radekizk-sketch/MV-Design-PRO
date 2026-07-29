/*
 * WykresZwarc — sekcja wykresu ekranu zwarć z PRZEŁĄCZNIKIEM wielkości
 * (karta W-A F2, punkt 12 karty właściciela): Ik" / ip / Ith / Sk" / I²t.
 * Reuse `WykresIkssChart` (props uogólnione addytywnie) + konfiguracja
 * deklaratywna `KONFIG_WYKRESU_ZWARC` (zwarciaModel — bez fizyki, sam wybór
 * pola wiersza kanonicznego).
 *
 * Przełącznik dostępny ZAWSZE; wielkość bez danych w tym przebiegu (starszy
 * wynik bez pól addytywnych, np. I²t) → uczciwy komunikat zamiast pustych
 * słupków (zero fabrykacji). Wzorzec przycisków: grupa `aria-pressed`
 * (jak tryb wejścia okna „Zgodność powykonawcza").
 */

import { useState } from 'react';
import type { ShortCircuitRow } from '../../../ui/results-inspector/types';
import { ZWARCIA_STRINGS } from './strings';
import { WykresIkssChart } from './WykresIkssChart';
import {
  KONFIG_WYKRESU_ZWARC,
  WIELKOSCI_WYKRESU,
  naSlupkiWielkosci,
  type WielkoscWykresu,
} from './zwarciaModel';

export interface WykresZwarcProps {
  /** Wiersze kanoniczne wyniku zwarciowego (read-only ze store'u). */
  rows: ShortCircuitRow[];
}

export function WykresZwarc({ rows }: WykresZwarcProps) {
  const [wielkosc, setWielkosc] = useState<WielkoscWykresu>('ikss');
  const konfig = KONFIG_WYKRESU_ZWARC[wielkosc];
  const slupki = naSlupkiWielkosci(rows, wielkosc);

  return (
    <div data-testid="mvd-zwarcia-wykres-blok">
      <div
        className="mvd-zwarcia-wykres-przelacznik"
        role="group"
        aria-label={ZWARCIA_STRINGS.wykresPrzelacznik}
      >
        {WIELKOSCI_WYKRESU.map((w) => (
          <button
            key={w}
            type="button"
            className={
              w === wielkosc ? 'mvd-zwarcia-wykres-btn mvd-on' : 'mvd-zwarcia-wykres-btn'
            }
            aria-pressed={w === wielkosc}
            data-testid={`mvd-zwarcia-wykres-btn-${w}`}
            onClick={() => setWielkosc(w)}
          >
            {KONFIG_WYKRESU_ZWARC[w].przycisk}
          </button>
        ))}
      </div>
      {slupki.length === 0 ? (
        <div className="mvd-zwarcia-wykres-brak" data-testid="mvd-zwarcia-wykres-brak">
          <p className="mvd-zwarcia-wykres-brak-title">{ZWARCIA_STRINGS.wykresBrakDanych}</p>
          <p className="mvd-zwarcia-wykres-brak-desc">{ZWARCIA_STRINGS.wykresBrakDanychOpis}</p>
        </div>
      ) : (
        <WykresIkssChart
          slupki={slupki}
          tytul={konfig.tytul}
          nazwaWielkosci={konfig.nazwaWielkosci}
          format={konfig.format}
          jednostka={konfig.jednostka}
        />
      )}
    </div>
  );
}
