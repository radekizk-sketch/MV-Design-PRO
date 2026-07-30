import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const ALT_CABLE_ID = 'cable-nkt-na2xs2y-3x150';
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const UPDATED_TRANSFORMER_NAME = 'Transformator terenowy';
const CATALOG_VERSION = '2024.1';
let entityCounter = 0;

function nextEntitySuffix(): string {
  entityCounter += 1;
  return String(entityCounter).padStart(4, '0');
}

type DomainOpResponse = {
  error?: string | null;
  snapshot?: {
    branches?: Array<{ ref_id: string; from_bus_ref?: string; to_bus_ref?: string }>;
    buses?: Array<{ ref_id: string }>;
    corridors?: Array<{ ordered_segment_refs?: string[] }>;
    substations?: Array<{
      ref_id: string;
      meta?: {
        field_specs?: Array<{
          field_ref?: string;
          bay_role?: string;
          bus_ref?: string;
        }>;
      };
    }>;
    transformers?: Array<{ ref_id: string; name?: string }>;
  };
  readiness?: { ready: boolean; status?: string; blockers?: Array<{ code: string; element_ref?: string | null }> };
  fix_actions?: Array<{ code: string; message_pl: string; element_ref?: string | null }>;
};

function buildCatalogBinding(catalogNamespace: string, catalogItemId: string) {
  return {
    catalog_namespace: catalogNamespace,
    catalog_item_id: catalogItemId,
    catalog_item_version: CATALOG_VERSION,
  };
}

let opCounter = 0;
function nextIdempotencyKey(name: string): string {
  opCounter += 1;
  return `e2e-real-${name}-${String(opCounter).padStart(4, '0')}`;
}

