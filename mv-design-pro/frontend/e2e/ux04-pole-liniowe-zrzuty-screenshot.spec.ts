/**
 * KARTA UX-04/POLE-LINIOWE-WZORZEC — pole liniowe SN GPZ wg ENEA Zeszyt 1 (Z.10, Z.11.1) na ŻYWEJ kanwie
 * `SldCanvasV3` i REALNYM backendzie (materiał oceny wizualnej właściciela, bramka B-02; spec
 * NIE wystawia werdyktu wizualnego).
 *
 * Ścieżka użytkownika (bez wywołań API budujących sieć): projekt i przypadek z API (miejsce
 * pracy, nie budowa sieci), potem WYŁĄCZNIE kanwa i okno pola — natywny prawy klik w tło →
 * „Wstaw GPZ" → kreator źródła z wartościami domyślnymi (2 sekcje × 2 pola liniowe, aparat
 * z katalogu); prawy klik w GPZ → ciąg główny (pole sekcji 1 zajęte kablem); prawy klik
 * w wyłącznik pola sekcji 2 → „Otwórz okno pola" → „Zmień wyposażenie" → szablon Z.10
 * z wyłącznikiem stałym i odłącznikiem szynowym (§13); prawy klik w wyłącznik wolnego pola
 * sekcji 1 → okno pola → szablon Z.11.1 (odgałęzienie przekładnika napięciowego od strony linii);
 * położenia aparatów pola z menu aparatu (prawy klik w aparat → „Zamknij / Otwórz / Uziem
 * łącznik"; łącznik bez gałęzi modelu → operacja `set_bay_apparatus_position`, wyłącznik →
 * `open_switch`), prawy klik w wyłącznik pola zajętego → „Otwórz łącznik".
 *
 * Sprawdzenia (model z backendu, rysunek z DOM kanwy):
 *  - każde pole liniowe GPZ niesie wzorzec Z.10 (Q1 trójpołożeniowy, Q0, T1, PF1, GK, T2) bez
 *    gazów fluorowanych (rodzina rozdzielnicy pola nie niesie SF₆), stan obiektu „projektowany"
 *    na polu, na aparatach i w atrybucie symbolu kanwy (`data-stan-obiektu`); pole po zmianie —
 *    wykonanie stałe z odłącznikiem (Q1 odłącznik, Q8 uziemnik — schemat oznaczeń DIN 40719-2,
 *    wartość robocza) albo Z.11.1 z odgałęzieniem (Q5, GK1, T3) na rysunku;
 *  - klik = ZAZNACZENIE (obrys zaznaczenia), bez żadnej operacji łączeniowej na backendzie;
 *  - KAFEL STANU łącznika (rozszerzenie 5, referencja HMI 2026-10-29): wypełniony prostokąt pod
 *    symbolem, czerwony `#C62828` = zamknięty (także zestyk uziemiający łącznika
 *    trójpołożeniowego w położeniu „uziemiony"), zielony `#2E7D32` = otwarty, szary `#6B7280`
 *    ze znakiem „?" = stan nieznany; kolory identyczne w obu motywach; aparat nie-łącznik bez
 *    kafla; oznaczenie aparatu przy symbolu (podpis stanu nie zastępuje koloru);
 *  - menu aparatu działa na TYM aparacie (odłącznik i uziemnik pola nie przełączają wyłącznika).
 *
 * Zrzuty (kadr pola, przycięty do obszaru aparatów pola):
 * `docs/uiux/zrzuty/ux04-pole-liniowe/<kadr>-<motyw>.png` (do drzewa repo wyłącznie
 * z `ZRZUTY_DO_DOKUMENTACJI=1`, inaczej `test-results/zrzuty-dokumentacji/…`).
 */
import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { katalogZrzutow } from './katalogZrzutow';
import { przelaczMotyw } from './powloka';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const HERE = dirname(fileURLToPath(import.meta.url));
const KATALOG_ZRZUTOW = katalogZrzutow(resolve(HERE, '..', '..', 'docs', 'uiux', 'zrzuty', 'ux04-pole-liniowe'));
// Szablony z rejestru backendu (`bay_templates.BAY_TEMPLATES_GPZ_LINE`): Z.10 z łącznikiem
// trójpołożeniowym (domyślny pola GPZ) i Z.10 z wyłącznikiem stałym z odłącznikiem (§13, izolacja
// powietrzna).
const SZABLON_Z10 = 'bay_template_gpz_line_enea_z10_trojpolozeniowy';
const SZABLON_Z10_STALY = 'bay_template_gpz_line_enea_z10_staly_z_odlacznikiem';
const SZABLON_Z11_1 = 'bay_template_gpz_line_enea_z11_1_trojpolozeniowy';
// Konwencja kafla stanu — lustro `sld/v3/theme/colorTokens.ts::STATE_COLOR` (jedna tabela
// kanwy, eksportu, legendy i inspektora; testy jednostkowe pilnują lustra w kodzie).
const KAFEL = { zamkniety: '#C62828', otwarty: '#2E7D32', nieustalony: '#6B7280' } as const;
type StanKafla = keyof typeof KAFEL;

type Aparat = {
  device_ref: string;
  kind: string;
  designation?: string | null;
  stan_obiektu?: string | null;
  switch_state?: { actual_state: string } | null;
};
type Pole = {
  ref_id: string;
  tags?: string[];
  gpz_section_id?: string | null;
  bay_template_ref?: string | null;
  switchgear_family_ref?: string | null;
  stan_obiektu?: string | null;
  equipment_refs?: string[];
  primary_devices?: Aparat[];
};
type Snapshot = {
  substations?: Array<{ ref_id: string; station_type?: string | null }>;
  bays?: Pole[];
  branches?: Array<{ ref_id: string; type?: string; status?: string; from_bus_ref?: string; to_bus_ref?: string }>;
};

async function pobierzEnm(request: APIRequestContext, caseId: string): Promise<Snapshot> {
  const response = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as Snapshot;
}

function polaLiniowe(enm: Snapshot): Pole[] {
  return (enm.bays ?? [])
    .filter((b) => (b.tags ?? []).includes('gpz_line_field'))
    .sort((a, b) => a.ref_id.localeCompare(b.ref_id));
}

function sekcje(enm: Snapshot): string[] {
  return [...new Set(polaLiniowe(enm).map((p) => p.gpz_section_id ?? ''))].sort();
}

function aparat(pole: Pole, oznaczenie: string): Aparat {
  const wynik = (pole.primary_devices ?? []).find((d) => d.designation === oznaczenie);
  expect(wynik, `${pole.ref_id}: aparat ${oznaczenie}`).toBeTruthy();
  return wynik!;
}

/** Projekt i przypadek z API (miejsce pracy) — nazwa projektu nazywa WYKONANIE pola, które
 *  pokazują zrzuty tego projektu (nagłówek aplikacji jest na każdym zrzucie). */
