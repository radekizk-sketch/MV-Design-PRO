/*
 * Model danych wyszukiwarki poleceń (okno W-105, karta E1.5 §2). JEDEN
 * kształt pozycji dla wszystkich grup wyników (przestrzenie/polecenia/
 * obiekty/przykłady/pomoc) — SPEC_UKLAD_PANELI §2.2. `CommandPalette` jest
 * w pełni sterowany propsami i agnostyczny wobec źródła danych — budowa
 * indeksu jest zakresem `searchIndex.ts`.
 *
 * `TrybZaawansowania` jest zduplikowany strukturalnie względem
 * `ui2/shell/modeModel.ts` (AdvancementMode): search NIE importuje z
 * ui2/shell poza jawnie wskazanym w karcie rejestrem przestrzeni
 * (`../shell/spaces`, wyłącznie w `searchIndex.ts`) — granica kart
 * równoległych, ta sama decyzja co `ui2/nav/treeModel.ts` (TrybMin).
 */

/** Grupa wyniku wyszukiwania — stała kolejność nagłówków (karta §4). */
export type GrupaWyszukiwania = 'przestrzenie' | 'polecenia' | 'obiekty' | 'przyklady' | 'pomoc';

/** Kolejność grup w wynikach i nagłówkach (karta §4: Przestrzenie, Polecenia, Obiekty, Gotowe przykłady, Pomoc). */
export const KOLEJNOSC_GRUP: readonly GrupaWyszukiwania[] = [
  'przestrzenie',
  'polecenia',
  'obiekty',
  'przyklady',
  'pomoc',
];

/** Tryb zaawansowania — wartości zamrożone jak `ui2/shell/modeModel.ts` (AdvancementMode). */
export type TrybZaawansowania = 'basic' | 'extended' | 'expert';

/** Pozycja wyniku wyszukiwania (karta §2: id, etykietaPL, grupa, trybMin?, akcja). */
export interface PozycjaWyszukiwania {
  id: string;
  etykietaPL: string;
  grupa: GrupaWyszukiwania;
  /** Minimalny tryb zaawansowania wymagany do wykonania (brak = dostępne zawsze). */
  trybMin?: TrybZaawansowania;
  /**
   * Rzeczywista akcja pozycji. Wołana przez warstwę integrującą (karta
   * zarządcy) — sam dialog `CommandPalette` NIE wywołuje `akcja` bezpośrednio,
   * wyłącznie zgłasza wybór przez `onWykonaj(pozycja)` (komponent w pełni
   * sterowany propsami, karta §2).
   */
  akcja: () => void;
}

const KOLEJNOSC_TRYBOW: Record<TrybZaawansowania, number> = { basic: 0, extended: 1, expert: 2 };

/** Czy `trybAktualny` udostępnia pozycję o wymaganym `trybMin`. */
export function trybWystarczajacy(
  trybAktualny: TrybZaawansowania,
  trybMin: TrybZaawansowania,
): boolean {
  return KOLEJNOSC_TRYBOW[trybAktualny] >= KOLEJNOSC_TRYBOW[trybMin];
}
