/**
 * B-2 — BUDOWA PARY POMIAROWEJ na ŻYWYM backendzie: sieć N stacji, migawka
 * PRZED, realna operacja `insert_station_on_segment_sn` na ŚRODKOWYM odcinku
 * magistrali, migawka PO (scenariusz audytu `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md`
 * §4.2). Wzorzec wywołań 1:1 z `scripts/generate-large-network.mjs` — realne
 * operacje domenowe, zero fabrykacji modelu.
 *
 * Wyjście (katalog `OUT`): `b2-przed.enm.json`, `b2-po.enm.json`,
 * `b2-odpowiedz.json` (wskazanie operacji + czas) — wejście dla
 * `scripts/pomiar_b2_kamera.tsx`.
 *
 * Uruchomienie (backend musi działać):
 *   BACKEND=http://127.0.0.1:8000 OUT=/tmp/b2 TARGET_STATIONS=50 node scripts/b2_zbuduj_pare.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const BACKEND = process.env.BACKEND ?? 'http://127.0.0.1:8037';
const OUT = process.env.OUT ?? '/tmp/b2';
mkdirSync(OUT, { recursive: true });

const CABLE_ID = 'cable-tfk-yakxs-3x120';
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const V = '2024.1';
const TARGET_STATIONS = Number(process.env.TARGET_STATIONS ?? 50);

const bind = (ns, id) => ({ catalog_namespace: ns, catalog_item_id: id, catalog_item_version: V });
let c = 0;

async function api(p, m = 'GET', b) {
  const r = await fetch(`${BACKEND}${p}`, {
    method: m,
    headers: { 'content-type': 'application/json' },
    body: b ? JSON.stringify(b) : undefined,
  });
  const t = await r.text();
  let j = null;
  try { j = t ? JSON.parse(t) : null; } catch { /* */ }
  return { ok: r.ok, status: r.status, json: j, text: t };
}

async function op(caseId, name, payload) {
  const r = await api(`/api/cases/${caseId}/enm/domain-ops`, 'POST', {
    project_id: '', snapshot_base_hash: '',
    operation: { name, idempotency_key: `b2-${name}-${++c}`, payload },
  });
  if (!r.ok || r.json?.error) return { error: r.json?.error ?? r.text?.slice(0, 200), snapshot: r.json?.snapshot };
  return r.json ?? {};
}

