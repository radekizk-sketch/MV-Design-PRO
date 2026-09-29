/**
 * Każde pole `*_latex` odpowiedzi backendu renderuje się przez KaTeX (karta DOWOD-CIEPLNY).
 *
 * DLACZEGO. Bramka treści specy zrzutowych (`e2e/trescMatematyczna.ts`) znalazła na
 * realnych ekranach wzory, których KaTeX nie składa — `MathRenderer` pokazywał wtedy
 * surowy zapis (`math-fallback`): `ga\l` w śladzie podziału prądu zwarciowego (polecenie
 * `\l` z plain TeX-a, nieznane KaTeX-owi) i `\quadI_{arc}` w śladzie łuku (sklejenie
 * dwóch literałów bez odstępu). Obie pomyłki przechodziły testy jednostkowe producentów,
 * bo żaden test nie składał zapisu tym samym silnikiem, co ekran.
 *
 * CO SPRAWDZA. Korpus = WSZYSTKIE fikstury harnessu liczone backendem
 * (`src/harness-fixtures/generated/*.json`); każdy napis pod kluczem z przyrostkiem
 * `_latex` (w dowolnym miejscu drzewa) przechodzi przez `renderLatexToHtml` — tę samą
 * funkcję, której używa `MathRenderer` na ekranie — z `throwOnError`. Lista wyjątków pusta.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { renderLatexToHtml } from '../MathRenderer';

const KATALOG = path.resolve(__dirname, '../../../harness-fixtures/generated');

function polaLatex(wezel: unknown, sciezka: string, wynik: [string, string][]): void {
  if (Array.isArray(wezel)) {
    wezel.forEach((w, i) => polaLatex(w, `${sciezka}[${i}]`, wynik));
    return;
  }
  if (wezel !== null && typeof wezel === 'object') {
    Object.entries(wezel as Record<string, unknown>).forEach(([klucz, wartosc]) => {
      if (klucz.endsWith('_latex') && typeof wartosc === 'string' && wartosc.trim() !== '') {
        wynik.push([`${sciezka}/${klucz}`, wartosc]);
      } else {
        polaLatex(wartosc, `${sciezka}/${klucz}`, wynik);
      }
    });
  }
}

const KORPUS: [string, string][] = [];
fs.readdirSync(KATALOG)
  .filter((plik) => plik.endsWith('.json'))
  .sort()
  .forEach((plik) => {
    polaLatex(JSON.parse(fs.readFileSync(path.join(KATALOG, plik), 'utf-8')), plik, KORPUS);
  });

describe('korpus pól *_latex fikstur backendu', () => {
  it('korpus nie jest pusty (skan, który nic nie znalazł, nie jest zielenią)', () => {
    expect(KORPUS.length).toBeGreaterThan(100);
  });

  it('każdy zapis LaTeX składa się w KaTeX bez błędu', () => {
    const bledy = KORPUS.map(([miejsce, latex]) => ({ miejsce, latex, wynik: renderLatexToHtml(latex, true) }))
      .filter(({ wynik }) => !wynik.success)
      .map(({ miejsce, latex, wynik }) => `${miejsce}: ${wynik.error ?? ''} — ${latex.slice(0, 120)}`);
    // Jeden wpis na unikalny zapis — meldunek czytelny.
    expect([...new Set(bledy.map((b) => b.split(': ').slice(1).join(': ')))]).toEqual([]);
  });
});
