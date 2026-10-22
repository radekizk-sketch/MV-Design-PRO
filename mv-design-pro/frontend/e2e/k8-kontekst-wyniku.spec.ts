/**
 * KARTA K8 KONTEKST-WYNIKU — jeden kontekst biegu na REALNYM backendzie.
 *
 * Odbiór właściciela: sekwencja biegów A (rozpływ), B (zwarcie 3F), zmiana modelu (długość
 * kabla), C (rozpływ). Kontekst biegu przełączany z trzech miejsc — panelu dolnego, ekranu
 * pełnego wyników i paska stanu — a pasek stanu, schemat (znacznik pochodzenia nakładki),
 * tabela panelu, inspektor, ekran pełny i „Dowody" pokazują po każdym przełączeniu TEN SAM
 * identyfikator biegu (`data-run-id`) i tę samą świeżość (`data-swiezosc`) z jednego
 * predykatu: A i B policzone przed zmianą modelu są nieaktualne, C — aktualny.
 *
 * Synchronizacja dwukierunkowa: wiersz ekranu pełnego zaznacza element na schemacie (i
 * przełącza kontekst na bieg ekranu, gdy schemat pokazywał inny — jawnie, nie po cichu),
 * a zaznaczenie na schemacie wyróżnia wiersz panelu dolnego.
 *
 * Interakcje natywne (klik, wybór z listy). Sieć i biegi przez API — spec bada kontekst
 * wyniku, nie budowę sieci. Zrzuty obu motywów przez `katalogZrzutow` (bez
 * `ZRZUTY_DO_DOKUMENTACJI=1` trafiają do `test-results/`). Spec NIE wystawia werdyktu
 * wizualnego (B-02).
 */
import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { wykonajBiegDoKonca } from './biegi';
import { katalogZrzutow, KORZEN_REPO } from './katalogZrzutow';
import { otworzZakladkeWynikow } from './nawigacjaWynikow';
import { przelaczMotyw, wlaczSzczegolyAudytowe } from './powloka';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const WERSJA_KATALOGU = '2024.1';
const APARAT = 'sw-cb-abb-vd4-17kv-630a';
const KABEL = 'cable-tfk-yakxs-3x120';
const TRAFO = 'tr-sn-nn-15-04-630kva-dyn11';
const ZRODLO = 'src-gpz-15kv-250mva-rx010';
const NAZWA_STACJI = 'Stacja K8';
const KATALOG_ZRZUTOW = katalogZrzutow(
  path.join(KORZEN_REPO, 'mv-design-pro', 'docs', 'uiux', 'zrzuty', 'k8-kontekst-wyniku'),
);

type Enm = {
  substations?: Array<{ ref_id: string; name?: string }>;
  branches?: Array<{ ref_id: string; name?: string; type?: string }>;
  buses?: Array<{ ref_id: string }>;
  corridors?: Array<{ ordered_segment_refs?: string[] }>;
};
type Seed = { projectId: string; projectName: string; caseId: string; caseName: string };
type Swiezosc = 'aktualny' | 'nieaktualny';

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
      operation: { name, idempotency_key: `k8-${Date.now()}-${String(++licznik).padStart(4, '0')}`, payload },
    },
  });
  expect(odpowiedz.ok(), await odpowiedz.text()).toBeTruthy();
  const body = (await odpowiedz.json()) as { error?: string | null; snapshot?: Enm };
  expect(body.error ?? null).toBeNull();
  return body.snapshot ?? {};
}

/** Projekt + przypadek + sieć gotowa do obliczeń: GPZ, trzy odcinki kablowe, odbiór, stacja SN/nN. */
async function siecGotowa(request: APIRequestContext): Promise<{ seed: Seed; enm: Enm }> {
  const suffix = Date.now().toString(36);
  const projectName = `Kontekst wyniku ${suffix}`;
  const caseName = `Biegi A B C ${suffix}`;
  const projekt = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: { name: projectName, description: 'Kontekst wyniku — jeden bieg wszędzie', mode: 'TO-BE', voltage_level_kv: 15.0, frequency_hz: 50.0 },
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

async function przejdzDoSchematu(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Schemat \(SLD\) \d$/ }).click();
  await expect(page.getByTestId('sld-canvas-v3')).toBeVisible({ timeout: 60000 });
}