async function build() {
  const sfx = Date.now().toString().slice(-5);
  const pj = await api('/api/projects', 'POST', {
    name: `B2 kotwiczenie kamery ${sfx}`, description: 'Pomiar B-2', mode: 'TO-BE',
    voltage_level_kv: 15, frequency_hz: 50,
  });
  const projectId = pj.json.id;
  const sc = await api('/api/study-cases', 'POST', {
    project_id: projectId, name: 'B2_POMIAR', description: '', config: {}, set_active: true,
  });
  const caseId = sc.json.id;
  console.log(`project=${projectId} case=${caseId}`);

  const zr = await op(caseId, 'add_grid_source_sn', {
    voltage_kv: 15, sk3_mva: 250, rx_ratio: 0.1, catalog_binding: bind('ZRODLO_SN', SOURCE_ID),
  });
  if (zr.error) throw new Error(`add_grid_source_sn: ${zr.error}`);

  const TRUNK_SEGMENTS = 24;
  for (let i = 0; i < TRUNK_SEGMENTS; i += 1) {
    const o = await op(caseId, 'continue_trunk_segment_sn', {
      segment: {
        rodzaj: i % 5 === 4 ? 'NAPOWIETRZNA' : 'KABEL',
        dlugosc_m: 200 + (i % 4) * 60,
        name: `Magistrala ${i + 1}`,
        catalog_binding: bind('KABEL_SN', CABLE_ID),
      },
    });
    if (o.error) { console.log(`trunk ${i}: ${o.error}`); break; }
  }

  const insertStation = async (segmentId, pos = 0.5) => op(caseId, 'insert_station_on_segment_sn', {
    segment_id: segmentId, station_type: 'B', insert_at: { value: pos },
    station: { sn_voltage_kv: 15, nn_voltage_kv: 0.4 }, sn_fields: ['IN', 'OUT', 'FEEDER'],
    field_apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
    transformer: { create: true, catalog_binding: bind('TRAFO_SN_NN', TRAFO_ID) },
  });

  const feederRef = (station) => {
    const f = (station?.meta?.field_specs ?? []).find(
      (x) => String(x.bay_role ?? '').toUpperCase() === 'FEEDER'
        || String(x.field_role ?? '').toUpperCase().includes('ODG'),
    );
    return f?.field_ref ? `${f.field_ref}.BRANCH` : null;
  };
  const newestStation = (o) => {
    const subs = (o.snapshot?.substations ?? []).filter((s) => s.ref_id.includes('/station'));
    return subs[subs.length - 1];
  };

  const liczStacje = async () => {
    const enm = await api(`/api/cases/${caseId}/enm`);
    return (enm.json?.substations ?? []).filter((s) => s.ref_id.includes('/station')).length;
  };

  // (1) Stacje przelotowe magistrali.
  const trunkStations = [];
  while (trunkStations.length < 14) {
    const enm = await api(`/api/cases/${caseId}/enm`);
    const corridor = enm.json?.corridors?.[0]?.ordered_segment_refs ?? [];
    if (!corridor.length) break;
    const idx = Math.min(corridor.length - 1, Math.floor(corridor.length * (0.2 + 0.6 * (trunkStations.length / 14))));
    const o = await insertStation(corridor[idx]);
    if (o.error) {
      const o2 = await insertStation(corridor[corridor.length - 1]);
      if (o2.error) break;
      trunkStations.push(newestStation(o2));
    } else trunkStations.push(newestStation(o));
  }
  console.log(`magistrala: ${trunkStations.length} stacji, razem ${await liczStacje()}`);

  // (2) Laterale z pól FEEDER + stacje na nich.
  let branches = 0;
  for (const ts of trunkStations) {
    if ((await liczStacje()) >= TARGET_STATIONS) break;
    const fr = feederRef(ts);
    if (!fr) continue;
    const br = await op(caseId, 'start_branch_segment_sn', {
      from_ref: fr,
      segment: { rodzaj: 'KABEL', dlugosc_m: 180, catalog_binding: bind('KABEL_SN', CABLE_ID) },
    });
    if (br.error) continue;
    branches += 1;
    const want = 2 + (branches % 2);
    for (let k = 0; k < want; k += 1) {
      if ((await liczStacje()) >= TARGET_STATIONS) break;
      const enm = await api(`/api/cases/${caseId}/enm`);
      const corridors = enm.json?.corridors ?? [];
      const lateral = corridors[corridors.length - 1]?.ordered_segment_refs ?? [];
      if (!lateral.length) break;
      const o = await insertStation(lateral[lateral.length - 1], 0.5);
      if (o.error) break;
    }
  }
  const stacje = await liczStacje();
  console.log(`sieć gotowa: ${stacje} stacji, ${branches} lateralów`);

  // ---- PARA POMIAROWA: snapshot PRZED + operacja + snapshot PO --------------
  const przedResp = await api(`/api/cases/${caseId}/enm`);
  const przed = przedResp.json;
  const corridor = przed?.corridors?.[0]?.ordered_segment_refs ?? [];
  if (!corridor.length) throw new Error('brak korytarza magistrali');
  const srodkowy = corridor[Math.floor(corridor.length / 2)];
  console.log(`odcinek środkowy magistrali: ${srodkowy} (z ${corridor.length})`);

  const t0 = Date.now();
  const odpowiedz = await insertStation(srodkowy, 0.5);
  const trwanie = Date.now() - t0;
  if (odpowiedz.error) throw new Error(`insert_station_on_segment_sn: ${odpowiedz.error}`);

  const poResp = await api(`/api/cases/${caseId}/enm`);
  const po = poResp.json;

  writeFileSync(`${OUT}/b2-przed.enm.json`, JSON.stringify({ enm: przed }, null, 0));
  writeFileSync(`${OUT}/b2-po.enm.json`, JSON.stringify({ enm: po }, null, 0));
  writeFileSync(`${OUT}/b2-odpowiedz.json`, JSON.stringify({
    selection_hint: odpowiedz.selection_hint ?? null,
    changes: odpowiedz.changes ?? null,
    trwanie_ms: trwanie,
    segment_srodkowy: srodkowy,
  }, null, 2));

  console.log(JSON.stringify({
    stacje_przed: (przed?.substations ?? []).length,
    stacje_po: (po?.substations ?? []).length,
    galezie_przed: (przed?.branches ?? []).length,
    galezie_po: (po?.branches ?? []).length,
    selection_hint: odpowiedz.selection_hint ?? null,
    created_element_ids: odpowiedz.changes?.created_element_ids ?? null,
    trwanie_ms: trwanie,
  }, null, 2));
}

build().catch((e) => { console.error('BŁĄD:', e.message); process.exit(1); });
