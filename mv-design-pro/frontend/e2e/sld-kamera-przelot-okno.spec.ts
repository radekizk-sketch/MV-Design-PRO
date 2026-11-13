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
 *  5. kółko nad kanwą bez skoku geometrii: punkt świata pod kursorem nieruchomy, a geometria
 *     każdego odcinka narysowanego przed i po obrocie kółka (atrybuty kształtu w układzie świata)
 *     jest ta sama — zmienia się tylko kamera;
 *  6. klawisze: `+` i `−` zmieniają skalę o √2 wokół środka kadru, strzałka przesuwa kadr
 *     o 0,2 widoku, `Alt+←` / `Alt+→` przechodzą historią kadrów w obie strony;
 *  7. dwuklik nazwy stacji kadruje stację (okruszki „Sieć › stacja”), okruszek „Sieć” wraca
 *     do kadru całej sieci;
 *  8. nawigator: klik przenosi kadr, kółko nad nawigatorem zmienia skalę wokół środka kadru;
 *  9. powrót do przestrzeni schematu po wyjściu do innej przestrzeni przywraca ostatni kadr
 *     (pamięć kamery per projekt).
 * Iloczyn: {motyw ciemny, jasny} × {okno 1440×900, 1280×720} dla punktów 5–9.
 *
 * Zrzuty w obu motywach (materiał oceny właściciela, B-02 — spec nie ocenia wyglądu): okno
 * powiększenia w toku, menu wskaźnika skali, kadr po skali czytania (1440×900) oraz kadr całej
 * sieci, kadr roboczy (stacja po dwukliku), skala czytania, powiększenie oknem i nawigator przy
 * 1440×900 i 1280×720. Katalog: `docs/uiux/zrzuty/sld-skala-i-nawigacja/po` przez
 * `katalogZrzutow`.
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

/** Kadr PO poleceniu widoku: polecenie (klawisz, klik, puszczenie przycisku) zmienia kamerę
 *  w następnym renderze, więc sam odczyt spoczynku tuż po nim widziałby jeszcze kadr sprzed
 *  polecenia — czekamy na zmianę `viewBox`, potem na spoczynek. */
async function kadrPo(kanwa: Locator, przed: string): Promise<string> {
  await expect.poll(() => viewBox(kanwa), { timeout: 10000 }).not.toBe(przed);
  return spoczynek(kanwa);
}

/** Kadr ustalony: dwa kolejne odczyty (co 300 ms) w spoczynku dają ten sam `viewBox` — dla
 *  polecenia, które może nie zmienić kadru (np. „Cała sieć” na starcie). */
async function kadrUstalony(page: Page, kanwa: Locator): Promise<string> {
  let poprzedni = await spoczynek(kanwa);
  for (let i = 0; i < 20; i += 1) {
    await page.waitForTimeout(300);
    const biezacy = await spoczynek(kanwa);
    if (biezacy === poprzedni) return biezacy;
    poprzedni = biezacy;
  }
  return poprzedni;
}

