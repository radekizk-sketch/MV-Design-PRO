/**
 * W5-E-TTIT — ochrona przeciwporażeniowa w układzie TT sieci nN na ŻYWEJ aplikacji
 * (real backend, kliki NATYWNE — zero dispatchEvent).
 *
 * Łańcuch: GPZ → magistrala SN → stacja SN/nN z układem TT (punkt neutralny nN uziemiony
 * bezpośrednio, R_B z danych) → odpływ nN z aparatem i wyłącznikiem różnicowoprądowym
 * z katalogu → odbiór nN z uziomem instalacji R_A → schemat → portal projekcji nN →
 * panel odpływu z werdyktem SWZ wyjaśnialnym (wielkość, kryterium, podstawa i jej stan,
 * margines albo brak podstawy).
 *
 * Dwie fazy tego samego przejścia (zmienna `W5E_FAZA`):
 *  - `przed` — stan bazy sprzed karty: TT daje „nie dotyczy" bez fizyki i bez werdyktu;
 *    spec robi WYŁĄCZNIE zrzuty (dowód stanu wyjściowego, oba motywy);
 *  - `po` (domyślna) — stan po karcie: werdykt wyjaśnialny na panelu odpływu, zrzuty
 *    i asercje kontraktu DOM.
 *
 * Zrzuty: `docs/audit/visual/w5e_ttit/<kadr>_<faza>_<motyw>.png`. Werdykt wizualny
 * należy do właściciela (zasada nr 2 CLAUDE.md) — spec dowodzi treści DOM, nie jakości.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bramkaTresciMatematycznej } from './trescMatematyczna';
import { katalogZrzutow } from './katalogZrzutow';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = katalogZrzutow(path.resolve(_dirname, '../../docs/audit/visual/w5e_ttit'));
const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const FAZA: 'przed' | 'po' = process.env.W5E_FAZA === 'przed' ? 'przed' : 'po';
const MOTYWY = ['light', 'dark'] as const;

const CABLE_ID = 'cable-tfk-yakxs-3x120';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
const APARAT_NN_ID = 'cb_nn_630a';
const RCD_ID = 'rcd_nn_a_40a_30ma';
const ODBIOR_ID = 'load_mieszk_15kw';
const CATALOG_VERSION = '2024.1';
/**
 * Tolerancja napięcia sieci nN stacji (PN-EN 60038: +10 %, domyślna kreatora stacji). Wiersz nN
 * tabeli 1 IEC 60909-0 dobiera z niej c_min/c_max pętli zwarcia TT — sieć bez deklaracji dostaje
 * odmowę nazwaną, nie ciche +6 %.
 */
const TOLERANCJA_NN = 'PLUS_10';
/** Dane projektowe uziemień (wejście projektanta, nie fizyka). */
const R_B_OHM = 2.0;
const R_A_OHM = 25.0;

let opCounter = 0;
let entityCounter = 0;

type Snapshot = {
  corridors?: Array<{ ordered_segment_refs?: string[] }>;
  buses?: Array<{ ref_id: string; voltage_kv: number }>;
  substations?: Array<{ ref_id: string; station_type?: string; bus_refs?: string[] }>;
  transformers?: Array<{ ref_id: string; lv_earthing_system?: string | null; lv_voltage_tolerance?: string | null; lv_neutral?: { type: string; r_ohm?: number | null } | null }>;
  loads?: Array<{ ref_id: string; earth_electrode_r_ohm?: number | null }>;
  branches?: Array<{ ref_id: string; catalog_namespace?: string | null }>;
};
type DomainOpResponse = { error?: string | null; snapshot?: Snapshot; changes?: { created_element_ids?: string[] } };

function buildCatalogBinding(catalogNamespace: string, catalogItemId: string) {
  return { catalog_namespace: catalogNamespace, catalog_item_id: catalogItemId, catalog_item_version: CATALOG_VERSION };
}

