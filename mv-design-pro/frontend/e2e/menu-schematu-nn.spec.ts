/**
 * Menu kontekstowe schematu nN stacji na realnym backendzie (V12K-351, operacje bez toku pracy).
 *
 * INTENCJA: operacje nN (`set_nn_cable_laying_conditions`, `merge_nn_segments`) istniały
 * w backendzie bez żadnego wołającego w interfejsie. Teraz projektant dochodzi do nich
 * z portalu domeny nN stacji: NATYWNY klik w symbol portalu na kanwie SN otwiera schemat
 * nN, NATYWNY prawy klik w obiekt rysunku otwiera menu, pozycja menu wykonuje operację
 * (formularz albo operację wprost) i backend zapisuje skutek.
 *
 * Sieć seedowana przez API domain-ops (wzorzec `kanon-menu-sld.spec.ts`): GPZ → magistrala →
 * stacja SN/nN z transformatorem → dwa odcinki kabla nN w szereg (kabel 1 od szyny nN stacji,
 * kabel 2 od końca kabla 1). Zacisk między nimi łączy DOKŁADNIE dwa kable, więc „Scal
 * odcinki” jest dostępne, a po scaleniu model ma jeden kabel nN.
 */
import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const KABEL_NN_ID = 'kab_nn_4x120_al';
const CATALOG_VERSION = '2024.1';
let opCounter = 0;

type Galaz = { ref_id: string; name?: string; type?: string; from_bus_ref?: string; to_bus_ref?: string };
type Migawka = {
  corridors?: Array<{ ordered_segment_refs?: string[] }>;
  substations?: Array<{ ref_id: string; station_type?: string; bus_refs?: string[] }>;
  buses?: Array<{ ref_id: string; voltage_kv?: number | null }>;
  branches?: Galaz[];
};

function binding(namespace: string, id: string) {
  return { catalog_namespace: namespace, catalog_item_id: id, catalog_item_version: CATALOG_VERSION };
}

async function op(request: APIRequestContext, caseId: string, name: string, payload: Record<string, unknown>): Promise<Migawka> {
  const response = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: { name, idempotency_key: `e2e-menu-nn-${name}-${String(++opCounter).padStart(4, '0')}`, payload },
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { error?: string | null; snapshot?: Migawka };
  expect(body.error ?? null).toBeNull();
  return body.snapshot ?? {};
}

