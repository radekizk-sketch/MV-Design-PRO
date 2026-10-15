/**
 * Karta OBIEKT-KABEL-NN — kabel nN jako obiekt projektowy na ŻYWEJ aplikacji i REALNYM
 * backendzie, kliki natywne.
 *
 * Sieć budują operacje domenowe (ten sam tor zapisu co kreatory): GPZ → magistrala SN →
 * stacja SN/nN (TR, układ TN-C-S) → RGnN → kabel K1 → rozdzielnica R1 → wyłącznik MCB →
 * złącze → kabel K2 → odbiór. Rysowanie odpływów nN z kanwy prowadzi osobna karta
 * („strona nN"), więc budowa idzie przez API, a CAŁA ścieżka obiektu kabla — przez UI:
 *  1. drzewo układu: K2 w sekcji „Odcinki nN" (nie w magistralach SN), klik zaznacza;
 *  2. inspektor: „Kabel nN", karta techniczna nN bez akcji ciągu SN, sekcja obliczeń;
 *  3. brak biegów → „Uruchom rozpływ" i „Uruchom zwarcia" z sekcji → osiem sprawdzeń;
 *  4. „Dobierz przekrój" → tabela wariantów → „Wybierz" → skutek zmiany (typ i Iz′);
 *  5. „Zmień typ katalogowy" otwiera katalog kabli nN;
 * zrzuty w obu motywach (werdykt wizualny należy do właściciela).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { BACKEND_BASE, operacja, stanAplikacji, type SiecEtykietyStacji } from './etykietaStacjiSiec';

const ZRZUTY = process.env.KABEL_NN_ZRZUTY ?? path.resolve('test-results', 'obiekt-kabel-nn');
const WERSJA = '2024.1';

interface SiecKabla extends SiecEtykietyStacji {
  readonly kabelK2: string;
}

async function zbudujSiec(request: APIRequestContext, motyw: string): Promise<SiecKabla> {
  const projectName = `E2E kabel nN ${motyw}`;
  const caseName = `Kabel nN ${motyw}`;
  const projekt = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: { name: projectName, description: 'Karta OBIEKT-KABEL-NN', mode: 'TO-BE', voltage_level_kv: 15.0, frequency_hz: 50.0 },
  });
  expect(projekt.ok()).toBeTruthy();
  const projectId = ((await projekt.json()) as { id: string }).id;
  const przypadek = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: projectId, name: caseName, description: '', config: {}, set_active: true },
  });
  expect(przypadek.ok()).toBeTruthy();
  const caseId = ((await przypadek.json()) as { id: string }).id;

  await operacja(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0, sk3_mva: 250.0, rx_ratio: 0.1, catalog_binding: { catalog_namespace: 'ZRODLO_SN', catalog_item_id: 'src-gpz-15kv-250mva-rx010', catalog_item_version: WERSJA },
    hv_voltage_kv: 110.0, transformer_sn_mva: 25.0,
  });
  let w = await operacja(request, caseId, 'continue_trunk_segment_sn', {
    segment: { rodzaj: 'KABEL', dlugosc_m: 300, name: 'Magistrala SN 1', catalog_binding: { catalog_namespace: 'KABEL_SN', catalog_item_id: 'cable-tfk-yakxs-3x120', catalog_item_version: WERSJA } },
  });
  const odcinek = w.snapshot?.corridors?.[0]?.ordered_segment_refs?.[0];
  expect(odcinek).toBeTruthy();
  w = await operacja(request, caseId, 'insert_station_on_segment_sn', {
    segment_ref: odcinek, field_apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a', station_type: 'B',
    insert_at: { value: 0.5 }, station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4, name: 'Stacja Topolowa' },
    sn_fields: ['IN', 'OUT', 'FEEDER'], transformer: { create: true, catalog_binding: { catalog_namespace: 'TRAFO_SN_NN', catalog_item_id: 'tr-sn-nn-15-04-630kva-dyn11', catalog_item_version: WERSJA } },
    nn_earthing: { lv_system: 'TN-C-S' },
  });
  type Snap = { substations: { ref_id: string; name: string; bus_refs: string[] }[]; buses: { ref_id: string; voltage_kv: number }[]; branches: { ref_id: string; name: string; to_bus_ref: string }[] };
  let snap = w.snapshot as unknown as Snap;
  const stacja = snap.substations.find((s) => s.name === 'Stacja Topolowa')!;
  const rgnn = snap.buses.find((b) => stacja.bus_refs.includes(b.ref_id) && b.voltage_kv === 0.4)!.ref_id;
  w = await operacja(request, caseId, 'add_nn_distribution_board', {
    voltage_kv: 0.4, name: 'R1', supply: { from_bus_ref: rgnn, length_m: 40.0, catalog_binding: { catalog_namespace: 'KABEL_NN', catalog_item_id: 'kab_nn_4x120_al', catalog_item_version: WERSJA }, name: 'K1' },
  });
  snap = w.snapshot as unknown as Snap;
  const r1 = snap.substations.find((s) => s.name === 'R1')!;
  w = await operacja(request, caseId, 'add_nn_distribution_board', { voltage_kv: 0.4, name: 'Złącze K2' });
  snap = w.snapshot as unknown as Snap;
  const zlacze = snap.substations.find((s) => s.name === 'Złącze K2')!;
  await operacja(request, caseId, 'add_nn_switch_device', {
    from_bus_ref: r1.bus_refs[0], to_bus_ref: zlacze.bus_refs[0], device_class: 'switch',
    catalog_binding: { catalog_namespace: 'APARAT_NN_MCB', catalog_item_id: 'mcb_nn_c25a', catalog_item_version: WERSJA },
    name: 'Wyłącznik K2 (MCB C25)',
  });
  w = await operacja(request, caseId, 'add_nn_cable_segment', {
    from_bus_ref: zlacze.bus_refs[0], length_m: 60.0, catalog_binding: { catalog_namespace: 'KABEL_NN', catalog_item_id: 'kab_nn_yaky_4x16_al', catalog_item_version: WERSJA }, name: 'K2',
  });
  snap = w.snapshot as unknown as Snap;
  const k2 = snap.branches.find((b) => b.name === 'K2')!;
  w = await operacja(request, caseId, 'add_nn_outgoing_field', {
    station_ref: zlacze.ref_id, bus_nn_ref: k2.to_bus_ref, field_name: 'Odpływ K2 - Odbiór', catalog_binding: { catalog_namespace: 'APARAT_NN', catalog_item_id: 'cb_nn_630a', catalog_item_version: WERSJA },
  });
  const pole = (w as unknown as { changes: { created_element_ids: string[] } }).changes.created_element_ids[0];
  await operacja(request, caseId, 'add_nn_load', {
    feeder_ref: pole, active_power_kw: 12.0, cos_phi: 0.95, load_name: 'Odbiór K2', catalog_binding: { catalog_namespace: 'OBCIAZENIE', catalog_item_id: 'load_uslugi_30kw', catalog_item_version: WERSJA },
  });
  return { projectId, projectName, caseId, caseName, stacje: {}, kabelK2: k2.ref_id };
}

async function otworz(page: Page, siec: SiecKabla, motyw: 'light' | 'dark'): Promise<void> {
  await page.addInitScript((wpisy) => {
    for (const [klucz, wartosc] of Object.entries(wpisy)) localStorage.setItem(klucz, wartosc);
  }, stanAplikacji(siec, motyw));
  await page.setViewportSize({ width: 1700, height: 1000 });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await page.getByRole('button', { name: 'Schemat (SLD)' }).first().click();
  await expect(page.getByTestId('project-tree')).toBeVisible({ timeout: 30000 });
}

for (const motyw of ['light', 'dark'] as const) {
  test(`kabel nN: drzewo → inspektor → obliczenia → dobór przekroju → skutek (motyw ${motyw})`, async ({ page, request }) => {
    test.setTimeout(420000);
    fs.mkdirSync(ZRZUTY, { recursive: true });
    const siec = await zbudujSiec(request, motyw);
    await otworz(page, siec, motyw);

    // (1) Drzewo: K2 w „Odcinki nN", nie w magistralach SN.
    const drzewo = page.getByTestId('project-tree');
    await expect(drzewo.getByTestId('model-tree-section-odcinki-nn').getByTestId(`model-tree-row-${siec.kabelK2}`)).toBeVisible();
    await expect(drzewo.getByTestId('model-tree-section-magistrale-i-odcinki-sn').getByTestId(`model-tree-row-${siec.kabelK2}`)).toHaveCount(0);
    await drzewo.getByTestId('model-tree-section-odcinki-nn').getByTestId(`model-tree-row-${siec.kabelK2}`).click();

    // (2) Inspektor: tożsamość nN, bez akcji ciągu SN.
    await expect(page.getByTestId('sld-segment-inspector-title')).toHaveText('Kabel nN', { timeout: 30000 });
    await expect(page.getByTestId('tech-card-host')).toHaveAttribute('data-tech-card-subject-kind', 'kabel_nn');
    await expect(page.getByText('Kontynuuj ciąg SN')).toHaveCount(0);
    await expect(page.getByText('Wstaw stację na odcinku')).toHaveCount(0);
    const sekcja = page.getByTestId('mvd-kabel-nn');
    await expect(sekcja).toBeVisible({ timeout: 60000 });
    await expect(sekcja.getByTestId('mvd-kabel-nn-aparat')).toContainText('Wyłącznik K2');

    // (3) Biegi z sekcji (ten sam tor co „Oblicz").
    await expect(sekcja.getByTestId('mvd-kabel-nn-brak-biegow')).toBeVisible();
    await sekcja.getByTestId('mvd-kabel-nn-uruchom-LOAD_FLOW').click();
    await expect(sekcja.getByTestId('mvd-kabel-nn-uruchom-LOAD_FLOW')).toHaveCount(0, { timeout: 120000 });
    await sekcja.getByTestId('mvd-kabel-nn-uruchom-SC_3F').click();
    await expect(sekcja.getByTestId('mvd-kabel-nn-brak-biegow')).toHaveCount(0, { timeout: 120000 });
    await expect(sekcja.getByTestId('mvd-kabel-nn-kryteria').locator('[data-kryterium]')).toHaveCount(8);
    await expect(sekcja.getByTestId('mvd-kabel-nn-wielkosc-ib')).not.toContainText('nie obliczono');
    await expect(sekcja.locator('[data-testid="math-fallback"]')).toHaveCount(0);
    await sekcja.getByTestId('mvd-kabel-nn-kryterium-kabel-nn-obciazalnosc-szczegoly').click();
    await expect(sekcja.getByTestId('mvd-kabel-nn-kryterium-kabel-nn-obciazalnosc-szczegol')).toBeVisible();
    await sekcja.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(ZRZUTY, `kabel_nn_obliczenia_${motyw}.png`) });

    // (4) Dobór przekroju i wybór wariantu.
    const typPrzed = await sekcja.getByTestId('mvd-kabel-nn-typ').textContent();
    await sekcja.getByTestId('mvd-kabel-nn-dobierz').click();
    const tabela = sekcja.getByTestId('mvd-kabel-nn-warianty');
    await expect(tabela).toBeVisible({ timeout: 120000 });
    await tabela.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(ZRZUTY, `kabel_nn_warianty_${motyw}.png`) });
    const rekomendowany = tabela.locator('[data-wariant][data-rekomendowany="true"]');
    const kandydat = (await rekomendowany.count()) > 0 && (await rekomendowany.getAttribute('data-biezacy')) !== 'true'
      ? rekomendowany
      : tabela.locator('[data-wariant]:not([data-biezacy="true"])').last();
    await kandydat.getByRole('button', { name: 'Wybierz' }).click();
    const skutek = sekcja.getByTestId('mvd-kabel-nn-skutek');
    await expect(skutek).toBeVisible({ timeout: 120000 });
    await expect(skutek.getByTestId('mvd-kabel-nn-skutek-typ')).toContainText(`${typPrzed} →`);
    await expect(sekcja.getByTestId('mvd-kabel-nn-typ')).not.toHaveText(typPrzed ?? '');
    await skutek.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(ZRZUTY, `kabel_nn_skutek_${motyw}.png`) });

    // (5) Katalog kabli nN przy „Zmień typ katalogowy".
    await page.getByTestId('sld-segment-open-catalog-picker').click();
    await expect(page.getByText('Kable nN').first()).toBeVisible({ timeout: 30000 });
    await page.screenshot({ path: path.join(ZRZUTY, `kabel_nn_katalog_${motyw}.png`) });
  });
}
