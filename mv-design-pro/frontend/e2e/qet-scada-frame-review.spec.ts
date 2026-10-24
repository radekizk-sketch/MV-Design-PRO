/**
 * Odbiór wizualny QET-SCADA Frame 1.0 na natywnym React/Playwright.
 * Bez wywołań SCADA, bez bezpośredniego API solvera: brak fałszywego E2E.
 */
import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';
import { katalogZrzutow } from './katalogZrzutow';

const HARNESS = adresHarnessu('qet-scada-frame-review.html');
const DIR = katalogZrzutow(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/audit/visual/qet-scada-frame-v1'),
);

test.describe('QET SCADA Frame — odbiór właścicielski (B-02 wstrzymane)', () => {
  test.beforeAll(() => fs.mkdirSync(DIR, { recursive: true }));

  for (const kadr of [
    { width: 1400, height: 800 },
    { width: 1000, height: 700 },
  ]) {
    for (const motyw of ['dark', 'light'] as const) {
      test(`plansza ${kadr.width}×${kadr.height} / ${motyw}`, async ({page}) => {
        await page.setViewportSize(kadr);
        const bledy: string[]=[];
        page.on('pageerror', e=>bledy.push(e.message));
        page.on('console', m=>{if(m.type()==='error')bledy.push(m.text())});
        await page.goto(HARNESS,{waitUntil:'domcontentloaded'});
        await expect(page.locator('.card[data-qet-review-id]')).toHaveCount(7);
        if(motyw==='light') await page.getByRole('button',{name:/Motyw:/}).click();
        await expect(page.locator('g[data-scada-frame-v1="true"]')).toHaveCount(7);
        await expect(page.locator('svg image, svg foreignObject')).toHaveCount(0);
        await page.screenshot({
          path:path.join(DIR,`atlas_${motyw}_${kadr.width}x${kadr.height}.png`),
          fullPage:true,
        });
        expect(bledy).toEqual([]);
      });
    }
  }

  test('położenie, alarm i jakość zmieniają ramkę, nie źródło QET', async({page})=>{
    await page.goto(HARNESS);
    const qf=page.locator('g[data-element-ref="breaker"]');
    await expect(qf).toHaveAttribute('data-position','ZAMKNIETY');
    await expect(qf).toHaveAttribute('data-state-source','SYMULACJA');
    await expect(qf.locator('rect[data-cad-overlay="mechanical-position"]'))
      .toHaveAttribute('stroke','#F05260');

    await page.getByRole('button',{name:'Otwórz w symulacji'}).click();
    await expect(qf).toHaveAttribute('data-position','OTWARTY');
    await expect(qf.locator('rect[data-cad-overlay="mechanical-position"]'))
      .toHaveAttribute('stroke','#2CCF93');
    await page.locator('#qet-quality').selectOption('NIEWIARYGODNE');
    await expect(qf).toHaveAttribute('data-position','NIEZNANY');
    await expect(qf.locator('rect[data-cad-overlay="mechanical-position"]'))
      .toHaveAttribute('stroke','#96AAB6');
    await expect(qf).toHaveAttribute('data-results-current','false');

    await page.getByRole('button',{name:'Przywróć przykład'}).click();
    await expect(page.locator('g[data-element-ref="breaker"]'))
      .toHaveAttribute('data-position','ZAMKNIETY');
    await page.getByRole('button',{name:'Zmień status wyzwolenia / wkładki'}).click();
    await expect(page.locator('g[data-element-ref="breaker"]'))
      .toHaveAttribute('data-position','OTWARTY');
    await expect(page.locator('g[data-element-ref="breaker"] [data-cad-overlay="alarm"]'))
      .toHaveCount(1);
  });

  test('wkładka bezpiecznika nie dostaje sterowania jak wyłącznik',async({page})=>{
    await page.goto(HARNESS);
    await page.locator('[data-qet-review-id="fuse"]').click();
    const fu=page.locator('g[data-element-ref="fuse"]');
    await expect(fu).toHaveAttribute('data-position','BRAK_RAMKI');
    await expect(page.getByRole('button',{name:'Otwórz w symulacji'})).toBeDisabled();
    await expect(page.getByRole('button',{name:'Zamknij w symulacji'})).toBeDisabled();
    await page.getByRole('button',{name:'Zmień status wyzwolenia / wkładki'}).click();
    await expect(fu.locator('[data-cad-overlay="alarm"]')).toHaveCount(1);
  });
});
