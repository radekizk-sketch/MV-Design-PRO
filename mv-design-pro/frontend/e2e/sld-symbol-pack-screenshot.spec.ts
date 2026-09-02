/**
 * DOWÓD WIZUALNY pakietu referencyjnego symboli CAD (R2 §21–§23) na harnessie
 * `sld-symbol-pack-harness.html`: tablica „obecny → proponowany" w motywie
 * ciemnym, jasnym i mono oraz tablica rozpoznawalności bez etykiet.
 *
 * BRAMKI KLASY (liczone tu):
 *  1. 19 wierszy pakietu, każdy z symbolem proponowanym z rodziny `cad`;
 *  2. symbol ze stanem: znacznik OPEN ≠ CLOSED ≠ UNKNOWN po geometrii (kąt
 *     przegubu), bez `fill` jako nośnika stanu;
 *  3. warstwa CAD bez bitmap, `<image>`, `<foreignObject>`, ikon czcionek;
 *  4. kadr mono i jasny/ciemny różnią się bajtowo;
 *  5. zero błędów konsoli.
 *
 * WERDYKT WIZUALNY NALEŻY DO WŁAŚCICIELA (zasada nr 2 CLAUDE.md).
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = 'http://127.0.0.1:5173/sld-symbol-pack-harness.html';
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/cad');

const SYMBOLE_CAD = [
  'cad.wylacznik',
  'cad.wylacznikInstalacyjny',
  'cad.odlacznik',
  'cad.rozlacznik',
  'cad.lacznik',
  'cad.uziemnik',
  'cad.bezpiecznik',
  'cad.rozlacznikBezpiecznikowy',
  'cad.transformator2u',
  'cad.przekladnikPradowy',
  'cad.przekladnikNapieciowy',
  'cad.przeksztaltnik',
  'cad.zrodloPvZPrzeksztaltnikiem',
  'cad.magazynZPrzeksztaltnikiem',
  'cad.generator',
  'cad.odplywOdbior',
  'cad.zabezpieczenie',
  'cad.zacisk',
  'cad.wezel',
] as const;

const ZE_STANEM = ['cad.wylacznik', 'cad.wylacznikInstalacyjny', 'cad.odlacznik', 'cad.rozlacznik', 'cad.lacznik', 'cad.uziemnik', 'cad.rozlacznikBezpiecznikowy'] as const;
/** Pozycje tablicy rozpoznawalności (klucz w dokumencie pakietu §6). */
const POZYCJE_ROZPOZNANIA = 26;

function sha256Pliku(sciezka: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(sciezka)).digest('hex');
}

