/**
 * Zrzuty dowodowe karty ETYKIETA-STACJI-PRZELOTOWEJ (materiał do werdyktu właściciela B-02).
 *
 * Sieć z `etykietaStacjiSiec.ts` (trzy stacje zadeklarowane jako przelotowe: jedna z polem
 * odgałęźnym, jedna w środku magistrali, jedna na końcu) na REALNYM backendzie, żywa
 * aplikacja, oba motywy. Kadry:
 *  1. `schemat` — przestrzeń „Schemat (SLD)" po „Dopasuj widok": rysunek i drzewo panelu
 *     „Schemat i topologia" (sekcja „Stacje SN/nN" z rodzajem przy każdej stacji);
 *  2. `stacja` — kadr „Stacji Klonowej" dwuklikiem w jej nazwę (karta K2; podpis rodzaju pod nazwą);
 *  3. `gotowosc` — lista gotowości z ostrzeżeniami o deklaracji rodzaju (tylko etap „po":
 *     przed kartą walidator nie znał tej niezgodności).
 * Etap w nazwie pliku z `ETYKIETA_ETAP` (`przed` — drzewo bazy karty, `po` — po karcie).
 * Spec nie ocenia wyglądu (zasada nr 2: werdykt wizualny należy do właściciela).
 */
import { expect, test, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { STACJE, stanAplikacji, zbudujSiecEtykietyStacji } from './etykietaStacjiSiec';
import { katalogZrzutow } from './katalogZrzutow';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
// `E2E_KATALOG_ZRZUTOW` kieruje kadry do katalogu materiału oceny innej karty (np. zrzuty „po”
// karty W5-B w `docs/audit/visual/w5b/po`) bez nadpisywania materiału tej karty.
// Zapis do drzewa repo wyłącznie z `ZRZUTY_DO_DOKUMENTACJI=1` (`katalogZrzutow`) — wcześniej
// spec pisał stałą ścieżką do `docs/audit/visual/etykieta-stacji`, czyli każdy bieg brudził
// śledzone pliki (strażnik drzewa `e2e/straznikDrzewa.ts` kończył bieg błędem).
const OUTPUT_DIR = katalogZrzutow(
  process.env.E2E_KATALOG_ZRZUTOW
    ? path.resolve(process.env.E2E_KATALOG_ZRZUTOW)
    : path.resolve(_dirname, '../../docs/audit/visual/etykieta-stacji'),
);
const ETAP = process.env.ETYKIETA_ETAP === 'przed' ? 'przed' : 'po';
const MOTYWY = ['light', 'dark'] as const;

async function otworzSchemat(page: Page, stan: Record<string, string>): Promise<void> {
  await page.addInitScript((wpisy) => {
    for (const [klucz, wartosc] of Object.entries(wpisy)) localStorage.setItem(klucz, wartosc);
  }, stan);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await page.getByRole('button', { name: 'Schemat (SLD)' }).first().click();
  await expect(page.locator('svg[data-testid="sld-canvas-v3"]')).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(800);
}

test.describe('rodzaj stacji — zrzuty dowodowe', () => {
  test.setTimeout(300000);
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const motyw of MOTYWY) {
    test(`schemat, drzewo i gotowość — ${motyw}`, async ({ page, request }) => {
      const siec = await zbudujSiecEtykietyStacji(request, `${ETAP}-${motyw}`);
      await otworzSchemat(page, stanAplikacji(siec, motyw));
      await expect(page.getByTestId('project-tree')).toBeVisible({ timeout: 30000 });
      await page.getByRole('button', { name: 'Dopasuj widok' }).click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUTPUT_DIR, `rodzaj_stacji_${ETAP}_schemat_${motyw}.png`) });
      await page.getByTestId('project-tree').screenshot({
        path: path.join(OUTPUT_DIR, `rodzaj_stacji_${ETAP}_drzewo_${motyw}.png`),
      });

      // Treść wierszy drzewa (nazwa · rodzaj) — zapis tekstowy obok kadru.
      const wiersze = await page.getByTestId('project-tree').locator('[data-testid^="model-tree-row-"]').allTextContents();
      fs.writeFileSync(
        path.join(OUTPUT_DIR, `rodzaj_stacji_${ETAP}_drzewo_${motyw}.txt`),
        `${wiersze.map((w) => w.replace(/\s+/g, ' ').trim()).join('\n')}\n`,
      );

      // Kadr stacji z polem odgałęźnym NATYWNIE (karta K2): dwuklik w uchwyt nazwy stacji
      // kadruje CAŁĄ stację na poziomie ≥ L1 — wcześniej przybliżenie kółkiem nad podpisem,
      // którego wynik zależał od kroku kółka i ucinał sąsiadów.
      const ref = siec.stacje[STACJE.odgalezna];
      const uchwyt = page.locator(`[data-hit-role="obrys"][data-hit-owner-ref^="${ref}#name-row"]`).first();
      await expect(uchwyt).toHaveCount(1, { timeout: 30000 });
      await uchwyt.dblclick();
      await expect(page.getByTestId('sld-v3-sciezka-kadru')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('svg[data-testid="sld-canvas-v3"]')).not.toHaveAttribute('data-scene-lod', '0');
      // Podpis rodzaju stacji stoi na rysunku w kadrze stacji.
      const etykiety = page.locator(`[data-testid="sld-v3-labels"] g[data-owner-ref^="${ref}"] text`);
      await expect
        .poll(async () => (await etykiety.allTextContents()).some((t) => t.trim().startsWith('stacja ')), { timeout: 10000 })
        .toBe(true);
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUTPUT_DIR, `rodzaj_stacji_${ETAP}_stacja_${motyw}.png`) });

      if (ETAP === 'po') {
        // Lista gotowości przestrzeni „Gotowość" — ta sama, na której działa „Napraw…".
        await page.getByRole('button', { name: /Gotowość/ }).first().click();
        await expect(page.locator('[data-testid^="mvd-problem-W043-"]').first()).toBeVisible({ timeout: 30000 });
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(OUTPUT_DIR, `rodzaj_stacji_${ETAP}_gotowosc_${motyw}.png`) });
      }
    });
  }
});
