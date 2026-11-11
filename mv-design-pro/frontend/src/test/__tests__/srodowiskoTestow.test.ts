/**
 * Środowisko testów wyznaczane regułą (karta SZYBKIE-TESTY-2, 2026-10-28).
 *
 * Plik testów bez DOM biegnie w środowisku `node` (komentarz w pierwszym wierszu wpisuje
 * `scripts/srodowisko_testow.mjs --zapisz`), reszta w `jsdom`. Ten test przypina:
 * 1. zgodność komentarza KAŻDEGO pliku testów z regułą — w obie strony: plik z DOM nie trafia
 *    do `node`, a plik bez DOM nie zostaje w `jsdom` (koszt tworzenia okna bez potrzeby);
 * 2. regułę iniekcjami — każda droga, którą moduł może sięgnąć DOM, wybiera `jsdom`, a nazwa
 *    lokalna, typ i nazwa właściwości o brzmieniu globalnego DOM — nie;
 * 3. wyjątek w drugą stronę — plik sięgający modułu spoza `src/**` z pakietem narzędzi
 *    budowania (`vite.config.ts`) biegnie w `node`, bo w jsdom pada przy imporcie esbuild;
 * 4. plik budżetu czasu procesora zostaje w `jsdom` (środowisko kalibracji budżetów), a predykat
 *    zbioru budżetów jest jeden dla reguły i dla `vite.config.ts` (`scripts/budzety_czasu.mjs`).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import {
  klasyfikujTesty,
  PRZYCZYNA_BUDZETU,
  rozbieznosci,
  trescZeZnacznikiem,
  ZNACZNIK_NODE,
} from '../../../scripts/srodowisko_testow.mjs';

const KORZEN = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const KATALOG = mkdtempSync(join(tmpdir(), 'srodowisko-testow-'));
afterAll(() => rmSync(KATALOG, { recursive: true, force: true }));

/** Klasyfikacja jednego pliku testów `t.test.ts` z modułami pomocniczymi w katalogu tymczasowym. */
async function klasyfikuj(
  test: string,
  moduly: Record<string, string> = {},
  /** Moduły zapisane obok, ale SPOZA analizowanego zbioru (jak `vite.config.ts` wobec `src/**`). */
  poza: Record<string, string> = {},
): Promise<string[] | null> {
  const katalog = mkdtempSync(join(KATALOG, 'p-'));
  const pliki = [join(katalog, 't.test.ts')];
  writeFileSync(pliki[0], test);
  for (const [nazwa, tresc] of [...Object.entries(moduly), ...Object.entries(poza)]) {
    const sciezka = join(katalog, nazwa);
    mkdirSync(dirname(sciezka), { recursive: true });
    writeFileSync(sciezka, tresc);
    if (nazwa in moduly) pliki.push(sciezka);
  }
  const wynik = await klasyfikujTesty(KORZEN, { pliki });
  expect(wynik.size).toBe(1);
  return [...wynik.values()][0];
}

