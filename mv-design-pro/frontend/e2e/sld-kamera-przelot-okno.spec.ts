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
import { mkdirSync, writeFileSync } from 'node:fs';
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

/** Stan nawigatora ustawiany jawnie (przełącznik z `aria-expanded`), nie przez liczbę kliknięć. */
async function ustawNawigator(page: Page, otwarty: boolean): Promise<void> {
  const przelacznik = page.getByTestId('sld-v3-minimap-toggle');
  if ((await przelacznik.getAttribute('aria-expanded')) !== String(otwarty)) await przelacznik.click();
  await expect(przelacznik).toHaveAttribute('aria-expanded', String(otwarty));
}

/** Kamera dochodzi do OCZEKIWANEGO kadru (polecenie widoku, historia, pamięć kamery). */
async function doKadru(kanwa: Locator, oczekiwany: string, opis: string): Promise<void> {
  await expect.poll(() => viewBox(kanwa), { timeout: 10000, message: opis }).toBe(oczekiwany);
  expect(await spoczynek(kanwa), opis).toBe(oczekiwany);
}

/** Punkt TREŚCI schematu do celowania kursorem i oknem: środek pola stacji (obszar trafienia
 *  klasy „pole” — kolumna aparatów pod szyną) najbliższego środka kanwy, w jej wewnętrznym pasie
 *  20–80 % (z dala od doków). Środek pola, nie szyna: skala czytania wokół szyny zostawiała pół
 *  kadru pustego nad nią. Zrzut „skala czytania” i „powiększenie oknem” celowany w pusty obszar
 *  niczego nie dowodzi. */
async function celTresci(kanwa: Locator): Promise<{ x: number; y: number; ref: string }> {
  const cel = await kanwa.evaluate((svg) => {
    const k = svg.getBoundingClientRect();
    const sx = k.left + k.width / 2;
    const sy = k.top + k.height / 2;
    let najlepszy: { x: number; y: number; ref: string; d: number } | null = null;
    for (const e of Array.from(svg.querySelectorAll('[data-hit-klasa="pole"]'))) {
      const r = e.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (x < k.left + 0.2 * k.width || x > k.right - 0.2 * k.width) continue;
      if (y < k.top + 0.2 * k.height || y > k.bottom - 0.2 * k.height) continue;
      const d = (x - sx) ** 2 + (y - sy) ** 2;
      if (!najlepszy || d < najlepszy.d) najlepszy = { x, y, ref: e.getAttribute('data-hit-owner-ref') ?? '', d };
    }
    return najlepszy;
  });
  expect(cel, 'na kadrze całej sieci jest pole stacji w wewnętrznym pasie kanwy').not.toBeNull();
  return { x: cel!.x, y: cel!.y, ref: cel!.ref };
}

/** Przy punkcie ekranu (w promieniu 32 px — kursor celuje w oś pola, aparaty stoją na niej
 *  w odstępach) leży obiekt schematu: obszar trafienia z refem obiektu. */
async function obiektPod(page: Page, p: { x: number; y: number }): Promise<string | null> {
  return page.evaluate((punkt) => {
    for (let r = 0; r <= 32; r += 8) {
      for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
        const ref = document
          .elementsFromPoint(punkt.x + dx, punkt.y + dy)
          .find((e) => e.hasAttribute('data-hit-owner-ref'))
          ?.getAttribute('data-hit-owner-ref');
        if (ref) return ref;
      }
    }
    return null;
  }, p);
}

/** Refy obiektów, których obszar trafienia przecina prostokąt ekranu [a, b]. */
async function refyWProstokacie(kanwa: Locator, a: { x: number; y: number }, b: { x: number; y: number }): Promise<string[]> {
  return kanwa.evaluate(
    (svg, [p, q]) => {
      const out = new Set<string>();
      for (const e of Array.from(svg.querySelectorAll('[data-hit-owner-ref]'))) {
        const r = e.getBoundingClientRect();
        if (r.right < p.x || r.left > q.x || r.bottom < p.y || r.top > q.y) continue;
        out.add(e.getAttribute('data-hit-owner-ref')!);
      }
      return [...out].sort();
    },
    [a, b] as const,
  );
}