async function utworzPrzypadek(page: Page, request: APIRequestContext): Promise<string> {
  const projekt = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: { name: 'E2E menu schematu nN', description: '', mode: 'TO-BE', voltage_level_kv: 15.0, frequency_hz: 50.0 },
  });
  expect(projekt.ok()).toBeTruthy();
  const { id: projectId } = (await projekt.json()) as { id: string };
  const przypadek = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: projectId, name: 'Przypadek menu nN', description: '', config: {}, set_active: true },
  });
  expect(przypadek.ok()).toBeTruthy();
  const { id: caseId } = (await przypadek.json()) as { id: string };

  await page.addInitScript((seed) => {
    localStorage.setItem(
      'mv-design-app-state',
      JSON.stringify({
        state: {
          activeProjectId: seed.projectId,
          activeProjectName: 'E2E menu schematu nN',
          activeCaseId: seed.caseId,
          activeCaseName: 'Przypadek menu nN',
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
  }, { projectId, caseId });
  return caseId;
}

/** GPZ → 3 odcinki SN → stacja SN/nN z TR → kabel nN 1 → kabel nN 2 (szeregowo). */
async function zbudujSiec(request: APIRequestContext, caseId: string): Promise<{ kabel1: Galaz; kabel2: Galaz }> {
  let migawka = await op(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: binding('ZRODLO_SN', SOURCE_ID),
    hv_voltage_kv: 110.0,
    transformer_sn_mva: 25.0,
  });
  for (const [idx, length] of [300, 250, 200].entries()) {
    migawka = await op(request, caseId, 'continue_trunk_segment_sn', {
      segment: { rodzaj: 'KABEL', dlugosc_m: length, name: `Odcinek ${idx + 1}`, catalog_binding: binding('KABEL_SN', CABLE_ID) },
    });
  }
  const odcinki = migawka.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(odcinki.length).toBeGreaterThan(0);
  migawka = await op(request, caseId, 'insert_station_on_segment_sn', {
    field_apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
    segment_id: odcinki[odcinki.length - 1],
    station_type: 'B',
    insert_at: { value: 0.5 },
    station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    sn_fields: ['IN', 'OUT', 'FEEDER', 'TR'],
    transformer: { create: true, catalog_binding: binding('TRAFO_SN_NN', TRAFO_ID) },
  });
  const napiecia = new Map((migawka.buses ?? []).map((bus) => [bus.ref_id, bus.voltage_kv ?? null]));
  const stacja = (migawka.substations ?? []).find((s) => s.ref_id.includes('/station'));
  const szynaNn = (stacja?.bus_refs ?? []).find((ref) => (napiecia.get(ref) ?? Infinity) < 1.0);
  expect(szynaNn, 'szyna nN stacji SN/nN').toBeTruthy();

  migawka = await op(request, caseId, 'add_nn_cable_segment', {
    from_bus_ref: szynaNn, length_m: 40.0, catalog_binding: binding('KABEL_NN', KABEL_NN_ID), name: 'Kabel nN 1',
  });
  const kabel1 = (migawka.branches ?? []).find((b) => b.name === 'Kabel nN 1');
  expect(kabel1?.to_bus_ref).toBeTruthy();
  migawka = await op(request, caseId, 'add_nn_cable_segment', {
    from_bus_ref: kabel1!.to_bus_ref, length_m: 30.0, catalog_binding: binding('KABEL_NN', KABEL_NN_ID), name: 'Kabel nN 2',
  });
  const kabel2 = (migawka.branches ?? []).find((b) => b.name === 'Kabel nN 2');
  expect(kabel2).toBeTruthy();
  return { kabel1: kabel1!, kabel2: kabel2! };
}

async function kablePrzypadku(request: APIRequestContext, caseId: string): Promise<Galaz[]> {
  const odpowiedz = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm`, { timeout: 30000 });
  expect(odpowiedz.ok()).toBeTruthy();
  const model = (await odpowiedz.json()) as { branches?: Galaz[] };
  return (model.branches ?? []).filter((b) => b.type === 'cable' && (b.name ?? '').startsWith('Kabel nN'));
}

/** Realny zoom kółkiem nad środkiem kanwy, aż symbol stanie się widoczny (LOD z kamery). */
async function zoomujAzWidoczne(page: Page, selector: string): Promise<Locator> {
  const canvas = page.locator('svg[data-testid="sld-canvas-v3"]');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  for (let i = 0; i < 30; i += 1) {
    if ((await page.locator(selector).count()) > 0) break;
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(100);
  }
  const cel = page.locator(selector).first();
  await expect(cel).toBeVisible({ timeout: 5000 });
  return cel;
}

/**
 * NATYWNY klik w symbol portalu nN: punkt wybrany sondą `elementFromPoint` — trafienie musi
 * należeć do symbolu portalu albo do obszaru warstwy trafień tego symbolu (`data-hit-for`),
 * nie do nachodzącego odcinka ani paska narzędzi.
 */
async function otworzPortalNn(page: Page): Promise<void> {
  const selektor = '[data-symbol-canon="lvPortal"]';
  const portal = await zoomujAzWidoczne(page, selektor);
  await page.waitForTimeout(400);
  const punkt = await portal.evaluate((el) => {
    const testId = el.closest('[data-testid]')?.getAttribute('data-testid') ?? null;
    const rect = (el as SVGGraphicsElement).getBoundingClientRect();
    for (const fy of [0.5, 0.4, 0.6, 0.3, 0.7]) {
      for (const fx of [0.5, 0.4, 0.6, 0.3, 0.7]) {
        const x = Math.round(rect.x + rect.width * fx);
        const y = Math.round(rect.y + rect.height * fy);
        const top = document.elementFromPoint(x, y);
        if (!top) continue;
        // Warstwa trafień kanwy: obszar `data-hit-for` niesie testid symbolu, nad którym leży.
        if (testId && top.getAttribute('data-hit-for') === testId) return { x, y };
        if (el === top || el.contains(top)) return { x, y };
      }
    }
    return null;
  });
  expect(punkt, 'Brak punktu trafienia symbolu portalu nN').not.toBeNull();
  await page.mouse.click(punkt!.x, punkt!.y);
  await expect(page.getByTestId('lv-domain-portal')).toHaveAttribute('data-loading', 'false', { timeout: 20000 });
}

/**
 * NATYWNY prawy klik w obiekt rysunku nN: obiekt przewinięty do widoku, punkt wybrany sondą
 * `elementFromPoint` tak, aby trafienie należało do TEGO obiektu (obszar trafienia krawędzi
 * jest przezroczystą linią o zerowej szerokości ramki — Playwright uznaje go za niewidoczny,
 * więc klik idzie zdarzeniem myszy w zmierzonym punkcie, bez `force` i bez `dispatchEvent`).
 */
async function prawyKlikObiektuNn(page: Page, cel: Locator): Promise<void> {
  await cel.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
  await page.waitForTimeout(200);
  const punkt = await cel.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    for (const f of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
      const x = Math.round(rect.x + Math.max(rect.width, 0) * f);
      const y = Math.round(rect.y + Math.max(rect.height, 0) * f);
      const top = document.elementFromPoint(x, y);
      if (top && (top === el || el.contains(top))) return { x, y };
    }
    return null;
  });
  expect(punkt, 'Brak punktu trafienia obiektu rysunku nN').not.toBeNull();
  await page.mouse.click(punkt!.x, punkt!.y, { button: 'right' });
}

test('schemat nN: menu kabla otwiera formularz warunków ułożenia, „Scal odcinki” na zacisku scala kable w backendzie', async ({ page, request }) => {
  test.setTimeout(240000);
  const caseId = await utworzPrzypadek(page, request);
  const { kabel1, kabel2 } = await zbudujSiec(request, caseId);
  await page.setViewportSize({ width: 1600, height: 1200 });

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  await page.getByRole('button', { name: 'Schemat (SLD)' }).first().click();
  await expect(page.locator('svg[data-testid="sld-canvas-v3"]')).toBeVisible({ timeout: 20000 });
  await otworzPortalNn(page);

  // 1. Kabel: natywny prawy klik w obszar trafienia krawędzi kabla → formularz operacji
  //    `set_nn_cable_laying_conditions` dla TEGO odcinka.
  await prawyKlikObiektuNn(page, page.getByTestId(`lv-domain-edge-hit-${kabel1.ref_id}`));
  const ulozenie = page.getByTestId('sld-menu-set-nn-laying');
  await expect(ulozenie).toBeEnabled();
  await ulozenie.click();
  const formularz = page.getByTestId('mvd-kreator-ulozenie-nn');
  await expect(formularz).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('mvd-kreator-ulozenie-nn-odcinek')).toContainText('Kabel nN 1');
  await page.getByTestId('mvd-kreator-ulozenie-nn-anuluj').click();
  await expect(formularz).toHaveCount(0);

  // 2. Zacisk między kablami: „Scal odcinki” wykonuje `merge_nn_segments` wprost.
  expect(await kablePrzypadku(request, caseId)).toHaveLength(2);
  await prawyKlikObiektuNn(
    page,
    page.locator(`[data-node-kind="terminal"][data-owner-ref="${kabel1.to_bus_ref}"]`).first(),
  );
  const scal = page.getByTestId('sld-menu-merge-nn-segments');
  await expect(scal).toBeEnabled();
  const odpowiedzOperacji = page.waitForResponse(
    (response) =>
      response.url().includes('/enm/domain-ops')
      && response.request().method() === 'POST'
      && (response.request().postData() ?? '').includes('"name":"merge_nn_segments"'),
    { timeout: 20000 },
  );
  await scal.click();
  const odpowiedz = await odpowiedzOperacji;
  expect(odpowiedz.ok()).toBeTruthy();
  expect(((await odpowiedz.json()) as { error?: string | null }).error ?? null).toBeNull();
  const ladunek = JSON.parse(odpowiedz.request().postData() ?? '{}') as { operation?: { payload?: Record<string, unknown> } };
  expect(ladunek.operation?.payload).toEqual({
    segment_a_ref: [kabel1.ref_id, kabel2.ref_id].sort()[0],
    segment_b_ref: [kabel1.ref_id, kabel2.ref_id].sort()[1],
  });

  await expect.poll(async () => (await kablePrzypadku(request, caseId)).length, { timeout: 15000 }).toBe(1);
});