async function przejdzDoWynikow(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Wyniki i dowody \d$/ }).click();
  await expect(page.getByTestId('mvd-wyniki-warsztat')).toBeVisible({ timeout: 60000 });
}

async function otworzPanelDolny(page: Page): Promise<void> {
  if (await page.getByTestId('mvd-bottom-tab-wyniki').isVisible()) return;
  await page.getByTestId('mvd-view-menu').click();
  await page.getByTestId('mvd-toggle-bottom').click();
  await expect(page.getByTestId('mvd-bottom-tab-wyniki')).toBeVisible();
}

/** Prawy dok (inspektor) otwarty — przełącznik „Widok" ma stan `aria-checked`. */
async function otworzInspektor(page: Page): Promise<void> {
  await page.getByTestId('mvd-view-menu').click();
  const przelacznik = page.getByTestId('mvd-toggle-right');
  if ((await przelacznik.getAttribute('aria-checked')) === 'true') {
    await page.keyboard.press('Escape');
    return;
  }
  await przelacznik.click();
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

async function zrzut(page: Page, nazwa: string): Promise<void> {
  for (const motyw of [
    { klucz: 'ciemny', theme: 'dark_scada' as const },
    { klucz: 'jasny', theme: 'light_technical' as const },
  ]) {
    await ustawMotyw(page, motyw.theme);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(KATALOG_ZRZUTOW, `${nazwa}-1440x900-${motyw.klucz}.png`) });
  }
}

/** Pasek stanu: bieg rodziny i jego świeżość. */
async function oczekujPaska(page: Page, rodzina: string, runId: string, swiezosc: Swiezosc): Promise<void> {
  const wpis = page.getByTestId(`mvd-status-rodzina-${rodzina}`);
  await expect(wpis, `pasek stanu: bieg rodziny ${rodzina}`).toHaveAttribute('data-run-id', runId, { timeout: 30000 });
  await expect(wpis, `pasek stanu: świeżość rodziny ${rodzina}`).toHaveAttribute('data-swiezosc', swiezosc);
}

/**
 * Bieg OGLĄDANY w przestrzeni „Schemat": pasek (rodzina oglądana), znacznik pochodzenia
 * nakładki schematu, tabela panelu dolnego i lista „Dowodów" — ten sam identyfikator
 * i ta sama świeżość.
 */
async function oczekujOgladanegoNaSchemacie(
  page: Page,
  rodzina: string,
  runId: string,
  swiezosc: Swiezosc,
): Promise<void> {
  await oczekujPaska(page, rodzina, runId, swiezosc);
  await expect(page.getByTestId(`mvd-status-rodzina-${rodzina}`)).toHaveAttribute('data-ogladana', 'true');
  const znacznik = page.getByTestId('sld-v3-overlay-provenance');
  await expect(znacznik, 'schemat: bieg nakładki').toHaveAttribute('data-run-id', runId, { timeout: 30000 });
  await expect(znacznik, 'schemat: świeżość nakładki').toHaveAttribute('data-swiezosc', swiezosc);

  await otworzPanelDolny(page);
  await page.getByTestId('mvd-bottom-tab-wyniki').click();
  const panel = page.getByTestId('mvd-wyniki');
  await expect(panel, 'panel dolny: bieg tabeli').toHaveAttribute('data-run-id', runId, { timeout: 30000 });
  await expect(panel, 'panel dolny: świeżość').toHaveAttribute('data-swiezosc', swiezosc);
  await expect(page.getByTestId('mvd-wyniki-bieg')).toHaveValue(runId);
  await expect(page.getByTestId('mvd-wyniki-nieaktualne')).toHaveCount(swiezosc === 'nieaktualny' ? 1 : 0);

  await page.getByTestId('mvd-bottom-tab-dowody').click();
  await expect(page.getByTestId('mvd-dowody'), '„Dowody": bieg oglądany').toHaveAttribute('data-run-id', runId);
  await expect(page.getByTestId(`mvd-dowod-${runId}`)).toHaveAttribute('data-ogladany', 'true');
  await expect(page.getByTestId(`mvd-dowod-${runId}`)).toHaveAttribute('data-swiezosc', swiezosc);
  await expect(page.locator('[data-testid^="mvd-dowod-"][data-ogladany="true"]')).toHaveCount(1);
  await page.getByTestId('mvd-bottom-tab-wyniki').click();
}

