/**
 * KARTA K6 — karta techniczna obiektu w prawym inspektorze, szerokość inspektora i formularz
 * układu OZE, na REALNYM backendzie, ścieżką NATYWNĄ (kliki, przeciągnięcia i klawisze myszy
 * Playwrighta w żywej aplikacji, bez zdarzeń syntetycznych).
 *
 * Co spec dowodzi:
 *  1. klik stacji przy 1440×900 pokazuje na PIERWSZYM ekranie inspektora (bez przewijania):
 *     identyfikację, rodzaj stacji z topologii, tabelę pól SN i transformator;
 *  2. przeciąganie uchwytu inspektora zatrzymuje się na 420 px; klawiatura też;
 *  3. tryb szeroki 560 px włącza i wyłącza przycisk w nagłówku inspektora oraz pozycja menu
 *     „Widok"; kanwa SLD zostaje używalna (szerokość ≥ połowy okna);
 *  4. wybór innego obiektu NIGDY nie zmienia szerokości inspektora;
 *  5. przycisk „Przyłącz po stronie SN…" w formularzu układu OZE otwiera kreator źródła SN
 *     z preselekcją stacji, technologii, wariantu i mocy;
 *  6. BESS 2,5 MW przez kreator SN (pakiet baterii z katalogu, dobór toru SN) tworzy w modelu
 *     pole SN z aparatem, transformator blokowy i kabel SN — asercja na ENM z API.
 *
 * Zrzuty (materiał oceny wizualnej właściciela, bramka B-02 — spec NIE wystawia werdyktu):
 * inspektor stacji, pola i transformatora × 2 motywy × (1440×900, 1920×1080), przez
 * `katalogZrzutow` (bez `ZRZUTY_DO_DOKUMENTACJI=1` — do `test-results/zrzuty-dokumentacji/`).
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { katalogZrzutow } from './katalogZrzutow';
import { BACKEND_BASE, otworzAplikacje, siecKadrow, ustawMotyw } from './siecKadrowStacji';
import { czekajNaStabilnaGeometrie } from './stabilnaGeometria';

const HERE = dirname(fileURLToPath(import.meta.url));
const KATALOG_ZRZUTOW = katalogZrzutow(resolve(HERE, '..', '..', 'docs', 'uiux', 'zrzuty', 'k6-inspektor'));

const OKNA = [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;
const MOTYWY = [
  { klucz: 'ciemny', theme: 'dark_scada' as const },
  { klucz: 'jasny', theme: 'light_technical' as const },
] as const;
// Stacja z czterema polami liniowymi (IN, OUT, 2 × FEEDER). Ziarno nazywa stacje wg rodzaju
// wyprowadzonego z topologii (karta GEOMETRIA-STACJI): ta stacja jest odgałęźna (R2).
const STACJA = 'Stacja Odgałęźna';
const INNA_STACJA = 'Stacja Końcowa';
/** BESS 2,5 MW: 5 × przekształtnik 0,5 MW / 0,4 kV (katalog backendu) za TR blokowym. */
const PRZEKSZTALTNIK_BESS = 'conv-bess-nn-0p5mw-0p4kv';
const LICZBA_PRZEKSZTALTNIKOW = '5';
const MOC_BESS_MW = '2.5';

type Enm = {
  substations?: Array<{ ref_id: string; name?: string; bay_refs?: string[]; transformer_refs?: string[] }>;
  bays?: Array<{ ref_id: string; substation_ref?: string | null; bay_role?: string; name?: string }>;
  branches?: Array<{ ref_id: string; type?: string; from_bus_ref?: string; to_bus_ref?: string; bay_ref?: string | null }>;
  transformers?: Array<{ ref_id: string; name?: string; hv_bus_ref?: string; lv_bus_ref?: string; meta?: Record<string, unknown> }>;
  generators?: Array<{
    ref_id: string;
    gen_type?: string | null;
    source_technology?: string | null;
    station_ref?: string | null;
    p_mw?: number;
    quantity?: number | null;
    catalog_ref?: string | null;
    blocking_transformer_ref?: string | null;
    connection_variant?: string | null;
    materialized_params?: Record<string, unknown> | null;
    meta?: Record<string, unknown> | null;
  }>;
};

