/**
 * AKCJA NAPRAWCZA GOTOWOŚCI JEDNYM KLIKNIĘCIEM (karta C-12, decyzja K-12 opcja A).
 *
 * INTENCJA: projektant widzi problem gotowości i klika „Napraw…" — dostaje OD RAZU
 * formularz operacji domenowej, która problem usuwa, z fokusem na polu, którego
 * brakuje. Przed C-12 akcja tylko przełączała przestrzeń na „Schemat": projektant
 * sam szukał elementu i sam otwierał formularz (EF-046).
 *
 * SCENARIUSZ (klik NATYWNY, realny backend):
 * 1. sieć GPZ + dwa odcinki kablowe; źródło dostaje moc zwarciową minimalną
 *    WIĘKSZĄ od maksymalnej (S''kQmin > S''kQmax — błąd danych projektowych) →
 *    walidator zgłasza blokadę `sources.sk_min_exceeds_max`, kanon
 *    `source.sk_min_inconsistent` z nawigacją naprawczą na pole `sk3_min_mva`;
 * 2. przestrzeń „Gotowość" → wiersz problemu tego źródła → klik „Napraw…";
 * 3. powłoka jest w przestrzeni „Schemat (SLD)", a panel pokazuje formularz edycji
 *    parametrów TEGO źródła z kluczem `sk3_min_mva` i kursorem w polu wartości;
 * 4. wpis poprawnej wartości i zapis zdejmują blokadę.
 *
 * Zrzuty (oba motywy) trafiają do `docs/audit/visual/C-12/` z przedrostkiem
 * `C12_ZRZUT_PREFIKS` (domyślnie `po`; bieg na bazie przed kartą: `przed`).
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const KATALOG_ZRZUTOW = path.resolve(_dirname, '../../docs/audit/visual/C-12');
const PRZEDROSTEK_ZRZUTOW = process.env.C12_ZRZUT_PREFIKS ?? 'po';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CATALOG_VERSION = '2024.1';
let opCounter = 0;

type DomainOpResponse = {
  error?: string | null;
  snapshot?: {
    corridors?: Array<{ ordered_segment_refs?: string[] }>;
    sources?: Array<{ ref_id: string }>;
  };
  readiness?: {
    blockers?: Array<{ code: string; element_ref?: string | null; canonical_code?: string }>;
  };
};

function buildCatalogBinding(catalogNamespace: string, catalogItemId: string) {
  return {
    catalog_namespace: catalogNamespace,
    catalog_item_id: catalogItemId,
    catalog_item_version: CATALOG_VERSION,
  };
}

async function executeDomainOp(
  request: APIRequestContext,
  caseId: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<DomainOpResponse> {
  const response = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: {
        name,
        idempotency_key: `e2e-akcja-naprawcza-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function createProjectAndCase(request: APIRequestContext) {
  const projectName = 'E2E akcja naprawcza jednym kliknieciem';
  const caseName = 'Przypadek akcji naprawczej';
  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Karta C-12: akcja naprawcza gotowości jest wykonawcą',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
  });
  expect(projectResponse.ok()).toBeTruthy();
  const project = (await projectResponse.json()) as { id: string };
  const caseResponse = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: project.id, name: caseName, description: '', config: {}, set_active: true },
  });
  expect(caseResponse.ok()).toBeTruthy();
  const studyCase = (await caseResponse.json()) as { id: string };
  return { projectId: project.id, projectName, caseId: studyCase.id, caseName };
}

async function otworzPowlokeZKontekstem(
  page: Page,
  seed: { projectId: string; projectName: string; caseId: string; caseName: string },
): Promise<void> {
  await page.addInitScript((dane) => {
    localStorage.setItem(
      'mv-design-app-state',
      JSON.stringify({
        state: {
          activeProjectId: dane.projectId,
          activeProjectName: dane.projectName,
          activeCaseId: dane.caseId,
          activeCaseName: dane.caseName,
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
  await page.goto('/', { waitUntil: 'commit' });
  // 90 s: pierwsze wejście w biegu uruchamia zimny transform vite dev (budżet
  // rozruchu narzędzia, nie asercja produktu).
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
}

async function zrzutObuMotywow(page: Page, nazwa: string): Promise<void> {
  fs.mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  const plik = (motyw: string) =>
    path.join(KATALOG_ZRZUTOW, `${PRZEDROSTEK_ZRZUTOW}-${nazwa}-${motyw}.png`);
  await page.screenshot({ path: plik('dark') });
  await page.getByTestId('mvd-theme-toggle').click();
  await page.screenshot({ path: plik('light') });
  await page.getByTestId('mvd-theme-toggle').click();
}

test('klik „Napraw…" w wierszu problemu otwiera formularz operacji z fokusem na brakującym polu', async ({
  page,
  request,
}) => {
  test.setTimeout(240000);

  const seed = await createProjectAndCase(request);

  await executeDomainOp(request, seed.caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
    hv_voltage_kv: 110.0,
    transformer_sn_mva: 25.0,
  });
  let op: DomainOpResponse | null = null;
  for (const [idx, dlugosc] of [300, 250].entries()) {
    op = await executeDomainOp(request, seed.caseId, 'continue_trunk_segment_sn', {
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: dlugosc,
        name: `Odcinek ${idx + 1}`,
        catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
      },
    });
  }
  const zrodlo = op?.snapshot?.sources?.[0]?.ref_id;
  expect(zrodlo).toBeTruthy();

  // Błąd danych: S''kQmin (400 MVA) większa od S''kQmax (250 MVA).
  const poBledzie = await executeDomainOp(request, seed.caseId, 'update_element_parameters', {
    element_ref: zrodlo,
    parameters: { sk3_min_mva: 400.0 },
  });
  const zgloszenie = (poBledzie.readiness?.blockers ?? []).find(
    (w) => w.code === 'sources.sk_min_exceeds_max' && w.element_ref === zrodlo,
  );
  expect(zgloszenie?.canonical_code).toBe('source.sk_min_inconsistent');

  await otworzPowlokeZKontekstem(page, seed);
  await page.getByRole('button', { name: /^Gotowość \d$/ }).click();
  await expect(page.getByTestId('mvd-gotowosc-panel')).toBeVisible({ timeout: 20000 });

  const wiersz = page.getByTestId(`mvd-problem-sources.sk_min_exceeds_max-${zrodlo}`);
  await expect(wiersz).toBeVisible({ timeout: 20000 });
  await wiersz.scrollIntoViewIfNeeded();
  await zrzutObuMotywow(page, 'panel-gotowosci');

  // Klik NATYWNY w przycisk akcji naprawczej wiersza (ta sama kontrolka co u inżyniera).
  await wiersz.getByRole('button', { name: 'Napraw…' }).click();

  // Jedna nawigacja (D1) → przestrzeń „Schemat".
  await expect(page.getByRole('button', { name: /^Schemat \(SLD\) \d$/ })).toHaveAttribute(
    'aria-current',
    'page',
    { timeout: 20000 },
  );

  // Formularz operacji domenowej dla TEGO elementu, z fokusem na brakującym polu.
  const formularz = page.getByTestId('mvd-kreator-edycja');
  await expect(formularz).toBeVisible({ timeout: 20000 });
  await expect(formularz.getByTestId('mvd-kreator-edycja-element')).toContainText(zrodlo as string);
  await expect(page.getByTestId('mvd-kreator-edycja-klucz-0')).toHaveValue('sk3_min_mva');
  await expect(page.getByTestId('mvd-kreator-edycja-wartosc-0')).toBeFocused();

  // Zamknięcie pętli: wpis wartości w polu z fokusem (klawiatura) i zapis zdejmują
  // blokadę — akcja naprawcza jest wykonawcą, nie drogowskazem.
  await page.keyboard.type('200');
  await expect(page.getByTestId('mvd-kreator-edycja-wartosc-0')).toHaveValue('200');
  // Zrzut PO asercji fokusu: przełącznik motywu w helperze zrzutów przejmuje fokus.
  await zrzutObuMotywow(page, 'po-kliknieciu');
  // Zbliżenie: sekcja parametrów formularza z polem wskazanym przez akcję naprawczą.
  const sekcja = page.getByTestId('mvd-kreator-edycja-parametry');
  await sekcja.screenshot({ path: path.join(KATALOG_ZRZUTOW, `${PRZEDROSTEK_ZRZUTOW}-formularz-pole-dark.png`) });
  await page.getByTestId('mvd-theme-toggle').click();
  await sekcja.screenshot({ path: path.join(KATALOG_ZRZUTOW, `${PRZEDROSTEK_ZRZUTOW}-formularz-pole-light.png`) });
  await page.getByTestId('mvd-theme-toggle').click();
  const zapis = page.waitForResponse(
    (r) =>
      r.url().includes('/enm/domain-ops')
      && r.request().method() === 'POST'
      && (r.request().postData() ?? '').includes('"name":"update_element_parameters"'),
  );
  await page.getByTestId('mvd-kreator-edycja-zapisz').click();
  const odpowiedz = (await (await zapis).json()) as DomainOpResponse;
  expect(odpowiedz.error ?? null).toBeNull();
  expect(
    (odpowiedz.readiness?.blockers ?? []).some(
      (w) => w.code === 'sources.sk_min_exceeds_max' && w.element_ref === zrodlo,
    ),
  ).toBe(false);
});
