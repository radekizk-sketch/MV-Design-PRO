/**
 * Odbiór QET-SCADA na istniejącej kanwie LvDomainView.
 * 02/03 to JSON-y wyeksportowane z backendu dla dwóch rzeczywistych modeli ENM,
 * NIE sztucznie przestawiony CSS i NIE nowa kanwa demonstracyjna.
 */
import { test, expect } from '@playwright/test';
import { adresHarnessu } from './adresHarnessu';

const base = adresHarnessu('lv-domain-harness.html');

test.describe('QET-SCADA × projekcja nN z ENM',()=>{
  for(const variant of [
    {slug:'02_two_tr_qbc_open',expected:'OTWARTY',color:'#2CCF93'},
    {slug:'03_two_tr_qbc_closed',expected:'ZAMKNIETY',color:'#F05260'},
  ]){
    for(const theme of ['dark','light'] as const){
      test(`sprzęgło QBC: ${variant.expected}, motyw ${theme}`,async({page})=>{
        await page.setViewportSize({width:1400,height:800});
        await page.goto(`${base}?scenariusz=${variant.slug}&lod=2&theme=${theme}&qetScada=1`);
        await expect(page.locator('[data-testid="lv-domain-view-root"]')).toHaveAttribute('data-status','ok');
        const qbc=page.locator('[data-element-ref="QBC"][data-scada-frame-v1="true"]');
        await expect(qbc).toHaveAttribute('data-position',variant.expected);
        await expect(qbc.locator('rect[data-cad-overlay="mechanical-position"]')).toHaveAttribute('stroke',variant.color);
        await expect(page.locator('[data-cad-family-source="qelectrotech"]').first()).toBeVisible();
        await expect(page.locator('[data-cad-overlay="unknown"],[data-cad-overlay="alarm"],[data-cad-overlay="blocked"]')).toHaveCount(0);
        const colors=await page.locator('rect[data-cad-overlay="mechanical-position"]').evaluateAll(
          nodes=>nodes.map(node=>node.getAttribute('stroke')),
        );
        expect(colors.length).toBeGreaterThan(0);
        expect(colors.every(c=>c==='#2CCF93'||c==='#F05260')).toBe(true);
      });
    }
  }
});
