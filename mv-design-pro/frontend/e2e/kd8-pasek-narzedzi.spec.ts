/**
 * KD-8 poz. 2, bramka 2 — GRUPY PASA NARZĘDZI KANWY NIE NACHODZĄ NA SIEBIE.
 *
 * Ocena właściciela: „chip »SVG« nachodzi na »+ BESS«; trzy rzędy pływających
 * kontrolek kolidują przy węższych szerokościach". Ten spec mierzy PROSTOKĄTY
 * grup w ŻYWEJ przeglądarce (`getBoundingClientRect`) na kilku szerokościach
 * okna — kontrakt jednostkowy (`toolbarLayout.contract.test.ts`) dowodzi
 * decyzji układu, ten spec dowodzi, że render faktycznie tak się układa.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const FIELD_APPARATUS_ID = 'sw-cb-abb-vd4-17kv-630a';
const CATALOG_VERSION = '2024.1';

/** Szerokości okna z oceny: od najciaśniejszej roboczej po pełny ekran. */
const SZEROKOSCI = [1280, 1440, 1600, 1920] as const;

let opCounter = 0;
let entityCounter = 0;

interface Scena {
  projectId: string;
  projectName: string;
  caseId: string;
  caseName: string;
}

type DomainOpResponse = {
  error?: string | null;
  snapshot?: { corridors?: Array<{ ordered_segment_refs?: string[] }> };
};