async function otworzAplikacje(page: Page, request: APIRequestContext, wykonanie: string): Promise<{ caseId: string }> {
  const suffix = Date.now().toString(36);
  const projectName = `Pole liniowe ${wykonanie} ${suffix}`;
  const caseName = `Przypadek pola ${suffix}`;
  const projekt = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: { name: projectName, description: `Pole liniowe SN GPZ wg ENEA ${wykonanie}`, mode: 'TO-BE', voltage_level_kv: 15.0, frequency_hz: 50.0 },
  });
  expect(projekt.ok()).toBeTruthy();
  const projectId = ((await projekt.json()) as { id: string }).id;
  const przypadek = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: projectId, name: caseName, description: '', config: {}, set_active: true },
  });
  expect(przypadek.ok()).toBeTruthy();
  const caseId = ((await przypadek.json()) as { id: string }).id;
  await page.addInitScript((seed) => {
    localStorage.setItem(
      'mv-design-app-state',
      JSON.stringify({
        state: {
          activeProjectId: seed.projectId,
          activeProjectName: seed.projectName,
          activeCaseId: seed.caseId,
          activeCaseName: seed.caseName,
          activeCaseKind: 'ShortCircuitCase',
          activeCaseResultStatus: 'NONE',
          activeSnapshotId: null,
          activeMode: 'MODEL_EDIT',
          activeAnalysisType: 'SHORT_CIRCUIT',
          caseManagerOpen: false,
          issuePanelOpen: false,
        },
        version: 1,
      }),
    );
  }, { projectId, projectName, caseId, caseName });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  return { caseId };
}

async function wrocNaSchemat(page: Page): Promise<void> {
  const okruszek = page.getByRole('button', { name: 'Schemat', exact: true }).first();
  if (await okruszek.isVisible({ timeout: 3000 }).catch(() => false)) await okruszek.click();
  await expect(page.getByTestId('sld-canvas-v3')).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => page.locator('[data-hit-klasa]').count(), { timeout: 60000 }).toBeGreaterThan(0);
  await widokCalejSieci(page);
}

/** „Dopasuj do… → Sieć" — kadr całej sieci BEZ kurtyny. Sam „Dopasuj widok" kadruje
 *  ZAKRES PRACY (zaznaczenie albo sieć, kontrakt K2): po kreatorze magistrali zaznaczony
 *  zostaje nowy odcinek, więc „Dopasuj widok" zakładał kurtynę na cały GPZ (pomiar
 *  2026-10-29: zrzuty GPZ przygaszone do krycia kurtyny, ścieżka „Sieć › Magistrala 01"). */
async function widokCalejSieci(page: Page): Promise<void> {
  await page.getByTestId('sld-v3-dopasuj-do-toggle').click();
  await page.getByTestId('sld-v3-dopasuj-do-siec').click();
  await expect(page.locator('svg[data-testid="sld-canvas-v3"] [data-kadr="poza"]')).toHaveCount(0, { timeout: 15000 });
}

/** Punkt na geometrii uchwytu trafienia (środek prostokąta albo połowa długości kreski). */
async function punktUchwytu(uchwyt: Locator): Promise<{ x: number; y: number }> {
  await expect.poll(async () => ((await uchwyt.boundingBox().catch(() => null))?.width ?? 0), { timeout: 60000 }).toBeGreaterThan(0);
  return uchwyt.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
}

/** Przybliżenie kółkiem, aż uchwyt trafienia aparatu pola ma ≥ 16 px i leży w kadrze kanwy
 *  (LOD z kamery). Kursor kółka celuje w aparat (przycięty do kanwy) — punkt pod kursorem
 *  zostaje w miejscu, więc aparat wchodzi do kadru, zamiast z niego uciekać. */
async function przyblizDoAparatu(page: Page, deviceRef: string): Promise<Locator> {
  const uchwyt = page.locator(`[data-hit-klasa="aparat"][data-hit-device-ref="${deviceRef}"]`).first();
  const kanwa = page.locator('svg[data-testid="sld-canvas-v3"]');
  for (let i = 0; i < 40; i += 1) {
    const k = (await kanwa.boundingBox())!;
    const box = (await uchwyt.count()) > 0 ? await uchwyt.boundingBox().catch(() => null) : null;
    const wKadrze = box != null && box.x >= k.x && box.y >= k.y && box.x + box.width <= k.x + k.width && box.y + box.height <= k.y + k.height;
    if (box && wKadrze && Math.min(box.width, box.height) >= 16) break;
    const cx = box ? box.x + box.width / 2 : k.x + k.width / 2;
    const cy = box ? box.y + box.height / 2 : k.y + k.height / 2;
    await page.mouse.move(Math.min(Math.max(cx, k.x + 40), k.x + k.width - 40), Math.min(Math.max(cy, k.y + 40), k.y + k.height - 40));
    await page.mouse.wheel(0, box && Math.min(box.width, box.height) >= 16 ? 0 : -240);
    if (box && !wKadrze) {
      // Aparat dość duży, ale poza kadrem — przesunięcie widoku przeciągnięciem tła w jego stronę.
      await page.mouse.down({ button: 'middle' });
      await page.mouse.move(k.x + k.width / 2, k.y + k.height / 2, { steps: 4 });
      await page.mouse.up({ button: 'middle' });
    }
    await page.waitForTimeout(150);
  }
  await expect(uchwyt).toHaveCount(1, { timeout: 15000 });
  await czekajNaStabilnaGeometrie(uchwyt);
  return uchwyt;
}

/** Geometria stabilna = dwa kolejne odczyty prostokąta identyczne (kamera po animacji). */
async function czekajNaStabilnaGeometrie(cel: Locator): Promise<void> {
  let poprzedni = '';
  for (let i = 0; i < 40; i += 1) {
    const r = await cel.boundingBox();
    const biezacy = r ? `${Math.round(r.x)}:${Math.round(r.y)}:${Math.round(r.width)}:${Math.round(r.height)}` : '';
    if (biezacy !== '' && biezacy === poprzedni) return;
    poprzedni = biezacy;
    await cel.page().waitForTimeout(250);
  }
}

/** Punkt ekranu, w którym NAJWYŻSZYM elementem jest uchwyt tego aparatu (sonda
 *  `elementFromPoint` — klik nie trafi w nachodzący odcinek ani pasek narzędzi). */
async function punktAparatu(page: Page, deviceRef: string): Promise<{ x: number; y: number }> {
  const uchwyt = await przyblizDoAparatu(page, deviceRef);
  const punkt = await uchwyt.evaluate((el, ref) => {
    const r = el.getBoundingClientRect();
    for (const fy of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
      for (const fx of [0.5, 0.4, 0.6, 0.3, 0.7]) {
        const x = Math.round(r.x + r.width * fx);
        const y = Math.round(r.y + r.height * fy);
        const top = document.elementFromPoint(x, y);
        if (top?.getAttribute('data-hit-klasa') === 'aparat' && top.getAttribute('data-hit-device-ref') === ref) return { x, y };
      }
    }
    return null;
  }, deviceRef);
  expect(punkt, `brak punktu trafienia aparatu ${deviceRef}`).not.toBeNull();
  return punkt!;
}

