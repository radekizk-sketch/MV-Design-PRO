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
 * prawy klik w wyłącznik pola zajętego → „Otwórz łącznik".
 *
 * Sprawdzenia (model z backendu, rysunek z DOM kanwy):
 *  - każde pole liniowe GPZ niesie wzorzec Z.10 (Q1 trójpołożeniowy, Q0, T1, PF1, GK, T2) bez
 *    gazów fluorowanych (rodzina rozdzielnicy pola nie niesie SF₆), stan obiektu „projektowany"
 *    na polu, na aparatach i w atrybucie symbolu kanwy (`data-stan-obiektu`); pole po zmianie —
 *    wykonanie stałe z odłącznikiem albo Z.11.1 z odgałęzieniem (Q5, GK1, T3) na rysunku;
 *  - klik = ZAZNACZENIE (obrys zaznaczenia), bez żadnej operacji łączeniowej na backendzie;
 *  - ramka stanu SCADA: wyłącznie obrys (`fill="none"`), `#F05260` zamknięty, `#2CCF93`
 *    otwarty, w obu motywach; łącznik bez rekordu położenia — bez ramki, z etykietą
 *    „stan nieznany", symbol zostaje.
 *
 * Zrzuty: `docs/uiux/zrzuty/ux04-pole-liniowe/<kadr>-<motyw>.png` (do drzewa repo wyłącznie
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
const RAMKA_ZAMKNIETY = '#F05260';
const RAMKA_OTWARTY = '#2CCF93';

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

async function prawyKlikAparatu(page: Page, deviceRef: string): Promise<Locator> {
  const punkt = await punktAparatu(page, deviceRef);
  await page.mouse.click(punkt.x, punkt.y, { button: 'right' });
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible({ timeout: 15000 });
  return menu;
}

async function ustawMotyw(page: Page, docelowy: 'dark_scada' | 'light_technical'): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    if ((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === docelowy) return;
    await przelaczMotyw(page);
    await page.waitForTimeout(300);
  }
  await expect.poll(async () => page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(docelowy);
}

/** Ramka SCADA symbolu aparatu na kanwie: kolor obrysu albo `null` (brak ramki). */
async function ramka(page: Page, deviceRef: string): Promise<{ stroke: string; fill: string } | null> {
  const r = page.locator(`g[data-device-ref="${deviceRef}"] [data-qet="ramka-scada"]`);
  if ((await r.count()) === 0) return null;
  return { stroke: (await r.first().getAttribute('stroke')) ?? '', fill: (await r.first().getAttribute('fill')) ?? '' };
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
async function zrzut(page: Page, nazwa: string, deviceRef: string): Promise<void> {
  const punkt = await punktAparatu(page, deviceRef);
  await page.mouse.click(punkt.x, punkt.y);
  await page.getByTestId('sld-v3-dopasuj-do-toggle').click();
  await page.getByTestId('sld-v3-dopasuj-do-pole').click();
  await expect(page.getByTestId('sld-v3-sciezka-kadru')).toBeVisible({ timeout: 15000 });
  const uchwyt = page.locator(`[data-hit-klasa="aparat"][data-hit-device-ref="${deviceRef}"]`).first();
  await czekajNaStabilnaGeometrie(uchwyt);
  await expect(page.locator(`[data-kadr="poza"] g[data-device-ref="${deviceRef}"]`)).toHaveCount(0);
  const k = (await page.locator('svg[data-testid="sld-canvas-v3"]').boundingBox())!;
  const box = (await uchwyt.boundingBox())!;
  const cx = box.x + box.width / 2;
  expect(cx, `${nazwa}: aparat w kadrze kanwy`).toBeGreaterThan(k.x);
  expect(cx, `${nazwa}: aparat w kadrze kanwy`).toBeLessThan(k.x + k.width);
  // Escape zdejmuje zaznaczenie, nie kadr (K2b §0.3) — zrzut bez ramki zaznaczenia.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const bufor = await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `${nazwa}.png`), fullPage: false });
  const odcisk = createHash('sha256').update(bufor).digest('hex');
  const dubel = [...ODCISKI_ZRZUTOW].find(([, h]) => h === odcisk)?.[0];
  expect(dubel, `${nazwa}: zrzut identyczny bajt w bajt z innym zrzutem pola`).toBeUndefined();
  ODCISKI_ZRZUTOW.set(nazwa, odcisk);
  await widokCalejSieci(page);
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
  const punktGpz = await punktUchwytu(uchwytGpz);
  await page.mouse.click(punktGpz.x, punktGpz.y, { button: 'right' });
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
    'Q9:ES',
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

  // ---- 4. Klik = zaznaczenie (natywny lewy klik w wyłącznik), bez operacji łączeniowej -----
  await wrocNaSchemat(page);
  const punktQ0 = await punktAparatu(page, q0.device_ref);
  await page.mouse.click(punktQ0.x, punktQ0.y);
  await expect(page.locator('[data-testid="sld-v3-zaznaczenie"] rect').first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);
  expect(operacjeLaczeniowe, 'klik nie przełącza aparatu').toEqual([]);
  expect(galezPola(poleZajete)?.status).toBe('closed');
  expect(((await pobierzEnm(request, caseId)).branches ?? []).find((b) => b.ref_id === poleZajete.equipment_refs?.[0])?.status).toBe('closed');
  await page.keyboard.press('Escape');

  // ---- 5. Ramki wg stanu z modelu + zrzuty (oba motywy) — stan wyjściowy ------------------
  const dsStaly = aparat(poleStalePo, 'Q1');
  for (const [klucz, theme] of [['ciemny', 'dark_scada'], ['jasny', 'light_technical']] as const) {
    await ustawMotyw(page, theme);
    await przyblizDoAparatu(page, q0.device_ref);
    expect(await ramka(page, q1.device_ref)).toEqual({ stroke: RAMKA_ZAMKNIETY, fill: 'none' });
    expect(await ramka(page, q0.device_ref)).toEqual({ stroke: RAMKA_ZAMKNIETY, fill: 'none' });
    // Aparaty nie-łączniki bez ramki; symbol zawsze narysowany.
    for (const ozn of ['T1', 'PF1', 'GK', 'T2']) {
      const ref = aparat(poleZajete, ozn).device_ref;
      await expect(page.locator(`g[data-device-ref="${ref}"]`)).toHaveCount(1);
      expect(await ramka(page, ref), ozn).toBeNull();
    }
    // Stan obiektu dyskretnie: atrybut symbolu (podpowiedź na kształcie trafienia).
    await expect(page.locator(`g[data-device-ref="${q0.device_ref}"]`)).toHaveAttribute('data-stan-obiektu', 'PROJEKTOWANY');
    await zrzut(page, `pole-z10-trojpolozeniowy-zamkniete-${klucz}`, q0.device_ref);
    // Wyłącznik stały: odłącznik bez rekordu położenia po zmianie szablonu — bez ramki, „stan nieznany".
    await przyblizDoAparatu(page, dsStaly.device_ref);
    await expect(page.locator(`g[data-device-ref="${dsStaly.device_ref}"]`)).toHaveCount(1);
    expect(await ramka(page, dsStaly.device_ref)).toBeNull();
    expect(await ramka(page, aparat(poleStalePo, 'Q0').device_ref)).toEqual({ stroke: RAMKA_ZAMKNIETY, fill: 'none' });
    await expect(page.locator('text', { hasText: 'Q1 · stan nieznany' }).first()).toBeVisible();
    await zrzut(page, `pole-z10-staly-stan-nieznany-${klucz}`, dsStaly.device_ref);
  }

  // ---- 6. „Otwórz łącznik" z menu wyłącznika → ramka zielona (oba motywy) ----------------
  await widokCalejSieci(page);
  const menuQ0 = await prawyKlikAparatu(page, q0.device_ref);
  await menuQ0.getByTestId('sld-menu-open-switch').click();
  await expect
    .poll(async () => ((await pobierzEnm(request, caseId)).branches ?? []).find((b) => b.ref_id === poleZajete.equipment_refs?.[0])?.status, { timeout: 30000 })
    .toBe('open');
  // Kontrola pozytywna detektora z kroku 4: jawna akcja menu DAJE dokładnie jedną operację
  // łączeniową — więc pusta lista po kliku była pomiarem, nie ślepotą nasłuchu.
  expect(operacjeLaczeniowe).toHaveLength(1);
  await page.keyboard.press('Escape');
  for (const [klucz, theme] of [['ciemny', 'dark_scada'], ['jasny', 'light_technical']] as const) {
    await ustawMotyw(page, theme);
    await przyblizDoAparatu(page, q0.device_ref);
    await expect.poll(async () => (await ramka(page, q0.device_ref))?.stroke, { timeout: 30000 }).toBe(RAMKA_OTWARTY);
    expect(await ramka(page, q0.device_ref)).toEqual({ stroke: RAMKA_OTWARTY, fill: 'none' });
    expect(await ramka(page, q1.device_ref)).toEqual({ stroke: RAMKA_ZAMKNIETY, fill: 'none' });
    await zrzut(page, `pole-z10-wylacznik-otwarty-${klucz}`, q0.device_ref);
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


  // ---- 3. Rysunek pola na kanwie: PF0 przy szynie, kolumna Q5 → GK1 → T3 za wyłącznikiem -----
  await wrocNaSchemat(page);
  for (const [klucz, theme] of [['ciemny', 'dark_scada'], ['jasny', 'light_technical']] as const) {
    await ustawMotyw(page, theme);
    for (const ozn of ['Q5', 'GK1', 'T3', 'PF0']) {
      await expect(page.locator(`g[data-device-ref="${aparat(poleZ11Po, ozn).device_ref}"]`), ozn).toHaveCount(1);
    }
    await zrzut(page, `pole-z11-1-odgalezienie-${klucz}`, aparat(poleZ11Po, 'Q5').device_ref);
  }
});
