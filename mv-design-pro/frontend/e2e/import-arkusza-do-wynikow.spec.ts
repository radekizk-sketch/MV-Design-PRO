/*
 * W1 — projekt akceptacyjny klasy A (mapa domknięcia §9): arkusz operatora →
 * projekt z modelem sieci → bieg rozpływu → wyniki, na REALNYM backendzie.
 *
 * Droga użytkownika bez otwartego projektu: ekran „Nowy / otwórz projekt" →
 * „Import z arkusza (XLSX)" → wybór pliku → „Sprawdź zawartość" (liczby z modelu
 * zbudowanego w pamięci) → „Importuj do nowego projektu" → „Otwórz zaimportowany
 * projekt". Potem bieg rozpływu na przypadku utworzonym przez import i lądowisko
 * wyników. Model czytany przez TE SAME końcówki, którymi żyje reszta aplikacji
 * (`/api/cases/{case}/enm`), więc test dowodzi jednej prawdy sieci od pierwszego bajtu.
 *
 * Fikstura `fixtures/arkusz-siec-sn.xlsx` jest generowana z
 * `backend/tests/utils/generuj_arkusz_e2e.py` (ten sam skoroszyt, którym testują
 * importer, końcówki HTTP i wyrocznia pandapower).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type APIRequestContext } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const _dirname = path.dirname(fileURLToPath(import.meta.url));
const FIKSTURA = path.join(_dirname, 'fixtures', 'arkusz-siec-sn.xlsx');

async function waitForAnalysisRunIndex(
  request: APIRequestContext,
  runId: string,
  timeoutMs = 15000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 0;
  let lastBody = '';
  while (Date.now() < deadline) {
    const response = await request.get(`${BACKEND_BASE}/api/analysis-runs/${runId}/results/index`);
    lastStatus = response.status();
    if (response.ok()) return;
    lastBody = await response.text();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `Publiczny results/index nie jest gotowy dla runu ${runId}. status=${lastStatus} body=${lastBody}`,
  );
}

test('klasa A: arkusz operatora → model projektu → bieg rozpływu → wyniki (realny backend)', async ({
  page,
  request,
}) => {
  const nazwaProjektu = `Arkusz e2e ${Date.now()}`;

  // Sekwencja pierwszego użycia: żadnego projektu w kontekście aplikacji.
  await page.addInitScript(() => {
    localStorage.removeItem('mv-design-app-state');
  });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });

  // Krok 1: wejście do importu z ekranu „Nowy / otwórz projekt" (bez projektu
  // pulpit z kaflami nie istnieje — to jedyna droga do importu).
  await page.getByTestId('mvd-projekty-droga-arkusz').click();
  await expect(page.getByTestId('mvd-import-arkusza')).toBeVisible();

  // Krok 2: plik + nazwa projektu + podgląd (liczby z modelu zbudowanego w pamięci).
  await page.getByTestId('mvd-ark-plik').setInputFiles(FIKSTURA);
  await page.getByTestId('mvd-ark-nazwa').fill(nazwaProjektu);
  await page.getByTestId('mvd-ark-podglad-akcja').click();
  const liczby = page.getByTestId('mvd-ark-podglad-liczby');
  await expect(liczby).toBeVisible({ timeout: 30000 });
  const wiersze = liczby.locator('.mvd-ark-kv-v');
  await expect(wiersze).toHaveText(['3', '1', '1', '1', '2']);
  await expect(page.getByTestId('mvd-ark-typy-projektu')).toContainText('L1');
  await expect(page.getByTestId('mvd-ark-typy-projektu')).toContainText('T1');
  expect(await page.getByTestId('mvd-ark-zastrzezenia').count()).toBe(0);

  // Krok 3: import → raport z odciskiem modelu.
  await page.getByTestId('mvd-ark-import').click();
  const raport = page.getByTestId('mvd-ark-raport');
  await expect(raport).toBeVisible({ timeout: 30000 });
  await expect(raport).toHaveAttribute('data-wariant', 'ok');
  await expect(page.getByTestId('mvd-ark-raport-liczby').locator('.mvd-ark-kv-v')).toHaveText([
    '3',
    '1',
    '1',
    '1',
    '2',
  ]);
  const odcisk = (await page.getByTestId('mvd-ark-raport-odcisk').locator('.mvd-ark-kv-v').textContent()) ?? '';
  expect(odcisk).toMatch(/^[0-9a-f]{16}$/);

  // Krok 4: otwarcie zaimportowanego projektu ustawia kontekst aplikacji
  // (projekt + aktywny wariant bazowy utworzony przez import).
  await page.getByTestId('mvd-ark-otworz').click();
  await expect(page.getByTestId('mvd-import-arkusza')).toHaveCount(0);
  const lista = (await (await request.get(`${BACKEND_BASE}/api/projects`)).json()) as {
    projects: Array<{ id: string; name: string }>;
  };
  const projekt = lista.projects.find((p) => p.name === nazwaProjektu);
  expect(projekt).toBeTruthy();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const surowy = localStorage.getItem('mv-design-app-state');
        if (!surowy) return null;
        const stan = (JSON.parse(surowy) as { state?: { activeProjectId?: string | null; activeCaseId?: string | null } }).state;
        return stan?.activeProjectId && stan?.activeCaseId ? stan.activeProjectId : null;
      }),
    )
    .toBe(projekt!.id);

  // Krok 5: model projektu przez końcówkę, którą czyta cała aplikacja.
  const aktywnyResponse = await request.get(`${BACKEND_BASE}/api/study-cases/project/${projekt!.id}/active`);
  expect(aktywnyResponse.ok()).toBeTruthy();
  const aktywny = (await aktywnyResponse.json()) as { id: string; name: string };
  expect(aktywny.name).toBe('Wariant bazowy');
  const enmResponse = await request.get(`${BACKEND_BASE}/api/cases/${aktywny.id}/enm`);
  expect(enmResponse.ok()).toBeTruthy();
  const enm = (await enmResponse.json()) as {
    header: { hash_sha256: string };
    buses: Array<{ name: string }>;
    branches: Array<{ name: string; catalog_ref: string }>;
    transformers: Array<{ name: string; catalog_ref: string }>;
    katalog_projektu: { line_types: Array<{ id: string }>; transformer_types: Array<{ id: string }> };
  };
  expect(enm.header.hash_sha256.startsWith(odcisk)).toBe(true);
  expect(enm.buses.map((b) => b.name)).toEqual(['GPZ 15 kV', 'Stacja 1', 'Stacja 1 nN']);
  expect(enm.branches.map((b) => b.catalog_ref)).toEqual(['arkusz-linia-afl-6-120']);
  expect(enm.transformers.map((t) => t.catalog_ref)).toEqual(['arkusz-trafo-t1']);
  expect(enm.katalog_projektu.line_types.map((t) => t.id)).toEqual(['arkusz-linia-afl-6-120']);

  // Krok 6: bieg rozpływu na zaimportowanym modelu + lądowisko wyników.
  const createRunResponse = await request.post(
    `${BACKEND_BASE}/api/execution/study-cases/${aktywny.id}/runs`,
    { data: { analysis_type: 'LOAD_FLOW' } },
  );
  expect(createRunResponse.ok()).toBeTruthy();
  const { id: runId } = (await createRunResponse.json()) as { id: string };
  const executeResponse = await request.post(`${BACKEND_BASE}/api/execution/runs/${runId}/execute`);
  expect(executeResponse.ok()).toBeTruthy();
  const bieg = (await executeResponse.json()) as { status: string };
  expect(bieg.status).toBe('DONE');
  await waitForAnalysisRunIndex(request, runId);

  await page.goto(`/#analysis?run=${runId}`, { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await expect(page.getByTestId('mvd-wyniki-warsztat')).toBeVisible();

  // Krok 7: bieg niczego nie zmienił w modelu (odcisk bez zmian).
  const enmPoResponse = await request.get(`${BACKEND_BASE}/api/cases/${aktywny.id}/enm`);
  const enmPo = (await enmPoResponse.json()) as { header: { hash_sha256: string } };
  expect(enmPo.header.hash_sha256).toBe(enm.header.hash_sha256);
});