/** Kamera dochodzi do OCZEKIWANEGO kadru (polecenie widoku, historia, pamięć kamery). */
async function doKadru(kanwa: Locator, oczekiwany: string, opis: string): Promise<void> {
  await expect.poll(() => viewBox(kanwa), { timeout: 10000, message: opis }).toBe(oczekiwany);
  expect(await spoczynek(kanwa), opis).toBe(oczekiwany);
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
    const kadrSieci = await kadrUstalony(page, kanwa);
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
    await doKadru(kanwa, kadrSieci, 'menu „Cała sieć” = Shift+F');

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
    const kadrOkna = await kadrPo(kanwa, kadrSieci);
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
    await doKadru(kanwa, kadrSieci, 'Alt+← po oknie wraca do kadru sieci');

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
    await doKadru(kanwa, kadrOkna, 'okno z przycisku = okno z klawisza Z');
    await page.keyboard.press('Shift+F');
    await doKadru(kanwa, kadrSieci, 'Shift+F po oknie');

    // (4) Przelot przy preferencji ruchu bez ograniczeń.
    await page.mouse.move(kursor.x, kursor.y);
    await page.keyboard.press('Shift+Digit1');
    const kadrCzytania = await kadrPo(kanwa, kadrSieci);
    await page.keyboard.press('Shift+F');
    await doKadru(kanwa, kadrSieci, 'Shift+F po skali czytania');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.keyboard.press('Shift+Digit1');
    await doKadru(kanwa, kadrCzytania, 'przelot do skali czytania kończy się w kadrze cięcia');
    const [probki] = await Promise.all([probkiPrzelotu(kanwa), page.keyboard.press('Shift+F')]);
    expect(probki.stany, 'kamera przechodzi przez stan przelotu').toContain('przelot');
    const posrednie = new Set(probki.kadry.filter((k) => k !== kadrSieci && k !== kadrCzytania));
    expect(posrednie.size, 'przelot przechodzi przez kadry pośrednie').toBeGreaterThanOrEqual(3);
    await doKadru(kanwa, kadrSieci, 'przelot do sieci kończy się w kadrze cięcia');
    // Kółko w trakcie przelotu przerywa go od razu (cięcie do celu, potem gest kółka).
    await page.keyboard.press('Shift+Digit1');
    await expect(kanwa).toHaveAttribute('data-stan-kamery', 'przelot');
    await page.mouse.wheel(0, -100);
    await expect(kanwa).toHaveAttribute('data-stan-kamery', 'spoczynek', { timeout: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });
}


/** Geometria odcinków w DOM: atrybuty kształtu (układ świata) każdego węzła odcinka, bez grubości
 *  kreski (podłoga ekranowa R5 zależy od skali z definicji). */
