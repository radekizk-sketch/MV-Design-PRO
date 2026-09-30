/**
 * Zrzuty dowodowe karty ETYKIETA-STACJI-PRZELOTOWEJ (materiał do werdyktu właściciela B-02).
 *
 * Sieć z `etykietaStacjiSiec.ts` (trzy stacje zadeklarowane jako przelotowe: jedna z polem
 * odgałęźnym, jedna w środku magistrali, jedna na końcu) na REALNYM backendzie, żywa
 * aplikacja, oba motywy. Kadry:
 *  1. `schemat` — przestrzeń „Schemat (SLD)" po „Dopasuj widok": rysunek i drzewo panelu
 *     „Schemat i topologia" (sekcja „Stacje SN/nN" z rodzajem przy każdej stacji);
 *  2. `stacja` — rysunek przybliżony kółkiem na „Stacji Klonowej" (podpis rodzaju pod nazwą);
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

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/etykieta-stacji');
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

      // Przybliżenie kółkiem nad stacją z polem odgałęźnym, aż podpis rodzaju stanie na
      // rysunku. Kotwica: podpis stacji (kod S01 na przeglądzie — stacja jest pierwsza
      // w magistrali), wyznaczona RAZ; kamera przybliża do kursora, więc stacja zostaje pod nim.
      const ref = siec.stacje[STACJE.odgalezna];
      const etykiety = page.locator(`[data-testid="sld-v3-labels"] g[data-owner-ref^="${ref}"]`);
      const kotwica = (await etykiety.count()) > 0
        ? etykiety.first()
        : page.locator('[data-testid="sld-v3-labels"] text', { hasText: /^S01$/ }).first();
      const box = await kotwica.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      for (let krok = 0; krok < 24; krok++) {
        const teksty = await etykiety.locator('text').allTextContents();
        if (teksty.some((t) => t.trim().startsWith('stacja '))) break;
        await page.mouse.wheel(0, -200);
        await page.waitForTimeout(200);
      }
      // Kadr: oddal drobnymi krokami, dopóki podpis rodzaju zostaje na rysunku (blok stacji
      // i sąsiednie odcinki w kadrze, nie sam podpis).
      for (let krok = 0; krok < 12; krok++) {
        await page.mouse.wheel(0, 60);
        await page.waitForTimeout(150);
        const teksty = await etykiety.locator('text').allTextContents();
        if (!teksty.some((t) => t.trim().startsWith('stacja '))) {
          await page.mouse.wheel(0, -60);
          await page.waitForTimeout(150);
          break;
        }
      }
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUTPUT_DIR, `rodzaj_stacji_${ETAP}_stacja_${motyw}.png`) });

      if (ETAP === 'po') {
        await page.getByTestId('left-panel-mode-readiness').click();
        await expect(page.getByText(/zadeklarowana jako przelotowa/).first()).toBeVisible({ timeout: 30000 });
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(OUTPUT_DIR, `rodzaj_stacji_${ETAP}_gotowosc_${motyw}.png`) });
      }
    });
  }
});