/** Natywny klik w punkt policzony sondą, z WERYFIKACJĄ skutku — jedna reguła dla każdego
 *  kliku w punkt w tym specu (inwentarz: prawy klik w łącznik, prawy klik w obrys GPZ, lewy
 *  klik w wyłącznik w kroku 4 i w każdym zrzucie pola). Klik bez skutku = test czerwony
 *  z opisem, co leży pod punktem i gdzie jest cel — BEZ ponowienia.
 *
 *  Pomiar 2026-10-29 (dziennik akcji kamery w biegu e2e): kliki „w tło" brały się z defektu
 *  produktu — po prawym kliku i wyborze pozycji z menu kontekstowego wskaźnik zostawał
 *  w mapie przeciągania kanwy (`pointerup` trafiał w menu), więc ruch myszy do następnego
 *  punktu PRZESUWAŁ widok (`pan`) i cel uciekał spod kursora. Naprawa u źródła:
 *  `SldCanvasV3.tsx` `zwolnijWskaznik`, test `przeciaganieKanwy.test.tsx`. Ponowienie kliku
 *  maskowałoby regresję tej naprawy, dlatego go nie ma. */
async function klikZWeryfikacja(
  page: Page,
  opis: string,
  cel: Locator,
  punktCelu: () => Promise<{ x: number; y: number }>,
  przycisk: 'left' | 'right',
  skutek: () => Promise<boolean>,
): Promise<void> {
  const punkt = await punktCelu();
  await page.mouse.click(punkt.x, punkt.y, { button: przycisk });
  const trafiony = await expect
    .poll(skutek, { timeout: 5000 })
    .toBe(true)
    .then(() => true)
    .catch(() => false);
  if (trafiony) return;
  const podPunktem = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el ? `${el.tagName}[${el.getAttribute('data-hit-klasa') ?? el.closest('[data-testid]')?.getAttribute('data-testid') ?? ''}]` : 'brak';
  }, punkt);
  const pudlo = await cel.boundingBox().catch(() => null);
  throw new Error(
    `${opis}: natywny klik bez skutku; punkt ${punkt.x},${punkt.y}; teraz pod nim ${podPunktem}; ` +
      `cel ${pudlo ? `${Math.round(pudlo.x)},${Math.round(pudlo.y)} ${Math.round(pudlo.width)}×${Math.round(pudlo.height)}` : 'nieobecny'}`,
  );
}

/** Prawy klik w łącznik pola i jego menu (z pozycjami położenia łącznika). */
async function prawyKlikAparatu(page: Page, deviceRef: string): Promise<Locator> {
  const menu = page.getByRole('menu');
  const pozycjeLacznika = menu.locator(
    '[data-testid="sld-menu-open-switch"], [data-testid="sld-menu-close-switch"], [data-testid="sld-menu-earth-switch"]',
  );
  await klikZWeryfikacja(
    page,
    `prawy klik ${deviceRef}`,
    page.locator(`[data-hit-klasa="aparat"][data-hit-device-ref="${deviceRef}"]`).first(),
    () => punktAparatu(page, deviceRef),
    'right',
    async () => (await pozycjeLacznika.count()) > 0,
  );
  return menu;
}

/** Lewy klik w aparat = zaznaczenie (obrys zaznaczenia na kanwie). */
async function klikAparatu(page: Page, deviceRef: string): Promise<void> {
  const obrys = page.locator('[data-testid="sld-v3-zaznaczenie"] rect').first();
  await klikZWeryfikacja(
    page,
    `klik ${deviceRef}`,
    page.locator(`[data-hit-klasa="aparat"][data-hit-device-ref="${deviceRef}"]`).first(),
    () => punktAparatu(page, deviceRef),
    'left',
    async () => obrys.isVisible(),
  );
}

async function ustawMotyw(page: Page, docelowy: 'dark_scada' | 'light_technical'): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    if ((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === docelowy) return;
    await przelaczMotyw(page);
    await page.waitForTimeout(300);
  }
  await expect.poll(async () => page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(docelowy);
}

/** Kafel stanu symbolu aparatu na kanwie: stan i wypełnienie albo `null` (brak kafla). */
async function kafel(page: Page, deviceRef: string): Promise<{ stan: string; fill: string; znak: string | null } | null> {
  const g = page.locator(`g[data-device-ref="${deviceRef}"] [data-kafel-stanu]`);
  if ((await g.count()) === 0) return null;
  const tlo = g.first().locator('[data-kafel="tlo"]');
  const znak = g.first().locator('[data-kafel="znak"]');
  return {
    stan: (await g.first().getAttribute('data-kafel-stanu')) ?? '',
    fill: ((await tlo.getAttribute('fill')) ?? '').toUpperCase(),
    znak: (await znak.count()) > 0 ? await znak.textContent() : null,
  };
}

async function oczekujKafla(page: Page, deviceRef: string, stan: StanKafla, opis: string): Promise<void> {
  await expect.poll(async () => (await kafel(page, deviceRef))?.stan, { timeout: 30000, message: opis }).toBe(stan);
  expect(await kafel(page, deviceRef), opis).toEqual({ stan, fill: KAFEL[stan], znak: stan === 'nieustalony' ? '?' : null });
}

/** Położenie aparatu z menu aparatu (natywny prawy klik w uchwyt aparatu, klik pozycji). */
async function polozenieZMenu(
  page: Page,
  deviceRef: string,
  akcja: 'open-switch' | 'close-switch' | 'earth-switch',
): Promise<void> {
  await widokCalejSieci(page);
  const menu = await prawyKlikAparatu(page, deviceRef);
  const pozycja = menu.getByTestId(`sld-menu-${akcja}`);
  await expect(pozycja, `${deviceRef}: ${akcja} dostępne`).toBeEnabled();
  // Rewizja modelu po stronie aplikacji przed operacją — następny krok startuje dopiero, gdy
  // aplikacja ma nowy model (pozycja aktywna = operacja zmienia stan, więc rewizja rośnie).
  // Pomiar 2026-10-29: prawy klik w aparat w trakcie odświeżania sceny po poprzedniej
  // operacji trafiał w tło (menu „Schemat — kanwa robocza").
  const rewizja = page.getByTestId('mvd-status-model');
  const przed = await rewizja.innerText();
  await pozycja.click();
  await page.keyboard.press('Escape');
  await expect(rewizja, `${deviceRef}: ${akcja} — nowa rewizja modelu w aplikacji`).not.toHaveText(przed, { timeout: 30000 });
  await ruchBezPrzyciskuNiePrzesuwaWidoku(page, `${deviceRef}: po pozycji menu ${akcja}`);
}

/** Ruch myszy nad kanwą BEZ przycisku nie przesuwa widoku — natywna kontrola defektu
 *  „wskaźnik wciśnięty po menu kontekstowym" (`SldCanvasV3.tsx` `zwolnijWskaznik`). */
