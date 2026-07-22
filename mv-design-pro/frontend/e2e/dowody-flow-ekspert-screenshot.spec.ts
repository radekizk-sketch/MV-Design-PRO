/**
 * Karta Z-1 — dowody wizualne „pokaż i udowodnij" dla 4 nowych ekranów
 * wynikowych E-29..E-32. Zrzut powstaje TYLKO gdy twarde asercje treści
 * przejdą (to jest „udowodnij"); wywód/ślad renderowany OTWARTY tam, gdzie
 * ekran go ma. Sceny harnessu na REALNYCH komponentach produkcyjnych
 * (ui2/wyniki/**) z podmienionym `fetch` (kształty 1:1 z kontraktami backendu,
 * te same fixture'y co w testach jednostkowych modułów):
 *  - e29-skladowe    — bilans Zk + składowe Z1/Z2/Z0 (ślad WHITE BOX, KaTeX)
 *                      + uziemienie punktu neutralnego + werdykt raportowalności,
 *  - e30-zbieznosc   — werdykt zbieżności (liczba iteracji) + bilans przebiegu
 *                      + tabela pętli OLTC + ślad iteracji OTWARTY,
 *  - e31-stan-fazowy — tabela napięć/prądów per faza + asymetrie z werdyktem
 *                      (PRZEKROCZENIE z flagi solvera),
 *  - e32-stabilnosc  — werdykt STABILNY + statusy kryteriów (checks) + ślad
 *                      automatyki OTWARTY.
 * Wyjście: docs/audit/visual/flow-ekspert/e29..e32-<scena>-<motyw>.png (oba motywy).
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = 'http://127.0.0.1:5173/creator-harness.html';
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/flow-ekspert');
const THEMES = ['light', 'dark'] as const;

interface Scena {
  readonly creator: string;
  readonly plik: string;
}

const SCENY: readonly Scena[] = [
  { creator: 'wyniki-skladowe', plik: 'e29-skladowe' },
  { creator: 'wyniki-zbieznosc', plik: 'e30-zbieznosc' },
  { creator: 'wyniki-stan-fazowy', plik: 'e31-stan-fazowy' },
  { creator: 'wyniki-stabilnosc', plik: 'e32-stabilnosc' },
];

/** Prowadzi scenę do stanu „wywód OTWARTY" i weryfikuje treść PRZED zrzutem. */
async function prowadzScene(page: Page, creator: string): Promise<void> {
  if (creator === 'wyniki-skladowe') {
    // Bilans + składowe Z1/Z2/Z0 ze śladu WHITE BOX (krok „Zk", KaTeX) +
    // uziemienie punktu neutralnego — sekcja składowych renderuje wywód domyślnie.
    await expect(page.getByTestId('mvd-skladowe-tabela')).toBeVisible();
    await expect(page.getByTestId('mvd-skladowe-raport-status')).toContainText('raportowalny');
    await expect(page.getByTestId('mvd-skladowe-z1')).toContainText('0,1000 + j 0,4000');
    await expect(page.getByTestId('mvd-skladowe-z0')).toContainText('0,3000 + j 0,9000');
    // KaTeX faktycznie wyrenderowany w DOM (nie surowy LaTeX / fallback).
    const wzor = page.getByTestId('mvd-skladowe-wzor').locator('[data-testid="math-rendered"]').first();
    expect(await wzor.getAttribute('data-latex')).toContain('Z_k');
    await expect(page.locator('.katex').first()).toBeVisible();
    // Wywód DYPLOMOWY, nie zdegenerowany: podstawienie zawiera pełną sumę
    // składowych ORAZ wynik z jednostką, a |Zk| podstawienia == |Zk| wiersza
    // bilansu (spójność liczb między sekcjami tego samego ekranu).
    const podstawienie = page
      .getByTestId('mvd-skladowe-podstawienie')
      .locator('[data-testid="math-rendered"]')
      .first();
    const latexPodstawienia = (await podstawienie.getAttribute('data-latex')) ?? '';
    expect(latexPodstawienia).toContain('0{,}5 + j');
    expect(latexPodstawienia).toContain('1{,}7720');
    expect(latexPodstawienia).toContain('\\Omega');
    await expect(page.getByTestId('mvd-skladowe-tabela')).toContainText('1,7720');
    await expect(page.getByTestId('mvd-skladowe-uziemienie-siec')).toContainText('Szyna GPZ');
  } else if (creator === 'wyniki-zbieznosc') {
    // Werdykt zbieżności (liczba iteracji) + bilans + pętla OLTC → ślad iteracji
    // OTWARTY (natywny klik przełącznika).
    const werdykt = page.getByTestId('mvd-zbieznosc-werdykt');
    await expect(werdykt).toBeVisible();
    await expect(werdykt).toHaveAttribute('data-werdykt', 'zbiezny');
    await expect(werdykt).toContainText('4');
    await expect(page.getByTestId('mvd-zbieznosc-bilans')).toContainText('0,1234');
    await expect(page.getByTestId('mvd-zbieznosc-oltc-tabela')).toContainText('uuid-tr-1');
    await page.getByTestId('mvd-zbieznosc-slad-przelacznik').click();
    const sladTabela = page.getByTestId('mvd-zbieznosc-slad-tabela');
    await expect(sladTabela).toBeVisible();
    // Spójność: liczba wierszy śladu iteracji == liczba iteracji z werdyktu (4),
    // a ostatnia norma jest poniżej tolerancji 1e-6 (uczciwy dowód zbieżności).
    await expect(sladTabela.locator('tbody tr')).toHaveCount(4);
    await expect(sladTabela).toContainText('8,700e-7');
  } else if (creator === 'wyniki-stan-fazowy') {
    // Tabela faz A/B/C (napięcia/prądy) + asymetrie z werdyktem z flagi solvera
    // (prądowa PRZEKROCZENIE); werdykty renderowane domyślnie.
    const tabela = page.getByTestId('mvd-fazowy-tabela-faz');
    await expect(tabela).toBeVisible();
    await expect(tabela).toContainText('8,660');
    await expect(tabela).toContainText('99,8');
    const asymetrie = page.getByTestId('mvd-fazowy-asymetrie');
    await expect(asymetrie).toContainText('12,70');
    await expect(asymetrie).toContainText('PRZEKROCZENIE');
  } else {
    // wyniki-stabilnosc: werdykt STABILNY + statusy kryteriów (checks) → ślad
    // automatyki OTWARTY (natywny klik).
    await expect(page.getByTestId('mvd-stabilnosc-werdykt-status')).toContainText('STABILNY');
    await expect(page.getByTestId('mvd-stabilnosc-wskaznik')).toContainText('0,812');
    await expect(page.getByTestId('mvd-stabilnosc-wielkosci')).toContainText('spełnione');
    await page.getByTestId('mvd-stabilnosc-slad-btn').click();
    await expect(page.getByTestId('mvd-stabilnosc-zdarzenia')).toBeVisible();
  }
}

