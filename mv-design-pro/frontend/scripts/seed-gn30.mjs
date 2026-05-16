#!/usr/bin/env node
/**
 * GN30 reference network seeder — K30 SCADA-CAD grade target.
 *
 * Buduje sieć K30: 2 GPZ + 30 stacji unique config (każda z innym
 * OZE/odbiór/connection_variant) zgodnie z PROMPT_K30_E2E_FULL_AUDIT_10_10.md
 * § 2.1. K30 = K20 (S02-S21) + 9 nowych konfiguracji (S22-S30).
 *
 * USAGE: node scripts/seed-gn30.mjs
 * REQUIRES: backend at BACKEND_URL (default http://127.0.0.1:8000)
 *
 * OUTPUT: JSON summary stations/DER/loads PASS/FAIL + projectId/caseId
 * dla downstream audit loop scripts (k30_audit2_seed + k30_setpoints +
 * screenshot-k30).
 *
 * UWAGA: jeśli backend nie wspiera ring main domain-op, K30 stosuje
 * dwa osobne trunki SN (jeden z każdego GPZ) i dokumentuje gap w REPORT.md.
 */

const BACKEND = process.env.BACKEND_URL ?? 'http://127.0.0.1:8000';

async function api(method, path, body) {
  const res = await fetch(BACKEND + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, ok: res.ok, json };
}

function log(step, msg, data) {
  const line = `[${step}] ${msg}`;
  console.log(line);
  if (data !== undefined) {
    console.log('    ', JSON.stringify(data).slice(0, 200));
  }
}

/**
 * STATION_CONFIGS — 30 unique stacji per PROMPT_K30 § 2.1 macierz.
 *
 * S02-S21: identyczne jak K20 (21 stacji reused, audit continuity).
 * S22-S30: 9 nowych konfiguracji rozszerzających K30.
 *
 * Pole feeder_source: 'A' (GPZ-A trunk) lub 'B' (GPZ-B trunk).
 * Pierwsza połowa stacji idzie z GPZ-A, druga z GPZ-B (ring N-1 surrogate
 * gdy backend nie wspiera ring main domain-op).
 */