async function executeDomainOp(
  request: APIRequestContext,
  caseId: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<DomainOpResponse> {
  const response = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: caseId,
      snapshot_base_hash: '',
      operation: {
        name,
        idempotency_key: nextIdempotencyKey(name),
        payload,
      },
    },
  });
  if (!response.ok()) {
    const bodyText = await response.text();
    throw new Error(`Domain op ${name} failed (${response.status()}): ${bodyText}`);
  }
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function createProjectAndCase(
  request: APIRequestContext,
): Promise<{ projectId: string; projectName: string; caseId: string; caseName: string }> {
  const suffix = nextEntitySuffix();
  const projectName = `E2E SLD ${suffix}`;
  const caseName = `Przypadek SLD ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Test real backend SLD editor V12.5',
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

  return {
    projectId: project.id,
    projectName,
    caseId: studyCase.id,
    caseName,
  };
}

async function createCaseFromUi(page: Page, request: APIRequestContext): Promise<string> {
  const { projectId, projectName, caseId, caseName } = await createProjectAndCase(request);

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
          activeRunId: null,
          activeAnalysisType: 'SHORT_CIRCUIT',
          caseManagerOpen: false,
          issuePanelOpen: false,
        },
        version: 1,
      }),
    );
  }, {
    projectId,
    projectName,
    caseId,
    caseName,
  });

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  await expect(page.getByTestId('active-case-bar')).toContainText(/Zakres|Bieżący zestaw/);
  return caseId;
}

async function reloadEditorPage(page: Page): Promise<void> {
  const refreshResponsePromise = page
    .waitForResponse(
      (response) =>
        response.url().includes('/enm/domain-ops')
        && response.request().method() === 'POST'
        && (response.request().postData() ?? '').includes('"name":"refresh_snapshot"'),
      { timeout: 15000 },
    )
    .catch(() => null);

  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  await expect(page.getByTestId('active-case-bar')).toContainText(/Zakres|Bieżący zestaw/);
  await refreshResponsePromise;
  await expect(page.getByTestId('sld-canvas-v3')).toBeAttached();
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  try {
    await page.screenshot({
      path: testInfo.outputPath(`${name}.png`),
      fullPage: false,
      timeout: 30000,
    });
  } catch {
    // Screenshot is diagnostic only; a slow shell render should not fail the flow.
  }
}

async function openSegmentInspector(page: Page, segmentRef: string): Promise<void> {
  // Adaptacja v3 (F12-C, 2026-07-17): odcinek to <path data-owner-ref=…>
  // (dawne data-connection-ref+polyline były kontraktem v2); ścieżka
  // użytkownika: klik w odcinek → drawer odcinka → „Otwórz konfigurację" →
  // powierzchnia E-12 (`sld-segment-inspector`). Klikalność odcinka i CTA
  // konfiguracji przywrócone w tej adaptacji (parytet F8c/K30-91).
  // Prefix-match: kawałki przęsła niosą sufiksy tras (`_L`, `_R_L`) —
  // klik dowolnego kawałka normalizuje się do refu kanonicznego w workspace.
  const hitbox = page.locator(`path[data-owner-ref^="${segmentRef}"]`).first();
  await expect(hitbox).toHaveCount(1, { timeout: 15000 });
  // REALNY klik Playwright — NIE syntetyczny `dispatchEvent` (maskował defekt
  // martwego klika, patrz `openElementInspector` niżej). Cel = punkt NA
  // torze (`getPointAtLength(len/2)`): środek bboxa polilinii z zagięciem
  // leży POZA kreską, a realny użytkownik klika w kreskę.
  const clickPos = await hitbox.evaluate((node: SVGPathElement) => {
    const len = node.getTotalLength();
    const pt = node.getPointAtLength(len / 2);
    const ctm = node.getScreenCTM();
    const screen = ctm
      ? { x: ctm.a * pt.x + ctm.c * pt.y + ctm.e, y: ctm.b * pt.x + ctm.d * pt.y + ctm.f }
      : { x: pt.x, y: pt.y };
    const rect = node.getBoundingClientRect();
    return { x: screen.x - rect.left, y: screen.y - rect.top };
  });
  await hitbox.click({ position: clickPos, force: true });

  await expect(page.getByTestId('sld-v2-detail-drawer')).toBeVisible();
  await page.getByTestId('sld-v2-detail-drawer-open-configuration').click();

  await expect(page.getByTestId('sld-segment-inspector')).toBeVisible();
  await expect(page.getByTestId('sld-segment-inspector')).toHaveAttribute(
    'data-segment-ref',
    segmentRef,
  );
}

function findBranchCapableFieldPort(snapshot: DomainOpResponse['snapshot']): string | null {
  const branchRoles = new Set(['OUT', 'FEEDER', 'LINE_OUT']);
  for (const substation of snapshot?.substations ?? []) {
    for (const spec of substation.meta?.field_specs ?? []) {
      const bayRole = String(spec.bay_role ?? '').toUpperCase();
      if (spec.field_ref && branchRoles.has(bayRole)) {
        return `${spec.field_ref}.BRANCH`;
      }
    }
  }
  return null;
}

async function openElementInspector(page: Page, elementRef: string): Promise<void> {
  // Adaptacja v3 (2026-07-17): kanwa v3 nie niesie `sld-symbol-*`/
  // `data-element-id` — symbol ma `data-element-kind` + `data-owner-ref`
  // (dla transformatora STACJI ownerRef = bay-ref, realny ref transformatora
  // rozwiązuje workspace kliku — `resolveTransformerRefForOwnerRef`).
  // Selektor: transformator w obrębie stacji (`stn/`), odróżniony od
  // transformatora GPZ (`gpz/`).
  const isStationTransformer = /\/transformer$/.test(elementRef) && elementRef.startsWith('stn/');
  const symbol = isStationTransformer
    ? page.locator('g[data-element-kind="transformer"][data-owner-ref^="stn/"]').first()
    : page.locator(`g[data-owner-ref="${elementRef}"]`).first();
  await expect(symbol).toHaveCount(1, { timeout: 15000 });

  // REALNY klik Playwright (pełna sekwencja pointer/mouse) — celowo NIE
  // syntetyczny `dispatchEvent`: dowodzi, że lewy klik użytkownika w symbol
  // działa (naprawa capture-on-pointerdown w `SldCanvasV3.handlePointerDown`,
  // 2026-07-17 — wcześniej capture przekierowywał click na <svg> i klik w
  // element kanwy był martwy, co testy maskowały syntetycznym dispatch).
  await symbol.click({ force: true });

  await expect(page.getByTestId('sld-engineering-inspector-wrapper')).toBeVisible();
}

async function activateEngineeringFieldEditor(page: Page, fieldKey: string): Promise<void> {
  const fieldRow = page.getByTestId(`engineering-field-${fieldKey}`);
  await expect(fieldRow).toHaveCount(1);

  // REALNY klik Playwright w komórkę wartości (ta sama zasada co klik w
  // elementy kanwy: test ćwiczy ścieżkę użytkownika, nie syntetyczny event).
  const clickable = fieldRow.locator('div.cursor-pointer').first();
  await expect(clickable, `Missing editable value cell for engineering-field-${fieldKey}`).toBeVisible();
  await clickable.click();

  await expect(fieldRow.locator('input')).toBeVisible();
}

test('real backend SLD editor flow: source -> trunk -> station -> branch -> update -> delete -> continue', async ({ page, request }, testInfo) => {
  const caseId = await createCaseFromUi(page, request);

  await executeDomainOp(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
  });
  await capture(page, testInfo, '01-after-source');

  let op = await executeDomainOp(request, caseId, 'continue_trunk_segment_sn', {
    segment: {
      rodzaj: 'KABEL',
      dlugosc_m: 210,
      name: 'T1',
      catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
    },
  });
  op = await executeDomainOp(request, caseId, 'continue_trunk_segment_sn', {
    segment: {
      rodzaj: 'KABEL',
      dlugosc_m: 230,
      name: 'T2',
      catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
    },
  });
  op = await executeDomainOp(request, caseId, 'continue_trunk_segment_sn', {
    segment: {
      rodzaj: 'KABEL',
      dlugosc_m: 180,
      name: 'T3',
      catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
    },
  });

  const segmentRefs = op.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(segmentRefs.length).toBeGreaterThan(1);
  await reloadEditorPage(page);
  await capture(page, testInfo, '02-after-trunk');

  await openSegmentInspector(page, segmentRefs[0]);
  await expect(page.getByTestId('sld-segment-inspector-catalog')).toContainText(CABLE_ID);
  await expect(page.getByTestId('sld-segment-inspector-catalog-family')).toContainText('KABEL_SN');
  await capture(page, testInfo, '02a-segment-inspector-with-catalog');

  await page.getByTestId('sld-segment-open-catalog-picker').click();
  await page.getByTestId('segment-catalog-item-select').selectOption(ALT_CABLE_ID);
  await expect(page.getByTestId('sld-segment-inspector-catalog')).toContainText(ALT_CABLE_ID);
  await expect(page.getByTestId('sld-segment-catalog-status')).toContainText(ALT_CABLE_ID);
  await capture(page, testInfo, '02b-segment-catalog-reassigned');

  op = await executeDomainOp(request, caseId, 'insert_station_on_segment_sn', {
    // B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
    field_apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
    segment_id: segmentRefs[1],
    station_type: 'B',
    insert_at: { value: 0.5 },
    station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    transformer: {
      create: true,
      catalog_binding: buildCatalogBinding('TRAFO_SN_NN', TRAFO_ID),
    },
  });
  const stationBus = (op.snapshot?.buses ?? []).find((bus) => bus.ref_id.includes('sn_bus'));
  expect(stationBus).toBeDefined();
  const transformerRef = op.snapshot?.transformers?.at(-1)?.ref_id;
  expect(transformerRef).toBeTruthy();
  await reloadEditorPage(page);
  await capture(page, testInfo, '03-after-station');

  await openElementInspector(page, transformerRef!);
  await expect(page.getByTestId('engineering-section-typ_i_katalog')).toContainText(TRAFO_ID);
  await capture(page, testInfo, '03a-transformer-inspector');

  await activateEngineeringFieldEditor(page, 'name');
  const nameEditor = page.getByTestId('engineering-field-name').locator('input');
  await nameEditor.fill(UPDATED_TRANSFORMER_NAME);
  await nameEditor.press('Tab');
  await expect(page.getByTestId('engineering-field-name')).toContainText(UPDATED_TRANSFORMER_NAME);

  const branchFromRef = findBranchCapableFieldPort(op.snapshot);
  expect(branchFromRef).toBeTruthy();
  op = await executeDomainOp(request, caseId, 'start_branch_segment_sn', {
    from_ref: branchFromRef!,
    segment: {
      rodzaj: 'KABEL',
      dlugosc_m: 140,
      name: 'B1',
      catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
    },
  });
  const branchRef = op.snapshot?.branches?.[op.snapshot.branches.length - 1]?.ref_id;
  expect(branchRef).toBeTruthy();
  await reloadEditorPage(page);
  await capture(page, testInfo, '03b-after-branch');

  await executeDomainOp(request, caseId, 'update_element_parameters', {
    element_ref: branchRef,
    parameters: { length_km: 0.155, status: 'closed' },
  });

  await executeDomainOp(request, caseId, 'delete_element', {
    element_ref: branchRef,
  });

  op = await executeDomainOp(request, caseId, 'continue_trunk_segment_sn', {
    segment: {
      rodzaj: 'KABEL',
      dlugosc_m: 160,
      name: 'T4',
      catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
    },
  });
  expect((op.snapshot?.branches ?? []).length).toBeGreaterThan(2);

  await reloadEditorPage(page);
  await capture(page, testInfo, '04-after-delete-and-continue');
  // Przepisane (karta K1/E, 2026-07-29). DIAGNOZA: to NIE defekt hydratacji
  // H-0 — testid `sld-readiness-stack` żyje wyłącznie w GuidedBuildActionPanel,
  // a ten panel od migracji na powłokę ui2 NIE jest montowany NIGDZIE
  // (świadoma decyzja, rejestr wygaszania — `ui2/legacy/LegacyInspektor.tsx`:
  // „panel prowadzenia budowy (GuidedBuildActionPanel) nie jest mostkowany…
  // pełne przejęcie = karty U2"). Panel nie pojawiłby się także BEZ reloadu.
  // INTENCJA BEZ ZMIAN: po delete+continue+reloadzie powłoka pokazuje
  // strukturę układu odzwierciedlającą realny model (nie stan zerowy).
  // Bieżący nośnik: pasek kontekstu przepływu pracy nad kanwą
  // (`WorkflowContextStrip` — faza budowy + metryki Szyny/Odcinki SN/Stacje).
  const strip = page.getByTestId('workflow-context-strip');
  await expect(strip).toBeVisible();
  await expect(page.getByTestId('workflow-build-phase')).toBeVisible();
  // 'Kontrola:' renderuje się TYLKO przy niepustej topologii (hasTopologyElements)
  // — dowodzi, że po reloadzie model został odtworzony z backendu.
  await expect(strip).toContainText('Kontrola:');
  await expect(strip).toContainText('Odcinki SN');
  await expect(strip).toContainText('Stacje');
});

test('real backend supports flexible operation order combinations', async ({ page, request }) => {
  const caseId = await createCaseFromUi(page, request);

  let snapshot = await executeDomainOp(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
  });

  snapshot = await executeDomainOp(request, caseId, 'continue_trunk_segment_sn', {
    segment: {
      rodzaj: 'KABEL',
      dlugosc_m: 200,
      name: 'F1',
      catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
    },
  });
  const firstSegment = snapshot.snapshot?.corridors?.[0]?.ordered_segment_refs?.[0];
  expect(firstSegment).toBeTruthy();

  await executeDomainOp(request, caseId, 'update_element_parameters', {
    element_ref: firstSegment,
    parameters: { length_km: 0.222 },
  });

  await executeDomainOp(request, caseId, 'delete_element', { element_ref: firstSegment });

  snapshot = await executeDomainOp(request, caseId, 'continue_trunk_segment_sn', {
    segment: {
      rodzaj: 'KABEL',
      dlugosc_m: 205,
      name: 'F2',
      catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
    },
  });
  snapshot = await executeDomainOp(request, caseId, 'continue_trunk_segment_sn', {
    segment: {
      rodzaj: 'KABEL',
      dlugosc_m: 210,
      name: 'F3',
      catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
    },
  });

  const targetSegment = snapshot.snapshot?.corridors?.[0]?.ordered_segment_refs?.[1];
  expect(targetSegment).toBeTruthy();
  await executeDomainOp(request, caseId, 'insert_station_on_segment_sn', {
    // B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
    field_apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
    segment_id: targetSegment,
    station_type: 'B',
    insert_at: { value: 0.45 },
    station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    transformer: {
      create: true,
      catalog_binding: buildCatalogBinding('TRAFO_SN_NN', TRAFO_ID),
    },
  });
  const segmentAfterInsert = snapshot.snapshot?.corridors?.[0]?.ordered_segment_refs?.[0];
  expect(segmentAfterInsert).toBeTruthy();

  await reloadEditorPage(page);
  await openSegmentInspector(page, segmentAfterInsert!);
  await expect(page.getByTestId('sld-segment-inspector')).toBeVisible();
});