/** Okno powiększenia wokół punktu treści (ułamek kanwy), wewnątrz kanwy. */
function oknoWokol(ramka: { x: number; y: number; width: number; height: number }, c: { x: number; y: number }) {
  const pw = ramka.width * 0.14;
  const ph = ramka.height * 0.16;
  const x0 = Math.max(ramka.x + 20, c.x - pw);
  const y0 = Math.max(ramka.y + 60, c.y - ph);
  return { a: { x: x0, y: y0 }, b: { x: Math.min(ramka.x + ramka.width - 20, c.x + pw), y: Math.min(ramka.y + ramka.height - 50, c.y + ph) } };
}

/** Po powiększeniu oknem w kadrze są obiekty, które okno obejmowało (cel w kadrze). */
async function celWKadrze(kanwa: Locator, refy: readonly string[], opis: string): Promise<void> {
  expect(refy.length, `${opis}: okno obejmuje obiekty schematu`).toBeGreaterThan(0);
  const widoczne = await kanwa.evaluate((svg, lista) => {
    const k = svg.getBoundingClientRect();
    const zbior = new Set(lista);
    let n = 0;
    for (const e of Array.from(svg.querySelectorAll('[data-hit-owner-ref]'))) {
      if (!zbior.has(e.getAttribute('data-hit-owner-ref')!)) continue;
      const r = e.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (x > k.left && x < k.right && y > k.top && y < k.bottom) n += 1;
    }
    return n;
  }, refy);
  expect(widoczne, `${opis}: obiekty z okna są w kadrze po powiększeniu`).toBeGreaterThan(0);
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
    const kursor = await celTresci(kanwa);
    await page.mouse.move(kursor.x, kursor.y);
    const przed = await swiatPod(kanwa, kursor);
    await page.keyboard.press('Shift+Digit1');
    await expect(kanwa).toHaveAttribute('data-skala-kamery', '1.0000');
    await spoczynek(kanwa);
    const po = await swiatPod(kanwa, kursor);
    expect(Math.abs(po.x - przed.x), 'punkt świata pod kursorem nieruchomy (x)').toBeLessThan(0.5);
    expect(Math.abs(po.y - przed.y), 'punkt świata pod kursorem nieruchomy (y)').toBeLessThan(0.5);
    expect(await obiektPod(page, kursor), 'skala czytania: pod kursorem obiekt schematu (cel w kadrze)').not.toBeNull();
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
    const { a, b } = oknoWokol(ramka, kursor);
    const refyOkna = await refyWProstokacie(kanwa, a, b);
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
    await celWKadrze(kanwa, refyOkna, 'powiększenie oknem');
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

    // Przycisk paska — ten sam tryb.
    await page.getByTestId('sld-v3-powieksz-oknem').click();
    await expect(nakladka).toHaveAttribute('data-tryb-okna', 'tak');
    await przeciagnij(page, a, b);
    await doKadru(kanwa, kadrOkna, 'okno z przycisku = okno z klawisza Z');
    await page.keyboard.press('Shift+F');
    await doKadru(kanwa, kadrSieci, 'Shift+F po oknie');

    // Shift+przeciągnięcie w trybie okna pozostaje lassem. Lasso nad treścią ZAZNACZA obiekty, więc
    // otwiera inspektor, a ten zwęża kanwę — `viewBox` zmienia się z rozmiarem kanwy, kamera nie:
    // skala i środek kadru te same. Zdjęcie zaznaczenia przywraca kanwę i ten sam kadr.
    await page.getByTestId('sld-v3-powieksz-oknem').click();
    await expect(nakladka).toHaveAttribute('data-tryb-okna', 'tak');
    const skalaSieci = await kanwa.getAttribute('data-skala-kamery');
    await page.keyboard.down('Shift');
    await przeciagnij(page, a, b, async () => {
      await expect(page.getByTestId('sld-lasso')).toBeVisible();
      await expect(page.getByTestId('sld-v3-okno-powiekszenia')).toHaveCount(0);
    });
    await page.keyboard.up('Shift');
    const poLassie = await kadrUstalony(page, kanwa);
    expect(await kanwa.getAttribute('data-skala-kamery'), 'lasso w trybie okna nie zmienia skali').toBe(skalaSieci);
    expect(Math.abs(srodekKadru(poLassie).x - srodekKadru(kadrSieci).x), 'lasso w trybie okna nie przesuwa kadru (x)').toBeLessThan(0.5);
    expect(Math.abs(srodekKadru(poLassie).y - srodekKadru(kadrSieci).y), 'lasso w trybie okna nie przesuwa kadru (y)').toBeLessThan(0.5);
    await page.keyboard.press('z');
    await expect(nakladka).not.toHaveAttribute('data-tryb-okna', 'tak');
    await page.keyboard.press('Escape');
    await doKadru(kanwa, kadrSieci, 'po zdjęciu zaznaczenia kanwa i kadr jak przed lassem');

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


type Prost = { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
async function prostokat(page: Page, selektor: string): Promise<Prost | null> {
  return page.evaluate((sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, selektor);
}
const rozlaczne = (a: Prost, b: Prost) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;

/** Pas narzędzi kanwy (każda grupa i menu „Narzędzia”) leży w obrębie kanwy. */
async function pasMiesciSieWKanwie(page: Page, kanwa: Locator, opis: string): Promise<void> {
  const k = (await kanwa.boundingBox())!;
  const grupy = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="sld-v3-toolbar"] > [data-toolbar-group]')).map((g) => {
      const r = g.getBoundingClientRect();
      return { id: g.getAttribute('data-toolbar-group'), left: r.left, right: r.right };
    }),
  );
  expect(grupy.length, `${opis}: pas narzędzi narysowany`).toBeGreaterThan(0);
  for (const g of grupy) {
    expect(g.left, `${opis}: grupa ${g.id} w kanwie (lewa krawędź)`).toBeGreaterThanOrEqual(k.x - 0.5);
    expect(g.right, `${opis}: grupa ${g.id} w kanwie (prawa krawędź)`).toBeLessThanOrEqual(k.x + k.width + 0.5);
  }
}

