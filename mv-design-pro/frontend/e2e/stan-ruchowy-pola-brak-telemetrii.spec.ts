/**
 * Karta #135 — stan ruchowy pola bez fabrykacji, na REALNYM backendzie.
 *
 * Narzędzie projektowe nie ma telemetrii. Sieć budowana operacjami domenowymi API
 * (źródło GPZ → magistrala → stacja B z polami i wyłącznikami z katalogu), bez żadnego
 * źródła runtime w modelu. Sprawdzane na realnej ścieżce użytkownika:
 *   1. `GET /api/cases/{id}/enm/field-view` — łączniki pól mają stan łącznika z modelu, a tryb
 *      sterowania, uzbrojenie napędu i komunikacja są `null`; rekord runtime pola `null`
 *      (dawniej „zdalne / uzbrojony / komunikacja OK / łączność ograniczona"),
 *   2. kanwa SLD: REALNY klik w aparat pola → szuflada → zakładka „Stan + telemetria"
 *      pokazuje „brak telemetrii" (dawniej „zamknięty / LOKALNY / Komunikacja: OK").
 *
 * Zrzuty dowodowe dla werdyktu wizualnego właściciela (B-02) — oba motywy, motyw
 * przełączany REALNYM przyciskiem powłoki z asercją na `data-theme` — trafiają do
 * `docs/audit/visual/dowody/dowod_stan-pola-brak-telemetrii_<light|dark>.png` (ten sam
 * katalog i wzorzec nazw co pozostałe specy dowodów; strona oceny zbiera je sama).
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   PLAYWRIGHT_REAL_BACKEND=1 npx playwright test e2e/stan-ruchowy-pola-brak-telemetrii.spec.ts
 */
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
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
const CB_ID = 'sw-cb-abb-vd4-17kv-630a';
const CATALOG_VERSION = '2024.1';
const BRAK_TELEMETRII = 'brak telemetrii';

let opCounter = 0;

function katalogBinding(namespace: string, itemId: string) {
  return { catalog_namespace: namespace, catalog_item_id: itemId, catalog_item_version: CATALOG_VERSION };
}

type OdpowiedzOperacji = {
  error?: string | null;
  snapshot?: { corridors?: Array<{ ordered_segment_refs?: string[] }> };
};

