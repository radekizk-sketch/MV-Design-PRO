/**
 * KARTA GEOMETRIA-STACJI (K3) — schemat = rzeczywista elektryka stacji i pól, z ŻYWEJ
 * aplikacji na REALNYM backendzie (materiał oceny wizualnej właściciela, bramka B-02; spec NIE
 * wystawia werdyktu wizualnego).
 *
 * Sieć: ziarno `siecKadrowStacji.ts` (stacja odgałęźna, sekcyjna typu D, końcowa, końcowa
 * odgałęzienia) uzupełnione w tym speku o stację przelotową wciętą w Odcinek 2 (pola IN, OUT) —
 * po jednej stacji każdego rodzaju z topologii. Ziarna nie rozbudowujemy (edytuje je też karta
 * kadrowania), stąd własna, jedna operacja dopisująca stację przelotową.
 *
 * Asercje DOM (rysunek WYRENDEROWANY, nie scena w pamięci):
 *  - tożsamość: zbiór odcinków szyn SN każdej stacji (`[data-owner-ref$="#sn-bus"]`) = zbiór
 *    szyn SN stacji w ENM; stacja sekcyjna ma DWA odcinki i sprzęgło z gałęzi `bus_coupler`;
 *  - aparat pola z rekordu modelu (`data-apparatus-source="dane"`, `data-device-ref` = gałąź
 *    łączeniowa pola), pole wolne stacji końcowej z sylwetką rezerwy;
 *  - obrys zaznaczenia po NATYWNYM kliku w aparat pola w barwie zaznaczenia (nie roli);
 *  - otwarcie sprzęgła istniejącą operacją `set_normal_open_point` (operacji łączeniowych nie
 *    dopisujemy — zakres W5-C) → rysunek sprzęgła otwarty → nowy bieg rozpływu mocy. Przed
 *    otwarciem szyna sekcji B ma wynik napięcia; po otwarciu sekcja B wraz z ciągiem za nią
 *    jest wyspą bez zasilania i backend ODMAWIA biegu blokadą walidatora E003 z tą szyną
 *    w `element_refs` (stan dzisiejszy: wyspa bez zasilania blokuje każdą analizę; wynik
 *    „sekcja bez napięcia" zamiast odmowy należy do stanów łączeniowych karty W5-C).
 *
 * Zrzuty: `katalogZrzutow` (domyślnie `test-results/zrzuty-dokumentacji/…`), pięć stacji × dwa
 * motywy + sprzęgło otwarte × dwa motywy.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { wykonajBiegDoKonca } from './biegi';
import { katalogZrzutow } from './katalogZrzutow';
import { BACKEND_BASE, kable, otworzAplikacje, siecKadrow, ustawMotyw } from './siecKadrowStacji';

const HERE = dirname(fileURLToPath(import.meta.url));
const KATALOG_ZRZUTOW = katalogZrzutow(resolve(HERE, '..', '..', 'docs', 'sld', 'audyt-2026-10', 'geometria-stacji'));

const WERSJA_KATALOGU = '2024.1';
const APARAT = 'sw-cb-abb-vd4-17kv-630a';
const TRAFO = 'tr-sn-nn-15-04-630kva-dyn11';

type Szyna = { ref_id: string; voltage_kv?: number };
type Stacja = { ref_id: string; name?: string; bus_refs?: string[] };
type Galaz = { ref_id: string; name?: string; type?: string; from_bus_ref?: string; to_bus_ref?: string; status?: string };
type Pole = { ref_id: string; substation_ref?: string | null; bay_role?: string; bus_ref?: string; equipment_refs?: string[] };
type Model = { buses?: Szyna[]; substations?: Stacja[]; branches?: Galaz[]; bays?: Pole[] };

const STACJE_PIECIU_RODZAJOW: readonly { readonly nazwa: string; readonly plik: string; readonly sekcje: number }[] = [
  { nazwa: 'Stacja Przelotowa', plik: 'przelotowa', sekcje: 1 },
  { nazwa: 'Stacja Odgałęźna', plik: 'odgalezna', sekcje: 1 },
  { nazwa: 'Stacja Sekcyjna', plik: 'sekcyjna', sekcje: 2 },
  { nazwa: 'Stacja Końcowa', plik: 'koncowa', sekcje: 1 },
  { nazwa: 'Stacja Końcowa odgałęzienia', plik: 'koncowa-odgalezienia', sekcje: 1 },
];

let licznik = 0;
async function operacjaDomenowa(
  request: APIRequestContext,
  caseId: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<Model> {
  const odpowiedz = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: { name, idempotency_key: `k3-geometria-${caseId}-${String(++licznik).padStart(4, '0')}`, payload },
    },
  });
  expect(odpowiedz.ok(), await odpowiedz.text()).toBeTruthy();
  const body = (await odpowiedz.json()) as { error?: string | null; snapshot?: Model };
  expect(body.error ?? null).toBeNull();
  return body.snapshot ?? {};
}

const stacja = (model: Model, nazwa: string): Stacja => {
  const wynik = (model.substations ?? []).find((s) => s.name === nazwa);
  expect(wynik, `stacja ${nazwa} w modelu`).toBeTruthy();
  return wynik!;
};

const szynySn = (model: Model, st: Stacja): string[] => {
  const napiecie = new Map((model.buses ?? []).map((b) => [b.ref_id, b.voltage_kv ?? 0]));
  return (st.bus_refs ?? []).filter((ref) => (napiecie.get(ref) ?? 0) > 1).sort();
};

const sprzegloStacji = (model: Model, st: Stacja): Galaz => {
  const szyny = new Set(st.bus_refs ?? []);
  const wynik = (model.branches ?? []).find(
    (g) => g.type === 'bus_coupler' && szyny.has(g.from_bus_ref ?? '') && szyny.has(g.to_bus_ref ?? ''),
  );
  expect(wynik, `sprzęgło ${st.name}`).toBeTruthy();
  return wynik!;
};

/** viewBox kanwy ustalony: dwa kolejne odczyty w odstępie 300 ms równe (kamera nie animuje). */
async function kadrUstalony(page: Page): Promise<void> {
  const kanwa = page.locator('svg[data-testid="sld-canvas-v3"]');
  let poprzedni = await kanwa.getAttribute('viewBox');
  for (let i = 0; i < 20; i += 1) {
    await page.waitForTimeout(300);
    const biezacy = await kanwa.getAttribute('viewBox');
    if (biezacy === poprzedni) return;
    poprzedni = biezacy;
  }
}

