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

  const PV_ID = 'conv-pv-sma-1p5mw-15kv';
  const BESS_ID = 'bess_pcs_sma_2200';
  const newestStation = (o) => {
    const subs = (o.snapshot?.substations ?? []).filter((s) => s.ref_id.includes('/station'));
    return subs[subs.length - 1];
  };
  const feederRef = (station) => {
    const f = (station?.meta?.field_specs ?? []).find(
      (x) => String(x.bay_role ?? '').toUpperCase() === 'FEEDER' || String(x.field_role ?? '').toUpperCase().includes('ODG'),
    );
    return f?.field_ref ? `${f.field_ref}.BRANCH` : null;
  };
  const insertStation = async (segmentId, pos = 0.5) => {
    const o = await op(caseId, 'insert_station_on_segment_sn', {
      segment_id: segmentId, station_type: 'B', insert_at: { value: pos },
      station: { sn_voltage_kv: 15, nn_voltage_kv: 0.4 }, sn_fields: ['IN', 'OUT', 'FEEDER'],
      // B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
      field_apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
      transformer: { create: true, catalog_binding: bind('TRAFO_SN_NN', TRAFO_ID) },
    });
    if (!o.error) counts.station++;
    return o;
  };
  const addDer = async (station, tech, variant, catId) => {
    if (!station?.ref_id) return;
    void catId;
    // FALOWNIK/inv-pv-1500 = jedyny binding zgodny z trafo 630 kVA @ 0.4 kV
    // (warianty katalogowe PV/BESS są 1.65 MVA lub 0.69 kV → odrzucane).
    // source_technology steruje renderem (PV/BESS/FW), nie binding.
    const r = await op(caseId, 'add_converter_source', {
      source_technology: tech, connection_variant: variant, station_ref: station.ref_id,
      p_install_mw: 1.5, catalog_binding: bind('FALOWNIK', 'inv-pv-1500'),
    });
    if (!r.error) counts.der++;
    else counts.derFail = (counts.derFail ?? 0) + 1;
  };

  // (1) Stacje przelotowe na magistrali (re-fetch refs po każdym insertcie).
  const trunkStations = [];
  while (trunkStations.length < 12) {
    const enm = await api(`/api/cases/${caseId}/enm`);
    const corridor = enm.json?.corridors?.[0]?.ordered_segment_refs ?? [];
    if (!corridor.length) break;
    const pick = corridor[Math.min(corridor.length - 1, Math.floor(corridor.length * (0.3 + 0.5 * (trunkStations.length / 12))))];
    const o = await insertStation(pick);
    if (o.error) { const o2 = await insertStation(corridor[corridor.length - 1]); if (o2.error) break; trunkStations.push(newestStation(o2)); }
    else trunkStations.push(newestStation(o));
  }

  // (2) Laterale: z pola FEEDER każdej stacji magistrali → odgałęzienie + 2-3 stacje (DRZEWO).
  for (const ts of trunkStations) {
    if (counts.station >= TARGET_STATIONS) break;
    const fr = feederRef(ts);
    if (!fr) continue;
    const br = await op(caseId, 'start_branch_segment_sn', { from_ref: fr, segment: { rodzaj: 'KABEL', dlugosc_m: 180, catalog_binding: bind('KABEL_SN', CABLE_ID) } });
    if (br.error) continue;
    counts.branch++;
    // 2-3 stacje wzdłuż lateralu (re-fetch ref lateralu po każdym insertcie)
    const lateralStations = [];
    const want = 2 + (counts.branch % 2);
    for (let k = 0; k < want && counts.station < TARGET_STATIONS; k++) {
      const enm = await api(`/api/cases/${caseId}/enm`);
      // znajdź korytarz lateralu zawierający segment z brancha
      const corridors = enm.json?.corridors ?? [];
      const lateral = corridors[corridors.length - 1]?.ordered_segment_refs ?? [];
      if (!lateral.length) break;
      const o = await insertStation(lateral[lateral.length - 1], 0.5);
      if (o.error) break;
      lateralStations.push(newestStation(o));
    }
    // OZE na końcu niektórych lateralów: PV / BESS / FW naprzemiennie + mieszane
    const tip = lateralStations[lateralStations.length - 1];
    if (counts.branch % 3 === 1) await addDer(tip, 'PV', 'block_transformer', PV_ID);
    else if (counts.branch % 3 === 2) { await addDer(tip, 'BESS', 'block_transformer', BESS_ID); await addDer(tip, 'PV', 'block_transformer', PV_ID); } // mieszane
    else await addDer(tip, 'FW', 'block_transformer', PV_ID);
  }

  // (2b) Gwarantowany pas OZE na stacjach magistrali (V-10: PV/BESS/FW + mieszane).
  const reTrunk = (await api(`/api/cases/${caseId}/enm`)).json?.substations?.filter((s) => s.ref_id.includes('/station')) ?? [];
  const ozePlan = [['PV'], ['BESS'], ['FW'], ['PV', 'BESS'] /* mieszane */, ['PV'], ['BESS'], ['FW']];
  for (let i = 0; i < ozePlan.length && i * 6 < reTrunk.length; i++) {
    const st = reTrunk[Math.min(reTrunk.length - 1, 2 + i * 6)];
    for (const tech of ozePlan[i]) await addDer(st, tech, 'block_transformer', null);
  }

  // (3) Dobij stacje na magistrali do progu, jeśli laterale nie wystarczyły.
  let guard = 0;
  while (counts.station < TARGET_STATIONS && guard < 40) {
    guard++;
    const enm = await api(`/api/cases/${caseId}/enm`);
    const corridor = enm.json?.corridors?.[0]?.ordered_segment_refs ?? [];
    if (!corridor.length) break;
    const o = await insertStation(corridor[corridor.length - 1]);
    if (o.error) break;
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
  // Pomiar wypełnienia kadru (§7.3.1 ≥75%): union bbox elementów SLD vs obszar płótna.
  const fill = await page.evaluate(() => {
    // Największy SVG = płótno SLD.
    let svg = null, area = 0;
    document.querySelectorAll('svg').forEach((s) => {
      const r = s.getBoundingClientRect();
      if (r.width * r.height > area) { area = r.width * r.height; svg = s; }
    });
    if (!svg) return null;
    const vp = svg.getBoundingClientRect();
    const sel = '[data-element-id],[data-element-kind],[data-testid*="sld-v2-station"],[data-testid*="sld-v2-run"],[data-testid*="sld-v2-gpz"],[data-testid*="sld-v2-mini"]';
    const nodes = document.querySelectorAll(sel);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, n = 0;
    nodes.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      // tylko elementy w obrębie płótna
      if (r.right < vp.left || r.left > vp.right || r.bottom < vp.top || r.top > vp.bottom) return;
      minX = Math.min(minX, Math.max(r.left, vp.left)); minY = Math.min(minY, Math.max(r.top, vp.top));
      maxX = Math.max(maxX, Math.min(r.right, vp.right)); maxY = Math.max(maxY, Math.min(r.bottom, vp.bottom)); n++;
    });
    if (n === 0 || !isFinite(minX)) return { n, fillW: 0, fillH: 0, vp: { w: Math.round(vp.width), h: Math.round(vp.height) } };
    return {
      n,
      fillW: +(((maxX - minX) / vp.width) * 100).toFixed(1),
      fillH: +(((maxY - minY) / vp.height) * 100).toFixed(1),
      vp: { w: Math.round(vp.width), h: Math.round(vp.height) },
    };
  });
  console.log(`RENDER: errorBoundary=${crashed ? 'YES' : 'no'} consoleErrors=${errs.length}`);
  console.log(`FILL: ${JSON.stringify(fill)} (cel: fillW i fillH ≥ 75%)`);
  if (errs.length) console.log('  first errors:', errs.slice(0, 3));
  await browser.close();
  console.log(`DONE → ${OUT}`);
}
main().catch((e) => { console.error('GEN ERROR:', e); process.exit(1); });
