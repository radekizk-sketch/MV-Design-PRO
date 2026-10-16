/**
 * Strażnik zapisu w drzewie repozytorium dla biegu e2e (karta SZYBKIE-TESTY, 2026-10-15).
 *
 * PO CO. Ścieżki zrzutów przechodzą przez `katalogZrzutow.ts`, ale inwentarz miejsc zapisu jest
 * statyczny — nowy spec może pisać do drzewa inną drogą. Ten strażnik pilnuje KLASY w czasie
 * biegu: globalSetup zapisuje stan drzewa Git (ścieżki zmienione i nieśledzone, z odciskiem
 * treści), globalTeardown porównuje go ze stanem po biegu. Każda ścieżka nowa albo o zmienionej
 * treści to błąd biegu — chyba że bieg jawnie odświeża zrzuty dokumentacji
 * (`ZRZUTY_DO_DOKUMENTACJI=1`) i ścieżka leży w katalogu dokumentacji.
 *
 * Pliki ignorowane przez Git (`test-results/`, `playwright-report/`, `node_modules/`) nie są
 * częścią stanu. Edycja drzewa przez człowieka W TRAKCIE biegu też zostanie zgłoszona — to
 * zamierzone: strażnik nie zgaduje, kto zmienił plik.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { KORZEN_REPO, zrzutyDoDokumentacji } from './katalogZrzutow';

/** Zmienna środowiska procesu runnera niosąca stan drzewa z globalSetup do globalTeardown. */
const ZMIENNA_STANU = 'MVD_E2E_STAN_DRZEWA';

/** Katalogi, do których bieg z `ZRZUTY_DO_DOKUMENTACJI=1` może pisać (względem korzenia repo). */
export const KATALOGI_DOKUMENTACJI = ['mv-design-pro/docs/', 'mv-design-pro/frontend/docs/'] as const;

function git(...argumenty: string[]): string {
  return execFileSync('git', ['-C', KORZEN_REPO, ...argumenty], { encoding: 'utf-8' });
}

/** Ścieżki zmienione albo nieśledzone (bez ignorowanych) z odciskiem treści (`git hash-object`). */
export function stanDrzewa(): Record<string, string> {
  const wpisy = git('status', '--porcelain=v1', '-z', '--untracked-files=all')
    .split('\0')
    .filter((wpis) => wpis.length > 3);
  const stan: Record<string, string> = {};
  for (const wpis of wpisy) {
    const sciezka = wpis.slice(3);
    const pelna = path.join(KORZEN_REPO, sciezka);
    stan[sciezka] = fs.existsSync(pelna) && fs.statSync(pelna).isFile()
      ? git('hash-object', '--', sciezka).trim()
      : 'usuniety-albo-katalog';
  }
  return stan;
}

/** Ścieżki, których stan po biegu różni się od stanu przed biegiem. */
export function zmianyDrzewa(
  przed: Record<string, string>,
  po: Record<string, string>,
): string[] {
  const sciezki = new Set([...Object.keys(przed), ...Object.keys(po)]);
  return [...sciezki].filter((sciezka) => przed[sciezka] !== po[sciezka]).sort();
}

/** Zmiany niedozwolone: wszystkie, a przy odświeżaniu dokumentacji — spoza jej katalogów. */
export function zmianyNiedozwolone(zmiany: readonly string[], dokumentacja: boolean): string[] {
  return zmiany.filter(
    (sciezka) => !(dokumentacja && KATALOGI_DOKUMENTACJI.some((k) => sciezka.startsWith(k))),
  );
}

export function zapiszStanPrzedBiegiem(): void {
  process.env[ZMIENNA_STANU] = JSON.stringify(stanDrzewa());
}

export function sprawdzStanPoBiegu(): void {
  const zapis = process.env[ZMIENNA_STANU];
  if (zapis === undefined) {
    throw new Error('straznikDrzewa: brak stanu drzewa sprzed biegu — globalSetup nie wykonał zapisu.');
  }
  const niedozwolone = zmianyNiedozwolone(
    zmianyDrzewa(JSON.parse(zapis) as Record<string, string>, stanDrzewa()),
    zrzutyDoDokumentacji(),
  );
  if (niedozwolone.length > 0) {
    throw new Error(
      `Bieg e2e zmienił drzewo repozytorium (${niedozwolone.length} ścieżek) — speki piszą ` +
        'wyłącznie poza drzewem (zrzuty przez `e2e/katalogZrzutow.ts`; odświeżenie zrzutów ' +
        'dokumentacji: ZRZUTY_DO_DOKUMENTACJI=1):\n  ' +
        niedozwolone.slice(0, 40).join('\n  '),
    );
  }
}
