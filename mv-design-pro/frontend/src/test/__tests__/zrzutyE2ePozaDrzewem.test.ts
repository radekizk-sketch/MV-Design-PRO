/**
 * Statyczny strażnik klasy „spec e2e pisze zrzuty do drzewa repozytorium".
 *
 * PO CO (partia integracji 9). Reguła `e2e/katalogZrzutow.ts` („bieg testów nie pisze do
 * drzewa repozytorium") była pilnowana WYŁĄCZNIE w czasie biegu (`e2e/straznikDrzewa.ts`
 * w globalTeardown) — czyli tylko dla speców, które ktoś akurat uruchomił. Trzy speki
 * (`w5e-ttit-nn`, `akcja-naprawcza-jednym-klikiem`, `etykieta-stacji-zrzuty`) wyznaczały katalog
 * zrzutów wprost `path.resolve(…, '../../docs/…')`, a strażnik biegu zapalił się dopiero na
 * biegu partii. Ten test sprawdza KAŻDY spec bez uruchamiania przeglądarki: ścieżka do
 * dokumentacji repozytorium budowana w specu musi przejść przez `katalogZrzutow(…)`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const KATALOG_E2E = path.resolve(__dirname, '../../../e2e');

/** Samotest strażnika biegu: buduje ścieżki w drzewie, żeby sprawdzić ich odwzorowanie przez
 * `katalogZrzutow`, i niczego pod nimi nie zapisuje. Jedyny wyjątek, z uzasadnieniem. */
const WYJATKI: ReadonlySet<string> = new Set(['straznik-drzewa.spec.ts']);

/** Wywołania `path.resolve(` / `path.join(`, których argumenty wskazują katalog `docs/`. */
const SCIEZKA_DO_DOKUMENTACJI = /path\.(?:resolve|join)\(([^()]*)\)/g;

function bezKomentarzy(tresc: string): string {
  return tresc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** Czy pozycja `indeks` leży wewnątrz argumentów wywołania `katalogZrzutow(…)` (na dowolnym
 * poziomie zagnieżdżenia, np. `katalogZrzutow(process.env.X ?? path.resolve(…))`). */
function wewnatrzKataloguZrzutow(kod: string, indeks: number): boolean {
  let glebokosc = 0;
  for (let i = indeks - 1; i >= 0; i -= 1) {
    const znak = kod[i];
    if (znak === ')') glebokosc += 1;
    else if (znak === '(') {
      if (glebokosc > 0) {
        glebokosc -= 1;
      } else if (kod.slice(0, i).trimEnd().endsWith('katalogZrzutow')) {
        return true;
      }
    }
  }
  return false;
}

/** Naruszenia w treści speku: wyrażenie ścieżki do `docs/` bez opakowania `katalogZrzutow(`. */
function sciezkiDoDokumentacjiBezKatalogu(tresc: string): string[] {
  const kod = bezKomentarzy(tresc);
  const naruszenia: string[] = [];
  for (const dopasowanie of kod.matchAll(SCIEZKA_DO_DOKUMENTACJI)) {
    const argumenty = dopasowanie[1];
    if (!/['"`](?:\.\.\/)*(?:mv-design-pro\/)?docs\//.test(argumenty)) continue;
    if (wewnatrzKataloguZrzutow(kod, dopasowanie.index ?? 0)) continue;
    naruszenia.push(dopasowanie[0].replace(/\s+/g, ' '));
  }
  return naruszenia;
}

describe('speki e2e — zrzuty poza drzewem repozytorium (katalogZrzutow)', () => {
  const speki = fs
    .readdirSync(KATALOG_E2E)
    .filter((nazwa) => nazwa.endsWith('.spec.ts') && !WYJATKI.has(nazwa))
    .sort();

  it('skan nie jest pusty', () => {
    expect(speki.length).toBeGreaterThan(50);
  });

  it.each(speki)('%s: ścieżka do dokumentacji tylko przez katalogZrzutow', (nazwa) => {
    const tresc = fs.readFileSync(path.join(KATALOG_E2E, nazwa), 'utf-8');
    expect(sciezkiDoDokumentacjiBezKatalogu(tresc)).toEqual([]);
  });

  it('predykat wykrywa ścieżkę wprost i przepuszcza opakowaną (para przypadków)', () => {
    expect(
      sciezkiDoDokumentacjiBezKatalogu(
        "const K = path.resolve(_dirname, '../../docs/audit/visual/x');",
      ),
    ).toHaveLength(1);
    expect(
      sciezkiDoDokumentacjiBezKatalogu(
        "const K = katalogZrzutow(path.resolve(_dirname, '../../docs/audit/visual/x'));",
      ),
    ).toEqual([]);
    expect(
      sciezkiDoDokumentacjiBezKatalogu(
        "const K = katalogZrzutow(\n  path.resolve(_dirname, '../../docs/audit/visual/x'),\n);",
      ),
    ).toEqual([]);
    expect(
      sciezkiDoDokumentacjiBezKatalogu(
        "const K = katalogZrzutow(process.env.X ?? path.resolve(_dirname, '../../docs/x'));",
      ),
    ).toEqual([]);
    expect(
      sciezkiDoDokumentacjiBezKatalogu(
        "const K = inny(path.resolve(_dirname, '../../docs/x')); katalogZrzutow(a);",
      ),
    ).toHaveLength(1);
    expect(
      sciezkiDoDokumentacjiBezKatalogu("// path.resolve(_dirname, '../../docs/x')"),
    ).toEqual([]);
  });

  it('wyjątki istnieją (lista nie gnije)', () => {
    for (const nazwa of WYJATKI) expect(fs.existsSync(path.join(KATALOG_E2E, nazwa))).toBe(true);
  });
});
