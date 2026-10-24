/**
 * Odbiór wizualny QET-SCADA Frame 2.0 na natywnym React/Playwright.
 * Dokładnie dwie ramki; dane nieprawidłowe = błąd w inspektorze, brak znaku.
 * Ekran odbiorowy nadal nie uruchamia backendu/solverów ani SCADA.
 */
import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';
import { katalogZrzutow } from './katalogZrzutow';

const HARNESS = adresHarnessu('qet-scada-frame-review.html');
const DIR = katalogZrzutow(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/audit/visual/qet-scada-frame-v2'),
);

test.describe('QET SCADA Frame — dwa zatwierdzone stany, B-02 wstrzymane', () => {
  test.beforeAll(() => fs.mkdirSync(DIR, { recursive: true }));

  for (const kadr of [{width:1400,height:800},{width:1000,height:700}]) {
    for (const motyw of ['dark','light'] as const) {
      test(`plansza ${kadr.width}×${kadr.height} / ${motyw}`, async ({page}) => {
        await page.setViewportSize(kadr);
        const bledy: string[] = [];
        page.on('pageerror', e=>bledy.push(e.message));
        page.on('console', m=>{if(m.type()==='error') bledy.push(m.text());});
        await page.goto(HARNESS,{waitUntil:'domcontentloaded'});
        await expect(page.locator('.card[data-qet-review-id]')).toHaveCount(7);
        if(motyw==='light') await page.getByRole('button',{name:/Motyw:/}).click();
        await expect(page.locator('g[data-scada-frame-v1="true"]')).toHaveCount(7);
        await expect(page.locator('svg image, svg foreignObject')).toHaveCount(0);
        const frames=await page.locator('rect[data-cad-overlay="mechanical-position"]').evaluateAll(
          els=>els.map(e=>e.getAttribute('stroke')),
        );
        expect(frames.every(c=>c==='#F05260'||c==='#2CCF93')).toBe(true);
        await expect(page.locator('[data-cad-overlay="unknown"], [data-cad-overlay="alarm"], [data-cad-overlay="blocked"]')).toHaveCount(0);
        await page.screenshot({
          path:path.join(DIR,`atlas_${motyw}_${kadr.width}x${kadr.height}.png`),
          fullPage:true,
        });
        expect(bledy).toEqual([]);
      });
    }
  }

  test('otwarcie, zamknięcie i błąd danych — bez trzeciego koloru', async({page})=>{
    await page.goto(HARNESS);
    const qf=page.locator('g[data-element-ref="breaker"]');
    await expect(qf).toHaveAttribute('data-position','ZAMKNIETY');
    await expect(qf).toHaveAttribute('data-state-source','SYMULACJA');
    await expect(qf.locator('rect[data-cad-overlay="mechanical-position"]')).toHaveAttribute('stroke','#F05260');

    await page.getByRole('button',{name:'Otwórz w symulacji'}).click();
    await expect(qf).toHaveAttribute('data-position','OTWARTY');
    await expect(qf.locator('rect[data-cad-overlay="mechanical-position"]')).toHaveAttribute('stroke','#2CCF93');

    await page.locator('#qet-quality').selectOption('NIEWIARYGODNE');
    await expect(qf).toHaveAttribute('data-position','BRAK_RAMKI');
    await expect(qf.locator('[data-cad-overlay="mechanical-position"]')).toHaveCount(0);
    await expect(qf.locator('[data-cad-source="qet-original"]')).toHaveCount(0);
    await expect(page.getByRole('alert')).toContainText('Błąd walidacji');
    await expect(qf).toHaveAttribute('data-results-current','false');

    await page.getByRole('button',{name:'Przywróć przykład'}).click();
    await expect(qf).toHaveAttribute('data-position','ZAMKNIETY');
    await page.getByRole('button',{name:'Zmień status wyzwolenia / wkładki'}).click();
    await expect(qf).toHaveAttribute('data-position','OTWARTY');
    await expect(qf.locator('rect[data-cad-overlay="mechanical-position"]')).toHaveAttribute('stroke','#2CCF93');
    await expect(qf.locator('[data-cad-overlay="alarm"]')).toHaveCount(0);
    await expect(page.locator('aside')).toContainText('WYZWOLONY');
  });

  test('bezpiecznik nie otrzymuje ramki ani polecenia otwórz/zamknij', async({page})=>{
    await page.goto(HARNESS);
    await page.locator('[data-qet-review-id="fuse"]').click();
    const fu=page.locator('g[data-element-ref="fuse"]');
    await expect(fu).toHaveAttribute('data-position','BRAK_RAMKI');
    await expect(page.getByRole('button',{name:'Otwórz w symulacji'})).toBeDisabled();
    await expect(page.getByRole('button',{name:'Zamknij w symulacji'})).toBeDisabled();
    await page.getByRole('button',{name:'Zmień status wyzwolenia / wkładki'}).click();
    await expect(fu.locator('[data-cad-overlay="alarm"]')).toHaveCount(0);
    await expect(page.locator('aside')).toContainText('WKŁADKA PRZEPALONA');
  });
  test('pełny atlas nN/SN: jedyny dostępny podgląd to rzeczywisty CAD/QET',async({page})=>{
    await page.goto(HARNESS);
    await page.getByRole('button',{name:'Katalog nN / SN'}).click();
    await expect(page.getByTestId('sld-library-atlas')).toBeVisible();
    await expect(page.getByTestId('sld-library-coverage')).toContainText('nN:');
    await expect(page.locator('[data-library-id]').first()).toBeVisible();
    const sources=await page.locator('[data-library-id]').evaluateAll(
      cards=>cards.map(el=>el.getAttribute('data-source-status')),
    );
    expect(sources).toContain('QET_ZRODLOWY');
    expect(sources).toContain('CAD_ISTNIEJACY');
    expect(sources).toContain('ZLOZENIE_ENM');
    expect(sources).toContain('WYMAGA_ZRODLA');

    await page.getByRole('button',{name:'Zamknięty',exact:true}).click();
    await expect(page.locator('[data-library-id] [data-cad-overlay="mechanical-position"]').first())
      .toHaveAttribute('stroke','#F05260');
    await page.getByRole('button',{name:'Biblioteka SN'}).click();
    await expect(page.getByTestId('sld-library-coverage')).toContainText('SN:');
    await expect(page.locator('[data-library-id]')).not.toHaveCount(0);
    await page.getByRole('button',{name:'Otwarty',exact:true}).click();
    await expect(page.locator('[data-library-id] [data-cad-overlay="mechanical-position"]').first())
      .toHaveAttribute('stroke','#2CCF93');

    await page.getByRole('combobox',{name:'Status źródła symbolu'}).selectOption('Braki i złożenia');
    await expect(page.locator('[data-cad-overlay="mechanical-position"]')).toHaveCount(0);
    await page.getByRole('textbox',{name:'Szukaj symbolu'}).fill('Pole liniowe');
    await expect(page.locator('[data-library-id]')).toHaveCount(1);
    await expect(page.locator('[data-library-id]')).toContainText('DO ZŁOŻENIA Z ELEMENTÓW ENM');
  });

});