test.describe('dowody-flow-ekspert:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const scena of SCENY) {
    for (const theme of THEMES) {
      test(`${scena.plik} — ${theme}`, async ({ page }) => {
        const errs: string[] = [];
        const isNoise = (t: string): boolean =>
          /favicon|Download the React DevTools|Failed to load resource/i.test(t);
        page.on('console', (m) => {
          if (m.type() === 'error' && !isNoise(m.text())) errs.push(m.text());
        });
        page.on('pageerror', (e) => errs.push(`PAGEERROR: ${e.message}`));

        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`${HARNESS_URL}?creator=${scena.creator}&theme=${theme}`, {
          waitUntil: 'domcontentloaded',
          timeout: 40000,
        });
        const root = page.locator('[data-testid="creator-harness-root"]').first();
        await expect(root).toBeVisible({ timeout: 15000 });
        await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });

        await prowadzScene(page, scena.creator);

        await page.waitForTimeout(400);
        if (errs.length > 0) console.log(`[${scena.plik}/${theme}] errors:\n${errs.join('\n')}`);
        expect(errs, `no console/page errors for ${scena.plik}/${theme}`).toEqual([]);

        const outPath = path.join(OUTPUT_DIR, `${scena.plik}-${theme}.png`);
        await root.screenshot({ path: outPath });
        expect(fs.existsSync(outPath)).toBe(true);
      });
    }
  }
});
