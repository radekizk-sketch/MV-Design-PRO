/*
 * Model i adaptery okna „Praca wyspowa" (ochrona LoM, P46). Czyste, read-only
 * odwzorowanie odpowiedzi końcówki lom-protection (`../api`) na model wspólnego
 * wzorca ekranu analizy (`../../wyniki/wzorzec`): kolumny/wiersze tabeli pól,
 * sekcja założeń. Statusy i ich etykiety pochodzą WYŁĄCZNIE z rekordu werdyktu pola
 * (`ocena.etykieta`, ZERO oceny w UI) — pole bez porównań ma etykietę „Ocena niewykonana".
 *
 * Nazwy adapterów/kolumn sufiksowane `Lom`, bo barrel OZE robi `export *`
 * (kolizja nazw TS2308). Zero fizyki, zero mutacji, zero wołań API stąd.
 */

import type { PoleLom } from '../api';
import type {
  DefinicjaKolumny,
  WierszTabeli,
  WierszZalozenia,
} from '../../wyniki/wzorzec/wzorzecModel';
import { LOM_STRINGS } from './strings';

/** Klucz kolumny identyfikatora pola (React key + wybór wiersza). */
export const KLUCZ_WIERSZA_LOM = 'identyfikator';

export const KOLUMNY_LOM: DefinicjaKolumny[] = [
  { klucz: 'pole', etykieta: LOM_STRINGS.kolPole, wyrownanie: 'lewo' },
  { klucz: 'szyna', etykieta: LOM_STRINGS.kolSzyna, wyrownanie: 'lewo' },
  { klucz: 'moduly', etykieta: LOM_STRINGS.kolModuly, mono: true },
  { klucz: 'status', etykieta: LOM_STRINGS.kolStatus, wyrownanie: 'lewo' },
  {
    klucz: KLUCZ_WIERSZA_LOM,
    etykieta: LOM_STRINGS.kolIdentyfikator,
    mono: true,
    wyrownanie: 'lewo',
    tylkoEkspercki: true,
  },
];

/** Adapter: pole LoM → wiersz tabeli wzorca (etykieta i semantyka z rekordu pola). */
export function mapujWierszLom(pole: PoleLom): WierszTabeli {
  const { etykieta } = pole.ocena;
  // Znacznik „Poza zakresem" wzorca tabeli wyłącznie dla semantyki negatywnej (naruszenie):
  // stan ostrzegawczy rekordu (brak podstawy, brak dowodu, niejednoznaczny) nie jest
  // przekroczeniem — nazywa go sama etykieta rekordu.
  const ostrzezenie = etykieta.semantyka === 'negatywna';
  return {
    pole: { wartosc: pole.bay_name },
    szyna: { wartosc: pole.bus_ref },
    moduly: { wartosc: pole.generating_module_refs.length, sortKey: pole.generating_module_refs.length },
    status: { wartosc: etykieta.etykieta_pl, ostrzezenie },
    [KLUCZ_WIERSZA_LOM]: { wartosc: pole.bay_ref },
  };
}

/** Mapuje pola LoM na wiersze tabeli wzorca (kolejność źródłowa — sort backendu). */
export function naWierszeLom(pola: readonly PoleLom[]): WierszTabeli[] {
  return pola.map(mapujWierszLom);
}

/** Buduje sekcję ZAŁOŻENIA z listy założeń backendu (każde jako osobny wiersz). */
export function naZalozeniaLom(zalozenia: readonly string[]): WierszZalozenia[] {
  return zalozenia.map((tekst, i) => ({
    etykieta: `${i + 1}`,
    wartosc: tekst,
  }));
}
