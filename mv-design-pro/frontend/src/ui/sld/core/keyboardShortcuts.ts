/**
 * Rejestr skrótów klawiaturowych pokazywany w Pomocy (F1, zakładka „Skróty").
 *
 * ZASADA (zero fabrykacji, karta K2): każdy wpis ma REALNĄ obsługę w kodzie
 * produkcyjnym — rejestr nie opisuje skrótów planowanych. Przed kartą K2 rejestr
 * wymieniał 35 kombinacji, z których obsługę miały trzy (pomiar grepem po
 * `addEventListener('keydown'` i `onKeyDown` w `src/`, 2026-10-21): Escape, F1
 * i Ctrl+I (opisany jako „karta techniczna", faktycznie panel prawy). Ctrl+Home, Ctrl+0,
 * „+", „-", Ctrl+F, Ctrl+N, Delete, Enter, Ctrl+D, F2, Space, S/T/B/R/N,
 * Ctrl+Shift+P/B/G/U, Ctrl+1/2/3, Ctrl+G, Ctrl+Shift+S, F5, Ctrl+T, Ctrl+R, Ctrl+W,
 * Ctrl+E, Ctrl+V i Ctrl+Shift+E nie robiły w aplikacji nic (Ctrl+R, Ctrl+W i F5
 * wykonywała przeglądarka: przeładowanie i zamknięcie karty). Pomoc obiecywała
 * polecenia, których nie było. Martwe eksporty `VISUAL_FILTERS`,
 * `groupShortcutsByCategory` i `CATEGORY_LABELS` (zero konsumentów) usunięte.
 *
 * Miejsca obsługi każdego wpisu są częścią kontraktu: test
 * `__tests__/keyboardShortcuts.test.ts` trzyma mapę wpis → pliki obsługi i sprawdza,
 * że każdy wskazany plik zawiera warunek na tym klawiszu (mapa żyje w teście, nie
 * w rejestrze — ścieżki plików nie są treścią produktu).
 */
import { SPACES } from '../../../ui2/shell/spaces';

export interface KeyboardShortcutDef {
  /** Kombinacja klawiszy, np. `Shift+F`. */
  readonly keys: string;
  /** Opis skrótu po polsku. */
  readonly description_pl: string;
  readonly category: KeyboardCategory;
  /** Identyfikator akcji (klucz wiersza tabeli Pomocy). */
  readonly action_id: string;
}

export type KeyboardCategory = 'NAWIGACJA' | 'WIDOKI' | 'EDYCJA_MODELU' | 'NARZEDZIA';

export const KEYBOARD_SHORTCUTS: readonly KeyboardShortcutDef[] = [
  // Nawigacja — schemat (karta K2: kadrowanie zakresu pracy, historia kadrów)
  {
    keys: 'F',
    description_pl: 'Schemat: dopasuj widok do zaznaczenia (bez zaznaczenia — do całej sieci)',
    category: 'NAWIGACJA',
    action_id: 'dopasuj_zakres',
  },
  {
    keys: 'Shift+F',
    description_pl: 'Schemat: dopasuj widok do całej sieci',
    category: 'NAWIGACJA',
    action_id: 'dopasuj_siec',
  },
  {
    keys: 'Alt+←',
    description_pl: 'Schemat: wróć do poprzedniego widoku',
    category: 'NAWIGACJA',
    action_id: 'poprzedni_widok',
  },
  {
    keys: 'Shift+przeciągnij',
    description_pl: 'Schemat: zaznacz elementy w prostokącie',
    category: 'NAWIGACJA',
    action_id: 'zaznacz_obszar',
  },
  {
    keys: 'Ctrl+K',
    description_pl: 'Szukaj poleceń, obiektów i okien',
    category: 'NAWIGACJA',
    action_id: 'szukaj',
  },
  {
    keys: 'Escape',
    description_pl: 'Zamknij wyszukiwanie albo panel dolny; na schemacie zdejmij zaznaczenie',
    category: 'NAWIGACJA',
    action_id: 'anuluj',
  },

  // Widoki
  {
    keys: `1–${SPACES.length}`,
    description_pl: `Przejdź do przestrzeni pracy (${SPACES.map((s) => `${s.shortcut} — ${s.label}`).join(', ')})`,
    category: 'WIDOKI',
    action_id: 'przestrzen_pracy',
  },
  {
    keys: 'Ctrl+B',
    description_pl: 'Zwiń albo rozwiń panel lewy',
    category: 'WIDOKI',
    action_id: 'panel_lewy',
  },
  {
    keys: 'Ctrl+I',
    description_pl: 'Zwiń albo rozwiń panel prawy (inspektor)',
    category: 'WIDOKI',
    action_id: 'panel_prawy',
  },
  {
    keys: 'P',
    description_pl: 'Inspektor: przypnij albo odepnij bieżący obiekt',
    category: 'WIDOKI',
    action_id: 'przypnij_inspektor',
  },

  // Edycja modelu
  {
    keys: 'Ctrl+Z',
    description_pl: 'Cofnij ostatnią operację',
    category: 'EDYCJA_MODELU',
    action_id: 'cofnij',
  },
  {
    keys: 'Ctrl+Y',
    description_pl: 'Ponów cofniętą operację (na macOS: Cmd+Shift+Z)',
    category: 'EDYCJA_MODELU',
    action_id: 'ponow',
  },

  // Narzędzia
  {
    keys: 'F1',
    description_pl: 'Pomoc: dokumentacja, glosariusz i skróty',
    category: 'NARZEDZIA',
    action_id: 'pomoc',
  },
  {
    keys: 'Ctrl+,',
    description_pl: 'Ustawienia',
    category: 'NARZEDZIA',
    action_id: 'ustawienia',
  },
];
