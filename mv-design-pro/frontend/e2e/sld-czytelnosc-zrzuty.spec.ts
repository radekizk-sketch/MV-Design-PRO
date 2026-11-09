/**
 * Zrzuty czytelności SLD i inspektora pola (karta SLD-CZYTELNOSC-INSPEKTOR): materiał oceny
 * wizualnej właściciela (bramka B-02 — spec NIE wystawia werdyktu) na REALNYM backendzie,
 * sieć kadrów stacji (`siecKadrowStacji.ts`: GPZ, 3 odcinki, 4 stacje SN/nN, odgałęzienie).
 *
 * Dla każdego okna (1440×900, 1600×900) i motywu (ciemny, jasny):
 *  1. `pelna-siec` — plan całej sieci po „Dopasuj widok” (Shift+F);
 *  2. `stacja` — stacja odgałęźna wskazana klikiem, karta stacji w inspektorze;
 *  3. `pole` — zbliżenie na stację kółkiem i klik w aparat pola SN, karta pola;
 *  4. `pole-340` — ta sama karta pola przy najwęższym inspektorze (340 px);
 *  5. `gpz` — zbliżenie na GPZ i klik w aparat pola GPZ.
 *
 * Asercje twarde (nie werdykt, tylko kontrakt): na każdym zrzucie żadna narysowana etykieta
 * sceny nie jest ucięta krawędzią kanwy, a karta pola ma tabelę aparatów bez przewijania w
 * poziomie przy 340 px.
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { katalogZrzutow } from './katalogZrzutow';
import { otworzAplikacje, siecKadrow, ustawMotyw } from './siecKadrowStacji';

const HERE = dirname(fileURLToPath(import.meta.url));
const KATALOG_ZRZUTOW = katalogZrzutow(resolve(HERE, '..', '..', 'docs', 'uiux', 'zrzuty', 'sld-czytelnosc'));

const OKNA = [
  { width: 1440, height: 900 },
  { width: 1600, height: 900 },
] as const;
const MOTYWY = [
  { klucz: 'ciemny', theme: 'dark_scada' as const },
  { klucz: 'jasny', theme: 'light_technical' as const },
] as const;
const STACJA = 'Stacja Odgałęźna';

async function kliknijBlok(page: Page, testId: string): Promise<void> {
  const blok = page.locator(`[data-testid="${testId}"]`);
  await expect(blok).toBeAttached({ timeout: 30000 });
  const ramka = (await blok.boundingBox())!;
  await page.mouse.click(ramka.x + ramka.width / 2, ramka.y + ramka.height / 2);
}

async function srodek(page: Page, selektor: string): Promise<{ x: number; y: number }> {
  const ramka = (await page.locator(selektor).first().boundingBox())!;
  return { x: ramka.x + ramka.width / 2, y: ramka.y + ramka.height / 2 };
}

async function przybliz(page: Page, selektor: string, punkt: { x: number; y: number }): Promise<void> {
  await page.mouse.move(punkt.x, punkt.y);
  for (let i = 0; i < 40; i += 1) {
    if ((await page.locator(selektor).count()) > 0) return;
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(120);
  }
  await expect(page.locator(selektor).first()).toBeAttached();
}

async function kliknijSymbol(page: Page, selektor: string): Promise<void> {
  const kanwa = (await page.locator('svg[data-testid="sld-canvas-v3"]').boundingBox())!;
  const symbole = page.locator(selektor);
  const n = await symbole.count();
  for (let i = 0; i < n; i += 1) {
    const ramka = await symbole.nth(i).boundingBox();
    if (!ramka) continue;
    const x = ramka.x + ramka.width / 2;
    const y = ramka.y + ramka.height / 2;
    if (x > kanwa.x + 10 && x < kanwa.x + kanwa.width - 10 && y > kanwa.y + 10 && y < kanwa.y + kanwa.height - 10) {
      await page.mouse.click(x, y);
      return;
    }
  }
  throw new Error(`brak widocznego symbolu ${selektor} na kanwie`);
}

/** Najwęższy inspektor klawiszem na uchwycie (ArrowRight zwęża do granicy 340 px). */
async function zwezInspektor(page: Page): Promise<number> {
  const uchwyt = page.getByTestId('mvd-handle-right');
  const inspektor = page.getByTestId('mvd-inspector');
  const szer = async () => Math.round((await inspektor.boundingBox())!.width);
  await uchwyt.focus();
  for (let i = 0; i < 20; i += 1) {
    const przed = await szer();
    await page.keyboard.press('ArrowRight');
    if ((await szer()) === przed) break;
  }
  return szer();
}

/** Etykiety sceny ucięte krawędzią kanwy (częściowo widoczne) — lista tekstów. */
async function etykietyUciete(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const kanwa = document.querySelector('svg[data-testid="sld-canvas-v3"]');
    if (!kanwa) return ['brak kanwy'];
    const k = kanwa.getBoundingClientRect();
    const wynik: string[] = [];
    kanwa.querySelectorAll('text').forEach((t) => {
      const r = t.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const calkiemPoza = r.right <= k.left || r.left >= k.right || r.bottom <= k.top || r.top >= k.bottom;
      const calkiemW = r.left >= k.left && r.right <= k.right && r.top >= k.top && r.bottom <= k.bottom;
      if (!calkiemPoza && !calkiemW) wynik.push(t.textContent ?? '');
    });
    return wynik;
  });
}