async function geometriaOdcinkow(kanwa: Locator): Promise<Record<string, string>> {
  return kanwa.evaluate((el) => {
    const out: Record<string, string> = {};
    const grupa = el.querySelector('[data-testid="sld-v3-segments"]');
    for (const n of Array.from(grupa?.children ?? [])) {
      const id = n.getAttribute('data-testid') ?? n.querySelector('[data-testid]')?.getAttribute('data-testid');
      if (!id) continue;
      const ksztalt = [n, ...Array.from(n.querySelectorAll('*'))]
        .map((e) => ['d', 'points', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r'].map((a) => e.getAttribute(a) ?? '').join(','))
        .join(';');
      out[id] = ksztalt;
    }
    return out;
  });
}

const srodekKadru = (vb: string) => {
  const [x, y, w, h] = vb.split(/\s+/).map(Number);
  return { x: x + w / 2, y: y + h / 2, w, h };
};

for (const motyw of [
  { klucz: 'ciemny', theme: 'dark_scada' as const },
  { klucz: 'jasny', theme: 'light_technical' as const },
]) {
  for (const okno of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
  ]) {
    const rozmiar = `${okno.width}x${okno.height}`;
    test(`R7 — kółko bez skoku geometrii, klawisze, okruszki, nawigator, powrót do przestrzeni (${motyw.klucz}, ${rozmiar})`, async ({ page, request }) => {
      test.setTimeout(600000);
      mkdirSync(KATALOG, { recursive: true });
      const zrzut = (nazwa: string) => page.screenshot({ path: resolve(KATALOG, `r7-${nazwa}-${motyw.klucz}-${rozmiar}.png`) });
      const seed = await siecKadrow(request);
      await otworzAplikacje(page, seed, okno);
      await ustawMotyw(page, motyw.theme);
      await page.getByRole('button', { name: /^Schemat \(SLD\)/ }).first().click();
      const kanwa = page.getByTestId('sld-canvas-v3');
      await expect(kanwa).toBeVisible();
      await page.keyboard.press('Shift+F');
      const kadrSieci = await kadrUstalony(page, kanwa);
      await zrzut('kadr-calej-sieci');
      const ramka = (await kanwa.boundingBox())!;
      const kursor = { x: ramka.x + ramka.width * 0.4, y: ramka.y + ramka.height * 0.55 };

      // (5) Kółko bez skoku geometrii — w skali czytania (obiekty mają pełne glify).
      await page.mouse.move(kursor.x, kursor.y);
      await page.keyboard.press('Shift+Digit1');
      await expect(kanwa).toHaveAttribute('data-skala-kamery', '1.0000');
      await spoczynek(kanwa);
      await zrzut('skala-czytania');
      const geoPrzed = await geometriaOdcinkow(kanwa);
      const swiatPrzed = await swiatPod(kanwa, kursor);
      const skalaPrzedKolkiem = Number(await kanwa.getAttribute('data-skala-kamery'));
      const kadrPrzedKolkiem = await spoczynek(kanwa);
      await page.mouse.wheel(0, -120);
      await expect.poll(async () => Number(await kanwa.getAttribute('data-skala-kamery'))).toBeGreaterThan(skalaPrzedKolkiem);
      await kadrPo(kanwa, kadrPrzedKolkiem);
      const swiatPo = await swiatPod(kanwa, kursor);
      expect(Math.abs(swiatPo.x - swiatPrzed.x), 'kółko: punkt świata pod kursorem nieruchomy (x)').toBeLessThan(0.5);
      expect(Math.abs(swiatPo.y - swiatPrzed.y), 'kółko: punkt świata pod kursorem nieruchomy (y)').toBeLessThan(0.5);
      const geoPo = await geometriaOdcinkow(kanwa);
      const wspolne = Object.keys(geoPrzed).filter((id) => id in geoPo);
      expect(wspolne.length, 'odcinki narysowane przed i po obrocie kółka').toBeGreaterThan(0);
      for (const id of wspolne) expect(geoPo[id], `geometria odcinka ${id} bez zmian`).toBe(geoPrzed[id]);

      // (6) Klawisze: + / − (√2 wokół środka), strzałka (0,2 widoku), historia w obie strony.
      const vbA = await spoczynek(kanwa);
      const skalaA = Number(await kanwa.getAttribute('data-skala-kamery'));
      await page.keyboard.press('Equal');
      const vbPlus = await kadrPo(kanwa, vbA);
      const skalaPlus = Number(await kanwa.getAttribute('data-skala-kamery'));
      expect(skalaPlus / skalaA, '+ powiększa o √2').toBeCloseTo(Math.SQRT2, 2);
      expect(Math.abs(srodekKadru(vbPlus).x - srodekKadru(vbA).x), '+ wokół środka kadru (x)').toBeLessThan(0.5);
      expect(Math.abs(srodekKadru(vbPlus).y - srodekKadru(vbA).y), '+ wokół środka kadru (y)').toBeLessThan(0.5);
      await page.keyboard.press('Minus');
      await kadrPo(kanwa, vbPlus);
      expect(Number(await kanwa.getAttribute('data-skala-kamery')) / skalaA, '− oddala o √2').toBeCloseTo(1, 2);
      const vbPrzedStrzalka = await spoczynek(kanwa);
      await page.keyboard.press('ArrowRight');
      const vbStrzalka = await kadrPo(kanwa, vbPrzedStrzalka);
      const przesuniecie = srodekKadru(vbStrzalka).x - srodekKadru(vbPrzedStrzalka).x;
      expect(Math.abs(przesuniecie) / srodekKadru(vbPrzedStrzalka).w, 'strzałka przesuwa kadr o 0,2 widoku').toBeCloseTo(0.2, 2);
      await page.keyboard.press('Shift+F');
      await doKadru(kanwa, kadrSieci, 'Shift+F — cała sieć');
      await page.keyboard.press('Alt+ArrowLeft');
      await doKadru(kanwa, vbStrzalka, 'Alt+← cofa do kadru sprzed „Cała sieć”');
      await page.keyboard.press('Alt+ArrowRight');
      await doKadru(kanwa, kadrSieci, 'Alt+→ przechodzi naprzód do kadru całej sieci');

      // (7) Dwuklik nazwy stacji → kadr stacji z okruszkami; okruszek „Sieć” wraca.
      const stacja = (seed.enm.substations ?? []).find((st) => st.name === 'Stacja Sekcyjna')!;
      // Każdy wiersz nazwy stacji jest tym samym celem (stacja); obszary trafień kolejnych wierszy
      // zachodzą na siebie (rozszerzenie do 24 px), wierzchni jest ostatni w kolejności rysowania.
      const uchwyt = page.locator(`[data-hit-owner-ref^="${stacja.ref_id}#name-row"]`).last();
      await expect(uchwyt).toHaveCount(1, { timeout: 30000 });
      await uchwyt.dblclick();
      await expect(page.getByTestId('sld-v3-sciezka-1')).toHaveText('Stacja Sekcyjna', { timeout: 10000 });
      await expect(page.getByTestId('sld-v3-sciezka-0')).toHaveText('Sieć');
      await kadrPo(kanwa, kadrSieci);
      await zrzut('kadr-roboczy-stacja');
      await page.getByTestId('sld-v3-sciezka-0').click();
      await doKadru(kanwa, kadrSieci, 'okruszek „Sieć” wraca do kadru całej sieci');

      // Powiększenie oknem (materiał oceny w obu rozmiarach okna).
      const a = { x: ramka.x + ramka.width * 0.3, y: ramka.y + ramka.height * 0.35 };
      const b = { x: ramka.x + ramka.width * 0.55, y: ramka.y + ramka.height * 0.65 };
      await page.keyboard.press('z');
      await przeciagnij(page, a, b, async () => {
        await expect(page.getByTestId('sld-v3-okno-powiekszenia')).toBeVisible();
        await zrzut('powiekszenie-oknem-w-toku');
      });
      const kadrOkna = await kadrPo(kanwa, kadrSieci);
      await zrzut('powiekszenie-oknem-wynik');

      // (8) Nawigator: klik przenosi kadr, kółko zmienia skalę wokół środka kadru.
      await page.getByTestId('sld-v3-minimap-toggle').click();
      const nawigator = page.getByTestId('sld-v3-minimap-svg');
      await expect(nawigator).toBeVisible();
      const rn = (await nawigator.boundingBox())!;
      await page.mouse.click(rn.x + rn.width * 0.8, rn.y + rn.height * 0.5);
      const kadrNawigatora = await kadrPo(kanwa, kadrOkna);
      const skalaN = Number(await kanwa.getAttribute('data-skala-kamery'));
      await page.mouse.move(rn.x + rn.width * 0.5, rn.y + rn.height * 0.5);
      await page.mouse.wheel(0, -120);
      await expect.poll(async () => Number(await kanwa.getAttribute('data-skala-kamery')), { message: 'kółko nad nawigatorem przybliża' }).toBeGreaterThan(skalaN);
      const kadrKolkaN = await kadrPo(kanwa, kadrNawigatora);
      expect(Math.abs(srodekKadru(kadrKolkaN).x - srodekKadru(kadrNawigatora).x), 'kółko nad nawigatorem wokół środka kadru (x)').toBeLessThan(0.5);
      expect(Math.abs(srodekKadru(kadrKolkaN).y - srodekKadru(kadrNawigatora).y), 'kółko nad nawigatorem wokół środka kadru (y)').toBeLessThan(0.5);
      await zrzut('nawigator');

      // (9) Powrót do przestrzeni schematu przywraca ostatni kadr.
      await page.getByRole('button', { name: /^Obliczenia \d$/ }).click();
      await expect(kanwa).toHaveCount(0);
      await page.getByRole('button', { name: /^Schemat \(SLD\)/ }).first().click();
      await expect(page.getByTestId('sld-canvas-v3')).toBeVisible();
      await doKadru(page.getByTestId('sld-canvas-v3'), kadrKolkaN, 'powrót do schematu: ten sam kadr');
    });
  }
}
