/**
 * Kontrakt ścieżek zrzutów i strażnika drzewa biegu e2e (karta SZYBKIE-TESTY, 2026-10-15).
 *
 * Funkcje czyste — bez przeglądarki i backendu. Iloczyny cech:
 *  - `katalogZrzutow`: {tryb: bieg testów, odświeżenie dokumentacji} × {cel: w drzewie, poza};
 *  - `zmianyDrzewa`: {ścieżka nowa, o zmienionej treści, usunięta ze stanu, bez zmian};
 *  - `zmianyNiedozwolone`: {tryb} × {ścieżka w katalogu dokumentacji, poza nim}.
 */
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { KATALOG_ZRZUTOW_BIEGU, KORZEN_REPO, katalogZrzutow } from './katalogZrzutow';
import { KATALOGI_DOKUMENTACJI, stanDrzewa, zmianyDrzewa, zmianyNiedozwolone } from './straznikDrzewa';

const CEL_W_DRZEWIE = path.join(KORZEN_REPO, 'mv-design-pro/docs/audit/visual/flow-ekspert');
const CEL_POZA = path.join(os.tmpdir(), 'zrzuty-spoza-repo');

test.describe('katalog zrzutów', () => {
  test.afterEach(() => {
    delete process.env.ZRZUTY_DO_DOKUMENTACJI;
  });

  test('bieg testów: cel w drzewie → ta sama ścieżka względna pod katalogiem biegu', () => {
    delete process.env.ZRZUTY_DO_DOKUMENTACJI;
    expect(katalogZrzutow(CEL_W_DRZEWIE)).toBe(
      path.join(KATALOG_ZRZUTOW_BIEGU, 'mv-design-pro/docs/audit/visual/flow-ekspert'),
    );
  });

  test('bieg testów: cel poza drzewem → bez zmian', () => {
    delete process.env.ZRZUTY_DO_DOKUMENTACJI;
    expect(katalogZrzutow(CEL_POZA)).toBe(CEL_POZA);
  });

  test('odświeżenie dokumentacji: cel w drzewie i poza nim → bez zmian', () => {
    process.env.ZRZUTY_DO_DOKUMENTACJI = '1';
    expect(katalogZrzutow(CEL_W_DRZEWIE)).toBe(CEL_W_DRZEWIE);
    expect(katalogZrzutow(CEL_POZA)).toBe(CEL_POZA);
  });

  test('katalog biegu jest ignorowany przez Git (nie wchodzi do stanu drzewa)', () => {
    expect(path.relative(KORZEN_REPO, KATALOG_ZRZUTOW_BIEGU)).toBe(
      'mv-design-pro/frontend/test-results/zrzuty-dokumentacji',
    );
  });
});

test.describe('strażnik drzewa', () => {
  test('zmiany: nowa, zmieniona treść i usunięta ze stanu — tak; bez zmian — nie', () => {
    const przed = { 'a.txt': 'h1', 'b.txt': 'h2', 'c.txt': 'h3' };
    const po = { 'a.txt': 'h1', 'b.txt': 'h2-nowa', 'd.png': 'h4' };
    expect(zmianyDrzewa(przed, po)).toEqual(['b.txt', 'c.txt', 'd.png']);
  });

  for (const dokumentacja of [false, true]) {
    test(`niedozwolone przy odświeżaniu dokumentacji = ${dokumentacja}`, () => {
      const wDokumentacji = KATALOGI_DOKUMENTACJI.map((k) => `${k}zrzut.png`);
      const poza = ['mv-design-pro/backend/src/x.py', 'mv-design-pro/frontend/src/y.ts'];
      expect(zmianyNiedozwolone([...wDokumentacji, ...poza], dokumentacja)).toEqual(
        dokumentacja ? poza : [...wDokumentacji, ...poza],
      );
    });
  }

  test('stan drzewa jest odczytywalny i deterministyczny (dwa odczyty = ten sam stan)', () => {
    expect(stanDrzewa()).toEqual(stanDrzewa());
  });
});
