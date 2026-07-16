/*
 * Fixtures wspólnego wzorca ekranu analizy (karta E8.1). Dane syntetyczne dla
 * testów kontraktu propsów — bez zależności od realnego wyniku (ten jest testowany
 * osobno w `rozplyw/__tests__`).
 */

import type {
  DefinicjaKolumny,
  EkranAnalizyProps,
  WierszTabeli,
  WierszZalozenia,
} from '../wzorzecModel';

export const kolumnyFixture: DefinicjaKolumny[] = [
  { klucz: 'nazwa', etykieta: 'Element', wyrownanie: 'lewo' },
  { klucz: 'wartosc', etykieta: 'Wartość', jednostka: 'kV', mono: true },
  { klucz: 'id', etykieta: 'Identyfikator', tylkoEkspercki: true },
];

export const wierszeFixture: WierszTabeli[] = [
  {
    nazwa: { wartosc: 'Szyna B' },
    wartosc: { wartosc: '20,50', sortKey: 20.5, dowodRef: 'dowod-b' },
    id: { wartosc: 'X-2' },
  },
  {
    nazwa: { wartosc: 'Szyna A' },
    wartosc: { wartosc: '15,10', sortKey: 15.1, ostrzezenie: true },
    id: { wartosc: 'X-1' },
  },
  {
    nazwa: { wartosc: 'Szyna C' },
    wartosc: { wartosc: '18,00', sortKey: 18.0 },
    id: { wartosc: 'X-3' },
  },
];

export const zalozeniaFixture: WierszZalozenia[] = [
  { etykieta: 'Moc bazowa', wartosc: '100,0', jednostka: 'MVA' },
  { etykieta: 'Metoda', wartosc: 'Newton-Raphson', uwaga: 'Parametr przebiegu' },
];

export function propsFixture(over: Partial<EkranAnalizyProps> = {}): EkranAnalizyProps {
  return {
    naglowek: { analizaPL: 'Analiza testowa' },
    zalozenia: zalozeniaFixture,
    kolumny: kolumnyFixture,
    wiersze: wierszeFixture,
    onOtworzDowod: () => undefined,
    trybZaawansowania: 'basic',
    ...over,
  };
}
