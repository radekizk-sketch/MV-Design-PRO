/**
 * KARTA UI-02 PANEL-DOLNY — zakładki „Wyniki" i „Dowody" na REALNYM backendzie.
 *
 * Przebieg projektanta (odbiór sesji głównej, recenzja SLD R01): otwórz sieć → wybierz
 * stację na schemacie → (rozpływ i zwarcia policzone) → wyniki w panelu dolnym → dowód.
 * Schemat pozostaje widoczny przez cały czas pracy w panelu, selekcja i kadr schematu są
 * zachowane (otwarcie panelu i klik wiersza nie przeskakują kamery do całej sieci), a wiersz
 * „Wyników" i inspektor wskazują tę samą referencję elementu.
 *
 * Interakcje natywne (klik, kółko myszy). Sieć i biegi przez API (spec bada panel, nie
 * budowę sieci — tę dowodzą speki budowy). Zrzuty 1440×900 i 1920×1080 × oba motywy:
 * `docs/uiux/zrzuty/ui02-panel-dolny` przez `katalogZrzutow` (bieg testów nie pisze do
 * drzewa repo bez `ZRZUTY_DO_DOKUMENTACJI=1`). Spec NIE wystawia werdyktu wizualnego (B-02).
 */
import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { wykonajBiegDoKonca } from './biegi';
import { katalogZrzutow, KORZEN_REPO } from './katalogZrzutow';
import { przelaczMotyw, wlaczSzczegolyAudytowe } from './powloka';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const WERSJA_KATALOGU = '2024.1';
const APARAT = 'sw-cb-abb-vd4-17kv-630a';
const KABEL = 'cable-tfk-yakxs-3x120';
const TRAFO = 'tr-sn-nn-15-04-630kva-dyn11';
const ZRODLO = 'src-gpz-15kv-250mva-rx010';
const NAZWA_STACJI = 'Stacja Osiedlowa';
const KATALOG_ZRZUTOW = katalogZrzutow(
  path.join(KORZEN_REPO, 'mv-design-pro', 'docs', 'uiux', 'zrzuty', 'ui02-panel-dolny'),
);

type Enm = {
  substations?: Array<{ ref_id: string; name?: string; station_type?: string | null }>;
  branches?: Array<{ ref_id: string; name?: string; type?: string }>;
  buses?: Array<{ ref_id: string }>;
  transformers?: Array<{ ref_id: string }>;
  corridors?: Array<{ ordered_segment_refs?: string[] }>;
};
type Seed = { projectId: string; projectName: string; caseId: string; caseName: string };

let licznik = 0;

function katalog(namespace: string, itemId: string) {
  return { catalog_namespace: namespace, catalog_item_id: itemId, catalog_item_version: WERSJA_KATALOGU };
}

async function operacja(
  request: APIRequestContext,
  caseId: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<Enm> {
  const odpowiedz = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: { name, idempotency_key: `ui02-${Date.now()}-${String(++licznik).padStart(4, '0')}`, payload },
    },
  });
  expect(odpowiedz.ok(), await odpowiedz.text()).toBeTruthy();
  const body = (await odpowiedz.json()) as { error?: string | null; snapshot?: Enm };
  expect(body.error ?? null).toBeNull();
  return body.snapshot ?? {};
}