const STATION_CONFIGS = [
  // === K20 inheritance (S02-S21) ===
  { id: 'S02', name: 'Stacja S02 ZKSN prosument PV', station_type: 'inline', der: [{ kind: 'PV', p_mw: 0.05 }], feeder_source: 'A', description: 'Słupowa ZKSN, PV prosument 50 kW' },
  { id: 'S03', name: 'Stacja S03 ZKSN bytowa 3 odpływy', station_type: 'inline', nn_feeders: [
    { p_kw: 30, kind: 'bytowy', label: 'Odpływ bytowy 1' },
    { p_kw: 25, kind: 'bytowy', label: 'Odpływ bytowy 2' },
    { p_kw: 40, kind: 'komunalny', label: 'Odpływ uliczny LED' },
  ], feeder_source: 'A', description: 'Słupowa ZKSN, 3 odpływy nN demonstrujące K30-25 multi-feeder' },
  { id: 'S04', name: 'Stacja S04 K PV+przemysł', station_type: 'inline', der: [{ kind: 'PV', p_mw: 0.5 }], load: { p_kw: 100, kind: 'przemyslowy' }, feeder_source: 'A', description: 'Kontenerowa typ K, mini-block PV nN' },
  { id: 'S05', name: 'Stacja S05 K BESS 1MW', station_type: 'inline', der: [{ kind: 'BESS', p_mw: 1.0, connection_variant: 'block_transformer' }], feeder_source: 'A', description: 'BESS 1 MW / 2 MWh block transformer 15 kV' },
  { id: 'S06', name: 'Stacja S06 K FW 800kW', station_type: 'inline', der: [{ kind: 'FW', p_mw: 0.8, connection_variant: 'DEDICATED_MV_CONNECTION' }], feeder_source: 'A', description: 'FW dedicated MV connection' },
  { id: 'S07', name: 'Stacja S07 K hybrid PV+BESS', station_type: 'inline', der: [{ kind: 'PV', p_mw: 2.0 }, { kind: 'BESS', p_mw: 0.5 }], load: { p_kw: 500, kind: 'przemyslowy' }, feeder_source: 'A', description: 'Hybrid PV+BESS dwa inwertery' },
  { id: 'S08', name: 'Stacja S08 wnętrzowa PV+komun', station_type: 'inline', der: [{ kind: 'PV', p_mw: 1.0, connection_variant: 'LV_BEHIND_STATION_TRANSFORMER' }], load: { p_kw: 200, kind: 'komunalny' }, feeder_source: 'A', description: 'Wnętrzowa LV_BEHIND_STATION_TRANSFORMER' },
  { id: 'S09', name: 'Stacja S09 wnętrzowa przemysł 4 odpływy', station_type: 'inline', nn_feeders: [
    { p_kw: 600, kind: 'przemyslowy', label: 'Linia produkcyjna A' },
    { p_kw: 600, kind: 'przemyslowy', label: 'Linia produkcyjna B' },
    { p_kw: 500, kind: 'przemyslowy', label: 'Silniki pomocnicze' },
    { p_kw: 300, kind: 'komunalny', label: 'Oświetlenie + biuro' },
  ], feeder_source: 'A', description: 'Wnętrzowa przemysłowa 4 odpływy nN — diversyfikacja per K30-25' },
  { id: 'S10', name: 'Stacja S10 K farma PV 5MW', station_type: 'inline', der: [{ kind: 'PV', p_mw: 5.0, connection_variant: 'SOURCE_CONNECTION_STATION' }], feeder_source: 'A', description: 'PV farma 5 MW source connection station' },
  { id: 'S11', name: 'Stacja S11 słupowa mikro PV', station_type: 'inline', der: [{ kind: 'PV', p_mw: 0.03 }], load: { p_kw: 20, kind: 'bytowy' }, feeder_source: 'A', description: 'Mikroinstalacja prosumencka 30 kW' },
  { id: 'S12', name: 'Stacja S12 wnętrzowa BESS 4MWh', station_type: 'inline', der: [{ kind: 'BESS', p_mw: 2.0, connection_variant: 'block_transformer' }], feeder_source: 'A', description: 'BESS 4 MWh peak shaving block 15 kV' },
  { id: 'S13', name: 'Stacja S13 K FW 2x2MW', station_type: 'inline', der: [{ kind: 'FW', p_mw: 2.0 }, { kind: 'FW', p_mw: 2.0 }], feeder_source: 'A', description: 'Dwa generatory asynchroniczne 2 MW' },
  { id: 'S14', name: 'Stacja S14 hybrid triple', station_type: 'inline', der: [{ kind: 'PV', p_mw: 1.0 }, { kind: 'BESS', p_mw: 0.5 }, { kind: 'FW', p_mw: 0.5 }], feeder_source: 'A', description: 'Triple-source hybrid station' },
  { id: 'S15', name: 'Stacja S15 słupowa rolnictwo', station_type: 'inline', load: { p_kw: 50, kind: 'rolniczy' }, feeder_source: 'A', description: 'Rzadkie obciążenie sezonowe rolne' },
  { id: 'S16', name: 'Stacja S16 wnętrzowa huta 5MW', station_type: 'inline', load: { p_kw: 5000, kind: 'przemyslowy' }, feeder_source: 'B', description: 'Duży zakład profil płaski' },
  { id: 'S17', name: 'Stacja S17 K PV+cos phi reg', station_type: 'inline', der: [{ kind: 'PV', p_mw: 0.8 }], load: { p_kw: 300, kind: 'przemyslowy' }, feeder_source: 'B', description: 'PV z regulacją cos φ' },
  { id: 'S18', name: 'Stacja S18 K BESS 2MW FCR', station_type: 'inline', der: [{ kind: 'BESS', p_mw: 2.0, connection_variant: 'block_transformer' }], feeder_source: 'B', description: 'BESS 2 MW / 4 MWh FCR/SR primary' },
  { id: 'S19', name: 'Stacja S19 słupowa PV 100kW Q-U', station_type: 'inline', der: [{ kind: 'PV', p_mw: 0.1 }], load: { p_kw: 40, kind: 'bytowy' }, feeder_source: 'B', description: 'Prosument PV 100 kW Q-U regulation NC RFG' },
  { id: 'S20', name: 'Stacja S20 wnętrzowa FW 3MW', station_type: 'inline', der: [{ kind: 'FW', p_mw: 3.0, connection_variant: 'DEDICATED_MV_CONNECTION' }], feeder_source: 'B', description: 'Single large wind turbine 3 MW' },
  { id: 'S21', name: 'Stacja S21 mini-block PV', station_type: 'inline', der: [{ kind: 'PV', p_mw: 0.3 }], load: { p_kw: 50, kind: 'bytowy' }, feeder_source: 'B', description: 'Mini-block PV-only variant rebuild' },
  // === K30 nowe konfiguracje (S22-S30) ===
  { id: 'S22', name: 'Stacja S22 mini-block PV+odbiór', station_type: 'inline', der: [{ kind: 'PV', p_mw: 0.3 }], load: { p_kw: 50, kind: 'bytowy' }, feeder_source: 'B', description: 'Mini-block PV mała mocowość' },
  { id: 'S23', name: 'Stacja S23 mini-block BESS', station_type: 'inline', der: [{ kind: 'BESS', p_mw: 1.0, connection_variant: 'block_transformer' }], feeder_source: 'B', description: 'Mini-block BESS 1 MW dedicated MV' },
  { id: 'S24', name: 'Stacja S24 mini-block FW', station_type: 'inline', der: [{ kind: 'FW', p_mw: 1.5, connection_variant: 'DEDICATED_MV_CONNECTION' }], feeder_source: 'B', description: 'Mini-block FW 1.5 MW DEDICATED' },
  { id: 'S25', name: 'Stacja S25 mini-block triple', station_type: 'inline', der: [{ kind: 'PV', p_mw: 0.4 }, { kind: 'BESS', p_mw: 0.3 }, { kind: 'FW', p_mw: 0.4 }], load: { p_kw: 100, kind: 'komunalny' }, feeder_source: 'B', description: 'Mini-block triple PV+BESS+FW' },
  { id: 'S26', name: 'Stacja S26 przemysłowa HV motor', station_type: 'inline', load: { p_kw: 3000, kind: 'przemyslowy' }, feeder_source: 'B', description: 'Stacja przemysłowa duży silnik HV 3 MW' },
  { id: 'S27', name: 'Stacja S27 kompaktowa prosument', station_type: 'inline', der: [{ kind: 'PV', p_mw: 0.25 }], load: { p_kw: 80, kind: 'bytowy' }, feeder_source: 'B', description: 'Kompaktowa klient prosumencki przemysłowy' },
  { id: 'S28', name: 'Stacja S28 ZKSN sekcyjna', station_type: 'sectional', feeder_source: 'B', description: 'ZKSN łącznikowa, branch point sekcyjny' },
  { id: 'S29', name: 'Stacja S29 ZKSN prosument zaawansowany', station_type: 'inline', der: [{ kind: 'PV', p_mw: 0.15 }], load: { p_kw: 60, kind: 'bytowy' }, feeder_source: 'B', description: 'Słupowa ZKSN, mikroinstalacja zaawansowana 150 kW' },
  { id: 'S30', name: 'Stacja S30 hybrid Q-V reg', station_type: 'inline', der: [{ kind: 'PV', p_mw: 1.0 }, { kind: 'BESS', p_mw: 1.0, connection_variant: 'block_transformer' }], load: { p_kw: 400, kind: 'przemyslowy' }, feeder_source: 'B', description: 'Kontenerowa hybrid z Q-V regulation NC RFG B' },
];

