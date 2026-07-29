/*
 * SPIS KROKÓW (karta E9.1 / W-608) — nawigowalna lewa kolumna okna dowodu:
 * numeracja, tytuły PL, wskazanie kroku aktywnego. Nawigacja klawiaturą: strzałki
 * góra/dół zmieniają aktywny krok, Enter/Spacja potwierdzają wybór (idempotentnie).
 * W pełni sterowany propsami; zero fizyki, zero mutacji.
 */

import { useRef, type KeyboardEvent } from 'react';
import { DOWOD_STRINGS } from './strings';

/** Pozycja spisu — numer i tytuł kroku (rzut modelu, bez pól technicznych). */
export interface PozycjaSpisu {
  numer: number;
  tytul: string;
}

export interface SpisKrokowProps {
  pozycje: PozycjaSpisu[];
  /** Indeks aktywnego kroku (pozycja w tablicy `pozycje`). */
  aktywnyIndeks: number;
  onWybierz: (indeks: number) => void;
}

export function SpisKrokow({ pozycje, aktywnyIndeks, onWybierz }: SpisKrokowProps) {
  const listaRef = useRef<HTMLUListElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const ostatni = pozycje.length - 1;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        onWybierz(Math.min(aktywnyIndeks + 1, ostatni));
        break;
      case 'ArrowUp':
        e.preventDefault();
        onWybierz(Math.max(aktywnyIndeks - 1, 0));
        break;
      case 'Home':
        e.preventDefault();
        onWybierz(0);
        break;
      case 'End':
        e.preventDefault();
        onWybierz(ostatni);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onWybierz(aktywnyIndeks);
        break;
      default:
        break;
    }
  };

  return (
    <ul
      ref={listaRef}
      className="mvd-dowod-spis"
      role="listbox"
      tabIndex={0}
      aria-label={DOWOD_STRINGS.spisEtykieta}
      aria-activedescendant={`mvd-dowod-krok-${aktywnyIndeks}`}
      onKeyDown={onKeyDown}
      data-testid="mvd-dowod-spis"
    >
      {pozycje.map((poz, i) => {
        const aktywny = i === aktywnyIndeks;
        return (
          <li
            key={`${poz.numer}-${i}`}
            id={`mvd-dowod-krok-${i}`}
            role="option"
            aria-selected={aktywny}
            className={aktywny ? 'mvd-dowod-spis-poz mvd-dowod-spis-poz-akt' : 'mvd-dowod-spis-poz'}
            onClick={() => onWybierz(i)}
            data-testid="mvd-dowod-spis-poz"
          >
            <span className="mvd-dowod-spis-numer mvd-num" aria-hidden="true">
              {poz.numer}
            </span>
            <span className="mvd-dowod-spis-poz-tytul">{poz.tytul}</span>
          </li>
        );
      })}
    </ul>
  );
}