/** Nawigator w prawym-dolnym rogu kanwy, w jej obrębie, rozłączny z dokami; ramka kadru w panelu. */
async function nawigatorWRoguKanwy(page: Page, kanwa: Locator): Promise<void> {
  const k = (await kanwa.boundingBox())!;
  const panel = (await prostokat(page, '[data-testid="sld-v3-minimap-panel"]'))!;
  expect(panel.left).toBeGreaterThanOrEqual(k.x);
  expect(panel.top).toBeGreaterThanOrEqual(k.y);
  expect(panel.right, 'nawigator przy prawej krawędzi kanwy').toBeLessThanOrEqual(k.x + k.width);
  expect(panel.right, 'nawigator przy prawej krawędzi kanwy').toBeGreaterThan(k.x + k.width - 40);
  expect(panel.bottom).toBeLessThanOrEqual(k.y + k.height);
  expect(panel.bottom, 'nawigator w dolnej części kanwy').toBeGreaterThan(k.y + k.height - 120);
  for (const dok of [
    '[data-testid="sld-v3-toolbar"]',
    '[data-testid="sld-v3-proof-packs-dock"]',
    '[data-testid="sld-v3-wskaznik-skali"]',
    '[data-testid="sld-v3-layer-panel-toggle"]',
    '[data-testid="sld-v3-minimap-toggle"]',
  ]) {
    const d = await prostokat(page, dok);
    if (d) expect(rozlaczne(panel, d), `nawigator nie nachodzi na ${dok}`).toBe(true);
  }
  const svg = (await prostokat(page, '[data-testid="sld-v3-minimap-svg"]'))!;
  const ramka = await prostokat(page, '[data-testid="sld-v3-minimap-frame"]');
  if (ramka && ramka.right > ramka.left) {
    expect(ramka.left, 'ramka kadru w panelu (lewa)').toBeGreaterThanOrEqual(svg.left - 0.5);
    expect(ramka.right, 'ramka kadru w panelu (prawa)').toBeLessThanOrEqual(svg.right + 0.5);
    expect(ramka.top, 'ramka kadru w panelu (góra)').toBeGreaterThanOrEqual(svg.top - 0.5);
    expect(ramka.bottom, 'ramka kadru w panelu (dół)').toBeLessThanOrEqual(svg.bottom + 0.5);
  }
}

/**
 * B-02 2026-11-13 (P0-02): WOLNA KANWA — prostokąt kanwy bez pasa narzędzi (z mini-ścieżką kadru)
 * u góry i bez rzędu doków u dołu. Panele narożne (nawigator, dowody) sprawdza `obiektWidoczny`
 * rozłącznością.
 */