async function kadrStacji(page: Page, st: Stacja): Promise<void> {
  // K2b (widok roboczy): po otwarciu schematu kamera stoi w widoku roboczym, nie w kadrze
  // całej sieci, więc podpis stacji może leżeć poza ekranem. Droga użytkownika jak w specu
  // K2: Shift+F — kadr całej sieci (bez mini-ścieżki), potem dwuklik podpisu stacji.
  await page.keyboard.press('Shift+F');
  await expect(page.getByTestId('sld-v3-sciezka-kadru')).toHaveCount(0);
  await kadrUstalony(page);
  const uchwyt = page.locator(`[data-hit-role="obrys"][data-hit-owner-ref^="${st.ref_id}#name-row"]`).first();
  await expect(uchwyt).toHaveCount(1, { timeout: 30000 });
  await uchwyt.dblclick();
  await expect(page.getByTestId('sld-v3-sciezka-1')).toHaveText(st.name ?? '', { timeout: 10000 });
  await expect(page.getByTestId('sld-canvas-v3')).not.toHaveAttribute('data-scene-lod', '0');
  await page.waitForTimeout(400);
}

/** Napięcie szyny z wyniku rozpływu (results/v1, nakładka elementów) — `null`, gdy wynik nie
 *  niesie wartości (szyna bez zasilania). */
/** Odmowa utworzenia biegu rozpływu (409) — treść odpowiedzi backendu. */
async function odmowaBieguRozplywu(request: APIRequestContext, caseId: string): Promise<string> {
  const utworz = await request.post(`${BACKEND_BASE}/api/execution/study-cases/${caseId}/runs`, {
    data: { analysis_type: 'LOAD_FLOW' },
    timeout: 60000,
  });
  expect(utworz.status(), 'bieg rozpływu przy wyspie bez zasilania').toBe(409);
  return utworz.text();
}

