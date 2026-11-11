/*
 * Model danych drzewa kontekstowego dolnej części lewego panelu (karta E1.2).
 * JEDEN kształt węzła dla wszystkich przestrzeni (Model→topologia,
 * Obliczenia→przypadki obliczeniowe, Wyniki→hierarchia przebiegów, …) —
 * SPEC_UKLAD_PANELI §1.1. Adaptery w `adapters/` mapują dane zastane na ten
 * kształt; komponent `ContextTree` jest w pełni agnostyczny wobec źródła.
 */

/** Źródło zdarzenia zaznaczenia (MODEL_INTERAKCJI §2 — gramatyka interakcji). */
export type ZrodloZaznaczenia = 'klik' | 'klawiatura' | 'typeahead';

/** Ikona węzła — zestaw pokrywający topologię, przypadki i przebiegi. */
export type IkonaWezla =
  | 'projekt'
  | 'stacja'
  | 'szyna'
  | 'galaz'
  | 'transformator'
  | 'zrodlo'
  | 'odgalezienie'
  | 'izolowany'
  | 'przypadek'
  | 'przebieg'
  | 'folder'
  | 'raport';

/** Liczniki problemów przypisane do gałęzi (blokady/ostrzeżenia — §5). */
export interface LicznikiWezla {
  blokady: number;
  ostrzezenia: number;
}

export const LICZNIKI_ZERO: LicznikiWezla = { blokady: 0, ostrzezenia: 0 };

/**
 * Węzeł drzewa kontekstowego (karta §2: id, etykietaPL, ikona, liczniki, dzieci).
 * Karta K1 POWLOKA: pole progu trybu zaawansowania skasowane — trzy tryby
 * ukrywały wyłącznie kontrolki, a każdy węzeł miał próg najniższy.
 */
export interface WezelDrzewa {
  id: string;
  etykietaPL: string;
  ikona: IkonaWezla;
  liczniki: LicznikiWezla;
  dzieci: WezelDrzewa[];
}

/** Tryby drzewa topologii (audyt W-208): zasilania (od GPZ) / administracyjny / obwodowy. */
export type TrybDrzewaTopologii = 'zasilania' | 'administracyjny' | 'obwodowy';

export const TRYBY_DRZEWA_TOPOLOGII: readonly TrybDrzewaTopologii[] = [
  'zasilania',
  'administracyjny',
  'obwodowy',
];

/** Akcja dostępna w stanie „pusty" (etykieta i callback zależą od przestrzeni wołającej). */
export interface AkcjaPusty {
  etykieta: string;
  onKlik: () => void;
}

/** Suma liczników własnych węzła i wszystkich potomków (do filtra „tylko z problemami"). */
export function licznikiLaczne(wezel: WezelDrzewa): LicznikiWezla {
  return wezel.dzieci.reduce(
    (acc, dziecko) => {
      const suma = licznikiLaczne(dziecko);
      return {
        blokady: acc.blokady + suma.blokady,
        ostrzezenia: acc.ostrzezenia + suma.ostrzezenia,
      };
    },
    { blokady: wezel.liczniki.blokady, ostrzezenia: wezel.liczniki.ostrzezenia },
  );
}

/** Spłaszczona reprezentacja widocznego węzła (do nawigacji klawiaturą/ARIA). */
export interface WidocznyWiersz {
  wezel: WezelDrzewa;
  poziom: number;
  maDzieci: boolean;
  rozwiniety: boolean;
}

/**
 * Spłaszcza drzewo do listy widocznych wierszy z zachowaniem kolejności DFS,
 * pomijając dzieci zwiniętych gałęzi. `rozwinieteId` = zbiór id węzłów rozwiniętych.
 */
export function splaszczWidoczne(
  wezly: WezelDrzewa[],
  rozwinieteId: ReadonlySet<string>,
  poziom = 0,
): WidocznyWiersz[] {
  const wynik: WidocznyWiersz[] = [];
  for (const wezel of wezly) {
    const maDzieci = wezel.dzieci.length > 0;
    const rozwiniety = maDzieci && rozwinieteId.has(wezel.id);
    wynik.push({ wezel, poziom, maDzieci, rozwiniety });
    if (rozwiniety) {
      wynik.push(...splaszczWidoczne(wezel.dzieci, rozwinieteId, poziom + 1));
    }
  }
  return wynik;
}
