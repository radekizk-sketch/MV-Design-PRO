/**
 * Karta SLD-SKALA-I-NAWIGACJA, R7 — KAMERA SCHEMATU na REALNYM backendzie, ścieżką NATYWNĄ
 * (klawisze, ruch i przyciski myszy Playwrighta w żywej aplikacji, bez zdarzeń syntetycznych).
 *
 * Co spec dowodzi:
 *  1. Shift+1 — skala czytania (100 %, `data-skala-kamery` = 1) WOKÓŁ KURSORA: punkt świata pod
 *     kursorem przed i po jest ten sam; wskaźnik skali pokazuje 100 %;
 *  2. wskaźnik skali — menu „Cała sieć” daje ten sam kadr co Shift+F;
 *  3. powiększenie oknem — klawisz Z + przeciągnięcie myszą: narożniki okna w kadrze, skala
 *     większa, tryb się kończy; przycisk „⬚” (Powiększ oknem) doku widoku — ten sam tryb; Alt+← wraca DOKŁADNIE do
 *     kadru sprzed okna; Shift+przeciągnięcie w trybie okna pozostaje lassem;
 *  4. przelot (preferencja ruchu bez ograniczeń): Shift+F po Shift+1 przechodzi przez stan
 *     „przelot” i ≥ 3 różne kadry pośrednie, kończy się w kadrze identycznym z cięciem
 *     (`prefers-reduced-motion: reduce`, ustawienie domyślne biegu e2e); kółko w trakcie przelotu
 *     przerywa go od razu.
 *
 * Zrzuty 1440×900 w obu motywach (materiał oceny właściciela, B-02 — spec nie ocenia wyglądu):
 * okno powiększenia w toku, menu wskaźnika skali, kadr po skali czytania. Katalog:
 * `docs/uiux/zrzuty/sld-skala-i-nawigacja/po` przez `katalogZrzutow`.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { katalogZrzutow } from './katalogZrzutow';
import { otworzAplikacje, siecKadrow, ustawMotyw } from './siecKadrowStacji';

const HERE = dirname(fileURLToPath(import.meta.url));
const KATALOG = katalogZrzutow(resolve(HERE, '..', '..', 'docs', 'uiux', 'zrzuty', 'sld-skala-i-nawigacja', 'po'));
const SZEROKOSC = 1440;
const WYSOKOSC = 900;

const viewBox = (kanwa: Locator) => kanwa.getAttribute('viewBox');

async function spoczynek(kanwa: Locator): Promise<string> {
  await expect(kanwa).toHaveAttribute('data-stan-kamery', 'spoczynek', { timeout: 10000 });
  return (await viewBox(kanwa))!;
}

/** Punkt świata pod punktem ekranu (`viewBox` i prostokąt kanwy). */
async function swiatPod(kanwa: Locator, p: { x: number; y: number }): Promise<{ x: number; y: number }> {
  return kanwa.evaluate((el, punkt) => {
    const svg = el as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    return { x: vb.x + ((punkt.x - r.left) * vb.width) / r.width, y: vb.y + ((punkt.y - r.top) * vb.height) / r.height };
  }, p);
}

async function ekranZ(kanwa: Locator, p: { x: number; y: number }): Promise<{ x: number; y: number }> {
  return kanwa.evaluate((el, punkt) => {
    const svg = el as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    return { x: r.left + ((punkt.x - vb.x) * r.width) / vb.width, y: r.top + ((punkt.y - vb.y) * r.height) / vb.height };
  }, p);
}

async function przeciagnij(page: Page, a: { x: number; y: number }, b: { x: number; y: number }, przedPuszczeniem?: () => Promise<void>) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  if (przedPuszczeniem) await przedPuszczeniem();
  await page.mouse.up();
}