async function biegRozplywu(request: APIRequestContext, caseId: string): Promise<Record<string, Record<string, unknown>>> {
  const utworz = await request.post(`${BACKEND_BASE}/api/execution/study-cases/${caseId}/runs`, {
    data: { analysis_type: 'LOAD_FLOW' },
    timeout: 60000,
  });
  expect(utworz.ok(), await utworz.text()).toBeTruthy();
  const runId = ((await utworz.json()) as { id: string }).id;
  await wykonajBiegDoKonca(request, BACKEND_BASE, runId);
  const wynik = await request.get(`${BACKEND_BASE}/api/execution/runs/${runId}/results/v1`);
  expect(wynik.ok()).toBeTruthy();
  return ((await wynik.json()) as { overlay_payload: { elements: Record<string, Record<string, unknown>> } }).overlay_payload
    .elements;
}

test('GEOMETRIA-STACJI — stacje pięciu rodzajów z topologii, sekcje i sprzęgło z modelu (oba motywy)', async ({
  page,
  request,
}) => {
  test.setTimeout(900000);
  mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  const seed = await siecKadrow(request);
  const odcinek2 = kable(seed.enm).find((b) => b.name === 'Odcinek 2');
  expect(odcinek2, 'Odcinek 2 w ziarnie').toBeTruthy();
  let model = await operacjaDomenowa(request, seed.caseId, 'insert_station_on_segment_sn', {
    segment_ref: odcinek2!.ref_id,
    field_apparatus_catalog_ref: APARAT,
    insert_at: { value: 0.5 },
    transformer: {
      create: true,
      catalog_binding: { catalog_namespace: 'TRAFO_SN_NN', catalog_item_id: TRAFO, catalog_item_version: WERSJA_KATALOGU },
    },
    station_type: 'B',
    station: { name: 'Stacja Przelotowa', sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    sn_fields: ['IN', 'OUT'],
  });

  await otworzAplikacje(page, seed);
  const kanwa = page.getByTestId('sld-canvas-v3');

  for (const motyw of [
    { klucz: 'ciemny', theme: 'dark_scada' as const, zaznaczenie: '#35C7FF' },
    { klucz: 'jasny', theme: 'light_technical' as const, zaznaczenie: '#0066CC' },
  ]) {
    await ustawMotyw(page, motyw.theme);
    for (const opis of STACJE_PIECIU_RODZAJOW) {
      const st = stacja(model, opis.nazwa);
      await kadrStacji(page, st);
      // Tożsamość: odcinki szyn SN rysunku = szyny SN stacji w ENM (bez nadmiaru i braku).
      const szyny = szynySn(model, st);
      expect(szyny, `${opis.nazwa}: liczba sekcji w ENM`).toHaveLength(opis.sekcje);
      for (const szyna of szyny) {
        await expect(kanwa.locator(`path[data-owner-ref="${szyna}#sn-bus"]`), `${opis.nazwa}: odcinek ${szyna}`).toHaveCount(1);
      }
      // Aparat pola z rekordu modelu: każde pole SN (poza sprzęgłem) rysuje aparat z danych.
      const pola = (model.bays ?? []).filter(
        (b) => b.substation_ref === st.ref_id && szyny.includes(b.bus_ref ?? '') && b.bay_role !== 'COUPLER',
      );
      for (const pole of pola) {
        const aparat = kanwa.locator(`g[data-owner-ref="${pole.ref_id}"][data-apparatus-source="dane"][data-device-ref]`).first();
        await expect(aparat, `${opis.nazwa}: aparat pola ${pole.ref_id}`).toBeAttached();
        expect(pole.equipment_refs ?? []).toContain(await aparat.getAttribute('data-device-ref'));
      }
      if (opis.sekcje === 2) {
        const sprzeglo = sprzegloStacji(model, st);
        await expect(kanwa.locator(`g[data-owner-ref="${sprzeglo.ref_id}"] [data-switch-state="closed"]`)).toHaveCount(1);
      }
      await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `geometria-stacji-${opis.plik}-${motyw.klucz}.png`) });
    }

    // Pole wolne stacji końcowej: sylwetka rezerwy, bez głowicy kablowej.
    const koncowa = stacja(model, 'Stacja Końcowa');
    await kadrStacji(page, koncowa);
    const wolne = (model.bays ?? []).find((b) => b.substation_ref === koncowa.ref_id && b.bay_role === 'OUT');
    await expect(kanwa.locator(`g[data-owner-ref="${wolne!.ref_id}"][data-bay-reserve="wolne"]`).first()).toBeAttached();

    // Obrys zaznaczenia po NATYWNYM kliku w aparat pola wejściowego stacji sekcyjnej.
    const sekcyjna = stacja(model, 'Stacja Sekcyjna');
    await kadrStacji(page, sekcyjna);
    const poleWe = (model.bays ?? []).find((b) => b.substation_ref === sekcyjna.ref_id && b.bay_role === 'IN')!;
    const aparat = kanwa.locator(`g[data-owner-ref="${poleWe.ref_id}"][data-device-ref]`).first();
    const ramka = (await aparat.boundingBox())!;
    await page.mouse.click(ramka.x + ramka.width / 2, ramka.y + ramka.height / 2);
    const obrys = kanwa.locator('[data-testid="sld-v3-zaznaczenie"] rect').first();
    await expect(obrys).toBeAttached({ timeout: 10000 });
    await expect(obrys).toHaveAttribute('stroke', motyw.zaznaczenie);
    await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `geometria-stacji-zaznaczenie-${motyw.klucz}.png`) });
    await page.keyboard.press('Escape');
  }

  // Sprzęgło stacji sekcyjnej: bieg rozpływu przy zamkniętym, otwarcie istniejącą operacją
  // domenową, rysunek otwarty, nowy bieg — napięcie szyny sekcji B przed i po.
  const sekcyjna = stacja(model, 'Stacja Sekcyjna');
  const sprzeglo = sprzegloStacji(model, sekcyjna);
  const sekcjaB = sprzeglo.to_bus_ref!;
  // Rozpływ wymaga odbioru albo generacji w modelu (`enm/validator.py`, dostępność
  // `load_flow`); ziarno kadrów stacji ich nie ma (karta: w ziarnie wolno zmienić wyłącznie
  // nazwy i dane wyposażenia). Odbiór na szynie sekcji B dokłada istniejąca operacja
  // domenowa `add_load_sn` — ta sama, której używa kreator odbioru.
  model = await operacjaDomenowa(request, seed.caseId, 'add_load_sn', { bus_ref: sekcjaB, p_mw: 0.4, q_mvar: 0.1 });
  const przed = await biegRozplywu(request, seed.caseId);
  model = await operacjaDomenowa(request, seed.caseId, 'set_normal_open_point', { switch_ref: sprzeglo.ref_id });
  expect((model.branches ?? []).find((g) => g.ref_id === sprzeglo.ref_id)?.status).toBe('open');
  expect(przed[sekcjaB], 'wynik szyny sekcji B przy zamkniętym sprzęgle').toBeTruthy();
  const odmowa = await odmowaBieguRozplywu(request, seed.caseId);
  const walidacja = await request.get(`${BACKEND_BASE}/api/cases/${seed.caseId}/enm/validate`, { timeout: 30000 });
  expect(walidacja.ok()).toBeTruthy();
  const wyspy = ((await walidacja.json()) as { issues: { code: string; element_refs: string[] }[] }).issues.filter(
    (p) => p.code === 'E003',
  );
  expect(
    wyspy.some((p) => p.element_refs.includes(sekcjaB)),
    'po otwarciu sprzęgła szyna sekcji B należy do wyspy bez zasilania (E003)',
  ).toBe(true);
  test.info().annotations.push({
    type: 'sekcja B przed i po otwarciu sprzęgła',
    description: `przed otwarciem: ${JSON.stringify(przed[sekcjaB])}; po otwarciu: odmowa biegu ${odmowa}`,
  });

  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 60000 });
  await expect(kanwa).toBeVisible({ timeout: 60000 });
  for (const motyw of [
    { klucz: 'ciemny', theme: 'dark_scada' as const },
    { klucz: 'jasny', theme: 'light_technical' as const },
  ]) {
    await ustawMotyw(page, motyw.theme);
    await kadrStacji(page, sekcyjna);
    await expect(kanwa.locator(`g[data-owner-ref="${sprzeglo.ref_id}"] [data-switch-state="open"]`)).toHaveCount(1, {
      timeout: 30000,
    });
    await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `geometria-stacji-sekcyjna-sprzeglo-otwarte-${motyw.klucz}.png`) });
  }
});