const PV_NN_CATALOG = 'conv-pv-nn-0p5mw-0p4kv';
const BESS_MV_CATALOG = 'conv-bess-1mw-2mwh-15kv';
const BESS_MV_LARGE = 'conv-bess-2mw-4mwh-15kv';
const FW_MV_CATALOG = 'conv-wind-2mw-15kv';
const FW_MV_LARGE = 'conv-wind-3mw-15kv';

function pickConverterCatalog(kind, pMw, variant) {
  if (kind === 'PV') {
    if (variant === 'nn_side') return PV_NN_CATALOG;
    if (pMw <= 1.0) return 'conv-pv-1mw-15kv';
    if (pMw <= 2.0) return 'conv-pv-2mw-15kv';
    return 'conv-pv-5mw-15kv';
  }
  if (kind === 'BESS') {
    if (pMw <= 0.5) return 'conv-bess-0.5mw-1mwh-15kv';
    if (pMw <= 1.0) return BESS_MV_CATALOG;
    if (pMw <= 2.0) return BESS_MV_LARGE;
    return 'conv-bess-5mw-10mwh-15kv';
  }
  if (kind === 'FW') {
    if (pMw <= 2.0) return FW_MV_CATALOG;
    if (pMw <= 3.0) return FW_MV_LARGE;
    return 'conv-wind-4mw-20kv';
  }
  return PV_NN_CATALOG;
}

/**
 * Tworzy GPZ + bay + trunk + zwraca currentSegmentId dla downstream
 * insertion. Reusable per GPZ-A/GPZ-B (single trunk per GPZ jako N-1
 * surrogate gdy brak domain-op ring main).
 *
 * cable_catalog: 'cable-base-epr-al-1c-150' default (medium urban),
 *   'cable-base-xlpe-cu-1c-240' (industrial high-current), inne per
 *   mv_cable_line_catalog.py.
 */