/** Próbki `viewBox` i stanu kamery w każdej klatce, aż kamera wróci do spoczynku. */
async function probkiPrzelotu(kanwa: Locator): Promise<{ readonly kadry: readonly string[]; readonly stany: readonly string[] }> {
  return kanwa.evaluate(
    (el) =>
      new Promise<{ kadry: string[]; stany: string[] }>((gotowe) => {
        const kadry: string[] = [];
        const stany: string[] = [];
        const start = performance.now();
        const krok = () => {
          kadry.push(el.getAttribute('viewBox') ?? '');
          const stan = el.getAttribute('data-stan-kamery') ?? '';
          stany.push(stan);
          if ((stan === 'spoczynek' && stany.includes('przelot')) || performance.now() - start > 3000) gotowe({ kadry, stany });
          else requestAnimationFrame(krok);
        };
        requestAnimationFrame(krok);
      }),
  );
}

for (const motyw of [
  { klucz: 'ciemny', theme: 'dark_scada' as const },
  { klucz: 'jasny', theme: 'light_technical' as const },
]) {
  test(`R7 — kamera: skala czytania, okno, wskaźnik skali i przelot (${motyw.klucz})`, async ({ page, request }) => {
    test.setTimeout(600000);
    mkdirSync(KATALOG, { recursive: true });
    const seed = await siecKadrow(request);
    await otworzAplikacje(page, seed, { width: SZEROKOSC, height: WYSOKOSC });
    await ustawMotyw(page, motyw.theme);
    await page.getByRole('button', { name: /^Schemat \(SLD\)/ }).first().click();
    const kanwa = page.getByTestId('sld-canvas-v3');
    await expect(kanwa).toBeVisible();
    await page.keyboard.press('Shift+F');
    const kadrSieci = await spoczynek(kanwa);
    const ramka = (await kanwa.boundingBox())!;

    // (1) Shift+1 wokół kursora.
    const kursor = { x: ramka.x + ramka.width * 0.35, y: ramka.y + ramka.height * 0.6 };
    await page.mouse.move(kursor.x, kursor.y);
    const przed = await swiatPod(kanwa, kursor);
    await page.keyboard.press('Shift+Digit1');
    await expect(kanwa).toHaveAttribute('data-skala-kamery', '1.0000');
    await spoczynek(kanwa);
    const po = await swiatPod(kanwa, kursor);
    expect(Math.abs(po.x - przed.x), 'punkt świata pod kursorem nieruchomy (x)').toBeLessThan(0.5);
    expect(Math.abs(po.y - przed.y), 'punkt świata pod kursorem nieruchomy (y)').toBeLessThan(0.5);
    const wskaznik = page.getByTestId('sld-v3-wskaznik-skali-toggle');
    await expect(wskaznik).toHaveAttribute('data-procent', '100');
    await expect(wskaznik).toContainText('100 %');
    await page.screenshot({ path: resolve(KATALOG, `r7-skala-czytania-${motyw.klucz}.png`) });

    // (2) Wskaźnik skali — menu, „Cała sieć” = Shift+F.
    await wskaznik.click();
    await expect(page.getByTestId('sld-v3-wskaznik-skali-menu')).toBeVisible();
    await expect(page.getByTestId('sld-v3-skala-zaznaczenie')).toBeDisabled();
    await page.screenshot({ path: resolve(KATALOG, `r7-wskaznik-skali-menu-${motyw.klucz}.png`) });
    await page.getByTestId('sld-v3-skala-siec').click();
    expect(await spoczynek(kanwa), 'menu „Cała sieć” = Shift+F').toBe(kadrSieci);

    // (3) Powiększenie oknem: Z + przeciągnięcie.
    const a = { x: ramka.x + ramka.width * 0.3, y: ramka.y + ramka.height * 0.35 };
    const b = { x: ramka.x + ramka.width * 0.55, y: ramka.y + ramka.height * 0.65 };
    const swiatA = await swiatPod(kanwa, a);
    const swiatB = await swiatPod(kanwa, b);
    const skalaPrzed = Number(await kanwa.getAttribute('data-skala-kamery'));
    await page.keyboard.press('z');
    const nakladka = page.getByTestId('sld-v3-lasso-capture');
    await expect(nakladka).toHaveAttribute('data-tryb-okna', 'tak');
    await expect(page.getByTestId('sld-v3-powieksz-oknem')).toHaveAttribute('aria-pressed', 'true');
    await przeciagnij(page, a, b, async () => {
      await expect(page.getByTestId('sld-v3-okno-powiekszenia')).toBeVisible();
      await page.screenshot({ path: resolve(KATALOG, `r7-okno-w-toku-${motyw.klucz}.png`) });
    });
    const kadrOkna = await spoczynek(kanwa);
    await expect(nakladka).not.toHaveAttribute('data-tryb-okna', 'tak');
    expect(Number(await kanwa.getAttribute('data-skala-kamery')), 'okno powiększa').toBeGreaterThan(skalaPrzed);
    const ramkaPo = (await kanwa.boundingBox())!;
    for (const [nazwa, p] of [
      ['lewy górny', swiatA],
      ['prawy dolny', swiatB],
    ] as const) {
      const e = await ekranZ(kanwa, p);
      expect(e.x, `${nazwa} narożnik okna w kadrze (x)`).toBeGreaterThanOrEqual(ramkaPo.x - 0.5);
      expect(e.x, `${nazwa} narożnik okna w kadrze (x)`).toBeLessThanOrEqual(ramkaPo.x + ramkaPo.width + 0.5);
      expect(e.y, `${nazwa} narożnik okna w kadrze (y)`).toBeGreaterThanOrEqual(ramkaPo.y - 0.5);
      expect(e.y, `${nazwa} narożnik okna w kadrze (y)`).toBeLessThanOrEqual(ramkaPo.y + ramkaPo.height + 0.5);
    }
    await page.keyboard.press('Alt+ArrowLeft');
    expect(await spoczynek(kanwa), 'Alt+← po oknie wraca do kadru sieci').toBe(kadrSieci);

    // Przycisk paska — ten sam tryb; Shift+przeciągnięcie pozostaje lassem.
    await page.getByTestId('sld-v3-powieksz-oknem').click();
    await expect(nakladka).toHaveAttribute('data-tryb-okna', 'tak');
    await page.keyboard.down('Shift');
    await przeciagnij(page, a, b, async () => {
      await expect(page.getByTestId('sld-lasso')).toBeVisible();
      await expect(page.getByTestId('sld-v3-okno-powiekszenia')).toHaveCount(0);
    });
    await page.keyboard.up('Shift');
    expect(await spoczynek(kanwa), 'lasso w trybie okna nie rusza kamery').toBe(kadrSieci);
    await przeciagnij(page, a, b);
    expect(await spoczynek(kanwa), 'okno z przycisku = okno z klawisza Z').toBe(kadrOkna);
    await page.keyboard.press('Shift+F');
    await spoczynek(kanwa);

    // (4) Przelot przy preferencji ruchu bez ograniczeń.
    await page.mouse.move(kursor.x, kursor.y);
    await page.keyboard.press('Shift+Digit1');
    const kadrCzytania = await spoczynek(kanwa);
    await page.keyboard.press('Shift+F');
    expect(await spoczynek(kanwa)).toBe(kadrSieci);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.keyboard.press('Shift+Digit1');
    expect(await spoczynek(kanwa), 'przelot do skali czytania kończy się w kadrze cięcia').toBe(kadrCzytania);
    const [probki] = await Promise.all([probkiPrzelotu(kanwa), page.keyboard.press('Shift+F')]);
    expect(probki.stany, 'kamera przechodzi przez stan przelotu').toContain('przelot');
    const posrednie = new Set(probki.kadry.filter((k) => k !== kadrSieci && k !== kadrCzytania));
    expect(posrednie.size, 'przelot przechodzi przez kadry pośrednie').toBeGreaterThanOrEqual(3);
    expect(await spoczynek(kanwa), 'przelot do sieci kończy się w kadrze cięcia').toBe(kadrSieci);
    // Kółko w trakcie przelotu przerywa go od razu (cięcie do celu, potem gest kółka).
    await page.keyboard.press('Shift+Digit1');
    await expect(kanwa).toHaveAttribute('data-stan-kamery', 'przelot');
    await page.mouse.wheel(0, -100);
    await expect(kanwa).toHaveAttribute('data-stan-kamery', 'spoczynek', { timeout: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });
}
