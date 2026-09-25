/**
 * Karta ARCHIWUM PROJEKTU (#134) — porównanie dwóch paczek projektu na REALNYM backendzie.
 *
 * Do tej karty router porównania archiwów nie był zamontowany: projektant nie miał
 * żadnej drogi, żeby zobaczyć, co zmieniło się między dwiema wersjami projektu.
 * Sprawdzana ścieżka użytkownika, w całości realna:
 *   1. projekt i sieć budowane operacjami domenowymi API (źródło GPZ), eksport paczki A;
 *      sieć rozbudowana o dwa odcinki magistrali, eksport paczki B — oba pliki z
 *      REALNEJ końcówki eksportu (`POST /api/projects/{id}/export`);
 *   2. okno „Archiwum projektu (ZIP)" otwarte kaflem przestrzeni „Projekt", oba pliki
 *      wskazane w polach wyboru pliku, klik „Porównaj paczki" → wynik z
 *      `POST /api/archives/diff`: część „Model sieci" z dodanymi odcinkami PO NAZWACH
 *      nadanych w operacjach (nie po identyfikatorach);
 *   3. uszkodzona paczka → zdanie backendu z nazwanym plikiem („Archiwum A: …").
 *
 * Zrzuty dowodowe (oba motywy, motyw przełączany REALNYM przyciskiem powłoki):
 * `docs/audit/visual/dowody/dowod_archiwum-porownanie_<light|dark>.png`.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   PLAYWRIGHT_REAL_BACKEND=1 npx playwright test e2e/archiwum-porownanie-wersji.spec.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const OUTPUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../docs/audit/visual/dowody',
);

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CATALOG_VERSION = '2024.1';
const ODCINKI = ['Odcinek magistrali M1-1', 'Odcinek magistrali M1-2'] as const;

let opCounter = 0;

function katalogBinding(namespace: string, itemId: string) {
  return { catalog_namespace: namespace, catalog_item_id: itemId, catalog_item_version: CATALOG_VERSION };
}

async function operacja(
  request: APIRequestContext,
  caseId: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const response = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: {
        name,
        idempotency_key: `k134-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as { error?: string | null };
  expect(body.error ?? null).toBeNull();
}

async function eksport(request: APIRequestContext, projectId: string): Promise<Buffer> {
  const response = await request.post(`${BACKEND_BASE}/api/projects/${projectId}/export`);
  expect(response.ok(), await response.text()).toBeTruthy();
  expect(response.headers()['content-type']).toBe('application/zip');
  return response.body();
}

/** Dwie paczki tego samego projektu: przed i po rozbudowie magistrali. */
async function dwiePaczki(request: APIRequestContext): Promise<{ przed: Buffer; po: Buffer }> {
  const suffix = Date.now().toString(36);
  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: `Archiwum porównanie ${suffix}`,
      description: 'Karta #134',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
  });
  expect(projectResponse.ok()).toBeTruthy();
  const project = (await projectResponse.json()) as { id: string };
  const caseResponse = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: project.id, name: 'Przypadek bazowy', description: '', config: {}, set_active: true },
  });
  expect(caseResponse.ok()).toBeTruthy();
  const studyCase = (await caseResponse.json()) as { id: string };

  await operacja(request, studyCase.id, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: katalogBinding('ZRODLO_SN', SOURCE_ID),
    hv_voltage_kv: 110.0,
    transformer_sn_mva: 25.0,
  });
  const przed = await eksport(request, project.id);
  for (const [idx, nazwa] of ODCINKI.entries()) {
    await operacja(request, studyCase.id, 'continue_trunk_segment_sn', {
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: 300 + 50 * idx,
        name: nazwa,
        catalog_binding: katalogBinding('KABEL_SN', CABLE_ID),
      },
    });
  }
  const po = await eksport(request, project.id);
  return { przed, po };
}

/** Okno archiwum przez REALNY kafel przestrzeni „Projekt" (bez otwartego projektu). */
async function otworzOknoArchiwum(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 60000 });
  await page.getByTestId('mvd-projekty-droga-archiwum').click();
  await expect(page.getByTestId('mvd-archiwum-projektu')).toBeVisible({ timeout: 15000 });
}

async function ustawMotyw(page: Page, docelowy: 'dark_scada' | 'light_technical'): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    const biezacy = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    if (biezacy === docelowy) return;
    await page.getByTestId('mvd-theme-toggle').click();
    await page.waitForTimeout(300);
  }
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.getAttribute('data-theme')), {
      timeout: 10000,
    })
    .toBe(docelowy);
}