async function buildGpzTrunk(caseId, projectId, gpzKey, gpzName, designation, cableCatalog = 'cable-base-epr-al-1c-150') {
  log(`K2.${gpzKey}`, `Wstaw ${gpzName}...`);
  const gpzRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
    project_id: projectId,
    operation: {
      name: 'add_grid_source_sn',
      idempotency_key: `gn30_gpz_${gpzKey}_v1`,
      payload: {
        source_id: `src_gpz_${gpzKey}_k30`,
        name_pl: gpzName,
        voltage_kv: 15.0,
        catalog_ref: 'src-gpz-15kv-100mva-rx008',
      },
    },
  });
  if (!gpzRes.ok || gpzRes.json?.error_code) {
    console.error(`K2.${gpzKey} FAIL:`, gpzRes.json?.error_code ?? gpzRes.json?.detail);
    return null;
  }
  const snapshot = gpzRes.json?.snapshot;
  const gpzList = (snapshot?.substations ?? []).filter((s) => s.station_type === 'gpz');
  const gpz = gpzList[gpzList.length - 1];
  const snBus = (snapshot?.buses ?? [])
    .filter((b) => b.voltage_kv === 15)
    .reverse()[0];
  log(`K2.${gpzKey}`, `OK GPZ=${gpz?.ref_id} bus=${snBus?.ref_id}`);

  log(`K4.${gpzKey}`, `Pole SN line_out ${designation}...`);
  const bayRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
    project_id: projectId,
    operation: {
      name: 'add_sn_bay',
      idempotency_key: `gn30_bay_${gpzKey}_${designation.toLowerCase()}`,
      payload: {
        bus_ref: snBus.ref_id,
        bay_role: 'LINE_OUT',
        catalog_ref: 'sw-ls-abb-nal-12kv-630a',
        designation_q: designation,
      },
    },
  });
  if (!bayRes.ok || bayRes.json?.error_code) {
    console.error(`K4.${gpzKey} FAIL:`, bayRes.json?.error_code);
    return null;
  }
  log(`K4.${gpzKey}`, `OK ${designation}`);

  log(`K5.${gpzKey}`, `Trunk segment SN 5000 m z ${gpzKey}...`);
  const enm = await api('GET', `/api/cases/${caseId}/enm`);
  const lineFields = (enm.json?.line_fields ?? []).filter((f) => f.bay_role === 'LINE_OUT');
  const lineField = lineFields[lineFields.length - 1];
  const trunkRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
    project_id: projectId,
    operation: {
      name: 'continue_trunk_segment_sn',
      idempotency_key: `gn30_trunk_${gpzKey}`,
      payload: {
        field_ref: lineField?.ref_id,
        from_terminal_id: snBus.ref_id,
        segment: {
          rodzaj: 'KABEL',
          dlugosc_m: 5000,
          catalog_ref: cableCatalog,
        },
      },
    },
  });
  if (!trunkRes.ok || trunkRes.json?.error_code) {
    console.error(`K5.${gpzKey} FAIL:`, trunkRes.json?.error_code);
    return null;
  }
  const created = trunkRes.json?.changes?.created_element_ids ?? [];
  const segmentId = created.find((id) => typeof id === 'string' && id.startsWith('seg/')) ?? created[1];
  log(`K5.${gpzKey}`, `OK trunk segment=${segmentId}`);

  return { gpz, snBus, segmentId };
}

