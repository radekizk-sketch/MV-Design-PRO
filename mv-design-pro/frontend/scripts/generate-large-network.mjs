/**
 * Generator sieci testowej ≥ 50 stacji (V-09) + render SLD na realnej skali.
 * Buduje proceduralnie: GPZ → długa magistrala → wiele stacji → odgałęzienia →
 * OZE (PV/BESS/FW + mieszane) → run SC. Zapisuje zrzuty do docs/audit/visual/.
 *
 * Wymaga uruchomionych serwerów (backend :8000 SQLite, frontend :5173).
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
const V = '2024.1';
const TARGET_STATIONS = Number(process.env.TARGET_STATIONS ?? 52);

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/audit/visual');
mkdirSync(OUT, { recursive: true });
const bind = (ns, id) => ({ catalog_namespace: ns, catalog_item_id: id, catalog_item_version: V });
let c = 0;
const counts = { station: 0, branch: 0, der: 0, segment: 0, op_fail: 0 };

async function api(p, m = 'GET', b) {
  const r = await fetch(`${BACKEND}${p}`, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch { /* */ }
  return { ok: r.ok, status: r.status, json: j, text: t };
}
async function op(caseId, name, payload) {
  const r = await api(`/api/cases/${caseId}/enm/domain-ops`, 'POST', {
    project_id: '', snapshot_base_hash: '', operation: { name, idempotency_key: `g-${name}-${++c}`, payload },
  });
  if (!r.ok || r.json?.error) { counts.op_fail++; return { error: r.json?.error ?? r.text?.slice(0, 120), snapshot: r.json?.snapshot }; }
  return r.json ?? {};
}
const segRefs = (o) => o.snapshot?.corridors?.flatMap((c) => c.ordered_segment_refs ?? []) ?? [];