async function enmPrzypadku(page: Page, caseId: string): Promise<Enm> {
  const odpowiedz = await page.request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm`);
  expect(odpowiedz.ok()).toBeTruthy();
  return (await odpowiedz.json()) as Enm;
}

/** Natywny klik myszy w środek bloku stacji na planie sieci (L0). */
async function kliknijStacje(page: Page, stacjaRef: string): Promise<void> {
  const blok = page.locator(`[data-testid="sld-v3-l0-${stacjaRef}"]`);
  await expect(blok).toBeAttached({ timeout: 30000 });
  // Spoczynek kadru przed pomiarem punktu kliku (klasa G karty FIX-E2E-PELNE).
  await czekajNaStabilnaGeometrie(blok);
  const ramka = await blok.boundingBox();
  expect(ramka, 'blok stacji ma ramkę na ekranie').not.toBeNull();
  await page.mouse.click(ramka!.x + ramka!.width / 2, ramka!.y + ramka!.height / 2);
}

async function szerokosc(lokator: Locator): Promise<number> {
  const ramka = await lokator.boundingBox();
  expect(ramka, 'element ma ramkę na ekranie').not.toBeNull();
  return Math.round(ramka!.width);
}

/** Liczba kolumn tabeli widocznych w całości w obszarze przewijania (bez przewijania w poziomie). */
async function widoczneKolumny(tabela: Locator): Promise<number> {
  return tabela.evaluate((t) => {
    const obszar = t.parentElement!.getBoundingClientRect();
    return Array.from(t.querySelectorAll('thead th')).filter((th) => th.getBoundingClientRect().right <= obszar.right + 1).length;
  });
}

/** Element w całości w widocznym obszarze przewijanej treści inspektora (pierwszy ekran). */
async function naPierwszymEkranie(tresc: Locator, element: Locator, opis: string): Promise<void> {
  const okno = await tresc.boundingBox();
  const ramka = await element.boundingBox();
  expect(okno, 'treść inspektora ma ramkę').not.toBeNull();
  expect(ramka, `${opis} ma ramkę`).not.toBeNull();
  expect(await tresc.evaluate((el) => el.scrollTop), 'inspektor nieprzewinięty').toBe(0);
  expect(ramka!.y, `${opis}: początek na pierwszym ekranie`).toBeGreaterThanOrEqual(okno!.y - 1);
  expect(ramka!.y, `${opis}: początek na pierwszym ekranie`).toBeLessThan(okno!.y + okno!.height);
}

/** Środek bloku stacji na planie sieci (L0) — punkt, wokół którego przybliża kółko myszy. */
async function srodekStacji(page: Page, stacjaRef: string): Promise<{ x: number; y: number }> {
  const ramka = await page.locator(`[data-testid="sld-v3-l0-${stacjaRef}"]`).boundingBox();
  expect(ramka, 'blok stacji ma ramkę na ekranie').not.toBeNull();
  return { x: ramka!.x + ramka!.width / 2, y: ramka!.y + ramka!.height / 2 };
}

/** Przybliżanie kółkiem nad stacją, aż selektor pojawi się w rysunku (pola, aparaty, TR). */
async function przybliz(page: Page, selektor: string, punkt: { x: number; y: number }): Promise<void> {
  await page.mouse.move(punkt.x, punkt.y);
  for (let i = 0; i < 40; i += 1) {
    if ((await page.locator(selektor).count()) > 0) return;
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(120);
  }
  await expect(page.locator(selektor).first()).toBeAttached();
}

/** Natywny klik w pierwszy widoczny symbol pasujący do selektora (środek ramki). */
async function kliknijSymbol(page: Page, selektor: string): Promise<void> {
  // Spoczynek kadru przed pomiarem punktu kliku (klasa G karty FIX-E2E-PELNE).
  await czekajNaStabilnaGeometrie(page.locator(selektor).first());
  const kanwa = await page.locator('svg[data-testid="sld-canvas-v3"]').boundingBox();
  const symbole = page.locator(selektor);
  const n = await symbole.count();
  for (let i = 0; i < n; i += 1) {
    const ramka = await symbole.nth(i).boundingBox();
    if (!ramka || !kanwa) continue;
    const x = ramka.x + ramka.width / 2;
    const y = ramka.y + ramka.height / 2;
    if (x > kanwa.x + 10 && x < kanwa.x + kanwa.width - 10 && y > kanwa.y + 10 && y < kanwa.y + kanwa.height - 10) {
      await page.mouse.click(x, y);
      return;
    }
  }
  throw new Error(`brak widocznego symbolu ${selektor} na kanwie`);
}

test('K6 — karta techniczna stacji na pierwszym ekranie, szerokość inspektora 340–420 i tryb szeroki 560', async ({
  page,
  request,
}) => {
  test.setTimeout(300000);
  const seed = await siecKadrow(request);
  const stacjaRef = (seed.enm.substations ?? []).find((s) => String(s.name) === STACJA)?.ref_id;
  const innaRef = (seed.enm.substations ?? []).find((s) => String(s.name) === INNA_STACJA)?.ref_id;
  expect(stacjaRef && innaRef, 'stacje w modelu').toBeTruthy();

  await otworzAplikacje(page, seed, OKNA[0], 'dark_scada');
  await page.keyboard.press('Shift+F');
  await page.waitForTimeout(400);
  await kliknijStacje(page, stacjaRef!);

  const inspektor = page.getByTestId('mvd-inspector');
  const tresc = inspektor.getByTestId('mvd-inspector-tresc');
  await expect(inspektor).toBeVisible();
  const karta = inspektor.getByTestId('inspektor-karta');
  await expect(karta).toHaveAttribute('data-rodzaj-karty', 'stacja');
  // Nagłówek: ta sama nazwa i ten sam rodzaj co w drzewie projektu.
  await expect(inspektor.getByTestId('inspektor-element-etykieta')).toHaveText(STACJA);
  await expect(inspektor.getByTestId('inspektor-element-rodzaj')).not.toHaveText('');

  // 1. Pierwszy ekran 1440×900: identyfikacja, rodzaj, tabela pól, transformator.
  const identyfikacja = karta.getByTestId('inspektor-karta-identyfikacja');
  const rodzaj = karta.getByTestId('inspektor-karta-pole-rodzaj');
  const tabelaPol = karta.getByTestId('inspektor-karta-tabela-pola_sn');
  const transformator = karta.getByTestId('inspektor-karta-transformator');
  await expect(rodzaj).toHaveAttribute('data-brak', 'false');
  await expect(tabelaPol.getByTestId('inspektor-karta-wiersz-pola_sn')).toHaveCount(5);
  await expect(transformator).toBeVisible();
  await naPierwszymEkranie(tresc, identyfikacja, 'identyfikacja');
  await naPierwszymEkranie(tresc, rodzaj, 'rodzaj stacji');
  await naPierwszymEkranie(tresc, tabelaPol, 'tabela pól SN');
  await naPierwszymEkranie(tresc, transformator, 'transformator');
  // Działania na końcu, zwinięte.
  const dzialania = inspektor.getByTestId('inspektor-dzialania-zwiniete');
  await expect(dzialania).not.toHaveAttribute('open', '');
  await expect(inspektor.getByTestId('inspektor-dzialania')).toBeHidden();

  // 2. Przeciąganie uchwytu: zatrzymuje się na 420 px.
  const poczatkowa = await szerokosc(inspektor);
  expect(poczatkowa).toBeGreaterThanOrEqual(340);
  expect(poczatkowa).toBeLessThanOrEqual(420);
  const uchwyt = page.getByTestId('mvd-handle-right');
  const ramkaUchwytu = (await uchwyt.boundingBox())!;
  await page.mouse.move(ramkaUchwytu.x + ramkaUchwytu.width / 2, ramkaUchwytu.y + ramkaUchwytu.height / 2);
  await page.mouse.down();
  await page.mouse.move(ramkaUchwytu.x - 300, ramkaUchwytu.y + ramkaUchwytu.height / 2, { steps: 12 });
  await page.mouse.up();
  expect(await szerokosc(inspektor), 'przeciąganie zatrzymuje się na 420 px').toBe(420);
  // Klawiatura: strzałka w lewo nie przekracza 420, strzałka w prawo zwęża.
  await uchwyt.focus();
  await page.keyboard.press('ArrowLeft');
  expect(await szerokosc(inspektor)).toBe(420);
  await page.keyboard.press('ArrowRight');
  expect(await szerokosc(inspektor)).toBeLessThan(420);
  await page.keyboard.press('ArrowLeft');
  expect(await szerokosc(inspektor)).toBe(420);

  // 3. Tryb szeroki 560 px — przycisk w nagłówku inspektora i powrót tym samym poleceniem.
  const szeroki = inspektor.getByTestId('mvd-inspector-szeroki');
  await expect(szeroki).toHaveAttribute('aria-pressed', 'false');
  const kolumnyZwykly = await widoczneKolumny(tabelaPol);
  await szeroki.click();
  await expect(szeroki).toHaveAttribute('aria-pressed', 'true');
  expect(await szerokosc(inspektor)).toBe(560);
  // Kanwa SLD używalna przy 1440×900 w trybie szerokim: włączenie trybu nie przestawia kamery
  // samoczynnie, a każda stacja planu sieci (blok L0) leży w całości w widocznej kanwie
  // (i przyjmuje klik — krok 4 niżej).
  const blokiStacji = (seed.enm.substations ?? []).filter((s) => s.station_type !== 'gpz').map((s) => `sld-v3-l0-${s.ref_id}`);
  expect(blokiStacji).toHaveLength(4);
  await expect
    .poll(
      async () =>
        page.evaluate((idBlokow) => {
          const kanwaEl = document.querySelector('svg[data-testid="sld-canvas-v3"]');
          if (!kanwaEl) return 'brak kanwy';
          const k = kanwaEl.getBoundingClientRect();
          const bloki = idBlokow
            .map((id) => document.querySelector(`[data-testid="${id}"]`))
            .filter((el): el is Element => el !== null);
          const poza = bloki.filter((el) => {
            const r = el.getBoundingClientRect();
            return r.left < k.left - 1 || r.top < k.top - 1 || r.right > k.right + 1 || r.bottom > k.bottom + 1;
          });
          return `${bloki.length} stacji, poza kanwą ${poza.length}`;
        }, blokiStacji),
      { timeout: 20000, message: 'tryb szeroki: cztery stacje planu sieci w całości w kanwie' },
    )
    .toBe('4 stacji, poza kanwą 0');
  // Tryb szeroki pokazuje więcej kolumn tabeli pól bez przewijania niż inspektor zwykły.
  expect(await widoczneKolumny(tabelaPol)).toBeGreaterThan(kolumnyZwykly);
  await szeroki.click();
  await expect(szeroki).toHaveAttribute('aria-pressed', 'false');
  expect(await szerokosc(inspektor)).toBe(420);
  // To samo polecenie z menu „Widok".
  await page.getByTestId('mvd-view-menu').click();
  await page.getByTestId('mvd-toggle-right-wide').click();
  expect(await szerokosc(inspektor)).toBe(560);

  // 4. Wybór innego obiektu nie zmienia szerokości (tryb szeroki i zwykły).
  await page.keyboard.press('Escape');
  await kliknijStacje(page, innaRef!);
  await expect(inspektor.getByTestId('inspektor-element-etykieta')).toHaveText(INNA_STACJA);
  expect(await szerokosc(inspektor), 'wybór obiektu nie zmienia szerokości (tryb szeroki)').toBe(560);
  await page.getByTestId('mvd-view-menu').click();
  await page.getByTestId('mvd-toggle-right-wide').click();
  expect(await szerokosc(inspektor)).toBe(420);
  await kliknijStacje(page, stacjaRef!);
  await expect(inspektor.getByTestId('inspektor-element-etykieta')).toHaveText(STACJA);
  expect(await szerokosc(inspektor), 'wybór obiektu nie zmienia szerokości (tryb zwykły)').toBe(420);
});

test('K6 — zrzuty inspektora stacji, pola i transformatora × motywy × okna', async ({ browser, request }, testInfo) => {
  test.setTimeout(900000);
  mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  const seed = await siecKadrow(request);
  const stacjaRef = (seed.enm.substations ?? []).find((s) => String(s.name) === STACJA)?.ref_id;
  expect(stacjaRef).toBeTruthy();

  for (const okno of OKNA) {
    for (const motyw of MOTYWY) {
      const kontekst = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
      const page = await kontekst.newPage();
      await otworzAplikacje(page, seed, okno, motyw.theme);
      await ustawMotyw(page, motyw.theme);
      const inspektor = page.getByTestId('mvd-inspector');
      const nazwa = `${okno.width}x${okno.height}-${motyw.klucz}`;

      await page.keyboard.press('Shift+F');
      await page.waitForTimeout(400);
      await kliknijStacje(page, stacjaRef!);
      await expect(inspektor.getByTestId('inspektor-karta')).toHaveAttribute('data-rodzaj-karty', 'stacja');
      await page.waitForTimeout(300);
      await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `k6-stacja-${nazwa}.png`) });

      const punkt = await srodekStacji(page, stacjaRef!);
      const selektorTr = `g[data-element-kind="transformer"][data-owner-ref^="${stacjaRef!.replace(/\/station$/, '')}"]`;
      await przybliz(page, selektorTr, punkt);
      await kliknijSymbol(page, selektorTr);
      await expect(inspektor.getByTestId('inspektor-karta')).toHaveAttribute('data-rodzaj-karty', 'transformator');
      await page.waitForTimeout(300);
      await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `k6-transformator-${nazwa}.png`) });

      const selektorPola = `g[data-element-kind="apparatus"][data-owner-ref^="${stacjaRef!.replace(/\/station$/, '')}"][data-owner-ref*="/sn_field/"]:not([data-device-ref])`;
      await przybliz(page, selektorPola, punkt);
      await kliknijSymbol(page, selektorPola);
      await expect(inspektor.getByTestId('inspektor-karta')).toHaveAttribute('data-rodzaj-karty', 'pole');
      await page.waitForTimeout(300);
      await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `k6-pole-${nazwa}.png`) });
      await kontekst.close();
    }
  }
});

test('K6 — formularz OZE: „Przyłącz po stronie SN…" otwiera kreator SN z preselekcją; BESS 2,5 MW tworzy pole SN, TR blokowy i kabel', async ({
  page,
  request,
}) => {
  test.setTimeout(400000);
  const seed = await siecKadrow(request);
  const stacjaRef = (seed.enm.substations ?? []).find((s) => String(s.name) === STACJA)?.ref_id;
  expect(stacjaRef).toBeTruthy();
  const przed = await enmPrzypadku(page, seed.caseId);
  const polaPrzed = new Set((przed.bays ?? []).map((b) => b.ref_id));
  const trPrzed = new Set((przed.transformers ?? []).map((t) => t.ref_id));
  const galeziePrzed = new Set((przed.branches ?? []).map((b) => b.ref_id));

  await otworzAplikacje(page, seed, OKNA[0], 'dark_scada');
  await page.keyboard.press('Shift+F');
  await page.waitForTimeout(400);
  if ((await page.getByTestId('der-palette-btn-BESS').count()) === 0) {
    await page.getByTestId('sld-v3-toolbar-menu-toggle').click();
    await expect(page.getByTestId('sld-v3-toolbar-menu')).toBeVisible();
  }
  await page.getByTestId('der-palette-btn-BESS').click();
  await kliknijStacje(page, stacjaRef!);
  const formularz = page.getByTestId('mvd-inspector').getByTestId('inspektor-der-formularz');
  await expect(formularz).toBeVisible();
  await expect(formularz).toContainText('Przyłączenie po stronie nN stacji');
  await expect(formularz.getByTestId('inspektor-der-typ')).toHaveValue('BESS');
  await formularz.getByTestId('inspektor-der-moc').fill(MOC_BESS_MW);
  await formularz.getByTestId('inspektor-der-przylacz-sn').click();

  // Kreator źródła SN z preselekcją: technologia, wariant z TR blokowym, moc zadana.
  const kreator = page.getByTestId('mvd-kreator-oze');
  await expect(kreator).toBeVisible({ timeout: 20000 });
  await expect(kreator.getByTestId('mvd-kreator-oze-brak')).toHaveCount(0);
  await expect(kreator.getByTestId('mvd-kreator-oze-technologia')).toHaveValue('BESS');
  await expect(kreator.getByTestId('mvd-kreator-oze-wariant')).toHaveValue('block_transformer');
  await expect(page.getByTestId('inspektor-der-formularz')).toHaveCount(0);

  // Krok katalogu: przekształtnik i (wymagany dla BESS) pakiet baterii z katalogu.
  await kreator.getByTestId('mvd-kreator-oze-dalej').click();
  const konwerter = kreator.getByTestId('mvd-kreator-oze-konwerter');
  await expect(konwerter.locator(`option[value="${PRZEKSZTALTNIK_BESS}"]`)).toBeAttached({ timeout: 20000 });
  await konwerter.selectOption(PRZEKSZTALTNIK_BESS);
  await kreator.getByTestId('mvd-kreator-oze-liczba').fill(LICZBA_PRZEKSZTALTNIKOW);
  const bateria = kreator.getByTestId('mvd-kreator-oze-bateria');
  await expect(bateria.locator('option').nth(1)).toBeAttached({ timeout: 20000 });
  await bateria.selectOption({ index: 1 });
  const bateriaRef = await bateria.inputValue();
  expect(bateriaRef.length).toBeGreaterThan(0);

  // Krok doboru toru SN: propozycja backendu i jej zastosowanie (pole, TR blokowy, kabel).
  await kreator.getByTestId('mvd-kreator-oze-dalej').click();
  await expect(kreator.getByTestId('mvd-kreator-oze-dobor-sekcja')).toBeVisible();
  await kreator.getByTestId('mvd-kreator-oze-dobor-dlugosc').fill('0.3');
  await kreator.getByTestId('mvd-kreator-oze-dobor-zaproponuj').click();
  await expect(kreator.getByTestId('mvd-kreator-oze-dobor-propozycje')).toBeVisible({ timeout: 30000 });
  await kreator.getByTestId('mvd-kreator-oze-dobor-zastosuj').click();

  // Kolejne kroki do zapisu (aparatura, zgodność, regulacja — wartości domyślne kreatora).
  let mocWidziana = false;
  for (let i = 0; i < 8; i += 1) {
    if ((await kreator.getByTestId('mvd-kreator-oze-autobieg-toggle').count()) > 0) break;
    // Moc zadana z formularza (preselekcja) — pole kroku regulacji.
    if ((await kreator.getByTestId('mvd-kreator-oze-moc').count()) > 0) {
      await expect(kreator.getByTestId('mvd-kreator-oze-moc')).toHaveValue(/^2[.,]5$/);
      mocWidziana = true;
    }
    await kreator.getByTestId('mvd-kreator-oze-dalej').click();
  }
  expect(mocWidziana, 'krok regulacji pokazał moc zadaną z formularza').toBe(true);
  await kreator.getByTestId('mvd-kreator-oze-autobieg-toggle').selectOption('nie');
  await kreator.getByTestId('mvd-kreator-oze-zapisz').click();
  await expect(kreator.getByTestId('mvd-kreator-oze-sekwencja')).toBeVisible({ timeout: 60000 });
  await expect(kreator.getByTestId('mvd-kreator-oze-sekwencja-zrodlo')).toHaveAttribute('data-stan', 'zapisane', {
    timeout: 60000,
  });

  // Asercja na ENM z API: generator BESS, nowe pole SN z aparatem, TR blokowy i kabel SN.
  const po = await enmPrzypadku(page, seed.caseId);
  const generator = (po.generators ?? []).find(
    (g) => g.catalog_ref === PRZEKSZTALTNIK_BESS && g.station_ref === stacjaRef,
  );
  expect(generator, 'generator BESS w modelu przypadku').toBeTruthy();
  expect(generator!.p_mw).toBeCloseTo(2.5, 6);
  expect((generator!.materialized_params ?? {})['battery_catalog_ref']).toBe(bateriaRef);
  const nowePola = (po.bays ?? []).filter((b) => !polaPrzed.has(b.ref_id) && b.substation_ref === stacjaRef);
  expect(nowePola.length, 'nowe pole SN w stacji').toBe(1);
  const noweTr = (po.transformers ?? []).filter((t) => !trPrzed.has(t.ref_id));
  expect(noweTr.length, 'nowy transformator blokowy').toBe(1);
  const noweGalezie = (po.branches ?? []).filter((b) => !galeziePrzed.has(b.ref_id));
  expect(noweGalezie.some((b) => b.type === 'cable'), 'nowy kabel SN toru źródła').toBe(true);
  expect(
    noweGalezie.some((b) => b.type === 'breaker' || b.type === 'switch' || b.type === 'disconnector' || b.type === 'load_switch'),
    'aparat nowego pola SN',
  ).toBe(true);
});