async function otworz(page: Page, query: string): Promise<string[]> {
  const bledy: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') bledy.push(msg.text());
  });
  page.on('pageerror', (err) => bledy.push(`PAGEERROR: ${err.message}`));
  await page.goto(`${HARNESS_URL}?${query}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(page.locator('[data-testid="symbol-pack-root"]')).toHaveAttribute('data-status', 'ok', { timeout: 20_000 });
  await page.waitForTimeout(250);
  return bledy;
}

test.describe('sld-symbol-pack:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  test('Pakiet referencyjny — motyw ciemny, jasny, mono (kontrakt DOM + kadry)', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    const skroty = new Map<string, string>();
    for (const wariant of [
      { plik: 'pakiet_dark', query: 'theme=dark' },
      { plik: 'pakiet_light', query: 'theme=light' },
      { plik: 'pakiet_mono', query: 'theme=light&mono=1' },
    ]) {
      const bledy = await otworz(page, wariant.query);
      await expect(page.locator('[data-testid^="pack-row-"]')).toHaveCount(SYMBOLE_CAD.length);
      for (const id of SYMBOLE_CAD) {
        const komorka = page.locator(`[data-testid="pack-cad-${id}-closed"] g[data-symbol-family="cad"]`);
        await expect(komorka).toHaveCount(1);
        await expect(komorka).toHaveAttribute('data-symbol-canon', id);
        // Warstwa CAD = wyłącznie prymitywy wektorowe.
        await expect(page.locator(`[data-testid="pack-cad-${id}-closed"] image, [data-testid="pack-cad-${id}-closed"] foreignObject`)).toHaveCount(0);
      }
      for (const id of ZE_STANEM) {
        const zamkniety = await page.locator(`[data-testid="pack-cad-${id}-closed"] g[data-symbol-family="cad"]`).innerHTML();
        const otwarty = await page.locator(`[data-testid="pack-cad-${id}-open"] g[data-symbol-family="cad"]`).innerHTML();
        const nieznany = await page.locator(`[data-testid="pack-cad-${id}-unknown"] g[data-symbol-family="cad"]`).innerHTML();
        expect(zamkniety, `${id}: OPEN musi różnić się geometrią od CLOSED`).not.toBe(otwarty);
        expect(otwarty, `${id}: UNKNOWN musi różnić się od OPEN`).not.toBe(nieznany);
        // Stan = kąt przegubu, nie wypełnienie: element z data-cad="pivot" ma różny kąt.
        const katZamkniety = await page.locator(`[data-testid="pack-cad-${id}-closed"] [data-cad="pivot"]`).first().getAttribute('data-cad-deg');
        const katOtwarty = await page.locator(`[data-testid="pack-cad-${id}-open"] [data-cad="pivot"]`).first().getAttribute('data-cad-deg');
        expect(katZamkniety).toBe('0');
        expect(katOtwarty).not.toBe('0');
        // Zakaz `fill` tuszem jako nośnika stanu: liczba elementów z fill=tusz identyczna w obu stanach.
        const wypelnioneZamkniety = await page.locator(`[data-testid="pack-cad-${id}-closed"] g[data-symbol-family="cad"] [fill]:not([fill="none"])`).count();
        const wypelnioneOtwarty = await page.locator(`[data-testid="pack-cad-${id}-open"] g[data-symbol-family="cad"] [fill]:not([fill="none"])`).count();
        expect(wypelnioneZamkniety).toBe(wypelnioneOtwarty);
      }
      const plik = path.join(OUTPUT_DIR, `${wariant.plik}.png`);
      await page.screenshot({ path: plik, fullPage: true });
      skroty.set(wariant.plik, sha256Pliku(plik));
      console.log(`Saved: ${plik}`);
      expect(bledy, `błędy konsoli: ${bledy.join(' | ')}`).toEqual([]);
    }
    expect(skroty.get('pakiet_dark')).not.toBe(skroty.get('pakiet_light'));
    expect(skroty.get('pakiet_light')).not.toBe(skroty.get('pakiet_mono'));
  });

  test('Tablica rozpoznawalności bez etykiet (§22, mono)', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1120, height: 1000 });
    const bledy = await otworz(page, 'tryb=rozpoznanie');
    await expect(page.locator('[data-testid="symbol-pack-root"]')).toHaveAttribute('data-mono', 'true');
    const tablica = page.locator('[data-testid="symbol-pack-rozpoznanie"]');
    await expect(tablica).toBeVisible();
    await expect(tablica.locator('[data-pack-pozycja]')).toHaveCount(POZYCJE_ROZPOZNANIA);
    // Bez etykiet: jedyny tekst to numery pozycji, znaki normatywne symboli
    // („G" maszyny, „3" przy „~" przekształtnika) i znaki funkcji IEC w
    // prostokącie zabezpieczenia (część symbolu, nie etykieta).
    const teksty = await tablica.locator('text:not([data-cad="letter"]):not([data-cad="mark"])').allTextContents();
    for (const t of teksty) {
      expect(/^\d+$/.test(t.trim()), `tekst na tablicy rozpoznawalności: „${t}"`).toBe(true);
    }
    await expect(tablica.locator('text[data-cad="mark"]')).toHaveCount(2);
    const plik = path.join(OUTPUT_DIR, 'rozpoznanie_mono.png');
    await page.screenshot({ path: plik, fullPage: true });
    console.log(`Saved: ${plik}`);
    expect(bledy, `błędy konsoli: ${bledy.join(' | ')}`).toEqual([]);
  });
});