test('K8 — jeden kontekst biegu: A, B, zmiana modelu, C; przełączanie z panelu, ekranu pełnego i paska stanu', async ({
  page,
  request,
}) => {
  test.setTimeout(600000);
  mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  const { seed, enm } = await siecGotowa(request);

  // ── Sekwencja biegów: A (rozpływ), B (zwarcie), zmiana długości kabla, C (rozpływ). ──
  const runA = await bieg(request, seed.caseId, 'LOAD_FLOW');
  const runB = await bieg(request, seed.caseId, 'SC_3F');
  const kabel = (enm.branches ?? []).find((b) => b.type === 'cable')?.ref_id
    ?? enm.corridors?.[0]?.ordered_segment_refs?.[0];
  expect(kabel, 'odcinek kablowy do zmiany długości').toBeTruthy();
  await operacja(request, seed.caseId, 'update_element_parameters', {
    element_ref: kabel,
    parameters: { length_km: 0.45, parameter_source: 'CATALOG' },
  });
  const runC = await bieg(request, seed.caseId, 'LOAD_FLOW');
  expect(new Set([runA, runB, runC]).size).toBe(3);

  await otworzAplikacje(page, seed);

  // ── Start: bez wyboru oglądany jest NAJNOWSZY bieg (C, aktualny); zwarcie = B, nieaktualne. ──
  await oczekujOgladanegoNaSchemacie(page, 'rozplyw', runC, 'aktualny');
  await oczekujPaska(page, 'zwarcie', runB, 'nieaktualny');
  await expect(page.getByTestId('mvd-status-rodzina-zwarcie')).toHaveAttribute('data-ogladana', 'false');

  // ── Przełączenie 1: panel dolny → A. Wszędzie A i „nieaktualny" (model zmieniony po A). ──
  await page.getByTestId('mvd-wyniki-bieg').selectOption(runA);
  await oczekujOgladanegoNaSchemacie(page, 'rozplyw', runA, 'nieaktualny');
  await oczekujPaska(page, 'zwarcie', runB, 'nieaktualny');
  await zrzut(page, 'panel-bieg-A-nieaktualny');

  // ── Przełączenie 2: pasek stanu → rodzina „Zwarcia" (B). Rozpływ zostaje przy A. ──
  await page.getByTestId('mvd-status-rodzina-zwarcie-pokaz').click();
  await oczekujOgladanegoNaSchemacie(page, 'zwarcie', runB, 'nieaktualny');
  await oczekujPaska(page, 'rozplyw', runA, 'nieaktualny');
  await expect(page.getByTestId('mvd-status-rodzina-rozplyw')).toHaveAttribute('data-ogladana', 'false');

  // Pasek stanu → lista biegów rozpływu → C: rodzina rozpływu oglądana z biegiem C.
  await page.getByTestId('mvd-status-rodzina-rozplyw-bieg').selectOption(runC);
  await oczekujOgladanegoNaSchemacie(page, 'rozplyw', runC, 'aktualny');
  // Powrót do A tą samą drogą — przygotowanie przełączenia z ekranu pełnego.
  await page.getByTestId('mvd-status-rodzina-rozplyw-bieg').selectOption(runA);
  await oczekujOgladanegoNaSchemacie(page, 'rozplyw', runA, 'nieaktualny');
  await page.getByTestId('mvd-status-rodzina-zwarcie-pokaz').click();
  await oczekujOgladanegoNaSchemacie(page, 'zwarcie', runB, 'nieaktualny');

  // ── Przełączenie 3: ekran pełny „Rozpływ". Pokazuje aktywny bieg rodziny (A) i JAWNIE
  //    mówi, że schemat pokazuje inny bieg (B) — nigdy po cichu. ──
  await przejdzDoWynikow(page);
  await otworzZakladkeWynikow(page, 'rozplyw');
  const pas = page.getByTestId('mvd-wyniki-kontekst');
  await expect(pas).toHaveAttribute('data-rodzina', 'rozplyw');
  await expect(pas).toHaveAttribute('data-run-id', runA, { timeout: 30000 });
  await expect(pas).toHaveAttribute('data-zgodny-ze-schematem', 'false');
  await expect(page.getByTestId('mvd-wyniki-kontekst-roznica')).toBeVisible();
  await expect(page.getByTestId('mvd-wyniki-kontekst-rodzina')).toHaveAttribute('data-swiezosc', 'nieaktualny');
  await zrzut(page, 'ekran-rozplyw-inny-bieg-na-schemacie');

  // Wybór C na ekranie pełnym: kontekst rozpływu = C, schemat przełącza się na rozpływ.
  await page.getByTestId('mvd-wyniki-kontekst-rodzina-bieg').selectOption(runC);
  await expect(pas).toHaveAttribute('data-run-id', runC, { timeout: 30000 });
  await expect(pas).toHaveAttribute('data-zgodny-ze-schematem', 'true');
  await expect(page.getByTestId('mvd-wyniki-kontekst-roznica')).toHaveCount(0);
  await expect(page.getByTestId('mvd-wyniki-kontekst-rodzina')).toHaveAttribute('data-swiezosc', 'aktualny');
  await oczekujPaska(page, 'rozplyw', runC, 'aktualny');
  await expect(page.getByTestId('mvd-status-rodzina-rozplyw')).toHaveAttribute('data-ogladana', 'true');
  await oczekujPaska(page, 'zwarcie', runB, 'nieaktualny');

  // ── Wiersz ekranu pełnego zaznacza element na schemacie (kontekst zostaje przy C). ──
  // Najpierw schemat pokazuje zwarcie (B): klik wiersza ekranu rozpływu przełącza kontekst
  // na bieg ekranu (C) jawnie — zaznaczony element nie stoi pod wynikiem innego biegu.
  await page.getByTestId('mvd-status-rodzina-zwarcie-pokaz').click();
  await oczekujPaska(page, 'zwarcie', runB, 'nieaktualny');
  await expect(pas).toHaveAttribute('data-zgodny-ze-schematem', 'false');
  // Wiersz odcinka w podzakładce „Gałęzie" (element narysowany na schemacie na każdym
  // poziomie szczegółu). Wiersze szyn pomocniczych (zaciski końcowe odcinków) nie
  // zaznaczają niczego — nie ma ich na schemacie (test jednostkowy `tabelaSzyn.test.tsx`).
  await page.getByTestId('mvd-rozplyw-podzakladka-galezie').click();
  const wierszEkranu = page
    .getByTestId('mvd-wyniki-warsztat')
    .getByTestId('mvd-wyn-wiersz')
    .filter({ hasText: /Odcinek/ })
    .first();
  await expect(wierszEkranu).toBeVisible({ timeout: 30000 });
  await wierszEkranu.click();
  await expect(wierszEkranu).toHaveAttribute('aria-selected', 'true');
  await expect(pas).toHaveAttribute('data-zgodny-ze-schematem', 'true');
  await expect(page.getByTestId('mvd-status-rodzina-rozplyw')).toHaveAttribute('data-ogladana', 'true');
  await oczekujPaska(page, 'rozplyw', runC, 'aktualny');

  // Schemat: ta sama selekcja, nakładka C, inspektor pokazuje wyniki C (aktualne).
  await przejdzDoSchematu(page);
  await oczekujOgladanegoNaSchemacie(page, 'rozplyw', runC, 'aktualny');
  await otworzInspektor(page);
  const inspektorWyniki = page.getByTestId('inspektor-wyniki');
  await expect(inspektorWyniki, 'inspektor: sekcja „Wyniki" zaznaczonego elementu').toBeVisible({ timeout: 30000 });
  await expect(inspektorWyniki).toHaveAttribute('data-run-id', runC);
  await expect(inspektorWyniki).toHaveAttribute('data-swiezosc', 'aktualny');
  await zrzut(page, 'schemat-bieg-C-aktualny');

  // Panel → A: inspektor przechodzi na A i pokazuje „Nieaktualne".
  await page.getByTestId('mvd-wyniki-bieg').selectOption(runA);
  await expect(inspektorWyniki).toHaveAttribute('data-run-id', runA, { timeout: 30000 });
  await expect(inspektorWyniki).toHaveAttribute('data-swiezosc', 'nieaktualny');
  await expect(page.getByTestId('inspektor-wyniki-nieaktualne')).toBeVisible();
  await oczekujOgladanegoNaSchemacie(page, 'rozplyw', runA, 'nieaktualny');

  // ── Zaznaczenie na schemacie wyróżnia (i przewija do) wiersz panelu dolnego. ──
  // Kolumna „Identyfikator" panelu jest kolumną szczegółów audytowych (jak w `ui02-panel-dolny`).
  await wlaczSzczegolyAudytowe(page);
  const tabelaPanelu = page.getByTestId('mvd-wyniki-tabela');
  const wierszePanelu = tabelaPanelu.getByTestId('mvd-wyn-wiersz');
  await expect(wierszePanelu.first()).toBeVisible({ timeout: 30000 });
  const naglowki = await tabelaPanelu
    .locator('thead th')
    .evaluateAll((th) => th.map((el) => el.getAttribute('data-testid')));
  const kolRef = naglowki.indexOf('mvd-wyn-th-ref');
  expect(kolRef, 'kolumna identyfikatora w tabeli panelu').toBeGreaterThanOrEqual(0);
  const liczba = await wierszePanelu.count();
  let kliknietoNaSchemacie = false;
  for (let i = liczba - 1; i >= 0 && !kliknietoNaSchemacie; i -= 1) {
    const ref = (await wierszePanelu.nth(i).locator('td').nth(kolRef).innerText()).trim();
    if (!ref || (await wierszePanelu.nth(i).getAttribute('aria-selected')) === 'true') continue;
    // Pole trafienia elementu, które naprawdę przyjmuje klik (etykieta wyniku tego samego
    // elementu bywa narysowana nad środkiem toru) — próba klikiem `trial`, potem klik natywny.
    const kandydaci = page.locator(`[data-hit-role="obrys"][data-hit-owner-ref^="${ref}"]`);
    let obrys: Locator | null = null;
    for (let k = 0; k < (await kandydaci.count()) && !obrys; k += 1) {
      const kandydat = kandydaci.nth(k);
      if (!(await kandydat.isVisible())) continue;
      const przyjmuje = await kandydat
        .click({ trial: true, timeout: 2000 })
        .then(() => true)
        .catch(() => false);
      if (przyjmuje) obrys = kandydat;
    }
    if (obrys) {
      await obrys.click();
      const wyroznony = tabelaPanelu.locator('tr[aria-selected="true"]');
      await expect(wyroznony, 'wiersz panelu wyróżniony po zaznaczeniu na schemacie').toHaveCount(1);
      await expect(wyroznony.locator('td').nth(kolRef)).toHaveText(ref);
      await expect(wyroznony).toBeInViewport();
      kliknietoNaSchemacie = true;
    }
  }
  expect(kliknietoNaSchemacie, 'element z wiersza panelu widoczny na schemacie').toBe(true);
  await zrzut(page, 'schemat-zaznaczenie-wiersz-panelu');
});