async function main() {
  console.log('=================================================================');
  console.log('GN30 K30 SEEDER — 2 GPZ + 30 stacji unique config (audit K30-0)');
  console.log('=================================================================');

  const ready = await api('GET', '/ready');
  if (!ready.ok) {
    console.error('Backend nieosiągalny:', ready);
    process.exit(1);
  }

  log('K1', 'Tworzę projekt GN30...');
  const project = await api('POST', '/api/projects', {
    name: 'GN30 — K30 reference network (30 stations + 2 GPZ)',
    description: 'K30 SCADA-CAD grade target — audit loop seeder',
  });
  if (!project.ok) {
    console.error('Project create failed:', project);
    process.exit(1);
  }
  const projectId = project.json.id;

  const caseRes = await api('POST', '/api/study-cases', {
    project_id: projectId,
    name: 'Wariant bazowy K30',
    description: 'GN30 baseline — audit loop K30-0',
  });
  const caseId = caseRes.json.id;
  log('K1', `OK projectId=${projectId} caseId=${caseId}`);

  // K2-K5 A: GPZ Main + trunk A (kabel EPR Al 150 mm² — typowy miejski)
  const trunkA = await buildGpzTrunk(
    caseId, projectId, 'a_main', 'GPZ-A Główny 110/15 kV (K30)',
    'Q01', 'cable-base-epr-al-1c-150',
  );
  if (!trunkA) process.exit(2);

  // K2-K5 B: GPZ Backup + trunk B (kabel XLPE Cu 240 mm² — przemysłowy, większy
  // przekrój, miedź — pokazuje na schemacie dywersyfikację catalog binding)
  const trunkB = await buildGpzTrunk(
    caseId, projectId, 'b_backup', 'GPZ-B Backup 110/15 kV (K30)',
    'Q01B', 'cable-base-xlpe-cu-1c-240',
  );
  if (!trunkB) {
    console.warn('GPZ-B build failed — kontynuuję z samym trunk A (N-1 surrogate degraded)');
  }

  // K6 loop: 30 stacji per feeder_source ('A' lub 'B')
  let currentSegmentA = trunkA.segmentId;
  let currentSegmentB = trunkB?.segmentId ?? null;
  const stationResults = [];
  // K30-14 NO-GO #10 ROOT FIX: zamiast binary split 0.5 (po 30 split-ach
  // rightmost segment ma długość ~9 nanometrów → Y-bus singular → Newton-Raphson
  // diverguje), używaj progresywny ratio. Cel: równomierny rozkład N stations
  // along trunk. Algorithm: ratio_i = 1/(remaining_count) gdy wstawiamy w prawą
  // resztę. Wzór wynika z: chcemy stacje na 1/(N+1), 2/(N+1), ..., N/(N+1)
  // długości; po i-tym wstawieniu w prawej reszcie chodzi o 1/(N-i+1).
  //
  // Counter per ACTUAL target segment (A lub B). Gdy GPZ-B fail i fallback do
  // trunk A, wszystkie stacje liczone w placedInA — żeby remaining nie poszedł
  // ujemnie.
  let placedInA = 0;
  let placedInB = 0;
  const stationsToA = STATION_CONFIGS.filter(
    (c) => c.feeder_source !== 'B' || !currentSegmentB,
  ).length;
  const stationsToB = STATION_CONFIGS.length - stationsToA;
  for (const cfg of STATION_CONFIGS) {
    const useB = cfg.feeder_source === 'B' && currentSegmentB;
    const targetSegment = useB ? currentSegmentB : currentSegmentA;
    if (!targetSegment) {
      stationResults.push({ id: cfg.id, status: 'FAIL', error: 'no_segment' });
      log(`K6.${cfg.id}`, 'FAIL: no_segment (feeder unavailable)');
      continue;
    }
    // Progresywny ratio. Najpierw wstawiamy w 1/(N+1) trunku, potem w prawej
    // reszcie 1/N (czyli 2/(N+1) całości), 1/(N-1) (3/(N+1)), itd.
    const total = useB ? stationsToB : stationsToA;
    const placed = useB ? placedInB : placedInA;
    const remaining = Math.max(1, total - placed);
    const insertRatio = 1.0 / (remaining + 1);
    if (useB) placedInB += 1;
    else placedInA += 1;
    const stationRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
      project_id: projectId,
      operation: {
        name: 'insert_station_on_segment_sn',
        idempotency_key: `gn30_station_${cfg.id}`,
        payload: {
          segment_id: targetSegment,
          insert_at: { mode: 'RATIO', value: insertRatio },
          station: {
            name_pl: cfg.name,
            station_type: cfg.station_type,
            sn_voltage_kv: 15,
            nn_voltage_kv: 0.4,
          },
          transformer: {
            transformer_catalog_ref: 'tr-sn-nn-15-04-1000kva-dyn11',
          },
          sn_fields: ['IN', 'OUT', 'TR'],
        },
      },
    });
    const ok = stationRes.ok && !stationRes.json?.error_code;
    if (!ok) {
      stationResults.push({ id: cfg.id, status: 'FAIL', error: stationRes.json?.error_code, feeder: cfg.feeder_source });
      log(`K6.${cfg.id}`, `FAIL: ${stationRes.json?.error_code}`);
      continue;
    }
    const createdIds = stationRes.json?.changes?.created_element_ids ?? [];
    const stationRefFromCreate = createdIds.find(
      (id) => typeof id === 'string' && id.startsWith('stn/') && id.endsWith('/station'),
    );
    const enmAfter = await api('GET', `/api/cases/${caseId}/enm`);
    const branches = enmAfter.json?.branches ?? [];
    const cableSegs = branches.filter(
      (b) => typeof b.ref_id === 'string' && b.ref_id.startsWith('seg/') && b.type === 'cable',
    );
    if (cableSegs.length > 0) {
      const newest = cableSegs[cableSegs.length - 1].ref_id;
      if (useB) currentSegmentB = newest;
      else currentSegmentA = newest;
    }
    const nnBus = (enmAfter.json?.buses ?? []).find(
      (b) =>
        typeof b.ref_id === 'string' &&
        stationRefFromCreate &&
        b.ref_id.startsWith(stationRefFromCreate.replace('/station', '/')) &&
        b.voltage_kv && b.voltage_kv <= 1.0,
    );
    stationResults.push({
      id: cfg.id,
      status: 'PASS',
      cfg,
      stationRef: stationRefFromCreate,
      nnBusRef: nnBus?.ref_id,
      feeder: cfg.feeder_source,
    });
    log(`K6.${cfg.id}`, `OK (feeder ${cfg.feeder_source}) station=${stationRefFromCreate?.slice(0, 40) ?? '?'} nn=${nnBus?.ref_id?.slice(0, 40) ?? '?'}`);
  }

  // K10 loop: dodaj DER per station
  const derResults = [];
  for (const stRes of stationResults) {
    if (stRes.status !== 'PASS' || !stRes.cfg.der || !stRes.stationRef) continue;
    for (let d = 0; d < stRes.cfg.der.length; d++) {
      const der = stRes.cfg.der[d];
      let variant = der.connection_variant;
      if (!variant) {
        variant = (der.kind === 'BESS' || der.kind === 'FW')
          ? 'block_transformer'
          : 'nn_side';
      }
      const catalog = pickConverterCatalog(der.kind, der.p_mw ?? 0.5, variant);
      const payload = {
        source_technology: der.kind,
        catalog_ref: catalog,
        connection_variant: variant,
        station_ref: stRes.stationRef,
      };
      if (variant === 'nn_side' && stRes.nnBusRef) {
        payload.bus_nn_ref = stRes.nnBusRef;
      }
      const derRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
        project_id: projectId,
        operation: {
          name: 'add_converter_source',
          idempotency_key: `gn30_${stRes.id}_${der.kind}_${d}`,
          payload,
        },
      });
      const ok = derRes.ok && !derRes.json?.error_code;
      if (!ok) {
        log(`K10.${stRes.id}.${der.kind}`, `FAIL: ${derRes.json?.error_code ?? derRes.json?.detail ?? 'unknown'}`);
      }
      derResults.push({
        id: stRes.id,
        kind: der.kind,
        variant,
        status: ok ? 'PASS' : `FAIL: ${derRes.json?.error_code ?? derRes.json?.detail ?? ''}`,
      });
    }
  }

  // K30-15.4: ODGAŁĘZIENIA — wstaw branch poles (słupy odgałęźne ZKSN) co kilka
  // stacji na trunk A + start short branch segments. Każde odgałęzienie symuluje
  // promień do peryferyjnej stacji obsługującej obszar poza głównym ciągiem.
  // Per Specialist Projektant K30-14 demand: 'schemat nie uwzględnia odgałęzień'.
  const enmAfterK10 = await api('GET', `/api/cases/${caseId}/enm`);
  const allBranches = enmAfterK10.json?.branches ?? [];
  const trunkASegments = allBranches.filter(
    (b) => b.type === 'cable' && b.ref_id?.startsWith('seg/')
      && b.length_km && b.length_km > 0.05  // skip zero-length artifacts
  );
  // Pick 4 segments at quartile positions for branches
  const branchTargets = [
    Math.floor(trunkASegments.length * 0.2),
    Math.floor(trunkASegments.length * 0.4),
    Math.floor(trunkASegments.length * 0.6),
    Math.floor(trunkASegments.length * 0.8),
  ].filter((idx, i, arr) => arr.indexOf(idx) === i && idx < trunkASegments.length);
  const branchResults = [];
  for (let i = 0; i < branchTargets.length; i++) {
    const targetSeg = trunkASegments[branchTargets[i]];
    if (!targetSeg) continue;
    // 1. Insert branch pole on segment
    const poleRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
      project_id: projectId,
      operation: {
        name: 'insert_zksn_on_segment_sn',
        idempotency_key: `gn30_branch_pole_${i}`,
        payload: {
          segment_id: targetSeg.ref_id,
          insert_at: { mode: 'RATIO', value: 0.5 },
          catalog_binding: {
            catalog_namespace: 'BRANCH_POINT_SN',
            catalog_item_id: 'ZKSN-2P-630A',
            catalog_item_version: '2024.1',
            materialize: true,
          },
          name_pl: `Słup ZKSN odgałęźny ${i + 1}`,
          branch_ports_count: 1,
        },
      },
    });
    const poleOk = poleRes.ok && !poleRes.json?.error_code;
    if (!poleOk) {
      const errMsg = poleRes.json?.error_code ?? (typeof poleRes.json?.detail === 'string' ? poleRes.json.detail : JSON.stringify(poleRes.json?.detail || poleRes.json));
      log(`K12.B${i}.pole`, `FAIL: ${errMsg}`);
      branchResults.push({ idx: i, status: `POLE_FAIL: ${errMsg}` });
      continue;
    }
    const poleCreated = poleRes.json?.changes?.created_element_ids ?? [];
    const poleRefId = poleCreated.find((id) => typeof id === 'string' && (id.includes('/zksn') || id.includes('/branch_pole')));
    if (!poleRefId) {
      log(`K12.B${i}.pole`, 'NO_POLE_REF');
      branchResults.push({ idx: i, status: 'NO_POLE_REF' });
      continue;
    }
    // Pobierz bus ref dla BRANCH port (per ZKSN.ports.BRANCH[0])
    const snapAfterPole = await api('GET', `/api/cases/${caseId}/enm`);
    const bps = snapAfterPole.json?.branch_points ?? [];
    const myBp = bps.find((b) => b.ref_id === poleRefId);
    const branchBusRef = myBp?.ports?.BRANCH?.[0];
    if (!branchBusRef) {
      log(`K12.B${i}.seg`, 'NO_BRANCH_BUS');
      branchResults.push({ idx: i, status: 'NO_BRANCH_BUS' });
      continue;
    }
    // 2. Start branch segment from ZKSN BRANCH bus
    const branchSegRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
      project_id: projectId,
      operation: {
        name: 'start_branch_segment_sn',
        idempotency_key: `gn30_branch_seg_${i}`,
        payload: {
          from_bus_ref: branchBusRef,
          segment: {
            rodzaj: 'KABEL',
            dlugosc_m: 1500 + (i * 200),  // varied 1.5-2.1 km branches
            catalog_ref: i % 2 === 0 ? 'cable-base-epr-al-1c-150' : 'cable-base-xlpe-al-1c-185',
          },
        },
      },
    });
    const segOk = branchSegRes.ok && !branchSegRes.json?.error_code;
    branchResults.push({
      idx: i,
      pole: poleRefId,
      status: segOk ? 'PASS' : `SEG_FAIL: ${branchSegRes.json?.error_code ?? branchSegRes.json?.detail ?? ''}`,
    });
    if (!segOk) {
      log(`K12.B${i}.seg`, `FAIL: ${branchSegRes.json?.error_code ?? ''}`);
    }
  }
  const branchOk = branchResults.filter((r) => r.status === 'PASS').length;
  log('K12', `Odgałęzienia: ${branchOk}/${branchResults.length} PASS`);

  // K11: Multi-feeder nN per station (K30-25 schema extension)
  // STATION_CONFIGS_K30 supports BOTH legacy `load: {p_kw,kind}` AND new
  // `nn_feeders: [{p_kw, kind, label}]` array. Backward-compat auto-convert.
  const NN_FEEDER_CATALOG = 'cb_nn_400a';
  const loadResults = [];
  for (const stRes of stationResults) {
    if (stRes.status !== 'PASS' || !stRes.nnBusRef) continue;

    // Resolve nn_feeders array: explicit field or fallback to legacy load
    const feeders = Array.isArray(stRes.cfg.nn_feeders)
      ? stRes.cfg.nn_feeders
      : stRes.cfg.load
        ? [{ p_kw: stRes.cfg.load.p_kw, kind: stRes.cfg.load.kind, label: `${stRes.cfg.load.kind} ${stRes.cfg.load.p_kw} kW` }]
        : [];

    if (feeders.length === 0) continue;

    for (let fi = 0; fi < feeders.length; fi++) {
      const feeder = feeders[fi];
      const feederRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
        project_id: projectId,
        operation: {
          name: 'add_nn_outgoing_field',
          idempotency_key: `gn30_${stRes.id}_nn_feeder_${fi}`,
          payload: {
            bus_nn_ref: stRes.nnBusRef,
            station_ref: stRes.stationRef,
            field_role: 'OUTGOING',
            field_name: feeder.label || `Odpływ nN ${stRes.cfg.id} #${fi + 1}`,
            catalog_ref: NN_FEEDER_CATALOG,
          },
        },
      });
      const feederOk = feederRes.ok && !feederRes.json?.error_code;
      if (!feederOk) {
        loadResults.push({
          id: `${stRes.id}#${fi}`,
          status: `FEEDER_FAIL: ${feederRes.json?.error_code ?? ''}`,
        });
        continue;
      }
      const feederIds = feederRes.json?.changes?.created_element_ids ?? [];
      const feederRef = feederIds.find(
        (id) => typeof id === 'string' && id.startsWith('nn/') && id.endsWith('/outgoing'),
      );
      if (!feederRef) {
        loadResults.push({ id: `${stRes.id}#${fi}`, status: 'NO_FEEDER_REF' });
        continue;
      }

      // Optionally attach load to feeder (if p_kw provided)
      if (feeder.p_kw && feeder.p_kw > 0) {
        let loadCatalog = 'load_mieszk_15kw';
        if (feeder.kind === 'przemyslowy') loadCatalog = 'load_przem_75kw';
        else if (feeder.kind === 'komunalny') loadCatalog = 'load_uslugi_30kw';

        const loadRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
          project_id: projectId,
          operation: {
            name: 'add_nn_load',
            idempotency_key: `gn30_${stRes.id}_load_${fi}`,
            payload: {
              feeder_ref: feederRef,
              bus_nn_ref: stRes.nnBusRef,
              active_power_kw: feeder.p_kw,
              reactive_power_kvar: feeder.p_kw * 0.33,
              load_kind: 'SKUPIONY',
              connection_type: 'TROJFAZOWY',
              load_name: feeder.label || `Odbiór ${feeder.kind} ${feeder.p_kw} kW`,
              cos_phi: 0.95,
              catalog_ref: loadCatalog,
            },
          },
        });
        const loadOk = loadRes.ok && !loadRes.json?.error_code;
        loadResults.push({
          id: `${stRes.id}#${fi}`,
          kind: feeder.kind,
          p_kw: feeder.p_kw,
          status: loadOk ? 'PASS' : `FAIL: ${loadRes.json?.error_code ?? ''}`,
        });
      } else {
        // Feeder bez load — count jako PASS (sole-purpose feeder)
        loadResults.push({
          id: `${stRes.id}#${fi}`,
          kind: 'feeder-only',
          p_kw: 0,
          status: 'PASS',
        });
      }
    }
  }

  // Final summary
  const sumOk = stationResults.filter((r) => r.status === 'PASS').length;
  const sumFail = stationResults.length - sumOk;
  const derOk = derResults.filter((r) => r.status === 'PASS').length;
  const derFail = derResults.length - derOk;
  const loadOk = loadResults.filter((r) => r.status === 'PASS').length;
  const loadFail = loadResults.length - loadOk;
  const aOk = stationResults.filter((r) => r.status === 'PASS' && r.feeder === 'A').length;
  const bOk = stationResults.filter((r) => r.status === 'PASS' && r.feeder === 'B').length;

  console.log('=================================================================');
  console.log('GN30 K30 SEED FINAL SUMMARY');
  console.log('=================================================================');
  console.log(`Stacje:   ${sumOk}/${stationResults.length} PASS (A=${aOk}, B=${bOk}) ${sumFail} FAIL`);
  console.log(`DER:      ${derOk}/${derResults.length} PASS, ${derFail} FAIL`);
  console.log(`Loads:    ${loadOk}/${loadResults.length} PASS, ${loadFail} FAIL`);
  console.log(`Project:  ${projectId}`);
  console.log(`Case:     ${caseId}`);
  console.log('-----------------------------------------------------------------');
  console.log('Station details:');
  for (const r of stationResults) {
    console.log(`  ${r.id} (feeder ${r.cfg?.feeder_source ?? r.feeder ?? '?'}): ${r.status}${r.error ? ` (${r.error})` : ''}`);
  }

  console.log('=================================================================');
  console.log('JSON:', JSON.stringify({
    projectId,
    caseId,
    stations: { pass: sumOk, fail: sumFail, total: stationResults.length, a: aOk, b: bOk },
    der: { pass: derOk, fail: derFail, total: derResults.length },
    loads: { pass: loadOk, fail: loadFail, total: loadResults.length },
  }));
}

main().catch((e) => {
  console.error('UNCAUGHT:', e);
  process.exit(99);
});