async function wolnaKanwa(page: Page, kanwa: Locator): Promise<Prost> {
  const k = (await kanwa.boundingBox())!;
  const pas = (await prostokat(page, '[data-testid="sld-v3-toolbar"] > [data-toolbar-group="widok"]'))!;
  const sciezka = await prostokat(page, '[data-testid="sld-v3-sciezka-kadru"]');
  const skala = (await prostokat(page, '[data-testid="sld-v3-wskaznik-skali"]'))!;
  return { left: k.x, right: k.x + k.width, top: Math.max(pas.bottom, sciezka?.bottom ?? 0), bottom: skala.top };
}

/** Prostokąt ekranu obiektu RAZEM z obrysem zaznaczenia i nagłówkiem (wiersze nazwy stacji). */
async function prostokatObiektu(kanwa: Locator, ref: string): Promise<Prost | null> {
  return kanwa.evaluate((svg, r) => {
    const el = [
      ...Array.from(svg.querySelectorAll(`[data-hit-klasa][data-hit-owner-ref="${r}"]`)),
      ...Array.from(svg.querySelectorAll(`[data-zaznaczenie-ref="${r}"]`)),
      ...Array.from(svg.querySelectorAll(`[data-testid="sld-v3-labels"] [data-owner-ref^="${r}#name-row"]`)),
    ];
    if (el.length === 0) return null;
    const p = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    for (const e of el) {
      // Obszar trafienia jest rozszerzony do minimum kliku — liczy się obrys obiektu (`data-hit-obrys`
      // niesie geometrię w układzie sceny), więc dla uchwytu bierzemy prostokąt rysunku obrysu.
      const b = e.getBoundingClientRect();
      p.left = Math.min(p.left, b.left);
      p.top = Math.min(p.top, b.top);
      p.right = Math.max(p.right, b.right);
      p.bottom = Math.max(p.bottom, b.bottom);
    }
    return p;
  }, ref);
}

