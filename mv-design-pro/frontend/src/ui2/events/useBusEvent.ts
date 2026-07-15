/**
 * Hook React subskrybujacy magistrale zdarzen powloki (E15.1) w cyklu zycia
 * komponentu: subskrypcja przy montowaniu, odsubskrybowanie przy odmontowaniu.
 * Hook nie renderuje niczego — czysty efekt uboczny (moduł bez UI, patrz karta §4a).
 *
 * Uzycie najnowszego obsluznika przez ref: zmiana referencji `obsluznik` miedzy
 * renderami NIE powoduje resubskrypcji (unika efektow ubocznych przy kazdym
 * renderze), ale kazde wywolanie zawsze uzywa najnowszej wersji przekazanej
 * funkcji. Zmiana `typ` resubskrybuje na nowy typ zdarzenia.
 */

import { useEffect, useRef } from 'react';
import { subskrybuj } from './bus';
import type { ObsluznikZdarzenia, TypZdarzenia, ZdarzenieTypu } from './types';

export function useBusEvent<T extends TypZdarzenia>(
  typ: T,
  obsluznik: ObsluznikZdarzenia<ZdarzenieTypu<T>>,
): void {
  const obsluznikRef = useRef(obsluznik);
  obsluznikRef.current = obsluznik;

  useEffect(() => {
    return subskrybuj(typ, (zdarzenie) => {
      obsluznikRef.current(zdarzenie);
    });
  }, [typ]);
}