/** Projekt + przypadek + sieć gotowa do obliczeń: GPZ, trzy odcinki kablowe, stacja SN/nN. */
async function siecGotowa(request: APIRequestContext): Promise<{ seed: Seed; enm: Enm }> {
  const suffix = Date.now().toString(36);
  const projectName = `Panel dolny ${suffix}`;
  const caseName = `Wyniki i dowody ${suffix}`;
  const projekt = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: { name: projectName, description: 'Panel dolny — wyniki i dowody', mode: 'TO-BE', voltage_level_kv: 15.0, frequency_hz: 50.0 },
  });
  expect(projekt.ok()).toBeTruthy();
  const projectId = ((await projekt.json()) as { id: string }).id;
  const przypadek = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: projectId, name: caseName, description: '', config: {}, set_active: true },
  });
  expect(przypadek.ok()).toBeTruthy();
  const caseId = ((await przypadek.json()) as { id: string }).id;

  let enm = await operacja(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: katalog('ZRODLO_SN', ZRODLO),
    hv_voltage_kv: 110.0,
    transformer_sn_mva: 25.0,
  });
  for (const [idx, dlugosc] of [300, 250, 200].entries()) {
    enm = await operacja(request, caseId, 'continue_trunk_segment_sn', {
      segment: { rodzaj: 'KABEL', dlugosc_m: dlugosc, name: `Odcinek ${idx + 1}`, catalog_binding: katalog('KABEL_SN', KABEL) },
    });
  }
  // Rozpływ wymaga odbioru w sieci (`enm/validator.py`: load_flow = has_loads) — odbiór
  // na szynie końcowej ciągu (najnowsza szyna migawki po dobudowaniu odcinka).
  const szynaKoncowa = (enm.buses ?? [])[(enm.buses ?? []).length - 1]?.ref_id;
  expect(szynaKoncowa).toBeTruthy();
  enm = await operacja(request, caseId, 'add_load_sn', { bus_ref: szynaKoncowa, p_mw: 0.1, cos_phi: 0.95 });
  const odcinki = enm.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(odcinki.length).toBeGreaterThan(0);
  enm = await operacja(request, caseId, 'insert_station_on_segment_sn', {
    field_apparatus_catalog_ref: APARAT,
    segment_id: odcinki[odcinki.length - 1],
    station_type: 'B',
    insert_at: { value: 0.5 },
    station: { name: NAZWA_STACJI, sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    sn_fields: ['IN', 'OUT', 'FEEDER', 'TR'],
    transformer: { create: true, catalog_binding: katalog('TRAFO_SN_NN', TRAFO) },
  });

  const gotowosc = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/engineering-readiness`);
  expect(gotowosc.ok()).toBeTruthy();
  const odczyt = (await gotowosc.json()) as { ready: boolean; issues?: Array<{ code: string }> };
  expect(odczyt.ready, JSON.stringify(odczyt.issues ?? [])).toBe(true);
  return { seed: { projectId, projectName, caseId, caseName }, enm };
}

async function bieg(request: APIRequestContext, caseId: string, analysisType: string): Promise<string> {
  const odpowiedz = await request.post(`${BACKEND_BASE}/api/execution/study-cases/${caseId}/runs`, {
    data: { analysis_type: analysisType },
  });
  expect(odpowiedz.ok(), await odpowiedz.text()).toBeTruthy();
  const runId = ((await odpowiedz.json()) as { id: string }).id;
  await wykonajBiegDoKonca(request, BACKEND_BASE, runId);
  return runId;
}

async function otworzAplikacje(page: Page, seed: Seed): Promise<void> {
  await page.addInitScript((s) => {
    localStorage.setItem(
      'mv-design-app-state',
      JSON.stringify({
        state: {
          activeProjectId: s.projectId,
          activeProjectName: s.projectName,
          activeCaseId: s.caseId,
          activeCaseName: s.caseName,
          activeCaseKind: 'ShortCircuitCase',
          activeCaseResultStatus: 'NONE',
          activeSnapshotId: null,
          activeMode: 'MODEL_EDIT',
          activeRunId: null,
          activeAnalysisType: 'SHORT_CIRCUIT',
          caseManagerOpen: false,
          issuePanelOpen: false,
        },
        version: 1,
      }),
    );
  }, seed);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 60000 });
  await przejdzDoSchematu(page);
}

async function przeladuj(page: Page): Promise<void> {
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 60000 });
  await przejdzDoSchematu(page);
}

/** Przestrzeń „Schemat (SLD)" realnym klikiem nawigacji; kanwa widoczna. */
async function przejdzDoSchematu(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Schemat \(SLD\) \d$/ }).click();
  await expect(page.getByTestId('sld-canvas-v3')).toBeVisible({ timeout: 60000 });
}

/** Otwiera panel dolny realną ścieżką (menu „Widok" → „Panel dolny"), jeśli jest zamknięty. */
async function otworzPanelDolny(page: Page): Promise<void> {
  if (await page.getByTestId('mvd-bottom-tab-wyniki').isVisible()) return;
  await page.getByTestId('mvd-view-menu').click();
  await page.getByTestId('mvd-toggle-bottom').click();
  await expect(page.getByTestId('mvd-bottom-tab-wyniki')).toBeVisible();
}

async function ustawMotyw(page: Page, docelowy: 'dark_scada' | 'light_technical'): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    const biezacy = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    if (biezacy === docelowy) return;
    await przelaczMotyw(page);
    await page.waitForTimeout(300);
  }
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.getAttribute('data-theme')), { timeout: 10000 })
    .toBe(docelowy);
}

/** Kadr kamery schematu: poziom szczegółu sceny i skala (jednostki rysunku na piksel ekranu). */
async function kadr(kanwa: Locator): Promise<{ lod: string | null; skala: number }> {
  const lod = await kanwa.getAttribute('data-scene-lod');
  const skala = await kanwa.evaluate((svg) => {
    const vb = (svg as SVGSVGElement).viewBox.baseVal;
    const szerokosc = svg.getBoundingClientRect().width;
    return szerokosc > 0 ? vb.width / szerokosc : Number.NaN;
  });
  return { lod, skala };
}

/** Indeks kolumny tabeli wyników po kluczu nagłówka (`mvd-wyn-th-<klucz>`). */
async function indeksKolumny(tabela: Locator, klucz: string): Promise<number> {
  const naglowki = await tabela.locator('thead th').evaluateAll((th) => th.map((el) => el.getAttribute('data-testid')));
  const indeks = naglowki.indexOf(`mvd-wyn-th-${klucz}`);
  expect(indeks, `kolumna ${klucz} w tabeli wyników`).toBeGreaterThanOrEqual(0);
  return indeks;
}

async function zrzut(page: Page, nazwa: string): Promise<void> {
  for (const [w, h] of [
    [1440, 900],
    [1920, 1080],
  ] as const) {
    for (const motyw of [
      { klucz: 'ciemny', theme: 'dark_scada' as const },
      { klucz: 'jasny', theme: 'light_technical' as const },
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await ustawMotyw(page, motyw.theme);
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(KATALOG_ZRZUTOW, `${nazwa}-${w}x${h}-${motyw.klucz}.png`) });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test('UI-02 — panel dolny: stan przed biegiem, wyniki → zaznaczenie z zachowanym kadrem → dowód biegu, nieaktualność', async ({
  page,
  request,
}) => {
  test.setTimeout(600000);
  mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  const { seed, enm } = await siecGotowa(request);
  const refStacji = (enm.substations ?? []).find((s) => s.name === NAZWA_STACJI)?.ref_id;
  expect(refStacji, 'stacja w modelu').toBeTruthy();

  // ── Stan przed biegiem: obie zakładki uczciwie puste, bez liczników. ──
  await otworzAplikacje(page, seed);
  await otworzPanelDolny(page);
  await page.getByTestId('mvd-bottom-tab-wyniki').click();
  await expect(page.getByTestId('mvd-wyniki-brak')).toBeVisible();
  await expect(page.getByTestId('mvd-bottom-licznik-wyniki')).toHaveCount(0);
  await page.getByTestId('mvd-bottom-tab-dowody').click();
  await expect(page.getByTestId('mvd-dowody-brak')).toBeVisible();
  await expect(page.getByTestId('mvd-bottom-licznik-dowody')).toHaveCount(0);

  // ── Rozpływ i zwarcia policzone do DONE (rozpływ starszy, zwarcia najnowsze). ──
  const runRozplywu = await bieg(request, seed.caseId, 'LOAD_FLOW');
  const runZwarc = await bieg(request, seed.caseId, 'SC_3F');
  await przeladuj(page);
  await wlaczSzczegolyAudytowe(page);

  // ── Otwórz sieć → wybierz stację na schemacie → przybliż kółkiem nad stacją. ──
  const kanwa = page.getByTestId('sld-canvas-v3');
  const uchwyt = page.locator(`[data-hit-role="obrys"][data-hit-owner-ref^="${refStacji}#name-row"]`).first();
  await expect(uchwyt).toHaveCount(1, { timeout: 30000 });
  for (let i = 0; i < 12; i += 1) {
    if ((await kanwa.getAttribute('data-scene-lod')) !== '0') break;
    const box = await uchwyt.boundingBox();
    if (!box) break;
    await page.mouse.move(box.x + box.width / 2, box.y - 6 * box.height);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(400);
  await uchwyt.click();
  // Inspektor = prawy panel powłoki (`mvd-inspector`): przy zaznaczeniu pokazuje widok
  // inżynierski / okno wskazanego elementu.
  const inspektor = page.getByTestId('mvd-inspector');
  await expect(inspektor).toContainText(NAZWA_STACJI);
  const kadrPrzed = await kadr(kanwa);
  expect(Number.isFinite(kadrPrzed.skala)).toBe(true);

  // ── Wyniki w panelu dolnym: schemat widoczny, selekcja i kadr zachowane. ──
  await otworzPanelDolny(page);
  await page.getByTestId('mvd-bottom-tab-wyniki').click();
  const tabela = page.getByTestId('mvd-wyniki-tabela');
  await expect(tabela).toBeVisible({ timeout: 30000 });
  await expect(kanwa).toBeVisible();
  await expect(inspektor).toContainText(NAZWA_STACJI);
  const kadrPanelu = await kadr(kanwa);
  expect(kadrPanelu.lod, 'poziom szczegółu po otwarciu panelu').toBe(kadrPrzed.lod);
  expect(kadrPanelu.skala, 'skala kamery po otwarciu panelu').toBeLessThanOrEqual(kadrPrzed.skala * 1.05);

  // Domyślnie najnowszy bieg (zwarcia); licznik = liczba wierszy wyniku.
  await expect(page.getByTestId('mvd-wyniki-bieg')).toHaveValue(runZwarc);
  await expect(page.getByTestId('mvd-wyniki-nieaktualne')).toHaveCount(0);
  const wiersze = tabela.getByTestId('mvd-wyn-wiersz');
  const liczbaWierszy = await wiersze.count();
  expect(liczbaWierszy).toBeGreaterThan(0);
  await expect(page.getByTestId('mvd-bottom-licznik-wyniki')).toHaveText(String(liczbaWierszy));
  await expect(page.getByTestId('mvd-wyniki-liczba')).toHaveText(`${liczbaWierszy} z ${liczbaWierszy} elementów`);
  await zrzut(page, 'wyniki-zwarcia');

  // Wybór biegu rozpływu: inne wielkości, ten sam układ.
  await page.getByTestId('mvd-wyniki-bieg').selectOption(runRozplywu);
  await expect(tabela.getByTestId('mvd-wyn-th-m:U_kV')).toBeVisible({ timeout: 30000 });
  // Szeroka tabela rozpływu przewija się w panelu, nie rozpycha strony (pasek projektu
  // i nawigacja zostają w kadrze); rodzaje elementów wyłącznie po polsku.
  const przepelnienie = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(przepelnienie, 'poziome przepełnienie strony').toBeLessThanOrEqual(0);
  await expect(page.getByTestId('mvd-view-menu')).toBeInViewport();
  const kolRodzaj = await indeksKolumny(tabela, 'rodzaj');
  const rodzaje = await tabela.locator(`tbody tr td:nth-child(${kolRodzaj + 1})`).allInnerTexts();
  expect(rodzaje.length).toBeGreaterThan(0);
  for (const rodzaj of rodzaje) expect(rodzaj, 'rodzaj elementu po polsku').not.toMatch(/[A-Z][a-z]+ [A-Z][a-z]+|Element$/);
  await zrzut(page, 'wyniki-rozplyw');

  // ── Klik wiersza zaznacza element: wiersz i inspektor wskazują tę samą referencję. ──
  const kolElement = await indeksKolumny(tabela, 'element');
  const kolRef = await indeksKolumny(tabela, 'ref');
  const wiersz = wiersze.first();
  const nazwaWiersza = (await wiersz.locator('td').nth(kolElement).innerText()).trim();
  const refWiersza = (await wiersz.locator('td').nth(kolRef).innerText()).trim();
  expect(refWiersza.length).toBeGreaterThan(0);
  await wiersz.click();
  // Ta sama referencja: wyróżnienie wiersza wynika z porównania `selectedElement.id` (jedno
  // zaznaczenie powłoki) z kolumną identyfikatora wiersza, a inspektor pokazuje ten element.
  await expect(wiersz).toHaveAttribute('aria-selected', 'true');
  await expect(tabela.locator('tr[aria-selected="true"]')).toHaveCount(1);
  await expect(inspektor).toContainText(nazwaWiersza);
  await expect(kanwa).toBeVisible();
  const kadrPoKliku = await kadr(kanwa);
  expect(kadrPoKliku.lod, 'poziom szczegółu po kliku wiersza').toBe(kadrPrzed.lod);
  expect(kadrPoKliku.skala, 'skala kamery po kliku wiersza (bez skoku do całej sieci)').toBeLessThanOrEqual(
    kadrPrzed.skala * 1.05,
  );

  // Filtr tekstowy zawęża do zaznaczonego elementu.
  await page.getByTestId('mvd-wyniki-filtr-tekst').fill(nazwaWiersza);
  await expect(page.getByTestId('mvd-wyniki-liczba')).toContainText(`z ${await page.getByTestId('mvd-bottom-licznik-wyniki').innerText()} elementów`);
  await page.getByTestId('mvd-wyniki-filtr-tekst').fill('');

  // ── Dowody: oba biegi, polecenia z bramy serwera. ──
  await page.getByTestId('mvd-bottom-tab-dowody').click();
  await expect(page.getByTestId(`mvd-dowod-${runZwarc}`)).toBeVisible();
  await expect(page.getByTestId(`mvd-dowod-${runRozplywu}`)).toBeVisible();
  await expect(page.getByTestId('mvd-bottom-licznik-dowody')).toHaveText('2');
  for (const runId of [runZwarc, runRozplywu]) {
    await expect(page.getByTestId(`mvd-dowod-pakiet-${runId}`)).toBeEnabled({ timeout: 30000 });
    for (const format of ['pdf', 'latex', 'json']) {
      await expect(page.getByTestId(`mvd-dowod-eksport-${format}-${runId}`)).toBeEnabled({ timeout: 30000 });
    }
  }
  await zrzut(page, 'dowody');

  // Eksport JSON wywodu rozpływu — realne pobranie z serwera.
  const pobranie = page.waitForEvent('download');
  await page.getByTestId(`mvd-dowod-eksport-json-${runRozplywu}`).click();
  await pobranie;
  await expect(page.getByTestId(`mvd-dowod-wynik-${runRozplywu}`)).toContainText('Pobrano');

  // „Otwórz dowód" STARSZEGO biegu (rozpływ) → zakładka dowodu TEGO biegu, nie najnowszego.
  const sladRozplywu = page.waitForRequest((r) => r.url().includes(`/analysis-runs/${runRozplywu}/results/trace`));
  await page.getByTestId(`mvd-dowod-otworz-${runRozplywu}`).click();
  await sladRozplywu;
  await expect(page.getByTestId('mvd-wyniki-warsztat')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('mvd-wyniki-zakladka-dowod')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('mvd-dowod-naglowek')).toContainText('Rozpływ mocy', { timeout: 30000 });

  // ── Edycja modelu po biegu → wynik nieaktualny (baner + przygaszenie). ──
  const szyna = (enm.buses ?? [])[0]?.ref_id;
  expect(szyna).toBeTruthy();
  await operacja(request, seed.caseId, 'add_load_sn', { bus_ref: szyna, p_mw: 0.05, cos_phi: 0.95 });
  await przeladuj(page);
  await otworzPanelDolny(page);
  await page.getByTestId('mvd-bottom-tab-wyniki').click();
  await expect(page.getByTestId('mvd-wyniki-nieaktualne')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('mvd-wyniki-nieaktualne')).toContainText('nieaktualne');
  await expect(page.getByTestId('mvd-wyniki-tabela')).toHaveAttribute('data-nieaktualne', 'true');
  await zrzut(page, 'wyniki-nieaktualne');
});