async function build() {
  const sfx = Date.now().toString().slice(-4);
  const pj = await api('/api/projects', 'POST', { name: `E2E DUŻA SIEĆ ${sfx}`, description: 'V-09 ≥50 stacji', mode: 'TO-BE', voltage_level_kv: 15, frequency_hz: 50 });
  const projectId = pj.json.id;
  const sc = await api('/api/study-cases', 'POST', { project_id: projectId, name: 'ZWARCIOWY_MAKS', description: '', config: {}, set_active: true });
  const caseId = sc.json.id;
  console.log(`project=${projectId} case=${caseId}`);

  await op(caseId, 'add_grid_source_sn', { voltage_kv: 15, sk3_mva: 250, rx_ratio: 0.1, catalog_binding: bind('ZRODLO_SN', SOURCE_ID) });

  // Magistrala główna: wiele segmentów kablowych.
  let last = {};
  const TRUNK_SEGMENTS = 22;
  for (let i = 0; i < TRUNK_SEGMENTS; i++) {
    last = await op(caseId, 'continue_trunk_segment_sn', {
      segment: { rodzaj: i % 5 === 4 ? 'NAPOWIETRZNA' : 'KABEL', dlugosc_m: 200 + (i % 4) * 60, name: `Magistrala ${i + 1}`, catalog_binding: bind('KABEL_SN', CABLE_ID) },
    });
    counts.segment++;
  }

  const insertStation = async (segmentId) => {
    const o = await op(caseId, 'insert_station_on_segment_sn', {
      segment_id: segmentId, station_type: 'B', insert_at: { value: 0.5 },
      station: { sn_voltage_kv: 15, nn_voltage_kv: 0.4 }, sn_fields: ['IN', 'OUT', 'FEEDER'],
      transformer: { create: true, catalog_binding: bind('TRAFO_SN_NN', TRAFO_ID) },
    });
    if (!o.error) counts.station++;
    return o;
  };

  // Stacje: wstawiaj na ŚWIEŻO odczytanym ostatnim segmencie korytarza (insert
  // dzieli segment → ref się zmienia, więc re-fetch po każdym wstawieniu).
  let guard = 0;
  while (counts.station < TARGET_STATIONS && guard < TARGET_STATIONS + 20) {
    guard++;
    const enm = await api(`/api/cases/${caseId}/enm`);
    const corridor = enm.json?.corridors?.[0]?.ordered_segment_refs ?? [];
    if (corridor.length === 0) break;
    // wybierz segment ~co drugi, by rozłożyć stacje wzdłuż magistrali
    const pick = corridor[Math.min(corridor.length - 1, Math.floor(corridor.length * 0.6))];
    const o = await insertStation(pick);
    if (o.error) {
      // fallback: spróbuj ostatni segment
      const o2 = await insertStation(corridor[corridor.length - 1]);
      if (o2.error) break;
    }
    // co 5 stacji — odgałęzienie z pola FEEDER + stacja na nim
    if (counts.station % 5 === 0) {
      const sub = (o.snapshot?.substations ?? []).find((s) => s.ref_id.includes('/station'));
      const bf = sub?.meta?.field_specs?.find((f) => String(f.bay_role ?? '').toUpperCase() === 'FEEDER');
      if (bf?.field_ref) {
        const br = await op(caseId, 'start_branch_segment_sn', { from_ref: `${bf.field_ref}.BRANCH`, segment: { rodzaj: 'KABEL', dlugosc_m: 160, catalog_binding: bind('KABEL_SN', CABLE_ID) } });
        if (!br.error) {
          counts.branch++;
          const bs = segRefs(br);
          if (bs.length) await insertStation(bs[bs.length - 1]);
        }
      }
    }
  }

  // OZE: PV przez trafo, BESS, FW, mieszane (add_converter_source na wybranych polach).
  // Próba na kilku polach wytwórczych — różne tryby.
  const enm = await api(`/api/cases/${caseId}/enm`);
  const subs = enm.json?.substations ?? [];
  let derModes = [['PV', 'pv'], ['BESS', 'bess'], ['FW', 'wind'], ['PV', 'pv'], ['BESS', 'bess']];
  let di = 0;
  for (const s of subs.slice(0, 8)) {
    const fields = s.meta?.field_specs ?? [];
    const feeder = fields.find((f) => String(f.bay_role ?? '').toUpperCase() === 'FEEDER');
    if (!feeder?.field_ref) continue;
    const [kind] = derModes[di % derModes.length]; di++;
    const r = await op(caseId, 'add_converter_source', {
      attach_to_ref: `${feeder.field_ref}.BRANCH`,
      source_kind: kind, p_install_mw: 1.5, voltage_kv: 0.4,
      via_transformer: kind !== 'FW',
      catalog_binding: bind('ZRODLO_SN', SOURCE_ID),
    });
    if (!r.error) counts.der++;
    if (counts.der >= 5) break;
  }

  // Run SC (best-effort).
  let runId = null;
  const cr = await api(`/api/execution/study-cases/${caseId}/runs`, 'POST', { analysis_type: 'SC_3F' });
  if (cr.ok) { runId = cr.json.id; await api(`/api/execution/runs/${runId}/execute`, 'POST'); }

  console.log('COUNTS:', JSON.stringify(counts), 'runId=', runId);
  return { projectId, projectName: pj.json.name, caseId, runId };
}

async function main() {
  const seed = await build();
  const browser = await chromium.launch({ executablePath: PW_EXE, headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
  await ctx.addInitScript((s) => {
    localStorage.setItem('mv-design-app-state', JSON.stringify({ state: {
      activeProjectId: s.projectId, activeProjectName: s.projectName, activeCaseId: s.caseId,
      activeCaseName: 'ZWARCIOWY_MAKS', activeCaseKind: 'ShortCircuitCase', activeCaseResultStatus: s.runId ? 'FRESH' : 'NONE',
      activeSnapshotId: null, activeMode: 'MODEL_EDIT', activeRunId: s.runId, activeAnalysisType: 'SHORT_CIRCUIT',
      caseManagerOpen: false, issuePanelOpen: false }, version: 1 }));
  }, seed);
  const page = await ctx.newPage();
  const errs = []; page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await page.screenshot({ path: resolve(OUT, 'sld_large_network.png') });
  await page.screenshot({ path: resolve(OUT, 'sld_large_network_canvas.png'), clip: { x: 300, y: 64, width: 1230, height: 980 } });
  const crashed = await page.locator('text=Coś poszło nie tak').count().catch(() => 0);
  console.log(`RENDER: errorBoundary=${crashed ? 'YES' : 'no'} consoleErrors=${errs.length}`);
  if (errs.length) console.log('  first errors:', errs.slice(0, 3));
  await browser.close();
  console.log(`DONE → ${OUT}`);
}
main().catch((e) => { console.error('GEN ERROR:', e); process.exit(1); });
