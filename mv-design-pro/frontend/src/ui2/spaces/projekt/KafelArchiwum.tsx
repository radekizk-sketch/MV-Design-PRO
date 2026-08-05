/*
 * Kafel „Archiwum projektu (ZIP)" (pulpit W-101) — stałe wejście do okna
 * archiwum w przestrzeni „Projekt". Do tej karty przestrzeń nie miała ŻADNEJ
 * akcji archiwum, mimo kompletu końcówek backendu; wejście z huba dokumentacji
 * kończyło się pulpitem bez akcji.
 *
 * Kafel jest w pełni sterowany propsami (jak reszta kafli pulpitu) — otwarcie
 * okna należy do przestrzeni, nie do kafla.
 */

import { Kafel } from './Kafel';
import { PULPIT_STRINGS } from './strings';

export function KafelArchiwum({ onKlik }: { onKlik: () => void }) {
  return (
    <Kafel
      tytul={PULPIT_STRINGS.archiwumTytul}
      onKlik={onKlik}
      ariaLabel={PULPIT_STRINGS.archiwumAkcja}
    >
      <p className="mvd-kafel-pusty-opis">{PULPIT_STRINGS.archiwumOpis}</p>
    </Kafel>
  );
}