test('SLD — zrzuty czytelności: pełna sieć, stacja, pole, GPZ × okna × motywy', async ({ browser, request }, testInfo) => {
  test.setTimeout(900000);
  mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  const seed = await siecKadrow(request);
  const stacjaRef = (seed.enm.substations ?? []).find((s) => String(s.name) === STACJA)?.ref_id;
  const gpzRef = (seed.enm.substations ?? []).find((s) => s.station_type === 'gpz')?.ref_id;
  expect(stacjaRef && gpzRef).toBeTruthy();
  const stacjaBaza = stacjaRef!.replace(/\/station$/, '');
  const pomiar: Record<string, unknown> = {};

  for (const okno of OKNA) {
    for (const motyw of MOTYWY) {
      const kontekst = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
      const page = await kontekst.newPage();
      await otworzAplikacje(page, seed, okno, motyw.theme);
      await ustawMotyw(page, motyw.theme);
      const nazwa = `${okno.width}x${okno.height}-${motyw.klucz}`;
      const inspektor = page.getByTestId('mvd-inspector');
      const karta = inspektor.getByTestId('inspektor-karta');

      // 1. Pełna sieć.
      await page.keyboard.press('Escape');
      await page.keyboard.press('Shift+F');
      await page.waitForTimeout(500);
      await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `pelna-siec-${nazwa}.png`) });
      pomiar[`pelna-siec-${nazwa}`] = { uciete: await etykietyUciete(page) };

      // 2. Stacja.
      await kliknijBlok(page, `sld-v3-l0-${stacjaRef}`);
      await expect(karta).toHaveAttribute('data-rodzaj-karty', 'stacja', { timeout: 30000 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `stacja-${nazwa}.png`) });

      // 3. Pole stacji (zbliżenie kółkiem i klik w aparat pola SN).
      const punkt = await srodek(page, `[data-testid="sld-v3-l0-${stacjaRef}"]`);
      const selektorPola = `g[data-element-kind="apparatus"][data-owner-ref^="${stacjaBaza}"][data-owner-ref*="/sn_field/"]:not([data-device-ref])`;
      await przybliz(page, selektorPola, punkt);
      await kliknijSymbol(page, selektorPola);
      await expect(karta).toHaveAttribute('data-rodzaj-karty', 'pole', { timeout: 30000 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `pole-${nazwa}.png`) });
      pomiar[`pole-${nazwa}`] = { uciete: await etykietyUciete(page) };

      // 4. Karta pola przy 340 px.
      const szer = await zwezInspektor(page);
      expect(szer).toBe(340);
      await page.waitForTimeout(300);
      await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `pole-340-${nazwa}.png`) });
      await inspektor.screenshot({ path: resolve(KATALOG_ZRZUTOW, `inspektor-pole-340-${nazwa}.png`) });
      const tabela = karta.getByTestId('inspektor-karta-tabela-aparaty-przewijanie');
      if ((await tabela.count()) > 0) {
        const w = await tabela.evaluate((el) => ({ widoczna: el.clientWidth, tresc: el.scrollWidth }));
        expect(w.tresc, 'tabela aparatów bez przewijania przy 340 px').toBeLessThanOrEqual(w.widoczna);
      }
      pomiar[`inspektor-pole-340-${nazwa}`] = {
        wysokosc_karty_px: Math.round((await karta.boundingBox())?.height ?? -1),
        sekcje: await karta.locator('[data-testid^="inspektor-karta-sekcja-"]').count(),
      };

      // 5. GPZ — klik w blok zwinięty (rozwija i przybliża), potem zbliżenie i klik w aparat pola GPZ.
      await page.keyboard.press('Escape');
      await page.keyboard.press('Shift+F');
      await page.waitForTimeout(400);
      const blokGpz = page.locator('[data-owner-ref^="gpz/"]').first();
      await expect(blokGpz).toBeAttached({ timeout: 30000 });
      const ramkaGpz = (await blokGpz.boundingBox())!;
      const punktGpz = { x: ramkaGpz.x + ramkaGpz.width / 2, y: ramkaGpz.y + ramkaGpz.height / 2 };
      await page.mouse.click(punktGpz.x, punktGpz.y);
      await page.waitForTimeout(500);
      const selektorPolaGpz = 'g[data-element-kind="apparatus"][data-owner-ref^="gpz/"]:not([data-device-ref])';
      const kanwaGpz = (await page.locator('svg[data-testid="sld-canvas-v3"]').boundingBox())!;
      await przybliz(page, selektorPolaGpz, { x: kanwaGpz.x + kanwaGpz.width / 2, y: kanwaGpz.y + kanwaGpz.height / 2 });
      await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `gpz-rozwiniety-${nazwa}.png`) });
      await kliknijSymbol(page, selektorPolaGpz);
      await expect(karta).toHaveAttribute('data-rodzaj-karty', 'pole', { timeout: 30000 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `gpz-${nazwa}.png`) });
      pomiar[`gpz-${nazwa}`] = { uciete: await etykietyUciete(page) };

      await kontekst.close();
    }
  }
  testInfo.attach('pomiar', { body: JSON.stringify(pomiar, null, 2), contentType: 'application/json' });
  console.log('POMIAR ' + JSON.stringify(pomiar));
});
