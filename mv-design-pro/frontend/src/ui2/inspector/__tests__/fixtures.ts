/*
 * Deterministyczne dane testowe inspektora (projekcje propów, nie dane modelu).
 * Bez Date.now()/Math.random() — wartości stałe.
 */

import type { ObiektInspektora } from '../inspectorModel';
import { usePinStore } from '../pinStore';

export function resetPinStore(): void {
  localStorage.clear();
  usePinStore.setState({ pinnedId: null, accordions: {} });
}

/** Bazowy obiekt: szyna z właściwościami, wynikami, dowodem i powiązaniami. */
export function szyna(overrides: Partial<ObiektInspektora> = {}): ObiektInspektora {
  return {
    id: 'BUS-7',
    typ: 'szyna',
    typEtykieta: 'Szyna',
    nazwa: 'Szyna GPZ 15 kV',
    wlasciwosci: [
      {
        id: 'podstawowe',
        tytul: 'Podstawowe',
        wiersze: [
          { etykieta: 'Napięcie znamionowe', wartosc: { wartosc: 15, jednostka: 'kV' } },
        ],
      },
      {
        id: 'zaawansowane',
        tytul: 'Parametry rozszerzone',
        zaawansowana: true,
        wiersze: [
          { etykieta: 'Ilość pól', wartosc: { wartosc: 8, jednostka: 'szt.' } },
        ],
      },
    ],
    wyniki: [
      {
        id: 'zwarcie',
        tytul: 'Zwarcie trójfazowe',
        wiersze: [
          {
            etykieta: 'Prąd zwarciowy początkowy',
            wartosc: {
              wartosc: 12.4,
              jednostka: 'kA',
              rewizja: 214,
              dowodRef: 'proof-sc3f-bus7',
              pochodzenie: 'IEC 60909',
            },
          },
        ],
      },
    ],
    dowody: [{ ref: 'proof-sc3f-bus7', etykieta: 'Zwarcie 3-fazowe (SC3F)', rewizja: 214 }],
    powiazania: {
      wchodzace: [
        { cel: { id: 'TR-1', typ: 'transformator' }, etykieta: 'Transformator T1', relacja: 'zasila' },
      ],
      wychodzace: [
        { cel: { id: 'LINE-3', typ: 'linia' }, etykieta: 'Linia L3', relacja: 'odpływ' },
      ],
    },
    rewizjaWynikow: 214,
    szczegolyTechniczne: [{ klucz: 'typKatalogowy', wartosc: 'BUS-STD-15' }],
    ...overrides,
  };
}