/** P0-02: obiekt (z obrysem i nagłówkiem) w wolnej kanwie i poza panelami narożnymi. */
async function obiektWidoczny(page: Page, kanwa: Locator, ref: string, opis: string): Promise<void> {
  const wolna = await wolnaKanwa(page, kanwa);
  const o = await prostokatObiektu(kanwa, ref);
  expect(o, `${opis}: obiekt ${ref} narysowany`).not.toBeNull();
  const tol = 1;
  expect(o!.left, `${opis}: lewa krawędź obiektu w wolnej kanwie`).toBeGreaterThanOrEqual(wolna.left - tol);
  expect(o!.top, `${opis}: górna krawędź obiektu pod pasem narzędzi`).toBeGreaterThanOrEqual(wolna.top - tol);
  // Obiekt większy od wolnej kanwy przy podłodze kadru (dyrektywa właściciela 2026-11-13:
  // czytelność i przesuw kadru zamiast pomniejszania do symbolu) jest pokazany od początku —
  // lewy górny róg w wolnej kanwie, resztę daje przesuw; obiekt mieszczący się — w całości
  // i poza panelami narożnymi.
  const wiekszy = o!.right - o!.left > wolna.right - wolna.left + tol || o!.bottom - o!.top > wolna.bottom - wolna.top + tol;
  if (wiekszy) {
    expect(o!.left, `${opis}: początek obiektu widoczny`).toBeLessThan(wolna.right);
    return;
  }
  expect(o!.right, `${opis}: prawa krawędź obiektu w wolnej kanwie`).toBeLessThanOrEqual(wolna.right + tol);
  expect(o!.bottom, `${opis}: dolna krawędź obiektu nad dokami`).toBeLessThanOrEqual(wolna.bottom + tol);
  for (const panel of ['[data-testid="sld-v3-minimap-panel"]', '[data-testid="sld-v3-proof-packs-dock"]']) {
    const r = await prostokat(page, panel);
    if (r) expect(rozlaczne(o!, { left: r.left + tol, right: r.right - tol, top: r.top + tol, bottom: r.bottom - tol }), `${opis}: obiekt nie pod ${panel}`).toBe(true);
  }
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
      const pomiaryDopasuj: Record<string, unknown>[] = [];
      const seed = await siecKadrow(request);
      await otworzAplikacje(page, seed, okno);
      await ustawMotyw(page, motyw.theme);
      await page.getByRole('button', { name: /^Schemat \(SLD\)/ }).first().click();
      const kanwa = page.getByTestId('sld-canvas-v3');
      await expect(kanwa).toBeVisible();
      await page.keyboard.press('Shift+F');
      const kadrSieci = await kadrUstalony(page, kanwa);
      await zrzut('kadr-calej-sieci');
      const kursor = await celTresci(kanwa);
      await pasMiesciSieWKanwie(page, kanwa, 'kadr całej sieci');

      // (5) Kółko bez skoku geometrii — w skali czytania (obiekty mają pełne glify).
      await page.mouse.move(kursor.x, kursor.y);
      await page.keyboard.press('Shift+Digit1');
      await expect(kanwa).toHaveAttribute('data-skala-kamery', '1.0000');
      await spoczynek(kanwa);
      expect(await obiektPod(page, kursor), 'skala czytania: pod kursorem obiekt schematu').not.toBeNull();
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
      await pasMiesciSieWKanwie(page, kanwa, 'kadr roboczy stacji (inspektor otwarty)');
      await zrzut('kadr-roboczy-stacja');
      await page.getByTestId('sld-v3-sciezka-0').click();
      await doKadru(kanwa, kadrSieci, 'okruszek „Sieć” wraca do kadru całej sieci');

      // P0-02 (B-02 2026-11-13): „Dopasuj widok” z zaznaczoną stacją — stacja z obrysem i nagłówkiem
      // w wolnej kanwie (inspektor otwarty zwęża kanwę); iloczyn: nawigator {zwinięty, otwarty}.
      // Stan nawigatora sprzed pętli wraca po niej — kadr całej sieci (`kadrSieci`) zależy od
      // zasłony nawigatora (P0-02), więc powrót do niego wymaga tej samej zasłony.
      const nawigatorPrzed = (await page.getByTestId('sld-v3-minimap-toggle').getAttribute('aria-expanded')) === 'true';
      for (const nawigatorOtwarty of [false, true]) {
        const opisN = `Dopasuj widok, nawigator ${nawigatorOtwarty ? 'otwarty' : 'zwinięty'}`;
        await ustawNawigator(page, nawigatorOtwarty);
        await page.keyboard.press('Shift+F');
        await kadrUstalony(page, kanwa);
        await page.locator(`[data-hit-owner-ref^="${stacja.ref_id}#name-row"]`).last().click();
        await expect.poll(() => page.locator(`[data-zaznaczenie-ref="${stacja.ref_id}"]`).count(), { message: `${opisN}: obrys zaznaczenia` }).toBeGreaterThan(0);
        await kadrUstalony(page, kanwa);
        await page.getByTestId('sld-v3-fit-view').click();
        await kadrUstalony(page, kanwa);
        await obiektWidoczny(page, kanwa, stacja.ref_id, opisN);
        // Decyzja architekta 2026-11-13 (pkt 6): „Dopasuj widok” obiektu daje jego WNĘTRZE — skala
        // kadru ≥ skali wejścia do LOD2 (9 px / pismo danych t2 11 j.św. × histereza 1,1 = 0,9); nawigator, który spychałby kadr pod próg,
        // zwija się na czas kadru. Pomiar: szerokość stacji przy 100 % wobec wolnej kanwy.
        const skalaKadru = Number(await kanwa.getAttribute('data-skala-kamery'));
        expect(skalaKadru, `${opisN}: skala kadru z wnętrzem pól`).toBeGreaterThanOrEqual((9 / 11) * 1.1 - 1e-4);
        expect(await kanwa.getAttribute('data-poziom-szczegolu'), `${opisN}: poziom szczegółu`).toBe('LOD2');
        const nawigatorPoKadrze = (await page.getByTestId('sld-v3-minimap-toggle').getAttribute('aria-expanded')) === 'true';
        const o = (await prostokatObiektu(kanwa, stacja.ref_id))!;
        const wolna = await wolnaKanwa(page, kanwa);
        pomiaryDopasuj.push({
          okno: rozmiar,
          motyw: motyw.klucz,
          nawigator_przed: nawigatorOtwarty,
          nawigator_po_kadrze: nawigatorPoKadrze,
          skala_kadru: skalaKadru,
          szerokosc_stacji_przy_100_px: Math.round((o.right - o.left) / skalaKadru),
          wysokosc_stacji_przy_100_px: Math.round((o.bottom - o.top) / skalaKadru),
          wolna_kanwa_px: { szerokosc: Math.round(wolna.right - wolna.left), wysokosc: Math.round(wolna.bottom - wolna.top) },
        });
        await zrzut(`dopasuj-widok-stacja-nawigator-${nawigatorOtwarty ? 'otwarty' : 'zwiniety'}`);
        // Wybór projektanta wraca po opuszczeniu obiektu (zmiana zaznaczenia).
        if (nawigatorOtwarty && !nawigatorPoKadrze) {
          await page.keyboard.press('Escape');
          await expect(page.getByTestId('sld-v3-minimap-toggle'), `${opisN}: nawigator wraca po opuszczeniu obiektu`).toHaveAttribute('aria-expanded', 'true');
          // Stan dalszej części testu: stacja zaznaczona, inspektor otwarty (jak przed `Esc`).
          await page.locator(`[data-hit-owner-ref^="${stacja.ref_id}#name-row"]`).last().click();
          await expect.poll(() => page.locator(`[data-zaznaczenie-ref="${stacja.ref_id}"]`).count(), { message: `${opisN}: zaznaczenie wraca` }).toBeGreaterThan(0);
        }
      }
      mkdirSync(resolve(HERE, '..', 'test-results'), { recursive: true });
      writeFileSync(resolve(HERE, '..', 'test-results', `pomiar-dopasuj-${motyw.klucz}-${rozmiar}.json`), JSON.stringify(pomiaryDopasuj, null, 2));
      await ustawNawigator(page, nawigatorPrzed);
      // Okno wokół stacji (z kadru całej sieci): stacja w wolnej kanwie po powiększeniu.
      await page.keyboard.press('Shift+F');
      await kadrUstalony(page, kanwa);
      const os = (await prostokatObiektu(kanwa, stacja.ref_id))!;
      await page.keyboard.press('z');
      await przeciagnij(page, { x: os.left - 8, y: os.top - 8 }, { x: os.right + 8, y: os.bottom + 8 });
      await kadrUstalony(page, kanwa);
      await obiektWidoczny(page, kanwa, stacja.ref_id, 'okno wokół stacji');
      await zrzut('okno-wokol-stacji');
      // Shift+1 nad polem: pole pod kursorem (obiekt wskazany) w wolnej kanwie.
      await page.keyboard.press('Shift+F');
      await kadrUstalony(page, kanwa);
      const pole = await celTresci(kanwa);
      await page.mouse.move(pole.x, pole.y);
      await page.keyboard.press('Shift+Digit1');
      await expect(kanwa).toHaveAttribute('data-skala-kamery', '1.0000');
      await kadrUstalony(page, kanwa);
      await obiektWidoczny(page, kanwa, pole.ref, 'Shift+1 nad polem');
      // Zaznaczenie stacji z pętli wyżej trzyma inspektor otwarty (kanwa 796 px); `Esc` zdejmuje
      // zaznaczenie i zamyka inspektor — kadr całej sieci dopiero na kanwie po zamknięciu (ten sam
      // rozmiar co przy `kadrSieci`), inaczej „Cała sieć” liczyłaby się na kanwie wąskiej.
      const szerokoscPrzed = (await kanwa.boundingBox())!.width;
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-zaznaczenie-ref]')).toHaveCount(0);
      await expect.poll(async () => (await kanwa.boundingBox())!.width, { message: 'kanwa po zamknięciu inspektora' }).toBeGreaterThan(szerokoscPrzed);
      await page.keyboard.press('Shift+F');
      await doKadru(kanwa, kadrSieci, 'powrót do kadru całej sieci po sprawdzeniu widoczności');

      // Powiększenie oknem (materiał oceny w obu rozmiarach okna).
      const ramkaSieci = (await kanwa.boundingBox())!;
      const { a, b } = oknoWokol(ramkaSieci, await celTresci(kanwa));
      const refyOkna = await refyWProstokacie(kanwa, a, b);
      await page.keyboard.press('z');
      await przeciagnij(page, a, b, async () => {
        await expect(page.getByTestId('sld-v3-okno-powiekszenia')).toBeVisible();
        await zrzut('powiekszenie-oknem-w-toku');
      });
      const kadrOkna = await kadrPo(kanwa, kadrSieci);
      await celWKadrze(kanwa, refyOkna, 'powiększenie oknem');
      await zrzut('powiekszenie-oknem-wynik');

      // (8) Nawigator: klik przenosi kadr, kółko zmienia skalę wokół środka kadru.
      await page.getByTestId('sld-v3-minimap-toggle').click();
      const nawigator = page.getByTestId('sld-v3-minimap-svg');
      await expect(nawigator).toBeVisible();
      await nawigatorWRoguKanwy(page, kanwa);
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
      await nawigatorWRoguKanwy(page, kanwa);
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
