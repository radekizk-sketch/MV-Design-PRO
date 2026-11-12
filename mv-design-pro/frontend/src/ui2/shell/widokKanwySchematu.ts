/*
 * „Kanwa schematu na ekranie" (karta SLD-SKALA-I-NAWIGACJA, część W).
 *
 * Dwa pytania, dwa źródła — każde jedno:
 *
 * 1. Czy WARSZTAT przestrzeni „Schemat" pokazuje kanwę (`kanwaSchematuWidocznaDla`)?
 *    Czyta je pasek narzędzi powłoki (przełącznik trybu pracy kanwy i „Wróć do"
 *    w `useWidokKanwySchematu`, `LegacyWarsztat`): przestrzeń „Schemat", trasa ''
 *    albo '#sld', brak rozwiniętej powierzchni.
 * 2. Czy JAKAKOLWIEK kanwa schematu jest zamontowana (`kanwaSchematuWidoczna`)?
 *    Kanwa żyje także poza przestrzenią „Schemat" — zakładki „Schemat" i
 *    „Diagnostyka" warsztatu „Model sieci", trasa podglądu, okno powierzchni.
 *    Odpowiedź daje rejestr montażu: każde miejsce montażu kanwy idzie przez
 *    `KanwaSchematu` (`ui2/legacy/KanwaSchematu.tsx`), który rejestruje się tutaj.
 *    To jest predykat PARY z konsumentem wskazania kamery (`sldWskazanie` obsługuje
 *    zamontowana kanwa): wskazanie przy przeglądaniu idzie wtedy i tylko wtedy, gdy
 *    istnieje kanwa, która je obsłuży od razu — bez odłożonych wskazań, które
 *    kadrowałyby schemat przy późniejszym, niezwiązanym wejściu.
 */

import { useEffect, useSyncExternalStore } from 'react';

import { ROUTES } from '../../ui/navigation/routes';
import type { SpaceId } from './spaces';

/** Czy powierzchnia rozwinięta wypełnia warsztat tej przestrzeni (wyniki/dokumentacja mają slot). */
export function powierzchniaRozwinieta(openMode: string | null | undefined, space: SpaceId): boolean {
  return openMode === 'expand_workspace' && space !== 'wyniki' && space !== 'dokumentacja';
}

/** Czysty predykat: warsztat przestrzeni „Schemat" pokazuje kanwę. */
export function kanwaSchematuWidocznaDla(route: string, space: SpaceId, rozwinieta: boolean): boolean {
  return space === 'schemat' && !rozwinieta && (route === '' || route === ROUTES.SLD.hash);
}

let zamontowane = 0;
const sluchacze = new Set<() => void>();

function powiadom(): void {
  for (const s of sluchacze) s();
}

/** Rejestracja montażu kanwy — woła WYŁĄCZNIE `KanwaSchematu`. */
export function useRejestracjaKanwySchematu(): void {
  useEffect(() => {
    zamontowane += 1;
    powiadom();
    return () => {
      zamontowane -= 1;
      powiadom();
    };
  }, []);
}

/** Stan chwili: czy kanwa schematu jest zamontowana (obsłuży wskazanie od razu). */
export function kanwaSchematuWidoczna(): boolean {
  return zamontowane > 0;
}

function subskrybuj(s: () => void): () => void {
  sluchacze.add(s);
  return () => sluchacze.delete(s);
}

/** Hook tego samego predykatu (przycisk „Pokaż na schemacie" w inspektorze). */
export function useKanwaSchematuWidoczna(): boolean {
  return useSyncExternalStore(subskrybuj, kanwaSchematuWidoczna, () => false);
}
