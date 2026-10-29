/**
 * Kontrakt typów `srodowisko_testow.mjs` — modułu własnego (reguła środowiska testów vitest,
 * karta SZYBKIE-TESTY-2, 2026-10-28). `tsc` nie czyta `.mjs` bez `allowJs` (TS7016), a test
 * `src/test/__tests__/srodowiskoTestow.test.ts` importuje ten moduł; deklaracja opisuje
 * dokładnie eksporty modułu. Para z `srodowisko_testow.mjs` — rozjazd sygnatur zapala
 * `npm run type-check` (plik testu jest w zasięgu `tsconfig_gate_guard`), jak przy
 * `playwright-env.d.mts`.
 */

/** Komentarz pierwszego wiersza pliku testów biegnącego w środowisku `node`. */
export const ZNACZNIK_NODE: string;

/** Przyczyna `jsdom` pliku budżetu czasu procesora (warunek 5 reguły). */
export const PRZYCZYNA_BUDZETU: string;

/** Pakiety, których import nie sięga DOM (moduł z nich nie wymusza `jsdom`). */
export const PAKIETY_BEZ_DOM: Set<string>;

/** Klucze globalne podstawiane przez środowisko `jsdom` vitest. */
export function kluczeJsdom(korzen: string): Promise<Set<string>>;

/**
 * Klasyfikacja plików testów: ścieżka względna → `null` (środowisko `node`) albo łańcuch
 * przyczyny wyboru `jsdom` (plik testów → … → moduł → przyczyna).
 */
export function klasyfikujTesty(
  korzen: string,
  opcje?: { pliki?: string[] | null },
): Promise<Map<string, string[] | null>>;

/** Treść pliku z komentarzem środowiska zgodnym z klasyfikacją. */
export function trescZeZnacznikiem(tresc: string, srodowiskoNode: boolean): string;

/** Rozbieżności komentarzy plików z regułą: `[plik, oczekiwane, przyczyna]`. */
export function rozbieznosci(
  korzen: string,
  klasyfikacja: Map<string, string[] | null>,
): Array<[string, 'node' | 'jsdom', string[] | null]>;