async function operacja(
  request: APIRequestContext,
  caseId: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<OdpowiedzOperacji> {
  const response = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: {
        name,
        idempotency_key: `k135-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as OdpowiedzOperacji;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function siecZPolem(
  request: APIRequestContext,
): Promise<{ caseId: string; projectId: string; projectName: string; caseName: string }> {
  const suffix = Date.now().toString(36);
  const projectName = `Stan ruchowy pola ${suffix}`;
  const caseName = `Przypadek telemetrii ${suffix}`;
  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: { name: projectName, description: 'Karta #135', mode: 'TO-BE', voltage_level_kv: 15.0, frequency_hz: 50.0 },
  });
  expect(projectResponse.ok()).toBeTruthy();
  const project = (await projectResponse.json()) as { id: string };
  const caseResponse = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: project.id, name: caseName, description: '', config: {}, set_active: true },
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
  let op: OdpowiedzOperacji = {};
  for (const [idx, dlugosc] of [300, 250].entries()) {
    op = await operacja(request, studyCase.id, 'continue_trunk_segment_sn', {
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: dlugosc,
        name: `Odcinek ${idx + 1}`,
        catalog_binding: katalogBinding('KABEL_SN', CABLE_ID),
      },
    });
  }
  const odcinki = op.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(odcinki.length).toBeGreaterThan(1);
  await operacja(request, studyCase.id, 'insert_station_on_segment_sn', {
    field_apparatus_catalog_ref: CB_ID,
    segment_id: odcinki[1],
    station_type: 'B',
    insert_at: { value: 0.5 },
    station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    transformer: { create: true, catalog_binding: katalogBinding('TRAFO_SN_NN', TRAFO_ID) },
  });
  return { caseId: studyCase.id, projectId: project.id, projectName, caseName };
}

async function otworzAplikacje(
  page: Page,
  seed: { projectId: string; projectName: string; caseId: string; caseName: string },
): Promise<void> {
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
          activeRunId: null,
          activeAnalysisType: 'SHORT_CIRCUIT',
          caseManagerOpen: false,
          issuePanelOpen: false,
        },
        version: 1,
      }),
    );
  }, seed);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 60000 });
  await expect(page.locator('svg[data-testid="sld-canvas-v3"]')).toBeVisible({ timeout: 60000 });
}

/** Motyw przełączany REALNYM przyciskiem powłoki, z asercją na `data-theme`. */
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

/**
 * Aparat pola STACJI SN/nN na kanwie (nie aparat GPZ). Widok startowy stacji z polami
 * pokazuje już tor aparatów; gdy kamera startuje z dalszego LOD — realny zoom kółkiem
 * nad środkiem kanwy (gest użytkownika, bez wymuszonego stanu kamery).
 */
async function aparatPola(page: Page) {
  const selektor = '[data-element-kind="apparatus"][data-owner-ref]';
  const canvas = page.locator('svg[data-testid="sld-canvas-v3"]');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  for (let i = 0; i < 30; i += 1) {
    if ((await page.locator(selektor).count()) > 0) break;
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(150);
  }
  const aparaty = page.locator(selektor);
  await expect(aparaty.first()).toBeAttached({ timeout: 10000 });
  const liczba = await aparaty.count();
  for (let i = 0; i < liczba; i += 1) {
    const ownerRef = (await aparaty.nth(i).getAttribute('data-owner-ref')) ?? '';
    if (!ownerRef.startsWith('gpz/')) return aparaty.nth(i);
  }
  throw new Error('Na kanwie brak aparatu pola stacji SN/nN (same aparaty GPZ).');
}

test('pole SN bez źródła runtime — model odczytu i szuflada SLD: brak telemetrii (oba motywy)', async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const seed = await siecZPolem(request);

  // 1. Model odczytu pola z REALNEGO backendu — ta sama końcówka, którą czyta inspektor.
  const widok = await request.get(`${BACKEND_BASE}/api/cases/${seed.caseId}/enm/field-view`);
  expect(widok.ok()).toBeTruthy();
  const pola = ((await widok.json()) as {
    fields: Array<{
      canonical_model: {
        runtime_state: unknown;
        base_model: { primary_devices: Array<{ switch_state?: Record<string, unknown> | null }> };
      };
    }>;
  }).fields;
  const stany = pola.flatMap((pole) =>
    pole.canonical_model.base_model.primary_devices
      .map((aparat) => aparat.switch_state)
      .filter((stan): stan is Record<string, unknown> => Boolean(stan)),
  );
  expect(stany.length, 'stacja B z wyłącznikami pól powinna nieść rekordy stanu łączników').toBeGreaterThan(0);
  for (const stan of stany) {
    expect(['zamkniety', 'otwarty']).toContain(stan.actual_state);
    for (const pole of ['control_mode', 'armed_for_close', 'armed_for_open', 'communication_ok']) {
      expect(stan[pole], `${pole} bez źródła runtime`).toBeNull();
    }
  }
  for (const pole of pola) expect(pole.canonical_model.runtime_state).toBeNull();

  // 2. Kanwa SLD → REALNY klik w aparat pola → szuflada → zakładka stanu.
  await otworzAplikacje(page, seed);
  const aparat = await aparatPola(page);
  // Hit-rect nadrzędnej grupy trafień leży nad symbolem (ten sam ref) — `force` pomija
  // wyłącznie sprawdzenie DOM-ancestry Playwrighta, klik jest realny (pełna sekwencja).
  await aparat.click({ force: true });
  const szuflada = page.getByTestId('sld-v2-detail-drawer');
  await expect(szuflada).toBeVisible({ timeout: 15000 });
  await page.getByTestId('sld-v2-detail-drawer-tab-state').click();
  const stanAparatu = page.getByTestId('drawer-apparatus-state');
  await expect(stanAparatu).toBeVisible();
  await expect(page.getByTestId('drawer-apparatus-communication')).toHaveText(BRAK_TELEMETRII);
  await expect(page.getByTestId('drawer-apparatus-control-mode')).toHaveText(BRAK_TELEMETRII);
  await expect(page.getByTestId('drawer-apparatus-actual-state')).toHaveText(BRAK_TELEMETRII);
  await expect(stanAparatu).not.toContainText('OK');
  await expect(stanAparatu).not.toContainText('LOKALNY');

  for (const [motyw, przyrostek] of [
    ['light_technical', 'light'],
    ['dark_scada', 'dark'],
  ] as const) {
    await ustawMotyw(page, motyw);
    await expect(stanAparatu).toBeVisible();
    await page.screenshot({
      path: path.join(OUTPUT_DIR, `dowod_stan-pola-brak-telemetrii_${przyrostek}.png`),
      fullPage: false,
    });
  }
});