async function executeDomainOp(request: APIRequestContext, caseId: string, name: string, payload: Record<string, unknown>): Promise<DomainOpResponse> {
  const response = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: { name, idempotency_key: `e2e-w5e-ttit-${name}-${String(++opCounter).padStart(4, '0')}`, payload },
    },
  });
  expect(response.ok(), `${name}: HTTP ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null, `${name}: błąd operacji`).toBeNull();
  return body;
}

async function zbudujSiecTt(request: APIRequestContext) {
  entityCounter += 1;
  const suffix = String(entityCounter).padStart(4, '0');
  const projectName = `TT nN ${FAZA} ${suffix}`;
  const caseName = `Przypadek TT ${suffix}`;
  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: { name: projectName, description: 'Łańcuch nN w układzie TT', mode: 'TO-BE', voltage_level_kv: 15.0, frequency_hz: 50.0 },
  });
  expect(projectResponse.ok()).toBeTruthy();
  const project = (await projectResponse.json()) as { id: string };
  const caseResponse = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: project.id, name: caseName, description: '', config: {}, set_active: true },
  });
  expect(caseResponse.ok()).toBeTruthy();
  const studyCase = (await caseResponse.json()) as { id: string };
  const caseId = studyCase.id;

  await executeDomainOp(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0, sk3_mva: 250.0, rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID), hv_voltage_kv: 110.0, transformer_sn_mva: 25.0,
  });
  let op: DomainOpResponse | null = null;
  for (const [idx, length] of [300, 250].entries()) {
    op = await executeDomainOp(request, caseId, 'continue_trunk_segment_sn', {
      segment: { rodzaj: 'KABEL', dlugosc_m: length, name: `Odcinek ${idx + 1}`, catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID) },
    });
  }
  const segmentRefs = op?.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(segmentRefs.length).toBeGreaterThan(0);

  // Stacja SN/nN w układzie TT: punkt neutralny nN uziemiony bezpośrednio z rezystancją
  // uziomu R_B (dana projektowa). W fazie „przed" backend przyjmuje układ TT, ale nie liczy
  // dla niego fizyki.
  op = await executeDomainOp(request, caseId, 'insert_station_on_segment_sn', {
    field_apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
    segment_id: segmentRefs[segmentRefs.length - 1],
    station_type: 'B',
    insert_at: { value: 0.5 },
    station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    sn_fields: ['IN', 'OUT', 'FEEDER', 'TR'],
    transformer: { create: true, catalog_binding: buildCatalogBinding('TRAFO_SN_NN', TRAFO_ID) },
    nn_earthing: {
      lv_system: 'TT', neutral_point: 'directly_grounded', lv_r_ohm: R_B_OHM,
      lv_voltage_tolerance: TOLERANCJA_NN,
    },
  });
  const napiecia = new Map((op.snapshot?.buses ?? []).map((bus) => [bus.ref_id, bus.voltage_kv]));
  const stacja = (op.snapshot?.substations ?? []).find(
    (s) => s.station_type !== 'gpz' && (s.bus_refs ?? []).some((ref) => (napiecia.get(ref) ?? Infinity) < 1.0),
  );
  expect(stacja, 'stacja SN/nN z szyną nN').toBeTruthy();
  const szynaNn = (stacja?.bus_refs ?? []).find((ref) => (napiecia.get(ref) ?? Infinity) < 1.0)!;
  const trafo = (op.snapshot?.transformers ?? []).find((t) => t.lv_earthing_system === 'TT');
  expect(trafo, 'transformator stacji deklaruje układ TT').toBeTruthy();
  expect(trafo?.lv_voltage_tolerance, 'transformator stacji deklaruje tolerancję sieci nN').toBe(TOLERANCJA_NN);

  const pole = await executeDomainOp(request, caseId, 'add_nn_outgoing_field', {
    station_ref: stacja?.ref_id, bus_nn_ref: szynaNn, field_name: 'Odpływ nN 1',
    catalog_binding: buildCatalogBinding('APARAT_NN', APARAT_NN_ID),
  });
  const feederRef = pole.changes?.created_element_ids?.[0];
  expect(feederRef, 'pole odpływowe nN utworzone').toBeTruthy();

  const odbiorPayload: Record<string, unknown> = {
    feeder_ref: feederRef, active_power_kw: 15.0, cos_phi: 0.95, load_name: 'Gospodarstwo TT',
    catalog_binding: buildCatalogBinding('OBCIAZENIE', ODBIOR_ID),
  };
  if (FAZA === 'po') odbiorPayload.earth_electrode_r_ohm = R_A_OHM;
  const odbior = await executeDomainOp(request, caseId, 'add_nn_load', odbiorPayload);

  if (FAZA === 'po') {
    // Wyłącznik różnicowoprądowy z katalogu w torze zasilania instalacji odbioru.
    const odbiorRef = odbior.snapshot?.loads?.find((l) => l.earth_electrode_r_ohm === R_A_OHM)?.ref_id;
    expect(odbiorRef, 'odbiór nN niesie R_A').toBeTruthy();
    // Operacja `add_nn_rcd` (W5-E-TTIT): RCD jako aparat w torze przed zaciskami instalacji
    // odbioru — wskazuje się ODBIÓR, którego instalację chroni (nie odcinek).
    const rcd = await executeDomainOp(request, caseId, 'add_nn_rcd', {
      load_ref: odbiorRef, name: 'RCD gospodarstwa',
      catalog_binding: buildCatalogBinding('APARAT_NN_RCD', RCD_ID),
    });
    expect(rcd.changes?.created_element_ids?.length ?? 0).toBeGreaterThan(0);
  }

  // Korzeń odpływu (aparat pola) wg KONTRAKTU projekcji nN — ten sam ref, którym kanwa
  // znakuje węzeł (`lv-domain-node-<ref>`); `created_element_ids` pola to identyfikator
  // specyfikacji pola, nie gałęzi aparatu. Tylko faza „po" klika odpływ (w bazie trasa
  // projekcji z „/" w referencji stacji odpowiadała 404 — defekt naprawiony tą kartą).
  let feederRootRef: string | undefined = String(feederRef);
  if (FAZA === 'po') {
    const projekcja = await request.get(
      `${BACKEND_BASE}/api/cases/${caseId}/enm/lv-domain/${encodeURIComponent(stacja!.ref_id)}/projection/v1`,
    );
    expect(projekcja.ok(), `projekcja nN: HTTP ${projekcja.status()}`).toBeTruthy();
    const swzSnapshot = ((await projekcja.json()) as { swz_snapshot?: { transformers?: Array<{ feeders?: Array<{ feeder_root_branch_ref: string }> }> } }).swz_snapshot;
    feederRootRef = swzSnapshot?.transformers?.flatMap((t) => t.feeders ?? [])[0]?.feeder_root_branch_ref;
    expect(feederRootRef, 'korzeń odpływu nN w projekcji').toBeTruthy();
  }

  return { projectId: project.id, projectName, caseId, caseName, stationRef: stacja!.ref_id, feederRef: String(feederRootRef) };
}

async function otworzSchemat(page: Page, seed: Awaited<ReturnType<typeof zbudujSiecTt>>, motyw: 'light' | 'dark'): Promise<void> {
  await page.addInitScript((s) => {
    localStorage.setItem('mv-design-app-state', JSON.stringify({
      state: {
        activeProjectId: s.projectId, activeProjectName: s.projectName, activeCaseId: s.caseId, activeCaseName: s.caseName,
        activeCaseKind: 'ShortCircuitCase', activeCaseResultStatus: 'NONE', activeSnapshotId: null, activeMode: 'MODEL_EDIT',
        activeAnalysisType: 'SHORT_CIRCUIT', caseManagerOpen: false, issuePanelOpen: false,
      },
      version: 1,
    }));
    // Słownik motywu powłoki (`ui2/theme/themeMode.ts`): wartość spoza niego = motyw domyślny
    // (ciemny) — wcześniejsze `light`/`dark` dawały dwa ciemne kadry.
    localStorage.setItem('mvd-theme-mode', JSON.stringify({ state: { mode: s.motyw === 'light' ? 'light_technical' : 'dark_scada' }, version: 0 }));
  }, { ...seed, motyw });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 60000 });
  await page.getByRole('button', { name: 'Schemat (SLD)' }).first().click();
  await expect(page.locator('svg[data-testid="sld-canvas-v3"]')).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(800);
}

async function otworzPortalNn(page: Page): Promise<void> {
  const portal = page.locator('[data-testid="sld-v3-symbols"] [data-symbol-canon="lvPortal"]').first();
  await expect(portal).toBeVisible({ timeout: 30000 });
  const box = await portal.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  // Faza „przed" (baza `f3c435b6`): projekcja stacji z „/" w referencji odpowiadała 404 — portal
  // pokazywał błąd. Kadr bazy utrwala TEN stan (dowód defektu naprawionego kartą), faza „po"
  // wymaga widoku domeny.
  const oczekiwany = FAZA === 'przed'
    ? page.locator('[data-testid="lv-domain-view-root"], [data-testid="lv-domain-portal-error"]').first()
    : page.getByTestId('lv-domain-view-root');
  await expect(oczekiwany).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(500);
}

async function zrzut(page: Page, kadr: string, motyw: string): Promise<void> {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outPath = path.join(OUTPUT_DIR, `${kadr}_${FAZA}_${motyw}.png`);
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`Saved: ${outPath}`);
}

for (const motyw of MOTYWY) {
  test(`łańcuch nN w układzie TT — faza ${FAZA} — motyw ${motyw}`, async ({ page, request }) => {
    test.setTimeout(300000);
    const seed = await zbudujSiecTt(request);
    await otworzSchemat(page, seed, motyw);
    await otworzPortalNn(page);

    if (FAZA === 'przed' && (await page.getByTestId('lv-domain-portal-error').count()) > 0) {
      await expect(page.getByTestId('lv-domain-portal-error')).toContainText('Not Found');
      await zrzut(page, '01_projekcja_nn_nakladka_swz', motyw);
      return;
    }

    // Nakładka SWZ na projekcji nN.
    await page.getByTestId('lv-domain-overlay-swz').click();
    await page.waitForTimeout(300);
    await zrzut(page, '01_projekcja_nn_nakladka_swz', motyw);

    const status = page.getByTestId('lv-domain-overlay-status');
    if (FAZA === 'przed') {
      // Stan bazy: układ TT nie ma fizyki — nakładka SWZ nie ma czego pokazać.
      await expect(status).toContainText('brak wyniku');
      await expect(page.getByTestId('lv-domain-feeder-panel')).toHaveCount(0);
      return;
    }

    await expect(status).toContainText('SWZ');
    // Klik NATYWNY w aparat korzenia odpływu otwiera panel odpływu z werdyktem.
    const aparat = page.locator(`[data-testid="lv-domain-node-${seed.feederRef}"]`);
    await expect(aparat).toBeVisible();
    // Klik w ETYKIETĘ aparatu (namalowany tekst) — środek pudełka całej grupy SVG może
    // wypaść w pustym polu między symbolem a etykietą, gdzie zdarzenie nie trafia w `<g>`.
    const etykieta = aparat.locator('text').first();
    await expect(etykieta).toBeVisible();
    const box = await etykieta.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + Math.min(10, box!.width / 2), box!.y + box!.height / 2);
    const panel = page.getByTestId('lv-domain-feeder-panel');
    await expect(panel).toBeVisible();
    const werdykt = panel.getByTestId('lv-domain-feeder-werdykt-tt-it');
    await expect(werdykt).toBeVisible();
    // Kontrakt werdyktu wyjaśnialnego: kryterium czasu wyłączenia RCD ma wynik, limit
    // z tabeli repo i stan źródła; kryterium napięcia dotykowego nie ma podstawy.
    await expect(werdykt).toContainText('Brak zweryfikowanej podstawy wymagania');
    await expect(werdykt).toContainText('Tab. 41.1');
    await expect(werdykt).toContainText('IEC 60364-4-41');
    await expect(panel.getByTestId('lv-domain-feeder-werdykt-tt-it-limit')).toContainText('swz.limit_tt_it_brak_tekstu_normy');
    await bramkaTresciMatematycznej(page, '[data-testid="lv-domain-feeder-panel"]');
    // Kadr do oceny właściciela (B-02): rekord werdyktu w polu widzenia panelu.
    await werdykt.scrollIntoViewIfNeeded();
    await zrzut(page, '02_panel_odplywu_werdykt_tt', motyw);
  });
}
