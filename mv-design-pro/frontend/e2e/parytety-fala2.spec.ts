/**
 * PARYTETY FALI 2 kolejki długu (bramka karty KD-4): luki L-15 i L-11.
 *
 * L-15 — generator raportu w powłoce: skład dokumentu (profil · poziom ·
 * zakres · sekcje) realnie jedzie do backendu, a wygenerowany dokument JEST
 * DOSTĘPNY: ląduje w magazynie dokumentów projektu (asercja przez API, nie
 * przez napis na ekranie).
 * L-11 — dowód wg WSKAZANEGO elementu: 2× klik na wartości z dowodem w tabeli
 * zwarć otwiera zakładkę wywodu ZAWĘŻONĄ do tego elementu (do karty KD-4 ref
 * elementu był przyjmowany i wyrzucany, więc wywód zawsze był całościowy).
 *
 * Wszystkie interakcje to kliki natywne w żywej aplikacji, na realnym backendzie.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CATALOG_VERSION = '2024.1';

let opCounter = 0;

type DomainOpResponse = {
  error?: string | null;
  // `type` jest CZYTANY nizej (filtr odcinkow liniowych) — bez deklaracji
  // filtr milczaco odpadal na bledzie typow poza bramka. Wartosci zgodne z
  // `src/types/enm.ts` (`Branch.type`).
  snapshot?: { branches?: Array<{ ref_id: string; type?: string }> };
};

function catalogBinding(namespace: string, itemId: string) {
  return {
    catalog_namespace: namespace,
    catalog_item_id: itemId,
    catalog_item_version: CATALOG_VERSION,
  };
}

async function domainOp(
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
        idempotency_key: `e2e-parytet-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function czekajNaWynik(request: APIRequestContext, runId: string): Promise<void> {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const response = await request.get(`${BACKEND_BASE}/api/analysis-runs/${runId}/results/index`);
    if (response.ok()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Wynik biegu ${runId} nie pojawił się w czasie budżetu.`);
}

interface Kontekst {
  projectId: string;
  projectName: string;
  caseId: string;
  caseName: string;
  runId: string;
}

async function przygotujKontekst(request: APIRequestContext): Promise<Kontekst> {
  const znacznik = String(Date.now());
  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: `Parytety fali 2 ${znacznik}`,
      description: 'Bramka KD-4: generator raportu i wywód wg elementu',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
  });
  expect(projectResponse.ok()).toBeTruthy();
  const project = (await projectResponse.json()) as { id: string; name: string };

  const caseResponse = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: {
      project_id: project.id,
      name: `Przypadek parytetów ${znacznik}`,
      description: '',
      config: {},
      set_active: true,
    },
  });
  expect(caseResponse.ok()).toBeTruthy();
  const studyCase = (await caseResponse.json()) as { id: string; name: string };

  await domainOp(request, studyCase.id, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: catalogBinding('ZRODLO_SN', SOURCE_ID),
    hv_voltage_kv: 110.0,
    transformer_sn_mva: 25.0,
  });
  let op: DomainOpResponse = {};
  for (const [idx, length] of [300, 250].entries()) {
    op = await domainOp(request, studyCase.id, 'continue_trunk_segment_sn', {
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: length,
        name: `Odcinek ${idx + 1}`,
        catalog_binding: catalogBinding('KABEL_SN', CABLE_ID),
      },
    });
  }
  // Kategoria katalogu MUSI pasować do rodzaju gałęzi: KABEL_SN dostają
  // WYŁĄCZNIE odcinki liniowe (aparat pola ma wiązanie APARAT_SN, którego nie
  // wolno nadpisać — `catalog.namespace_mismatch`, KD-6).
  const odcinkiLiniowe = (op.snapshot?.branches ?? []).filter(
    (branch) => branch.type === 'cable' || branch.type === 'line_overhead',
  );
  for (const branch of odcinkiLiniowe) {
    await domainOp(request, studyCase.id, 'assign_catalog_to_element', {
      element_ref: branch.ref_id,
      catalog_binding: catalogBinding('KABEL_SN', CABLE_ID),
    });
  }

  const createRun = await request.post(
    `${BACKEND_BASE}/api/execution/study-cases/${studyCase.id}/runs`,
    { data: { analysis_type: 'SC_3F' } },
  );
  expect(createRun.ok()).toBeTruthy();
  const run = (await createRun.json()) as { id: string };
  const executeRun = await request.post(`${BACKEND_BASE}/api/execution/runs/${run.id}/execute`);
  expect(executeRun.ok()).toBeTruthy();
  await czekajNaWynik(request, run.id);

  return {
    projectId: project.id,
    projectName: project.name,
    caseId: studyCase.id,
    caseName: studyCase.name,
    runId: run.id,
  };
}

async function otworzAplikacje(page: Page, kontekst: Kontekst, hash: string): Promise<void> {
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
          activeCaseResultStatus: 'FRESH',
          activeSnapshotId: null,
          activeMode: 'MODEL_EDIT',
          activeRunId: dane.runId,
          activeAnalysisType: 'SHORT_CIRCUIT',
          caseManagerOpen: false,
          issuePanelOpen: false,
        },
        version: 1,
      }),
    );
  }, kontekst);
  await page.goto(hash, { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
}

test('L-15: generator raportu w powłoce wytwarza dokument dostępny w magazynie projektu', async ({
  page,
  request,
}) => {
  test.setTimeout(240000);
  const kontekst = await przygotujKontekst(request);

  // Magazyn na starcie — punkt odniesienia (bez założenia „pusty").
  const przed = await request.get(`${BACKEND_BASE}/api/projects/${kontekst.projectId}/documents`);
  expect(przed.ok()).toBeTruthy();
  const liczbaPrzed = ((await przed.json()) as { count: number }).count;

  await otworzAplikacje(page, kontekst, '/');
  await page.getByRole('button', { name: /^Dokumentacja/ }).click();
  await expect(page.getByTestId('mvd-dokumentacja-hub')).toBeVisible({ timeout: 30000 });

  // Karta raportu prowadzi do OKNA ui2 (nie do powierzchni mostu).
  await page
    .getByTestId('mvd-dok-karta-raport')
    .getByRole('button', { name: 'Otwórz generator' })
    .click();
  await expect(page.getByTestId('mvd-generator-raportu')).toBeVisible();

  // Skład dokumentu — realne parametry eksportu.
  await page.getByTestId('mvd-generator-profil').selectOption('audytowy');
  await page.getByTestId('mvd-generator-poziom').selectOption('pelny');
  await page.getByTestId('mvd-generator-sekcja-summary').check();
  await page.getByTestId('mvd-generator-sekcja-results').check();

  await page.getByTestId('mvd-generator-raport-json').click();
  await expect(page.getByTestId('mvd-generator-stan-ok')).toBeVisible({ timeout: 60000 });

  // ASERCJA PRZEZ API: dokument realnie powstał i jest DOSTĘPNY do pobrania.
  await expect
    .poll(
      async () => {
        const po = await request.get(
          `${BACKEND_BASE}/api/projects/${kontekst.projectId}/documents`,
        );
        return ((await po.json()) as { count: number }).count;
      },
      { timeout: 30000 },
    )
    .toBeGreaterThan(liczbaPrzed);

  const po = await request.get(`${BACKEND_BASE}/api/projects/${kontekst.projectId}/documents`);
  const rekordy = (await po.json()) as {
    items: Array<{ doc_type: string; doc_format: string; content_url: string; run_ref?: string }>;
  };
  const raport = rekordy.items.find((r) => r.doc_type === 'RAPORT' && r.doc_format === 'JSON');
  expect(raport, 'Wygenerowany raport musi być w magazynie dokumentów projektu.').toBeTruthy();
  expect(raport!.run_ref).toBe(kontekst.runId);

  // Dokument da się pobrać, a jego treść niesie WYBRANY skład (nie domyślny).
  const pobrany = await request.get(`${BACKEND_BASE}${raport!.content_url}`);
  expect(pobrany.ok()).toBeTruthy();
  const tresc = (await pobrany.json()) as {
    report_options: { profile: string; detail_level: string; sections: string[] };
  };
  expect(tresc.report_options.profile).toBe('audytowy');
  expect(tresc.report_options.detail_level).toBe('pelny');
  expect(tresc.report_options.sections).toEqual(['summary', 'results']);

  // Hub pokazuje dokument w magazynie (cykl życia domknięty w UI).
  await page.getByRole('button', { name: '← Dokumentacja' }).click();
  await expect(page.getByTestId('mvd-dok-karta-raport-magazyn')).toBeVisible({ timeout: 30000 });
});

test('L-11: 2× klik na wartości z dowodem otwiera wywód ZAWĘŻONY do wskazanego elementu', async ({
  page,
  request,
}) => {
  test.setTimeout(240000);
  const kontekst = await przygotujKontekst(request);

  await otworzAplikacje(page, kontekst, `/#analysis?run=${kontekst.runId}`);
  await page.getByRole('tab', { name: /Zwarcia/ }).click();
  await expect(page.getByTestId('mvd-zwarcia-ekran')).toBeVisible({ timeout: 30000 });

  // Wartość z dowodem w tabeli punktów zwarciowych (natywny 2× klik).
  const wartoscZDowodem = page.locator('[data-mvd-action="dowod"]').first();
  await expect(wartoscZDowodem).toBeVisible();
  await wartoscZDowodem.dblclick();

  // Zakładka wywodu otwarta i ZAWĘŻONA do wskazanego elementu. Ślad biegu
  // zwarciowego wiąże kroki z punktem (`selection_index` + referencje kroku),
  // więc zawężenie jest tu stanem WYMAGANYM — nie „jednym z możliwych".
  const przelacznik = page.getByTestId('mvd-dowod-zakres-element');
  await expect(przelacznik).toBeVisible({ timeout: 30000 });
  await expect(przelacznik).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('mvd-dowod-zakres-caly')).toHaveAttribute('aria-pressed', 'false');

  // Zawężenie NIE gubi całości — powrót na cały przebieg działa.
  await page.getByTestId('mvd-dowod-zakres-caly').click();
  await expect(page.getByTestId('mvd-dowod-zakres-caly')).toHaveAttribute('aria-pressed', 'true');

  // L-10 przy okazji: źródło LaTeX wywodu jest osiągalne z powłoki.
  await expect(page.getByTestId('mvd-dowod-latex-pokaz')).toBeVisible();
  await page.getByTestId('mvd-dowod-latex-pokaz').click();
  await expect(page.getByTestId('mvd-dowod-latex-zrodlo')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('mvd-dowod-latex-zrodlo')).toContainText('documentclass');
});
