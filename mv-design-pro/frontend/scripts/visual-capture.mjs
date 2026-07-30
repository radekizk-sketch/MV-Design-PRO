/**
 * Harness zrzutowy (ZASADA NR 2) — buduje realny projekt na backendzie SQLite,
 * nawiguje po kluczowych powierzchniach i zapisuje PNG do docs/audit/visual/.
 *
 * Wymaga uruchomionych serwerów:
 *   backend  127.0.0.1:8000 (uvicorn, SQLite)
 *   frontend 127.0.0.1:5173 (vite dev:e2e)
 *
 * Build sieci portowany z e2e/critical-run-flow.spec.ts (kanoniczny flow).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const BACKEND = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const FRONTEND = process.env.PLAYWRIGHT_FRONTEND_URL ?? 'http://127.0.0.1:5173';
const PW_EXE = process.env.PW_EXE ?? '/opt/pw-browsers/chromium-1208/chrome-linux64/chrome';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CATALOG_VERSION = '2024.1';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../docs/audit/visual');
mkdirSync(OUT, { recursive: true });

let opCounter = 0;
const bind = (ns, id) => ({ catalog_namespace: ns, catalog_item_id: id, catalog_item_version: CATALOG_VERSION });

async function api(path, method = 'GET', body) {
  const res = await fetch(`${BACKEND}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return { ok: res.ok, status: res.status, json, text };
}

async function domainOp(caseId, name, payload) {
  const r = await api(`/api/cases/${caseId}/enm/domain-ops`, 'POST', {
    project_id: '', snapshot_base_hash: '',
    operation: { name, idempotency_key: `vis-${name}-${String(++opCounter).padStart(4, '0')}`, payload },
  });
  if (!r.ok || (r.json && r.json.error)) {
    console.log(`  ! domainOp ${name} -> status=${r.status} err=${r.json?.error ?? r.text?.slice(0,160)}`);
  }
  return r.json ?? {};
}

async function buildProject() {
  const suffix = Date.now().toString().slice(-4);
  const projectName = `E2E SLD ${suffix}`;
  const proj = await api('/api/projects', 'POST', {
    name: projectName, description: 'Render referencyjny ZASADA NR 2',
    mode: 'TO-BE', voltage_level_kv: 15.0, frequency_hz: 50.0,
  });
  const projectId = proj.json.id;
  const sc = await api('/api/study-cases', 'POST', {
    project_id: projectId, name: `ZWARCIOWY_MAKS ${suffix}`, description: '', config: {}, set_active: true,
  });
  const caseId = sc.json.id;
  console.log(`  project=${projectId} case=${caseId}`);

  // GPZ
  await domainOp(caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0, sk3_mva: 250.0, rx_ratio: 0.1, catalog_binding: bind('ZRODLO_SN', SOURCE_ID),
  });
  // Magistrala (3 segmenty kablowe)
  let op = {};
  for (const [idx, length] of [300, 250, 200].entries()) {
    op = await domainOp(caseId, 'continue_trunk_segment_sn', {
      segment: { rodzaj: 'KABEL', dlugosc_m: length, name: `Odcinek ${idx + 1}`, catalog_binding: bind('KABEL_SN', CABLE_ID) },
    });
  }
  const segRefs = op.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  // Stacja SN/nN
  op = await domainOp(caseId, 'insert_station_on_segment_sn', {
    segment_id: segRefs[segRefs.length - 1], station_type: 'B', insert_at: { value: 0.5 },
    station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    sn_fields: ['IN', 'OUT', 'FEEDER'],
    // B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
    field_apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
    transformer: { create: true, catalog_binding: bind('TRAFO_SN_NN', TRAFO_ID) },
  });
  const station = (op.snapshot?.substations ?? []).find((s) => s.ref_id.includes('/station'));
  const branchField = station?.meta?.field_specs?.find((f) =>
    String(f.field_role ?? f.bay_role ?? '').toUpperCase().includes('ODG') ||
    String(f.bay_role ?? '').toUpperCase() === 'FEEDER');
  if (branchField?.field_ref) {
    op = await domainOp(caseId, 'start_branch_segment_sn', {
      from_ref: `${branchField.field_ref}.BRANCH`,
      segment: { rodzaj: 'KABEL', dlugosc_m: 180, catalog_binding: bind('KABEL_SN', CABLE_ID) },
    });
  }
  for (const b of op.snapshot?.branches ?? []) {
    await domainOp(caseId, 'assign_catalog_to_element', { element_ref: b.ref_id, catalog_binding: bind('KABEL_SN', CABLE_ID) });
  }
  for (const t of op.snapshot?.transformers ?? []) {
    await domainOp(caseId, 'assign_catalog_to_element', { element_ref: t.ref_id, catalog_binding: bind('TRAFO_SN_NN', TRAFO_ID) });
    await domainOp(caseId, 'update_element_parameters', {
      element_ref: t.ref_id,
      parameters: { sn_mva: 0.63, uhv_kv: 15.0, ulv_kv: 0.4, uk_percent: 4.0, pk_kw: 6.5, vector_group: 'Dyn5', parameter_source: 'CATALOG' },
    });
  }
  // Readiness loop (domknięcie blokerów katalogowych/impedancyjnych)
  let readiness = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await api(`/api/cases/${caseId}/engineering-readiness`);
    readiness = r.json;
    if (readiness?.ready) break;
    for (const issue of (readiness?.issues ?? []).filter((i) => i.code?.includes('catalog') && i.element_ref)) {
      const ns = issue.code.includes('transformer') ? 'TRAFO_SN_NN' : 'KABEL_SN';
      const id = issue.code.includes('transformer') ? TRAFO_ID : CABLE_ID;
      await domainOp(caseId, 'assign_catalog_to_element', { element_ref: issue.element_ref, catalog_binding: bind(ns, id) });
    }
    for (const issue of (readiness?.issues ?? []).filter((i) => i.code === 'E005' && i.element_ref)) {
      await domainOp(caseId, 'update_element_parameters', {
        element_ref: issue.element_ref,
        parameters: { r_ohm_per_km: 0.253, x_ohm_per_km: 0.073, b_siemens_per_km: 0.26e-6, parameter_source: 'CATALOG' },
      });
    }
  }
  console.log(`  readiness.ready=${readiness?.ready} status=${readiness?.status}`);

  // Run SC_3F
  let runId = null;
  const createRun = await api(`/api/execution/study-cases/${caseId}/runs`, 'POST', { analysis_type: 'SC_3F' });
  if (createRun.ok) {
    runId = createRun.json.id;
    await api(`/api/execution/runs/${runId}/execute`, 'POST');
    // poll results index
    for (let i = 0; i < 30; i++) {
      const idx = await api(`/api/analysis-runs/${runId}/results/index`);
      if (idx.ok) break;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  console.log(`  runId=${runId}`);
  return { projectId, projectName, caseId, runId };
}

function seedScript(seed) {
  return (s) => {
    localStorage.setItem('mv-design-app-state', JSON.stringify({
      state: {
        activeProjectId: s.projectId, activeProjectName: s.projectName,
        activeCaseId: s.caseId, activeCaseName: 'ZWARCIOWY_MAKS',
        activeCaseKind: 'ShortCircuitCase', activeCaseResultStatus: s.runId ? 'FRESH' : 'NONE',
        activeSnapshotId: null, activeMode: 'RESULT_VIEW',
        activeRunId: s.runId, activeAnalysisType: 'SHORT_CIRCUIT',
        caseManagerOpen: false, issuePanelOpen: false,
      },
      version: 1,
    }));
  };
}

async function shoot(page, name, { wait = 2200, full = false } = {}) {
  // Czekaj na gotowość aplikacji (testid app-ready), tolerancyjnie.
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(wait);
  const path = resolve(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: full });
  const errs = page._capturedErrors ?? [];
  const crashed = await page.locator('text=Coś poszło nie tak').count().catch(() => 0);
  console.log(`  📸 ${name}.png  (console errors: ${errs.length}${crashed ? ', ⚠ ERROR BOUNDARY' : ''})`);
  return path;
}

async function main() {
  const seed = await buildProject();
  const browser = await chromium.launch({ executablePath: PW_EXE, headless: true, args: ['--no-sandbox'] });

  async function newCtx(width, height) {
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx.addInitScript(seedScript(seed), seed);
    const page = await ctx.newPage();
    page._capturedErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') page._capturedErrors.push(m.text()); });
    return { ctx, page };
  }

  // 1080p — główne powierzchnie
  {
    const { ctx, page } = await newCtx(1920, 1080);
    const runQ = seed.runId ? `?run=${seed.runId}` : '';
    const routes = [
      ['', 'sld_environment_results'],
      [`#analysis${runQ}`, 'analysis_surface'],
      [`#proof${runQ}`, 'proof_surface'],
      [`#results${runQ}`, 'results_surface'],
      ['#dashboard', 'dashboard'],
      ['#kreator-stacji-v2', 'station_wizard'],
    ];
    for (const [hash, name] of routes) {
      await page.goto(`${FRONTEND}/${hash}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      await shoot(page, name);
      // Detal kadru SLD w natywnej rozdzielczości (ocena kompozycji §7.3).
      if (name === 'sld_environment_results') {
        await page.waitForTimeout(800);
        await page.screenshot({
          path: resolve(OUT, 'sld_canvas_detail.png'),
          clip: { x: 300, y: 64, width: 1230, height: 980 },
        });
        console.log('  📸 sld_canvas_detail.png (clip)');
      }
    }
    // SLD z zaznaczonym obiektem (klik w środek płótna)
    await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const canvas = page.locator('[data-testid^="workspace-surface"], svg, canvas').first();
    try { await canvas.click({ position: { x: 400, y: 300 }, timeout: 5000 }); } catch { /* ignore */ }
    await shoot(page, 'sld_object_selected');
    await ctx.close();
  }

  // Laptop 1440×900 — app shell spójność
  {
    const { ctx, page } = await newCtx(1440, 900);
    await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await shoot(page, 'sld_environment_1440x900');
    await ctx.close();
  }

  await browser.close();
  console.log(`\nDONE → ${OUT}`);
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(1); });
