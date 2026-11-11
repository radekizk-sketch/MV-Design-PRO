/**
 * Sekwencja pierwszego użycia (E1a + K4-E2, karta K4; real backend).
 *
 * INTENCJA (KOLEJNOSC_KROKOW_E1_E8_2026-07-29 §P1–P3, §E2.7):
 * 1. Świeży użytkownik (czysty persist) ląduje w przestrzeni „Projekt" na
 *    ekranie „Nowy / otwórz projekt" (W-102) — start od CELU pracy. Klik celu
 *    tworzy REALNIE projekt (POST /api/projects) i pierwszy przypadek
 *    (POST /api/study-cases, set_active) — bez przypadku pulpit i obliczenia
 *    są martwe. Dokąd dalej: pulpit projektu (KafelPrzylaczenia), a z niego
 *    przestrzeń „Schemat" z CTA „Wstaw GPZ" (dalszą budowę sieci pokrywa
 *    critical-run-flow — tu jej NIE dublujemy).
 * 2. Przy modelu z GPZ przejście E2→E3 jest w chromie: pozycja „Gotowość"
 *    paska stanu (jedyne miejsce gotowości w chromie po karcie K1 POWLOKA,
 *    która skasowała baner „Następny krok" nad kanwą jako powtórzenie
 *    gotowości) — jeden klik prowadzi do przestrzeni „Gotowość"
 *    (PanelGotowosci; werdykt należy do panelu, nie do chromu).
 *
 * Wzorzec seedu GPZ: e2e/sld-gpz-rendered.spec.ts (realne API domain-ops).
 */

import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CATALOG_VERSION = '2024.1';

async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="app-ready"]', {
    state: 'attached',
    timeout: 30_000,
  });
}