describe('środowisko testów wyznaczane regułą', () => {
  it('komentarz środowiska każdego pliku testów zgadza się z regułą', async () => {
    const klasyfikacja = await klasyfikujTesty(KORZEN);
    expect(klasyfikacja.size).toBeGreaterThan(800);
    const lista = rozbieznosci(KORZEN, klasyfikacja).map(
      ([plik, oczekiwane]) => `${plik} → ${oczekiwane} (popraw: node scripts/srodowisko_testow.mjs --zapisz)`,
    );
    expect(lista).toEqual([]);
    // Oba środowiska są w użyciu — reguła nie zdegenerowała się do jednego.
    const node = [...klasyfikacja.values()].filter((p) => p === null).length;
    expect(node).toBeGreaterThan(0);
    expect(node).toBeLessThan(klasyfikacja.size);
  }, 120_000);

  it('plik czystej logiki biegnie w node', async () => {
    expect(
      await klasyfikuj("import { expect, it } from 'vitest';\nimport { suma } from './m';\nit('x', () => expect(suma(1, 2)).toBe(3));\n", {
        'm.ts': 'export const suma = (a: number, b: number): number => a + b;\n',
      }),
    ).toBeNull();
  });

  it('nazwa lokalna, typ i nazwa właściwości o brzmieniu globalnego DOM nie wybierają jsdom', async () => {
    expect(
      await klasyfikuj(
        [
          "import { it } from 'vitest';",
          "import { screen } from './m';",
          'type T = Element | HTMLElement;',
          'interface I { location: string; document: Node }',
          'const history = [1];',
          'function f(name: string, status: number): string { return name + status; }',
          'const o = { location: 1, window: 2 };',
          'const { document: d } = { document: 3 };',
          'it("x", () => { void (screen, history, f, o.location, o.window, d); const x: T | null = null; void x; });',
          '',
        ].join('\n'),
        { 'm.ts': 'export const screen = 1;\n' },
      ),
    ).toBeNull();
  });

  it.each([
    ['wywołanie DOM w funkcji modułu', "export const f = () => document.createElement('div');\n"],
    ['gałąź typeof window', "export const f = () => (typeof window === 'undefined' ? 0 : 1);\n"],
    ['globalThis.localStorage', 'export const f = () => globalThis.localStorage;\n'],
    ['dynamiczny dostęp globalThis[…]', "export const f = (k: string) => (globalThis as never)[k];\n"],
    ['alias obiektu globalnego', 'const g = globalThis;\nexport const f = () => (g as never as { document: unknown }).document;\n'],
    ['klucz z obiektu globalnego w nawiasach', 'export const f = () => (globalThis as never as { navigator: unknown }).navigator;\n'],
    ['skrót właściwości z globalnym', 'export const f = () => ({ location });\n'],
    ['globalny zadeklarowany w declare global', 'declare global { var localStorage: number }\nexport const f = () => localStorage;\n'],
    ['klasa DOM jako wartość', 'export const f = (x: unknown) => x instanceof HTMLElement;\n'],
    ['pakiet DOM', "export { render } from '@testing-library/react';\n"],
    ['podścieżka pakietu z localStorage', "export { persist } from 'zustand/middleware';\n"],
    ['import() z nienapisowym argumentem', 'export const f = (p: string) => import(p);\n'],
    ['nierozwiązany import względny', "export { x } from './nie-ma';\n"],
  ])('%s w module zależnym wybiera jsdom', async (_opis, modul) => {
    const przyczyna = await klasyfikuj(
      "import { it } from 'vitest';\nimport * as m from './posredni';\nit('x', () => void m);\n",
      { 'posredni.ts': "export * from './m';\n", 'm.ts': modul },
    );
    expect(przyczyna).not.toBeNull();
    // Łańcuch przyczyny prowadzi przez moduł pośredni do modułu z DOM.
    expect(przyczyna?.[0]).toMatch(/posredni\.ts$/);
  });

  it('moduł podstawiony przez vi.mock jest częścią domknięcia', async () => {
    const przyczyna = await klasyfikuj(
      "import { it, vi } from 'vitest';\nvi.mock('./m');\nit('x', () => undefined);\n",
      { 'm.ts': 'export const f = () => window;\n' },
    );
    expect(przyczyna?.join(' ')).toMatch(/window/);
  });

  it('pakiet bez DOM z listy biegnie w node, wejście główne zustand także', async () => {
    expect(
      await klasyfikuj("import { it } from 'vitest';\nimport { create } from 'zustand';\nimport { z } from 'zod';\nit('x', () => void (create, z));\n"),
    ).toBeNull();
  });

  // Warunek 4 (wymaga node) — iloczyn cech: pakiet narzędzi w module spoza zbioru × droga
  // (import wprost z testu / przez moduł `src`) × przyczyna jsdom obok (brak / `import()`
  // z nienapisowym argumentem / globalny DOM). Kontrast: moduł spoza zbioru BEZ pakietu
  // narzędzi zostaje przyczyną jsdom („plik poza analizą”), jak przed regułą.
  const NARZEDZIA = [
    "import { defineConfig } from 'vite';\nexport const k = defineConfig({});\n",
    "import { configDefaults } from 'vitest/config';\nexport const k = configDefaults;\n",
    "import { transform } from 'esbuild';\nexport const k = transform;\n",
    "import react from '@vitejs/plugin-react';\nexport const k = react;\n",
    "export const k = await import('vite');\n",
  ];
  const OBOK = ['', "const s = './x';\nvoid import(s);\n", 'void document.title;\n'];
  for (const [i, narzedzie] of NARZEDZIA.entries()) {
    for (const [j, obok] of OBOK.entries()) {
      for (const posrednio of [false, true]) {
        it(`moduł spoza zbioru z narzędziami budowania wymaga node [${i}×${j}×${posrednio ? 'pośrednio' : 'wprost'}]`, async () => {
          const test = posrednio
            ? `import { it } from 'vitest';\nimport { k } from './posredni';\n${obok}it('x', () => void k);\n`
            : `import { it } from 'vitest';\nimport { k } from './konfig';\n${obok}it('x', () => void k);\n`;
          const moduly: Record<string, string> = posrednio ? { 'posredni.ts': "export { k } from './konfig';\n" } : {};
          expect(await klasyfikuj(test, moduly, { 'konfig.ts': narzedzie })).toBeNull();
        });
      }
    }
  }

  it('moduł spoza zbioru bez narzędzi budowania zostaje przyczyną jsdom', async () => {
    const wynik = await klasyfikuj(
      "import { it } from 'vitest';\nimport { k } from './konfig';\nit('x', () => void k);\n",
      {},
      { 'konfig.ts': "import { readFileSync } from 'node:fs';\nexport const k = readFileSync;\n// vite\n" },
    );
    expect(wynik?.join(' ')).toMatch(/plik poza analizą/);
  });

  // Warunek 5 (plik budżetu czasu zostaje w jsdom) — iloczyn cech: postać importu pomocnika
  // (ścieżka pośrednia / bieżący katalog / cudzysłów podwójny) × treść pliku (czysta logika /
  // globalny DOM / moduł spoza zbioru z narzędziami budowania). Warunek 4 ma pierwszeństwo.
  const IMPORTY_POMOCNIKA = [
    "import { czasProcesoraMs } from './test/czasProcesora';\n",
    "import { czasProcesoraMs } from './czasProcesora';\n",
    'import { czasProcesoraMs } from "./czasProcesora";\n',
  ];
  const TRESCI: Array<[string, string, Record<string, string>, string[] | null]> = [
    ['czysta logika', '', {}, [PRZYCZYNA_BUDZETU]],
    ['globalny DOM', 'void document.title;\n', {}, [PRZYCZYNA_BUDZETU]],
    ['narzędzia budowania', "import { k } from './konfig';\nvoid k;\n", { 'konfig.ts': "import { defineConfig } from 'vite';\nexport const k = defineConfig({});\n" }, null],
  ];
  for (const [i, importPomocnika] of IMPORTY_POMOCNIKA.entries()) {
    for (const [opis, tresc, poza, oczekiwane] of TRESCI) {
      it(`plik budżetu czasu procesora [import ${i} × ${opis}]`, async () => {
        const sciezkaPomocnika = importPomocnika.includes('/test/') ? 'test/czasProcesora.ts' : 'czasProcesora.ts';
        const test = `import { it } from 'vitest';\n${importPomocnika}${tresc}it('x', () => void czasProcesoraMs);\n`;
        const moduly = { [sciezkaPomocnika]: 'export const czasProcesoraMs = (): number => 0;\n' };
        expect(await klasyfikuj(test, moduly, poza)).toEqual(oczekiwane);
      });
    }
  }

  it('ten sam plik bez importu pomocnika czasu biegnie w node (kontrast warunku 5)', async () => {
    expect(
      await klasyfikuj("import { it } from 'vitest';\nimport { f } from './czasProcesoraInny';\nit('x', () => void f);\n", {
        'czasProcesoraInny.ts': 'export const f = (): number => 0;\n',
      }),
    ).toBeNull();
  });

  it('zbiór budżetów vite.config.ts i reguła środowiska mają jeden predykat', () => {
    const konfig = readFileSync(join(KORZEN, 'vite.config.ts'), 'utf-8');
    expect(konfig).toMatch(/import \{ IMPORT_POMOCNIKA_CZASU \} from '\.\/scripts\/budzety_czasu\.mjs'/);
    expect(konfig).toMatch(/IMPORT_POMOCNIKA_CZASU\.test\(/);
    // Żadnego drugiego, lokalnego wzorca pomocnika czasu w konfiguracji.
    expect(konfig).not.toMatch(/=\s*\/from[^\n]*czasProcesora/);
  });

  it('komentarz środowiska: wpis w pierwszym wierszu, usuwanie, idempotencja', () => {
    const tresc = "import { it } from 'vitest';\n";
    const zNode = trescZeZnacznikiem(tresc, true);
    expect(zNode.split('\n')[0]).toBe(ZNACZNIK_NODE);
    expect(trescZeZnacznikiem(zNode, true)).toBe(zNode);
    expect(trescZeZnacznikiem(zNode, false)).toBe(tresc);
    const jsdomRecznie = '// @' + 'vitest-environment jsdom\n' + tresc;
    expect(trescZeZnacznikiem(jsdomRecznie, false)).toBe(tresc);
  });
});