test('porównanie dwóch paczek projektu — wynik po nazwach elementów i nazwany błąd pliku', async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const { przed, po } = await dwiePaczki(request);
  const bledyKonsoli: string[] = [];
  page.on('pageerror', (err) => bledyKonsoli.push(String(err)));

  await otworzOknoArchiwum(page);

  // Ścieżka błędu najpierw: uszkodzona paczka A → zdanie backendu z nazwanym plikiem.
  await page.getByTestId('mvd-arch-por-plik-a').setInputFiles({
    name: 'uszkodzona.mvdp.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('to nie jest archiwum ZIP'),
  });
  await page.getByTestId('mvd-arch-por-plik-b').setInputFiles({
    name: 'po.mvdp.zip',
    mimeType: 'application/zip',
    buffer: po,
  });
  const [odpowiedzBledu] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/archives/diff')),
    page.getByTestId('mvd-arch-por-pliki').click(),
  ]);
  expect(odpowiedzBledu.status()).toBe(422);
  await expect(page.getByTestId('mvd-arch-por-blad')).toHaveText(
    'Archiwum A: Nieprawidłowy format archiwum ZIP',
  );

  // Ścieżka poprawna: paczka przed i po rozbudowie magistrali.
  await page.getByTestId('mvd-arch-por-plik-a').setInputFiles({
    name: 'przed.mvdp.zip',
    mimeType: 'application/zip',
    buffer: przed,
  });
  const [odpowiedz] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/archives/diff')),
    page.getByTestId('mvd-arch-por-pliki').click(),
  ]);
  expect(odpowiedz.status()).toBe(200);
  const wynikApi = (await odpowiedz.json()) as {
    overall_status: string;
    section_diffs: Array<{
      section_name: string;
      element_diffs: Array<{ element_id: string; element_name: string | null; status: string }>;
    }>;
  };
  expect(wynikApi.overall_status).toBe('MODIFIED');
  const siecApi = wynikApi.section_diffs.find((s) => s.section_name === 'enm');
  expect(siecApi, 'porównanie musi rozbić zmienioną część „Model sieci"').toBeTruthy();
  const dodaneNazwy = siecApi!.element_diffs
    .filter((e) => e.status === 'ADDED')
    .map((e) => e.element_name);
  for (const nazwa of ODCINKI) expect(dodaneNazwy).toContain(nazwa);

  const wynik = page.getByTestId('mvd-arch-por-wynik');
  await expect(wynik).toBeVisible();
  await expect(page.getByTestId('mvd-arch-por-blad')).toHaveCount(0);
  const siec = page.getByTestId('mvd-arch-por-sekcja-enm');
  await expect(siec.getByRole('heading', { name: 'Model sieci' })).toBeVisible();
  for (const nazwa of ODCINKI) await expect(siec.getByText(nazwa, { exact: true })).toBeVisible();
  // Identyfikatory elementów z nazwą nie trafiają na ekran — ani jako podpis
  // elementu, ani WEWNĄTRZ wartości pola-odwołania (kolejność odcinków magistrali,
  // odcinki ciągu linii): stąd `toContainText` na całej części, nie dokładny tekst
  // (ten przepuszczał `seg/…` zaszyte w liście odwołań).
  for (const element of siecApi!.element_diffs.filter((e) => e.element_name)) {
    await expect(siec).not.toContainText(element.element_id);
  }
  const kolejnosc = siec
    .locator('tr')
    .filter({ has: page.getByRole('rowheader', { name: 'Kolejność odcinków magistrali' }) });
  for (const nazwa of ODCINKI) await expect(kolejnosc).toContainText(nazwa);

  // Kontrakt prezentacji V12.7 §0.3 + wartości złożone po polsku (odbiór karty):
  // pierwszy plan wyniku bez surowego JSON-a i bez metadanych produkcyjnych
  // (odciski paczek i modelu, sygnatura, rewizja) — w trybie podstawowym sekcji
  // informacji audytowych nie ma wcale.
  const trescWyniku = (await wynik.textContent()) ?? '';
  expect(trescWyniku).not.toMatch(/[{}"]/);
  const odciskiApi = (await odpowiedz.json()) as {
    archive_hash_a: string;
    archive_hash_b: string;
    deterministic_signature: string;
  };
  for (const odcisk of [
    odciskiApi.archive_hash_a,
    odciskiApi.archive_hash_b,
    odciskiApi.deterministic_signature,
  ]) {
    expect(trescWyniku).not.toContain(odcisk.slice(0, 16));
  }
  await expect(siec.getByRole('rowheader', { name: 'Odcisk SHA-256' })).toHaveCount(0);
  await expect(siec.getByRole('rowheader', { name: 'Rewizja' })).toHaveCount(0);
  await expect(page.getByTestId('mvd-arch-por-audyt')).toHaveCount(0);

  // Tryb ekspercki (natywny klik przełącznika powłoki) → zwinięte informacje
  // audytowe; po rozwinięciu — odciski obu paczek i zmiany metadanych nagłówka.
  await page
    .getByRole('group', { name: /tryb/i })
    .getByRole('button', { name: 'Ekspercki' })
    .click();
  const audyt = page.getByTestId('mvd-arch-por-audyt');
  await expect(audyt).toBeVisible();
  await expect(page.getByTestId('mvd-arch-por-audyt-lista')).toHaveCount(0);
  await page.getByTestId('mvd-arch-por-audyt-przelacz').click();
  const listaAudytu = page.getByTestId('mvd-arch-por-audyt-lista');
  await expect(listaAudytu).toContainText(odciskiApi.archive_hash_a);
  await expect(listaAudytu).toContainText(odciskiApi.archive_hash_b);
  await expect(listaAudytu).toContainText('Nagłówek modelu sieci');

  for (const [motyw, przyrostek] of [
    ['light_technical', 'light'],
    ['dark_scada', 'dark'],
  ] as const) {
    await ustawMotyw(page, motyw);
    await audyt.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(OUTPUT_DIR, `dowod_archiwum-porownanie_${przyrostek}.png`),
      fullPage: true,
    });
  }
  expect(bledyKonsoli, bledyKonsoli.join(' | ')).toEqual([]);
});