async function ruchBezPrzyciskuNiePrzesuwaWidoku(page: Page, opis: string): Promise<void> {
  const svg = page.locator('svg[data-testid="sld-canvas-v3"]');
  const k = (await svg.boundingBox())!;
  await czekajNaStabilnyWidok(page);
  const przed = await svg.getAttribute('viewBox');
  await page.mouse.move(k.x + k.width * 0.3, k.y + k.height * 0.4, { steps: 3 });
  await page.mouse.move(k.x + k.width * 0.7, k.y + k.height * 0.6, { steps: 3 });
  await page.waitForTimeout(200);
  expect(await svg.getAttribute('viewBox'), `${opis}: ruch myszy bez przycisku nie przesuwa widoku`).toBe(przed);
}

/** Widok kamery stabilny = dwa kolejne odczyty `viewBox` kanwy identyczne. */
async function czekajNaStabilnyWidok(page: Page): Promise<void> {
  const svg = page.locator('svg[data-testid="sld-canvas-v3"]');
  let poprzedni: string | null = null;
  for (let i = 0; i < 40; i += 1) {
    const biezacy = await svg.getAttribute('viewBox');
    if (biezacy !== null && biezacy === poprzedni) return;
    poprzedni = biezacy;
    await page.waitForTimeout(250);
  }
}

function polozenieAparatu(enm: Snapshot, deviceRef: string): string | null {
  for (const pole of enm.bays ?? []) {
    const a = (pole.primary_devices ?? []).find((d) => d.device_ref === deviceRef);
    if (a) return a.switch_state?.actual_state ?? null;
  }
  return null;
}

/** Zrzut okna pola (schemat pola `SchematPolaSn` na powierzchni konfiguratora) w obu motywach. */
async function zrzutyOknaPola(page: Page, nazwa: string): Promise<void> {
  const okno = page.getByTestId('bay-configurator-surface');
  for (const [klucz, theme] of [['ciemny', 'dark_scada'], ['jasny', 'light_technical']] as const) {
    await ustawMotyw(page, theme);
    await expect(okno).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `${nazwa}-${klucz}.png`), fullPage: false });
  }
}

/** Zrzut POLA aparatu: natywny klik w aparat (zaznacza pole), „Dopasuj do… → Pole" — kamera
 *  kadruje całe pole na środku kanwy, sąsiedzi pod kurtyną. Aparat celu poza kurtyną i w
 *  środkowej części kanwy (każdy zrzut kadruje SWOJE pole — pomiar 2026-10-29: przybliżanie
 *  kółkiem zostawiało kamerę z poprzedniego zrzutu, dwa zrzuty były identyczne bajt w bajt). */
async function zrzut(
  page: Page,
  nazwa: string,
  deviceRef: string,
  aparatyPola: readonly string[],
  oznaczenia: readonly string[] = [],
): Promise<void> {
  await klikAparatu(page, deviceRef);
  await page.getByTestId('sld-v3-dopasuj-do-toggle').click();
  await page.getByTestId('sld-v3-dopasuj-do-pole').click();
  await expect(page.getByTestId('sld-v3-sciezka-kadru')).toBeVisible({ timeout: 15000 });
  const uchwyt = page.locator(`[data-hit-klasa="aparat"][data-hit-device-ref="${deviceRef}"]`).first();
  await czekajNaStabilnaGeometrie(uchwyt);
  // Kadr pola trwa do zrzutu: ścieżka kadru widoczna i aparat narysowany (LOD pola). Jawna
  // asercja zamiast milczącego limitu `boundingBox` — porzucony kadr (np. przeładowanie
  // strony) ma być nazwany w raporcie biegu.
  await expect(page.getByTestId('sld-v3-sciezka-kadru'), `${nazwa}: kadr pola aktywny`).toBeVisible();
  await expect(uchwyt, `${nazwa}: aparat narysowany na kadrze pola`).toHaveCount(1);
  await expect(page.locator(`[data-kadr="poza"] g[data-device-ref="${deviceRef}"]`)).toHaveCount(0);
  const k = (await page.locator('svg[data-testid="sld-canvas-v3"]').boundingBox())!;
  const box = (await uchwyt.boundingBox())!;
  const cx = box.x + box.width / 2;
  expect(cx, `${nazwa}: aparat w kadrze kanwy`).toBeGreaterThan(k.x);
  expect(cx, `${nazwa}: aparat w kadrze kanwy`).toBeLessThan(k.x + k.width);
  // Escape zdejmuje zaznaczenie, nie kadr (K2b §0.3) — zrzut bez ramki zaznaczenia.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  // Oznaczenia aparatów stoją przy symbolach na poziomie szczegółu pola (kadr „Pole"); na
  // widoku przeglądowym stacji ich nie ma — stan niesie wtedy wyłącznie kafel.
  for (const ozn of oznaczenia) {
    await expect(page.locator('svg[data-testid="sld-canvas-v3"] text', { hasText: new RegExp(`^${ozn}$`) }).first(), `${nazwa}: oznaczenie ${ozn}`).toBeVisible();
  }
  const bufor = await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `${nazwa}.png`), clip: await kadrPola(page, aparatyPola) });
  const odcisk = createHash('sha256').update(bufor).digest('hex');
  const dubel = [...ODCISKI_ZRZUTOW].find(([, h]) => h === odcisk)?.[0];
  expect(dubel, `${nazwa}: zrzut identyczny bajt w bajt z innym zrzutem pola`).toBeUndefined();
  ODCISKI_ZRZUTOW.set(nazwa, odcisk);
  await widokCalejSieci(page);
}

/** Kadr zrzutu pola: obrys uchwytów WSZYSTKICH aparatów pola ∪ panel pola GPZ
 *  (`sld-v3-gpz-panel-*`, z podpisem pola i każdym tekstem, którego środek leży w panelu) ∪
 *  etykiety oznaczeń aparatów pola (także na lewo od panelu), z wąskim marginesem i przycięty do kanwy — zrzut
 *  pokazuje całe pole z podpisem, nie cały ekran aplikacji. Pomiar 2026-10-29: kadr ze stałym
 *  marginesem wokół samych aparatów ucinał podpis „Pole liniowe…" pola Z.11.1 (podpis stoi przy
 *  prawej krawędzi panelu, dalej niż margines od najbliższego aparatu) — dlatego podpis pola jest
 *  sprawdzany asercją w każdym kadrze, który ma panel. */
