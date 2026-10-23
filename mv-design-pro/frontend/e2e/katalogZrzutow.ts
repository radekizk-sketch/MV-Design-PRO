/**
 * Katalog zrzutów ekranu speców e2e — JEDNO źródło decyzji, czy zrzut trafia do drzewa repo.
 *
 * PO CO (karta SZYBKIE-TESTY, 2026-10-15). 54 speki zapisywały zrzuty stałymi ścieżkami do
 * `mv-design-pro/docs/**` i `frontend/docs/**`. Każdy pełny bieg e2e nadpisywał ~220 ŚLEDZONYCH
 * plików PNG (bajty zależą od renderu), więc drzewo po biegu testów było brudne, a zrzuty
 * dokumentacji zmieniały się przy okazji, bez decyzji autora. Bieg testów nie pisze do drzewa
 * repozytorium (ta sama reguła co strażnik zapisu autotestów `scripts/conftest.py`).
 *
 * REGUŁA. Spec podaje ścieżkę DOCELOWĄ w dokumentacji tak jak dotąd; ta funkcja zwraca:
 *  - ją samą, gdy bieg jawnie odświeża zrzuty dokumentacji: `ZRZUTY_DO_DOKUMENTACJI=1`;
 *  - ją samą, gdy wskazuje poza drzewo repozytorium (np. katalog z własnej zmiennej speku);
 *  - w pozostałych przypadkach — tę samą ścieżkę względną (wobec korzenia repo) pod
 *    `frontend/test-results/zrzuty-dokumentacji/` (katalog ignorowany przez Git, czyszczony przez
 *    Playwrighta na starcie biegu), więc zrzuty biegu nadal da się obejrzeć po biegu.
 *
 * Strażnik klasy w czasie biegu: `e2e/straznikDrzewa.ts` (globalSetup/globalTeardown) — bieg,
 * który zmienił drzewo repozytorium poza dozwolonym zakresem, kończy się błędem.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Korzeń repozytorium (katalog zawierający `mv-design-pro/`). */
export const KORZEN_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Katalog zrzutów biegu (domyślny cel zamiast drzewa dokumentacji). */
export const KATALOG_ZRZUTOW_BIEGU = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../test-results/zrzuty-dokumentacji',
);

/** Czy bieg jawnie odświeża zrzuty dokumentacji w drzewie repozytorium. */
export function zrzutyDoDokumentacji(): boolean {
  return process.env.ZRZUTY_DO_DOKUMENTACJI === '1';
}

/** Katalog, do którego spec zapisuje zrzuty przeznaczone dla `docelowy`. */
export function katalogZrzutow(docelowy: string): string {
  const bezwzgledny = path.resolve(docelowy);
  const wzgledny = path.relative(KORZEN_REPO, bezwzgledny);
  const poza = wzgledny.startsWith('..') || path.isAbsolute(wzgledny);
  if (zrzutyDoDokumentacji() || poza) {
    return bezwzgledny;
  }
  return path.join(KATALOG_ZRZUTOW_BIEGU, wzgledny);
}