test('pierwsze użycie: cel → realny projekt + przypadek → pulpit → Schemat z CTA „Wstaw GPZ" (E1a)', async ({ page }) => {
  test.setTimeout(180_000);

  // Czysty kontekst — zero persist (świeży użytkownik, pusta powłoka).
  await page.addInitScript(() => {
    localStorage.clear();
  });

  await page.goto('/', { waitUntil: 'commit' });
  await waitForAppReady(page);

  // Przestrzeń „Projekt" (domyślna) pokazuje ekran „Nowy / otwórz projekt":
  // sekcja celu widoczna (W-102: start od celu).
  await expect(
    page.getByRole('heading', { name: 'Nowy projekt / otwórz projekt' }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Co projektujesz?')).toBeVisible();

  // Klik celu → REALNE API: POST /api/projects + POST /api/study-cases.
  const odpowiedzProjektu = page.waitForResponse(
    (r) => r.url().includes('/api/projects') && r.request().method() === 'POST',
    { timeout: 30_000 },
  );
  const odpowiedzPrzypadku = page.waitForResponse(
    (r) => r.url().includes('/api/study-cases') && r.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await page.getByRole('button', { name: /Nowa sieć SN/ }).click();
  expect((await odpowiedzProjektu).ok()).toBeTruthy();
  expect((await odpowiedzPrzypadku).ok()).toBeTruthy();

  // Dokąd dalej: pulpit projektu — kontekst aktywny (pasek przypadku z nazwą
  // projektu i wariantu) + KafelPrzylaczenia obecny (pierwsze ogniwo E1).
  await expect(page.getByTestId('active-case-bar')).toContainText('Nowa sieć SN', {
    timeout: 20_000,
  });
  await expect(page.getByTestId('active-case-bar')).toContainText('Wariant bazowy');
  await expect(page.getByText('Pulpit projektu')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('pulpit-osd-warunki')).toBeVisible({ timeout: 30_000 });

  // Przejście do Schematu → pusta kanwa z CTA „Wstaw GPZ" (krok P3).
  // Dalszej budowy sieci NIE wykonujemy — pokrywa ją critical-run-flow.
  await page.getByRole('button', { name: /^Schemat \(SLD\) \d$/ }).click();
  await expect(page.getByTestId('sld-empty-state')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('sld-empty-state-insert-gpz')).toBeVisible();
});

/** Projekt + przypadek + GPZ przez realne API (wzorzec sld-gpz-rendered). */
async function createProjectCaseWithGpz(
  request: APIRequestContext,
): Promise<{ projectId: string; projectName: string; caseId: string; caseName: string }> {
  const suffix = String(Date.now() % 100000);
  const projectName = `E2E pierwsze użycie ${suffix}`;
  const caseName = `Przypadek pierwsze użycie ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Jawne przejście Schemat → Gotowość (spec pierwsze-uzycie)',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
  });
  expect(projectResponse.ok()).toBeTruthy();
  const project = (await projectResponse.json()) as { id: string };

  const caseResponse = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: {
      project_id: project.id,
      name: caseName,
      description: '',
      config: {},
      set_active: true,
    },
  });
  expect(caseResponse.ok()).toBeTruthy();
  const studyCase = (await caseResponse.json()) as { id: string };

  const opResponse = await request.post(
    `${BACKEND_BASE}/api/cases/${studyCase.id}/enm/domain-ops`,
    {
      data: {
        project_id: '',
        snapshot_base_hash: '',
        operation: {
          name: 'add_grid_source_sn',
          idempotency_key: `e2e-pierwsze-uzycie-gpz-${suffix}`,
          payload: {
            voltage_kv: 15.0,
            sk3_mva: 250.0,
            rx_ratio: 0.1,
            catalog_binding: {
              catalog_namespace: 'ZRODLO_SN',
              catalog_item_id: SOURCE_ID,
              catalog_item_version: CATALOG_VERSION,
            },
          },
        },
      },
    },
  );
  expect(opResponse.ok()).toBeTruthy();
  const op = (await opResponse.json()) as { error?: string | null };
  expect(op.error ?? null).toBeNull();

  return { projectId: project.id, projectName, caseId: studyCase.id, caseName };
}

test('model z GPZ: Schemat → pozycja „Gotowość" paska stanu → klik → Gotowość (K4-E2)', async ({ page, request }) => {
  test.setTimeout(180_000);

  const seed = await createProjectCaseWithGpz(request);

  // Persist powłoki z PRAWDZIWYMI identyfikatorami (klucz i kształt 1:1
  // z zustand persist `mv-design-app-state` — wzorzec sld-gpz-rendered).
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

  await page.goto('/', { waitUntil: 'commit' });
  await waitForAppReady(page);

  // REALNA droga projektanta: jawny wybór przestrzeni „Schemat (SLD)"
  // (ustawia trasę '#sld' — dokładnie scenariusz, w którym przejście musi
  // wyczyścić trasę nadrzędną, aby PanelGotowosci mógł się wyrenderować).
  await page.getByRole('button', { name: /^Schemat \(SLD\) \d$/ }).click();

  // Model NIEPUSTY (GPZ w migawce) ⇒ gotowość ODCZYTANA z serwera w pasku stanu
  // (czekamy na nią NAJPIERW, potem uczciwie sprawdzamy brak stanu pustego kanwy).
  const gotowosc = page.getByTestId('mvd-status-gotowosc');
  await expect(gotowosc).toHaveAttribute('data-ustalona', 'true', { timeout: 30_000 });
  await expect(page.getByTestId('sld-empty-state')).toHaveCount(0);
  // Baner „Następny krok" nad kanwą nie istnieje (powtórzenie gotowości).
  await expect(page.getByTestId('mvd-schemat-nastepny')).toHaveCount(0);

  // Jeden klik → przestrzeń „Gotowość" (werdykt należy do PanelGotowosci).
  await gotowosc.click();
  await expect(page.getByTestId('mvd-gotowosc-panel')).toBeVisible({ timeout: 30_000 });
});