async function kadrPola(page: Page, aparatyPola: readonly string[]): Promise<{ x: number; y: number; width: number; height: number }> {
  const wynik = await page.evaluate(
    ({ refs }) => {
      const kanwa = document.querySelector('svg[data-testid="sld-canvas-v3"]');
      if (!kanwa) return null;
      const k = kanwa.getBoundingClientRect();
      const pudla = refs
        .map((ref) => document.querySelector(`[data-hit-klasa="aparat"][data-hit-device-ref="${ref}"]`))
        .filter((el): el is Element => el !== null)
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0);
      if (pudla.length === 0) return null;
      let x0 = Math.min(...pudla.map((r) => r.left));
      let y0 = Math.min(...pudla.map((r) => r.top));
      let x1 = Math.max(...pudla.map((r) => r.right));
      let y1 = Math.max(...pudla.map((r) => r.bottom));
      const sx = (x0 + x1) / 2;
      const sy = (y0 + y1) / 2;
      const panel = [...kanwa.querySelectorAll('[data-testid^="sld-v3-gpz-panel-"]')]
        .map((el) => el.getBoundingClientRect())
        .find((r) => sx >= r.left && sx <= r.right && sy >= r.top && sy <= r.bottom);
      let podpis: { left: number; top: number; right: number; bottom: number; tekst: string } | null = null;
      const teksty = [...kanwa.querySelectorAll('text')]
        .map((el) => ({ r: el.getBoundingClientRect(), tekst: (el.textContent ?? '').trim() }))
        .filter(({ r }) => r.width > 0 && r.height > 0);
      if (panel) {
        x0 = Math.min(x0, panel.left);
        y0 = Math.min(y0, panel.top);
        x1 = Math.max(x1, panel.right);
        y1 = Math.max(y1, panel.bottom);
        for (const { r, tekst } of teksty) {
          const cx = (r.left + r.right) / 2;
          const cy = (r.top + r.bottom) / 2;
          if (cx < panel.left || cx > panel.right || cy < panel.top || cy > panel.bottom) continue;
          x0 = Math.min(x0, r.left);
          y0 = Math.min(y0, r.top);
          x1 = Math.max(x1, r.right);
          y1 = Math.max(y1, r.bottom);
          if (tekst.startsWith('Pole ') && (podpis === null || r.top < podpis.top)) {
            podpis = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, tekst };
          }
        }
      }
      // Oznaczenia aparatów pola stoją obok symbolu, także na lewo od panelu — etykiety
      // właściciela `<pole>#etykieta-aparatu-<device_ref>` (compose/gpz.ts).
      for (const el of kanwa.querySelectorAll('[data-owner-ref*="#etykieta-aparatu-"]')) {
        const wlasciciel = el.getAttribute('data-owner-ref') ?? '';
        if (!refs.some((ref) => wlasciciel.endsWith(`#etykieta-aparatu-${ref}`))) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        x0 = Math.min(x0, r.left);
        y0 = Math.min(y0, r.top);
        x1 = Math.max(x1, r.right);
        y1 = Math.max(y1, r.bottom);
      }
      const MARGINES = 16;
      const x = Math.max(k.left, x0 - MARGINES);
      const y = Math.max(k.top, y0 - MARGINES);
      const prawa = Math.min(k.right, x1 + MARGINES);
      const dol = Math.min(k.bottom, y1 + MARGINES);
      return { kadr: { x, y, width: prawa - x, height: dol - y }, maPanel: panel !== undefined, podpis };
    },
    { refs: [...aparatyPola] },
  );
  expect(wynik, 'kadr pola: uchwyty aparatów pola na kanwie').not.toBeNull();
  const { kadr, maPanel, podpis } = wynik!;
  if (maPanel) {
    expect(podpis, 'kadr pola: podpis pola w panelu pola').not.toBeNull();
    // Podpis cały w kadrze — chyba że wychodzi poza kanwę (wtedy kadr jest ucięty kanwą, a nie
    // marginesem; zbliżenie kamery).
    const kanwa = (await page.locator('svg[data-testid="sld-canvas-v3"]').boundingBox())!;
    if (podpis!.left >= kanwa.x && podpis!.right <= kanwa.x + kanwa.width) {
      expect(podpis!.left, `kadr pola: podpis „${podpis!.tekst}" w kadrze (lewa)`).toBeGreaterThanOrEqual(kadr.x);
      expect(podpis!.right, `kadr pola: podpis „${podpis!.tekst}" w kadrze (prawa)`).toBeLessThanOrEqual(kadr.x + kadr.width);
    }
  }
  return { x: Math.round(kadr.x), y: Math.round(kadr.y), width: Math.round(kadr.width), height: Math.round(kadr.height) };
}

/** Odciski zrzutów kanwy w biegu — każdy zrzut pola musi być inny (kontrola kadrowania). */
const ODCISKI_ZRZUTOW = new Map<string, string>();

/** GPZ z menu tła kanwy — kreator źródła z wartościami domyślnymi (2 sekcje × 2 pola liniowe Z.10,
 *  stan projektowany, rodzina bez gazów fluorowanych). */
async function wstawGpz(page: Page, request: APIRequestContext, caseId: string): Promise<{ sekcjaA: string; sekcjaB: string }> {
  const kanwa = page.getByTestId('sld-canvas-v3');
  await expect(kanwa).toBeVisible({ timeout: 30000 });
  await kanwa.click({ button: 'right', position: { x: 40, y: 40 } });
  await page.getByRole('menu').getByTestId('sld-menu-insert-gpz').click();
  const kreator = page.getByTestId('mvd-kreator-zrodlo');
  await expect(kreator).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Sekcje i pola', exact: false }).first().click();
  const aparatKatalog = page.getByTestId('mvd-kreator-zrodlo-aparat-katalog');
  await expect(aparatKatalog).toBeVisible({ timeout: 60000 });
  await expect.poll(async () => (await aparatKatalog.inputValue()).trim(), { timeout: 60000 }).not.toBe('');
  await page.getByTestId('mvd-kreator-zrodlo-zapisz').click();
  await expect(kreator).toBeHidden({ timeout: 60000 });
  await expect.poll(async () => polaLiniowe(await pobierzEnm(request, caseId)).length, { timeout: 60000 }).toBeGreaterThanOrEqual(4);

  const enm = await pobierzEnm(request, caseId);
  const [sekcjaA, sekcjaB] = sekcje(enm);
  expect(sekcjaB, 'dwie sekcje SN').toBeTruthy();
  const odpowiedzRodzin = await request.get(`${BACKEND_BASE}/api/catalog/switchgear-families`);
  expect(odpowiedzRodzin.ok()).toBeTruthy();
  const listaRodzin = (await odpowiedzRodzin.json()) as Array<{ switchgear_family_ref: string; gaz_fluorowany: boolean | null }>;
  for (const pole of polaLiniowe(enm)) {
    expect(pole.bay_template_ref, pole.ref_id).toBe(SZABLON_Z10);
    // Nowe pole: stan projektowany, rodzina bez gazów fluorowanych (dyrektywa 2026-10-28).
    expect(pole.stan_obiektu, pole.ref_id).toBe('PROJEKTOWANY');
    expect((pole.primary_devices ?? []).every((d) => d.stan_obiektu === 'PROJEKTOWANY'), pole.ref_id).toBe(true);
    const rodzina = listaRodzin.find((f) => f.switchgear_family_ref === pole.switchgear_family_ref);
    if (pole.switchgear_family_ref) expect(rodzina?.gaz_fluorowany, `${pole.ref_id}: ${pole.switchgear_family_ref}`).toBe(false);
    expect((pole.primary_devices ?? []).map((d) => `${d.designation}:${d.kind}`), pole.ref_id).toEqual([
      'Q1:THREE_POSITION_SWITCH',
      'Q0:CB',
      'T1:CT',
      'PF1:VOLTAGE_INDICATOR',
      'GK:CABLE_HEAD',
      'T2:CORE_BALANCE_CT',
    ]);
  }

  return { sekcjaA, sekcjaB };
}

