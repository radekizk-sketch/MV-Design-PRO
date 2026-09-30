/**
 * Karta KASACJA-SCL-I-CIM-KLIENT (decyzja K-14/D-41) — jeden eksport modelu sieci:
 * CGMES (IEC 61970 EQ+TP) budowany przez BACKEND.
 *
 * Ścieżka użytkownika NATYWNYMI klikami na realnym backendzie (reguła Zero-Debt
 * pkt 5 — żadnych syntetycznych zdarzeń): schemat → „Eksportuj schemat" →
 * „CGMES — model sieci (IEC 61970 EQ+TP)" → przeglądarka pobiera plik.
 * Sprawdzane:
 *   · plik to archiwum ZIP z profilami EQ i TP (+ side-car i manifest),
 *   · bajty pobrane przez przeglądarkę są IDENTYCZNE (SHA-256) z bajtami
 *     końcówki `GET /api/cases/{case_id}/enm/eksport-cgmes` wołanej wprost —
 *     klient niczego nie składa ani nie przerabia; dwa biegi końcówki dają ten
 *     sam SHA-256 (determinizm na żywym modelu),
 *   · nazwa pliku wg jednej konwencji, z rewizją modelu podaną przez serwer,
 *   · menu nie oferuje już klientowych SCD ani CIM (dokładnie 4 pozycje),
 *   · model niekompletny (projekt bez sieci) ⇒ nazwana odmowa serwera w
 *     powiadomieniu, zero pobranego pliku.
 * Zrzut otwartego menu trafia do katalogu wyników testu (`menu-eksportu.png`).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const FIELD_APPARATUS_ID = 'sw-cb-abb-vd4-17kv-630a';
const CATALOG_VERSION = '2024.1';

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
      operation: { name, idempotency_key: `e2e-cgmes-${name}-${String(++opCounter).padStart(4, '0')}`, payload },
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
  const projectName = `Eksport CGMES ${suffix}`;
  const caseName = `Wymiana modelu ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Eksport modelu sieci do CGMES',
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

async function pustaScena(request: APIRequestContext): Promise<Scena> {
  entityCounter += 1;
  const suffix = String(entityCounter).padStart(4, '0');
  const projectName = `Eksport CGMES pusty ${suffix}`;
  const caseName = `Bez sieci ${suffix}`;
  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: { name: projectName, description: '', mode: 'TO-BE', voltage_level_kv: 15.0, frequency_hz: 50.0 },
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
  return { projectId: project.id, projectName, caseId, caseName };
}

function sha256(dane: Buffer): string {
  return createHash('sha256').update(dane).digest('hex');
}

/** Nazwy członów archiwum ZIP z katalogu centralnego (bez zależności od biblioteki). */
function czlonyZip(dane: Buffer): string[] {
  const nazwy: string[] = [];
  for (let i = 0; i + 46 <= dane.length; i += 1) {
    if (dane.readUInt32LE(i) === 0x02014b50) {
      const dlugosc = dane.readUInt16LE(i + 28);
      nazwy.push(dane.subarray(i + 46, i + 46 + dlugosc).toString('utf8'));
    }
  }
  return nazwy;
}

async function otworzMenuEksportu(page: Page): Promise<void> {
  const toggle = page.getByTestId('sld-export-menu-toggle');
  if (!(await toggle.isVisible())) {
    await page.getByTestId('sld-v3-toolbar-menu-toggle').click();
  }
  await toggle.click();
  await expect(page.getByTestId('sld-export-menu-items')).toBeVisible();
}

test.describe('eksport-cgmes', () => {
  test('menu → CGMES → przeglądarka pobiera archiwum zbudowane przez backend', async ({ page, request }, testInfo) => {
    test.setTimeout(300000);
    const scena = await zbudujScene(request);
    await page.setViewportSize({ width: 1600, height: 900 });
    await otworzSchemat(page, scena);
    await otworzMenuEksportu(page);

    const pozycje = page.getByTestId('sld-export-menu-items').getByRole('menuitem');
    await expect(pozycje).toHaveCount(4);
    await expect(page.getByTestId('sld-export-format-cgmes')).toContainText('CGMES — model sieci (IEC 61970 EQ+TP)');
    await page.screenshot({ path: testInfo.outputPath('menu-eksportu.png') });

    const pobranie = page.waitForEvent('download', { timeout: 60000 });
    await page.getByTestId('sld-export-format-cgmes').click();
    const plik = await pobranie;
    const sciezka = await plik.path();
    expect(sciezka).not.toBeNull();
    const bajty = readFileSync(sciezka as string);

    expect(bajty.subarray(0, 2).toString('latin1')).toBe('PK');
    expect(czlonyZip(bajty)).toEqual(['EQ.xml', 'TP.xml', 'refmap.json', 'manifest.json']);

    const adres = `${BACKEND_BASE}/api/cases/${scena.caseId}/enm/eksport-cgmes`;
    const pierwszy = await request.get(adres, { timeout: 60000 });
    const drugi = await request.get(adres, { timeout: 60000 });
    expect(pierwszy.status()).toBe(200);
    expect(drugi.status()).toBe(200);
    const bajtyApi = await pierwszy.body();
    expect(sha256(await drugi.body())).toBe(sha256(bajtyApi));
    expect(sha256(bajty)).toBe(sha256(bajtyApi));

    const rewizja = pierwszy.headers()['x-model-rewizja'];
    const odcisk = pierwszy.headers()['x-model-odcisk'] ?? '';
    expect(plik.suggestedFilename()).toMatch(/^schemat-sld_Eksport_CGMES_\d{4}_Wymiana_modelu_\d{4}_rew\d+-[0-9a-f]{8}\.cgmes\.zip$/);
    expect(plik.suggestedFilename()).toContain(`_rew${rewizja}-${odcisk.slice(0, 8)}.cgmes.zip`);
  });

  test('model bez sieci ⇒ nazwana odmowa serwera, żaden plik nie jest pobierany', async ({ page, request }) => {
    test.setTimeout(300000);
    const scena = await pustaScena(request);
    const odpowiedz = await request.get(`${BACKEND_BASE}/api/cases/${scena.caseId}/enm/eksport-cgmes`);
    expect(odpowiedz.status()).toBe(422);
    const odmowa = ((await odpowiedz.json()) as { detail: string }).detail;
    expect(odmowa).toContain('Eksport CGMES wstrzymany — model sieci jest niekompletny');

    await page.setViewportSize({ width: 1600, height: 900 });
    let pobrano = false;
    page.on('download', () => {
      pobrano = true;
    });
    await otworzSchemat(page, scena);
    await otworzMenuEksportu(page);
    await page.getByTestId('sld-export-format-cgmes').click();

    await expect(page.getByText(`Eksport schematu: ${odmowa}`)).toBeVisible({ timeout: 30000 });
    expect(pobrano).toBe(false);
  });
});