function catalogBinding(namespace: string, itemId: string) {
  return { catalog_namespace: namespace, catalog_item_id: itemId, catalog_item_version: CATALOG_VERSION };
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
      operation: { name, idempotency_key: `e2e-kd8-pasek-${name}-${String(++opCounter).padStart(4, '0')}`, payload },
    },
    timeout: 30000,
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function zbudujScene(request: APIRequestContext): Promise<Scena> {
  entityCounter += 1;
  const suffix = String(entityCounter).padStart(4, '0');
  const projectName = `Pasek narzedzi ${suffix}`;
  const caseName = `Przeglad paska ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'KD-8: jedna warstwa narzedzi kanwy',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
    timeout: 30000,
  });
  expect(projectResponse.ok()).toBeTruthy();
  const project = (await projectResponse.json()) as { id: string };

  const caseResponse = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: project.id, name: caseName, description: '', config: {}, set_active: true },
    timeout: 30000,
  });
  expect(caseResponse.ok()).toBeTruthy();
  const caseId = ((await caseResponse.json()) as { id: string }).id;

  await domainOp(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: catalogBinding('ZRODLO_SN', SOURCE_ID),
    hv_voltage_kv: 110.0,
    transformer_sn_mva: 25.0,
  });
  let op: DomainOpResponse = {};
  for (const [idx, length] of [300, 250].entries()) {
    op = await domainOp(request, caseId, 'continue_trunk_segment_sn', {
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: length,
        name: `Odcinek ${idx + 1}`,
        catalog_binding: catalogBinding('KABEL_SN', CABLE_ID),
      },
    });
  }
  const segmentRefs = op.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(segmentRefs.length).toBeGreaterThan(0);
  await domainOp(request, caseId, 'insert_station_on_segment_sn', {
    field_apparatus_catalog_ref: FIELD_APPARATUS_ID,
    segment_id: segmentRefs[segmentRefs.length - 1],
    station_type: 'B',
    insert_at: { value: 0.5 },
    station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    // KOMPLETNOSC-POLA-TR (klasa A): stacja SN/nN Z transformatorem — pole roli
    // 'TR' dopisane, bo realna rozdzielnia realizuje odejscie do transformatora
    // polem transformatorowym. Kreator stacji tworzy je domyslnie, wiec fixture
    // bez niego opisywal siec, ktorej kreator by nie zbudowal.
    sn_fields: ['IN', 'OUT', 'FEEDER', 'TR'],
    transformer: { create: true, catalog_binding: catalogBinding('TRAFO_SN_NN', TRAFO_ID) },
  });

  return { projectId: project.id, projectName, caseId, caseName };
}

async function otworzSchemat(page: Page, scena: Scena): Promise<void> {
  await page.addInitScript(
    (dane) => {
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
      localStorage.setItem('mvd-theme-mode', JSON.stringify({ state: { mode: 'dark_scada' }, version: 0 }));
    },
    scena,
  );
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await page.getByRole('button', { name: 'Schemat (SLD)' }).first().click();
  await expect(page.locator('svg[data-testid="sld-canvas-v3"]')).toBeVisible({ timeout: 30000 });
}

interface Pomiar {
  readonly id: string;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

async function prostokatyGrup(page: Page): Promise<{ grupy: Pomiar[]; kanwa: Pomiar }> {
  return page.evaluate(() => {
    const doProstokata = (id: string, el: Element): Pomiar => {
      const r = el.getBoundingClientRect();
      return { id, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const pas = document.querySelector('[data-testid="sld-v3-toolbar"]')!;
    const grupy = Array.from(pas.querySelectorAll('[data-toolbar-group]'))
      .filter((el) => (el as HTMLElement).offsetParent !== null || el.getBoundingClientRect().width > 0)
      .map((el) => doProstokata(el.getAttribute('data-toolbar-group') ?? '?', el));
    const canvasEl = document.querySelector('svg[data-testid="sld-canvas-v3"]')!;
    return { grupy, kanwa: doProstokata('kanwa', canvasEl) };
  }) as Promise<{ grupy: Pomiar[]; kanwa: Pomiar }>;
}

function nachodza(a: Pomiar, b: Pomiar): boolean {
  const poziomo = a.left < b.right - 0.5 && b.left < a.right - 0.5;
  const pionowo = a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  return poziomo && pionowo;
}

test.describe('kd8:pasek-narzedzi', () => {
  test('grupy narzędzi są rozłączne przy każdej szerokości roboczej', async ({ page, request }) => {
    test.setTimeout(300000);
    const scena = await zbudujScene(request);
    await page.setViewportSize({ width: SZEROKOSCI[0], height: 900 });
    await otworzSchemat(page, scena);

    for (const width of SZEROKOSCI) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(400);

      const { grupy, kanwa } = await prostokatyGrup(page);
      expect(grupy.length, `${width} px: pas narzędzi bez grup`).toBeGreaterThan(0);

      for (let i = 0; i < grupy.length; i++) {
        for (let j = i + 1; j < grupy.length; j++) {
          expect(
            nachodza(grupy[i], grupy[j]),
            `${width} px: „${grupy[i].id}" (${grupy[i].left.toFixed(0)}–${grupy[i].right.toFixed(0)}) nachodzi na „${grupy[j].id}" (${grupy[j].left.toFixed(0)}–${grupy[j].right.toFixed(0)})`,
          ).toBe(false);
        }
      }

      // Żadna grupa nie może wystawać poza kanwę — pas narzędzi jest jej warstwą.
      for (const grupa of grupy) {
        expect(grupa.left, `${width} px: „${grupa.id}" poza lewą krawędzią`).toBeGreaterThanOrEqual(kanwa.left - 1);
        expect(grupa.right, `${width} px: „${grupa.id}" poza prawą krawędzią`).toBeLessThanOrEqual(kanwa.right + 1);
      }
    }
  });

  test('grupa zwinięta jest osiągalna jednym klikiem w „Narzędzia"', async ({ page, request }) => {
    test.setTimeout(300000);
    const scena = await zbudujScene(request);
    await page.setViewportSize({ width: 1280, height: 900 });
    await otworzSchemat(page, scena);

    const menu = page.getByTestId('sld-v3-toolbar-menu-toggle');
    const pas = page.getByTestId('sld-v3-toolbar');
    const zwiniete = await pas.getAttribute('data-toolbar-collapsed');
    expect(zwiniete, 'pas nie zgłasza stanu zwinięcia').not.toBeNull();

    if (zwiniete !== 'brak') {
      await expect(menu).toBeVisible();
      await menu.click();
      await expect(page.getByTestId('sld-v3-toolbar-menu')).toBeVisible();
      // Kontrolka z grupy zwiniętej działa TAK SAMO jak w pasie.
      const eksport = page.getByTestId('sld-v3-export-svg');
      await expect(eksport).toBeVisible();
    } else {
      // Przy tej szerokości nic się nie zwija — menu nie ma prawa istnieć.
      await expect(menu).toHaveCount(0);
    }
  });
});