test('UX-04 — pole liniowe Z.10 GPZ: budowa z kanwy, klik = zaznaczenie, ramki SCADA wg stanu (oba motywy)', async ({ page, request }) => {
  test.setTimeout(900_000);
  mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  const { caseId } = await otworzAplikacje(page, request, 'Z.10');
  const operacjeLaczeniowe: string[] = [];
  page.on('request', (req) => {
    const tresc = req.postData() ?? '';
    if (req.url().includes('/enm/domain-ops') && /"name"\s*:\s*"(open_switch|close_switch)"/.test(tresc)) operacjeLaczeniowe.push(tresc);
  });

  // ---- 1. GPZ z menu tła — kreator źródła z wartościami domyślnymi --------------------------
  const { sekcjaA, sekcjaB } = await wstawGpz(page, request, caseId);
  let enm: Snapshot;

  // ---- 2. Ciąg główny z GPZ (prawy klik w symbol GPZ) — pole sekcji 1 zajęte kablem ---------
  await wrocNaSchemat(page);
  const uchwytGpz = page.locator('[data-hit-klasa="zrodlo"][data-hit-role="obrys"]').first();
  await klikZWeryfikacja(
    page,
    'prawy klik GPZ',
    uchwytGpz,
    () => punktUchwytu(uchwytGpz),
    'right',
    async () => (await page.getByRole('menu').getByTestId('sld-menu-continue-trunk').count()) > 0,
  );
  await page.getByRole('menu').getByTestId('sld-menu-continue-trunk').click();
  const magistrala = page.getByTestId('mvd-kreator-magistrala');
  await expect(magistrala).toBeVisible({ timeout: 20000 });
  const katalogKabla = page.getByTestId('mvd-kreator-magistrala-katalog');
  await expect.poll(async () => katalogKabla.locator('option').count(), { timeout: 60000 }).toBeGreaterThan(1);
  await katalogKabla.selectOption({ index: 1 });
  await page.getByTestId('mvd-kreator-magistrala-dalej').click();
  await page.getByTestId('mvd-kreator-magistrala-dlugosc').fill('400');
  await expect(magistrala).toHaveAttribute('data-status', 'gotowy', { timeout: 30000 });
  await page.getByTestId('mvd-kreator-magistrala-zapisz').click();
  const zakoncz = page.getByTestId('mvd-kreator-magistrala-zakoncz');
  if (await zakoncz.isVisible({ timeout: 15000 }).catch(() => false)) await zakoncz.click();
  await expect(magistrala).toBeHidden({ timeout: 60000 });
  await expect.poll(async () => ((await pobierzEnm(request, caseId)).branches ?? []).filter((b) => b.type === 'cable').length, { timeout: 60000 }).toBe(1);

  // ---- 3. Z.10 z wyłącznikiem stałym (§13) w polu sekcji 2 — okno pola → „Zmień wyposażenie" → szablon -----
  enm = await pobierzEnm(request, caseId);
  const poleStale = polaLiniowe(enm).find((p) => p.gpz_section_id === sekcjaB)!;
  await wrocNaSchemat(page);
  const menuStale = await prawyKlikAparatu(page, aparat(poleStale, 'Q0').device_ref);
  await menuStale.getByTestId('sld-menu-open-bay').click();
  await expect(page.getByTestId('bay-configurator-surface')).toBeVisible({ timeout: 30000 });
  // Karta pola i inspektor o TYM SAMYM obiekcie: po kreatorze magistrali zaznaczony był nowy
  // odcinek — akcja z menu wyłącznika zaznacza jego pole (pomiar 2026-10-29: inspektor
  // pokazywał odcinek kablowy obok karty pola).
  const kabelRef = (enm.branches ?? []).find((b) => b.type === 'cable')!.ref_id;
  await expect(page.getByTestId('inspektor-element-kanwy')).toHaveAttribute('data-element-id', poleStale.ref_id, { timeout: 15000 });
  await expect(page.getByTestId('inspektor-element-kanwy')).not.toHaveAttribute('data-element-id', kabelRef);
  await zrzutyOknaPola(page, 'okno-pola-z10-trojpolozeniowy');
  await page.getByTestId('wyposazenie-pola-edytuj').click();
  await page.getByTestId('wyposazenie-pola-tryb').selectOption('szablon');
  const szablon = page.getByTestId('wyposazenie-pola-szablon');
  await expect.poll(async () => szablon.locator(`option[value="${SZABLON_Z10_STALY}"]`).count(), { timeout: 30000 }).toBe(1);
  await szablon.selectOption(SZABLON_Z10_STALY);
  await page.getByTestId('wyposazenie-pola-zapisz').click();
  await expect
    .poll(async () => polaLiniowe(await pobierzEnm(request, caseId)).find((p) => p.ref_id === poleStale.ref_id)?.bay_template_ref, { timeout: 60000 })
    .toBe(SZABLON_Z10_STALY);
  await zrzutyOknaPola(page, 'okno-pola-z10-staly-z-odlacznikiem');

  enm = await pobierzEnm(request, caseId);
  const poleStalePo = polaLiniowe(enm).find((p) => p.ref_id === poleStale.ref_id)!;
  expect((poleStalePo.primary_devices ?? []).map((d) => `${d.designation}:${d.kind}`)).toEqual([
    'Q1:DS',
    'Q0:CB',
    'T1:CT',
    'PF1:VOLTAGE_INDICATOR',
    'Q8:ES',
    'GK:CABLE_HEAD',
    'T2:CORE_BALANCE_CT',
  ]);
  const kabel = (enm.branches ?? []).find((b) => b.type === 'cable')!;
  const galezPola = (pole: Pole) => (enm.branches ?? []).find((b) => b.ref_id === pole.equipment_refs?.[0]);
  const poleZajete = polaLiniowe(enm).find((p) => p.gpz_section_id === sekcjaA && galezPola(p)?.to_bus_ref === kabel.from_bus_ref)!;
  expect(poleZajete, 'pole sekcji 1 z kablem odejścia').toBeTruthy();
  const q1 = aparat(poleZajete, 'Q1');
  const q0 = aparat(poleZajete, 'Q0');
  expect(q1.switch_state?.actual_state).toBe('zamkniety');
  const aparatyZajetego = (poleZajete.primary_devices ?? []).map((d) => d.device_ref);
  const aparatyStalego = (poleStalePo.primary_devices ?? []).map((d) => d.device_ref);

  // ---- 4. Klik = zaznaczenie (natywny lewy klik w wyłącznik), bez operacji łączeniowej -----
  await wrocNaSchemat(page);
  await klikAparatu(page, q0.device_ref);
  await expect(page.locator('[data-testid="sld-v3-zaznaczenie"] rect').first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);
  expect(operacjeLaczeniowe, 'klik nie przełącza aparatu').toEqual([]);
  expect(galezPola(poleZajete)?.status).toBe('closed');
  expect(((await pobierzEnm(request, caseId)).branches ?? []).find((b) => b.ref_id === poleZajete.equipment_refs?.[0])?.status).toBe('closed');
  await page.keyboard.press('Escape');

  // ---- 5. Kafle wg stanu z modelu + zrzuty (oba motywy) — stan wyjściowy ------------------
  const dsStaly = aparat(poleStalePo, 'Q1');
  const esStaly = aparat(poleStalePo, 'Q8');
  const q0Staly = aparat(poleStalePo, 'Q0');
  for (const [klucz, theme] of [['ciemny', 'dark_scada'], ['jasny', 'light_technical']] as const) {
    await ustawMotyw(page, theme);
    await przyblizDoAparatu(page, q0.device_ref);
    await oczekujKafla(page, q1.device_ref, 'zamkniety', `${klucz}: Q1 trójpołożeniowy zamknięty`);
    await oczekujKafla(page, q0.device_ref, 'zamkniety', `${klucz}: Q0 zamknięty`);
    // Aparaty nie-łączniki bez kafla; symbol zawsze narysowany.
    for (const ozn of ['T1', 'PF1', 'GK', 'T2']) {
      const ref = aparat(poleZajete, ozn).device_ref;
      await expect(page.locator(`g[data-device-ref="${ref}"]`)).toHaveCount(1);
      expect(await kafel(page, ref), ozn).toBeNull();
    }
    // Stan obiektu dyskretnie: atrybut symbolu (podpowiedź na kształcie trafienia).
    await expect(page.locator(`g[data-device-ref="${q0.device_ref}"]`)).toHaveAttribute('data-stan-obiektu', 'PROJEKTOWANY');
    await zrzut(page, `pole-z10-trojpolozeniowy-zamkniete-${klucz}`, q0.device_ref, aparatyZajetego, ['Q1', 'Q0', 'T1']);
    // Wyłącznik stały: odłącznik i uziemnik bez rekordu położenia po zmianie szablonu — kafel
    // „stan nieznany" (szary ze znakiem „?"), nie brak kafla; oznaczenie przy symbolu.
    await przyblizDoAparatu(page, dsStaly.device_ref);
    await oczekujKafla(page, dsStaly.device_ref, 'nieustalony', `${klucz}: Q1 odłącznik bez rekordu położenia`);
    await oczekujKafla(page, esStaly.device_ref, 'nieustalony', `${klucz}: Q8 uziemnik bez rekordu położenia`);
    await oczekujKafla(page, q0Staly.device_ref, 'zamkniety', `${klucz}: Q0 pola stałego zamknięty`);
    await zrzut(page, `pole-z10-staly-stan-nieznany-${klucz}`, dsStaly.device_ref, aparatyStalego, ['Q1', 'Q8']);
  }

  // ---- 6. Położenia z menu aparatu: Q1 zamknięty, Q8 otwarty (operacje na TYM aparacie) ----
  await polozenieZMenu(page, dsStaly.device_ref, 'close-switch');
  await expect.poll(async () => polozenieAparatu(await pobierzEnm(request, caseId), dsStaly.device_ref), { timeout: 30000 }).toBe('zamkniety');
  await polozenieZMenu(page, esStaly.device_ref, 'open-switch');
  await expect.poll(async () => polozenieAparatu(await pobierzEnm(request, caseId), esStaly.device_ref), { timeout: 30000 }).toBe('otwarty');
  // Menu odłącznika i uziemnika nie przełączyło wyłącznika pola (defekt sprzed rozszerzenia 5).
  expect(operacjeLaczeniowe, 'odłącznik i uziemnik nie przełączają wyłącznika').toEqual([]);
  expect(((await pobierzEnm(request, caseId)).branches ?? []).find((b) => b.ref_id === poleStalePo.equipment_refs?.[0])?.status).toBe('closed');
  for (const [klucz, theme] of [['ciemny', 'dark_scada'], ['jasny', 'light_technical']] as const) {
    await ustawMotyw(page, theme);
    await przyblizDoAparatu(page, esStaly.device_ref);
    await oczekujKafla(page, dsStaly.device_ref, 'zamkniety', `${klucz}: Q1 odłącznik zamknięty`);
    await oczekujKafla(page, q0Staly.device_ref, 'zamkniety', `${klucz}: Q0 zamknięty`);
    await oczekujKafla(page, esStaly.device_ref, 'otwarty', `${klucz}: Q8 uziemnik otwarty`);
    await zrzut(page, `pole-z10-wylacznik-zamkniety-uziemnik-otwarty-${klucz}`, q0Staly.device_ref, aparatyStalego, ['Q1', 'Q0', 'Q8']);
  }

  // ---- 7. Zbliżenie: kamera kółkiem na wyłącznik pola (LOD szczegółu z kamery) ------------
  await ustawMotyw(page, 'dark_scada');
  await widokCalejSieci(page);
  const uchwytQ0 = await przyblizDoAparatu(page, q0Staly.device_ref);
  for (let i = 0; i < 6; i += 1) {
    const box = (await uchwytQ0.boundingBox())!;
    if (Math.min(box.width, box.height) >= 40) break;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(200);
  }
  await czekajNaStabilnaGeometrie(uchwytQ0);
  await oczekujKafla(page, q0Staly.device_ref, 'zamkniety', 'zbliżenie: Q0 zamknięty');
  const bufor = await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, 'pole-z10-zblizenie-ciemny.png'), clip: await kadrPola(page, aparatyStalego) });
  ODCISKI_ZRZUTOW.set('pole-z10-zblizenie-ciemny', createHash('sha256').update(bufor).digest('hex'));

  // ---- 8. „Otwórz łącznik" z menu wyłącznika → kafel zielony (oba motywy) -----------------
  await widokCalejSieci(page);
  const menuQ0 = await prawyKlikAparatu(page, q0.device_ref);
  await menuQ0.getByTestId('sld-menu-open-switch').click();
  await expect
    .poll(async () => ((await pobierzEnm(request, caseId)).branches ?? []).find((b) => b.ref_id === poleZajete.equipment_refs?.[0])?.status, { timeout: 30000 })
    .toBe('open');
  // Kontrola pozytywna detektora z kroku 4: jawna akcja menu wyłącznika DAJE dokładnie jedną
  // operację łączeniową — więc pusta lista po kliku i po menu odłącznika była pomiarem.
  expect(operacjeLaczeniowe).toHaveLength(1);
  await page.keyboard.press('Escape');
  for (const [klucz, theme] of [['ciemny', 'dark_scada'], ['jasny', 'light_technical']] as const) {
    await ustawMotyw(page, theme);
    await przyblizDoAparatu(page, q0.device_ref);
    await oczekujKafla(page, q0.device_ref, 'otwarty', `${klucz}: Q0 otwarty`);
    await oczekujKafla(page, q1.device_ref, 'zamkniety', `${klucz}: Q1 zamknięty`);
    await zrzut(page, `pole-z10-wylacznik-otwarty-${klucz}`, q0.device_ref, aparatyZajetego, ['Q1', 'Q0', 'T1']);
  }
});

