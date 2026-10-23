/**
 * Karta GPZ-H5-SLD pkt 3f — jedna funkcja polskiej odmiany liczebnikowej.
 *
 * Iloczyn cech reguły: końcówka {1, 2–4, 5–9, 0} × „naście" {tak (11–14), nie} × setki
 * {<100, ≥100} × znak {+, −}. Deklaracja modułu („JEDNA funkcja dla całej aplikacji") jest
 * przypięta skanem źródeł: lokalna kopia reguły (`% 100`) albo dwuformowy skrót
 * `=== 1 ? 'słowo' : 'słowo'` poza modułem wywala test.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { formaLiczebnikowa, liczbaZOdmiana } from '../odmianaLiczebnikowa';

const OPIS = { jeden: 'opis', kilka: 'opisy', wiele: 'opisów' } as const;

describe('formaLiczebnikowa — reguła', () => {
  it.each([
    [0, 'opisów'],
    [1, 'opis'],
    [2, 'opisy'],
    [3, 'opisy'],
    [4, 'opisy'],
    [5, 'opisów'],
    [9, 'opisów'],
    [10, 'opisów'],
    [11, 'opisów'],
    [12, 'opisów'],
    [13, 'opisów'],
    [14, 'opisów'],
    [15, 'opisów'],
    [21, 'opisów'],
    [22, 'opisy'],
    [24, 'opisy'],
    [25, 'opisów'],
    [101, 'opisów'],
    [102, 'opisy'],
    [112, 'opisów'],
    [114, 'opisów'],
    [122, 'opisy'],
    [-1, 'opis'],
    [-3, 'opisy'],
    [-12, 'opisów'],
  ])('%i → %s', (n, forma) => {
    expect(formaLiczebnikowa(n, OPIS)).toBe(forma);
    expect(liczbaZOdmiana(n, OPIS)).toBe(`${n} ${forma}`);
  });

  it('formy przypadka rządzonego (kilka = wiele) — jedna reguła wyboru', () => {
    const miejscownik = { jeden: 'iteracji', kilka: 'iteracjach', wiele: 'iteracjach' };
    expect(liczbaZOdmiana(1, miejscownik)).toBe('1 iteracji');
    expect(liczbaZOdmiana(3, miejscownik)).toBe('3 iteracjach');
    expect(liczbaZOdmiana(12, miejscownik)).toBe('12 iteracjach');
  });
});

function plikiZrodlowe(katalog: string): string[] {
  const wynik: string[] = [];
  for (const nazwa of readdirSync(katalog)) {
    const sciezka = join(katalog, nazwa);
    if (statSync(sciezka).isDirectory()) {
      if (nazwa === '__tests__' || nazwa === 'node_modules') continue;
      wynik.push(...plikiZrodlowe(sciezka));
    } else if (/\.(ts|tsx)$/.test(nazwa) && !/\.test\.tsx?$/.test(nazwa)) {
      wynik.push(sciezka);
    }
  }
  return wynik;
}

describe('jedna funkcja odmiany — skan źródeł (deklaracja modułu przypięta)', () => {
  const src = resolve(__dirname, '../../..');
  const pliki = plikiZrodlowe(src).filter((p) => !p.endsWith('odmianaLiczebnikowa.ts'));

  it('skan widzi źródła (zapadka na pusty zbiór)', () => {
    expect(pliki.length).toBeGreaterThan(500);
  });

  it('żaden moduł poza `ui/shared/odmianaLiczebnikowa.ts` nie liczy reguły sam (`% 100`)', () => {
    const naruszenia = pliki.filter((p) => /%\s*100\b(?!0)/.test(readFileSync(p, 'utf8'))).map((p) => relative(src, p));
    expect(naruszenia).toEqual([]);
  });

  it('brak dwuformowego skrótu `=== 1 ? \'słowo\' : \'słowo\'` (gubi formę „kilka")', () => {
    const wzorzec = /=== 1\s*\?\s*'[a-ząćęłńóśźż ]+'\s*:\s*'[a-ząćęłńóśźż ]+'/;
    const naruszenia = pliki.filter((p) => wzorzec.test(readFileSync(p, 'utf8'))).map((p) => relative(src, p));
    expect(naruszenia).toEqual([]);
  });
});