test('UX-04 — pole liniowe Z.11.1 GPZ: odgałęzienie przekładnika napięciowego od strony linii (oba motywy)', async ({ page, request }) => {
  test.setTimeout(900_000);
  mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  const { caseId } = await otworzAplikacje(page, request, 'Z.11.1');

  // ---- 1. GPZ z menu tła — kreator źródła z wartościami domyślnymi --------------------------
  const { sekcjaA } = await wstawGpz(page, request, caseId);

  // ---- 2. Z.11.1 w pierwszym polu sekcji 1 — okno pola → „Zmień wyposażenie" → szablon ------
  let enm = await pobierzEnm(request, caseId);
  const poleZ11 = polaLiniowe(enm).find((p) => p.gpz_section_id === sekcjaA)!;
  expect(poleZ11, 'pole sekcji 1').toBeTruthy();
  await wrocNaSchemat(page);
  const menuZ11 = await prawyKlikAparatu(page, aparat(poleZ11, 'Q0').device_ref);
  await menuZ11.getByTestId('sld-menu-open-bay').click();
  await expect(page.getByTestId('bay-configurator-surface')).toBeVisible({ timeout: 30000 });
  // Karta pola i inspektor o TYM SAMYM obiekcie: akcja z menu aparatu zaznacza jego pole.
  await expect(page.getByTestId('inspektor-element-kanwy')).toHaveAttribute('data-element-id', poleZ11.ref_id, { timeout: 15000 });
  await page.getByTestId('wyposazenie-pola-edytuj').click();
  const szablon = page.getByTestId('wyposazenie-pola-szablon');
  await page.getByTestId('wyposazenie-pola-tryb').selectOption('szablon');
  await expect.poll(async () => szablon.locator(`option[value="${SZABLON_Z11_1}"]`).count(), { timeout: 30000 }).toBe(1);
  await szablon.selectOption(SZABLON_Z11_1);
  await page.getByTestId('wyposazenie-pola-zapisz').click();
  await expect
    .poll(async () => polaLiniowe(await pobierzEnm(request, caseId)).find((p) => p.ref_id === poleZ11.ref_id)?.bay_template_ref, { timeout: 60000 })
    .toBe(SZABLON_Z11_1);
  await expect(page.getByTestId('ocena-pola-liniowego')).toBeVisible({ timeout: 30000 });
  await zrzutyOknaPola(page, 'okno-pola-z11-1-trojpolozeniowy');

  enm = await pobierzEnm(request, caseId);
  const poleZ11Po = polaLiniowe(enm).find((p) => p.ref_id === poleZ11.ref_id)!;
  expect((poleZ11Po.primary_devices ?? []).map((d) => `${d.designation}:${d.kind}`)).toEqual([
    'PF0:VOLTAGE_INDICATOR',
    'Q1:THREE_POSITION_SWITCH',
    'Q0:CB',
    'Q5:THREE_POSITION_SWITCH',
    'GK1:CABLE_HEAD',
    'T3:VT',
    'T1:CT',
    'PF1:VOLTAGE_INDICATOR',
    'GK:CABLE_HEAD',
    'T2:CORE_BALANCE_CT',
  ]);


  // ---- 3. Położenia z menu aparatu: Q0 otwarty, Q1 uziemiony (przez otwarte), Q5 zamknięty ---
  const q0 = aparat(poleZ11Po, 'Q0');
  const q1 = aparat(poleZ11Po, 'Q1');
  const q5 = aparat(poleZ11Po, 'Q5');
  await wrocNaSchemat(page);
  await polozenieZMenu(page, q0.device_ref, 'open-switch');
  await expect
    .poll(async () => ((await pobierzEnm(request, caseId)).branches ?? []).find((b) => b.ref_id === poleZ11Po.equipment_refs?.[0])?.status, { timeout: 30000 })
    .toBe('open');
  if (polozenieAparatu(await pobierzEnm(request, caseId), q1.device_ref) === 'zamkniety') {
    // Łącznik trójpołożeniowy: zamknięty → uziemiony wyłącznie przez położenie otwarte.
    await polozenieZMenu(page, q1.device_ref, 'open-switch');
    await expect.poll(async () => polozenieAparatu(await pobierzEnm(request, caseId), q1.device_ref), { timeout: 30000 }).toBe('otwarty');
  }
  await polozenieZMenu(page, q1.device_ref, 'earth-switch');
  await expect.poll(async () => polozenieAparatu(await pobierzEnm(request, caseId), q1.device_ref), { timeout: 30000 }).toBe('uziemiony');
  await polozenieZMenu(page, q5.device_ref, 'close-switch');
  await expect.poll(async () => polozenieAparatu(await pobierzEnm(request, caseId), q5.device_ref), { timeout: 30000 }).toBe('zamkniety');
  enm = await pobierzEnm(request, caseId);
  const aparatyZ11 = (polaLiniowe(enm).find((p) => p.ref_id === poleZ11.ref_id)!.primary_devices ?? []).map((d) => d.device_ref);

  // ---- 4. Rysunek pola na kanwie: PF0 przy szynie, kolumna Q5 → GK1 → T3 za wyłącznikiem, kafle -----
  for (const [klucz, theme] of [['ciemny', 'dark_scada'], ['jasny', 'light_technical']] as const) {
    await ustawMotyw(page, theme);
    await przyblizDoAparatu(page, q5.device_ref);
    for (const ozn of ['Q5', 'GK1', 'T3', 'PF0']) {
      await expect(page.locator(`g[data-device-ref="${aparat(poleZ11Po, ozn).device_ref}"]`), ozn).toHaveCount(1);
    }
    await oczekujKafla(page, q0.device_ref, 'otwarty', `${klucz}: Q0 otwarty`);
    // Uziemiony: zestyk uziemiający zamknięty — kafel czerwony, nóż na zestyku uziemiającym.
    await oczekujKafla(page, q1.device_ref, 'zamkniety', `${klucz}: Q1 uziemiony`);
    await expect(page.locator(`g[data-device-ref="${q1.device_ref}"] [data-qet-polozenie]`).first()).toHaveAttribute('data-qet-polozenie', 'earthed');
    await oczekujKafla(page, q5.device_ref, 'zamkniety', `${klucz}: Q5 zamknięty`);
    await zrzut(page, `pole-z11-1-wylacznik-otwarty-uziemiony-${klucz}`, q5.device_ref, aparatyZ11, ['PF0', 'Q1', 'Q0', 'Q5', 'T3']);
  }
});
