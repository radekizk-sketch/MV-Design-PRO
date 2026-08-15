#!/usr/bin/env node
/**
 * Seeder złożonego wariantu referencyjnego SN/OZE.
 *
 * Buduje sieć terenową: 2 GPZ + 30 stacji z różnymi konfiguracjami
 * odbiorów, PV, BESS i FW. Dane są przeznaczone do audytu UI/SLD oraz
 * sprawdzenia materializacji ENM bez nazw kodowych w widoku projektanta.
 *
 * USAGE: node scripts/seed-gn30.mjs
 * REQUIRES: backend at BACKEND_URL (default http://127.0.0.1:8000)
 *
 * OUTPUT: JSON summary stations/DER/loads PASS/FAIL + projectId/caseId
 * dla skryptów audytu przeglądarkowego i eksportów kontrolnych.
 *
 * UWAGA: jeżeli backend nie wspiera pierścienia jako jednej operacji domenowej,
 * skrypt tworzy dwa osobne ciągi SN z niezależnych GPZ jako wariant N-1.
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
 * STATION_CONFIGS - 30 stacji do wariantu referencyjnego.
 *
 * Pole feeder_source: 'A' (ciąg GPZ-A) lub 'B' (ciąg GPZ-B).
 * Pierwsza połowa stacji idzie z GPZ-A, druga z GPZ-B.
 */
const STATION_CONFIGS = [
  { id: 'S01', name: 'Stacja S01 przelotowa bytowo-usługowa', station_type: 'inline', nn_feeders: [
    { p_kw: 80, kind: 'bytowy', label: 'Odpływ osiedlowy' },
    { p_kw: 60, kind: 'komunalny', label: 'Oświetlenie i usługi' },
  ], feeder_source: 'A', description: 'Pierwsza stacja przelotowa na magistrali GPZ-A, odbiory bytowo-usługowe' },
  { id: 'S02', name: 'Stacja S02 ZKSN prosument PV', station_type: 'inline', der: [{ kind: 'PV', p_mw: 0.05 }], feeder_source: 'A', description: 'Słupowa ZKSN, PV prosument 50 kW' },
  { id: 'S03', name: 'Stacja S03 ZKSN bytowa 3 odpływy', station_type: 'inline', nn_feeders: [
    { p_kw: 30, kind: 'bytowy', label: 'Odpływ bytowy 1' },
    { p_kw: 25, kind: 'bytowy', label: 'Odpływ bytowy 2' },
    { p_kw: 40, kind: 'komunalny', label: 'Odpływ uliczny LED' },
  ], feeder_source: 'A', description: 'Słupowa ZKSN, trzy odpływy nN' },
  { id: 'S04', name: 'Stacja S04 kontenerowa PV i przemysł', station_type: 'inline', der: [{ kind: 'PV', p_mw: 0.5 }], load: { p_kw: 100, kind: 'przemyslowy' }, feeder_source: 'A', description: 'Kontenerowa stacja z PV po stronie nN i odbiorem przemysłowym' },
  { id: 'S05', name: 'Stacja S05 kontenerowa BESS 1 MW', station_type: 'inline', der: [{ kind: 'BESS', p_mw: 1.0, connection_variant: 'block_transformer' }], feeder_source: 'A', description: 'BESS 1 MW / 2 MWh przez transformator blokowy 15 kV' },
  { id: 'S06', name: 'Stacja S06 kontenerowa FW 800 kW', station_type: 'inline', der: [{ kind: 'FW', p_mw: 0.8, connection_variant: 'DEDICATED_MV_CONNECTION' }], feeder_source: 'A', description: 'FW z dedykowanym przyłączeniem SN' },
  { id: 'S07', name: 'Stacja S07 hybrydowa PV+BESS', station_type: 'inline', der: [{ kind: 'PV', p_mw: 2.0 }, { kind: 'BESS', p_mw: 0.5 }], load: { p_kw: 500, kind: 'przemyslowy' }, feeder_source: 'A', description: 'Układ hybrydowy PV+BESS z dwoma przekształtnikami' },
  { id: 'S08', name: 'Stacja S08 wnętrzowa PV i komunalna', station_type: 'inline', der: [{ kind: 'PV', p_mw: 1.0, connection_variant: 'LV_BEHIND_STATION_TRANSFORMER' }], load: { p_kw: 200, kind: 'komunalny' }, feeder_source: 'A', description: 'PV po stronie nN za transformatorem stacyjnym' },
  { id: 'S09', name: 'Stacja S09 wnętrzowa przemysłowa 4 odpływy', station_type: 'inline', nn_feeders: [
    { p_kw: 600, kind: 'przemyslowy', label: 'Linia produkcyjna A' },
    { p_kw: 600, kind: 'przemyslowy', label: 'Linia produkcyjna B' },
    { p_kw: 500, kind: 'przemyslowy', label: 'Silniki pomocnicze' },
    { p_kw: 300, kind: 'komunalny', label: 'Oświetlenie + biuro' },
  ], feeder_source: 'A', description: 'Wnętrzowa stacja przemysłowa z czterema odpływami nN' },
  { id: 'S10', name: 'Stacja S10 przyłączeniowa farma PV 5 MW', station_type: 'inline', der: [{ kind: 'PV', p_mw: 5.0, connection_variant: 'SOURCE_CONNECTION_STATION' }], feeder_source: 'A', description: 'Farma PV 5 MW jako dedykowana stacja przyłączeniowa' },
  { id: 'S11', name: 'Stacja S11 słupowa mikro PV', station_type: 'inline', der: [{ kind: 'PV', p_mw: 0.03 }], load: { p_kw: 20, kind: 'bytowy' }, feeder_source: 'A', description: 'Mikroinstalacja prosumencka 30 kW' },
  { id: 'S12', name: 'Stacja S12 wnętrzowa BESS 4 MWh', station_type: 'inline', der: [{ kind: 'BESS', p_mw: 2.0, connection_variant: 'block_transformer' }], feeder_source: 'A', description: 'BESS 4 MWh do redukcji szczytów przez transformator blokowy 15 kV' },
  { id: 'S13', name: 'Stacja S13 wiatrowa 2x2 MW', station_type: 'inline', der: [{ kind: 'FW', p_mw: 2.0 }, { kind: 'FW', p_mw: 2.0 }], feeder_source: 'A', description: 'Dwa źródła wiatrowe po 2 MW' },
  { id: 'S14', name: 'Stacja S14 hybrydowa PV+BESS+FW', station_type: 'inline', der: [{ kind: 'PV', p_mw: 1.0 }, { kind: 'BESS', p_mw: 0.5 }, { kind: 'FW', p_mw: 0.5 }], feeder_source: 'A', description: 'Stacja z trzema typami źródeł przekształtnikowych' },
  { id: 'S15', name: 'Stacja S15 słupowa rolnictwo', station_type: 'inline', load: { p_kw: 50, kind: 'rolniczy' }, feeder_source: 'A', description: 'Rzadkie obciążenie sezonowe rolne' },
  { id: 'S16', name: 'Stacja S16 wnętrzowa zakład 5 MW', station_type: 'inline', load: { p_kw: 5000, kind: 'przemyslowy' }, feeder_source: 'B', description: 'Duży zakład przemysłowy o profilu płaskim' },
  { id: 'S17', name: 'Stacja S17 PV z regulacją cosφ', station_type: 'inline', der: [{ kind: 'PV', p_mw: 0.8 }], load: { p_kw: 300, kind: 'przemyslowy' }, feeder_source: 'B', description: 'PV z regulacją współczynnika mocy' },
  { id: 'S18', name: 'Stacja S18 BESS 2 MW FCR', station_type: 'inline', der: [{ kind: 'BESS', p_mw: 2.0, connection_variant: 'block_transformer' }], feeder_source: 'B', description: 'BESS 2 MW / 4 MWh dla usług FCR/SR' },
  { id: 'S19', name: 'Stacja S19 słupowa PV 100 kW Q(U)', station_type: 'inline', der: [{ kind: 'PV', p_mw: 0.1 }], load: { p_kw: 40, kind: 'bytowy' }, feeder_source: 'B', description: 'Prosument PV 100 kW z regulacją Q(U) według NC RfG' },
  { id: 'S20', name: 'Stacja S20 wnętrzowa FW 3 MW', station_type: 'inline', der: [{ kind: 'FW', p_mw: 3.0, connection_variant: 'DEDICATED_MV_CONNECTION' }], feeder_source: 'B', description: 'Pojedyncze źródło wiatrowe 3 MW' },
  { id: 'S21', name: 'Stacja S21 PV po stronie nN', station_type: 'inline', der: [{ kind: 'PV', p_mw: 0.3 }], load: { p_kw: 50, kind: 'bytowy' }, feeder_source: 'B', description: 'PV po stronie nN z odbiorem bytowym' },
  { id: 'S22', name: 'Stacja S22 PV i odbiór bytowy', station_type: 'inline', der: [{ kind: 'PV', p_mw: 0.3 }], load: { p_kw: 50, kind: 'bytowy' }, feeder_source: 'B', description: 'Mała stacja z PV i odbiorem bytowym' },
  { id: 'S23', name: 'Stacja S23 BESS przyłączony do SN', station_type: 'inline', der: [{ kind: 'BESS', p_mw: 1.0, connection_variant: 'block_transformer' }], feeder_source: 'B', description: 'BESS 1 MW z dedykowanym przyłączeniem SN' },
  { id: 'S24', name: 'Stacja S24 FW 1,5 MW', station_type: 'inline', der: [{ kind: 'FW', p_mw: 1.5, connection_variant: 'DEDICATED_MV_CONNECTION' }], feeder_source: 'B', description: 'Źródło wiatrowe 1,5 MW z dedykowanym przyłączeniem SN' },
  { id: 'S25', name: 'Stacja S25 hybrydowa PV+BESS+FW', station_type: 'inline', der: [{ kind: 'PV', p_mw: 0.4 }, { kind: 'BESS', p_mw: 0.3 }, { kind: 'FW', p_mw: 0.4 }], load: { p_kw: 100, kind: 'komunalny' }, feeder_source: 'B', description: 'Układ hybrydowy PV+BESS+FW z odbiorem komunalnym' },
  { id: 'S26', name: 'Stacja S26 przemysłowa silnik SN', station_type: 'inline', load: { p_kw: 3000, kind: 'przemyslowy' }, feeder_source: 'B', description: 'Stacja przemysłowa z dużym napędem SN 3 MW' },
  { id: 'S27', name: 'Stacja S27 kompaktowa prosumencka', station_type: 'inline', der: [{ kind: 'PV', p_mw: 0.25 }], load: { p_kw: 80, kind: 'bytowy' }, feeder_source: 'B', description: 'Kompaktowa stacja prosumencka z odbiorem bytowym' },
  { id: 'S28', name: 'Stacja S28 ZKSN sekcyjna', station_type: 'sectional', feeder_source: 'B', description: 'ZKSN łącznikowa jako węzeł sekcyjny' },
  { id: 'S29', name: 'Stacja S29 ZKSN prosument 150 kW', station_type: 'inline', der: [{ kind: 'PV', p_mw: 0.15 }], load: { p_kw: 60, kind: 'bytowy' }, feeder_source: 'B', description: 'Słupowa ZKSN z mikroinstalacją 150 kW' },
  { id: 'S30', name: 'Stacja S30 hybrydowa z regulacją Q(U)', station_type: 'inline', der: [{ kind: 'PV', p_mw: 1.0 }, { kind: 'BESS', p_mw: 1.0, connection_variant: 'block_transformer' }], load: { p_kw: 400, kind: 'przemyslowy' }, feeder_source: 'B', description: 'Kontenerowa stacja hybrydowa z regulacją Q(U) według NC RfG' },
];

const PV_NN_CATALOG = 'conv-pv-nn-0p5mw-0p4kv';
const BESS_MV_CATALOG = 'conv-bess-1mw-2mwh-15kv';
const BESS_MV_LARGE = 'conv-bess-2mw-4mwh-15kv';
const FW_MV_CATALOG = 'conv-wind-2mw-15kv';
const FW_MV_LARGE = 'conv-wind-3mw-15kv';

function pickConverterCatalog(kind, pMw, variant) {
  if (kind === 'PV') {
    if (variant === 'nn_side' || variant === 'LV_BEHIND_STATION_TRANSFORMER') return PV_NN_CATALOG;
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
 * Tworzy GPZ, pole liniowe i początkowy odcinek ciągu SN.
 * Funkcja jest używana osobno dla GPZ-A i GPZ-B.
 *
 * cable_catalog: 'cable-base-epr-al-1c-150' - standard miejski,
 *   'cable-base-xlpe-cu-1c-240' - wariant przemysłowy, inne per
 *   mv_cable_line_catalog.py.
 */
async function buildGpzTrunk(caseId, projectId, gpzKey, gpzName, designation, cableCatalog = 'cable-base-epr-al-1c-150') {
  log(`GPZ.${gpzKey}`, `Wstaw ${gpzName}...`);
  const gpzRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
    project_id: projectId,
    operation: {
      name: 'add_grid_source_sn',
      idempotency_key: `ref_network_gpz_${gpzKey}_v1`,
      payload: {
        source_id: `src_gpz_${gpzKey}_terenowy`,
        source_name: gpzName,
        name_pl: gpzName,
        voltage_kv: 15.0,
        catalog_ref: 'src-gpz-15kv-100mva-rx008',
      },
    },
  });
  if (!gpzRes.ok || gpzRes.json?.error_code) {
    console.error(`GPZ.${gpzKey} FAIL:`, gpzRes.json?.error_code ?? gpzRes.json?.detail);
    return null;
  }
  const gpzCreated = gpzRes.json?.changes?.created_element_ids ?? [];
  const corridorRef = gpzCreated.find((id) => typeof id === 'string' && id.includes('/corridor_'));
  const snapshot = gpzRes.json?.snapshot;
  const gpzList = (snapshot?.substations ?? []).filter((s) => s.station_type === 'gpz');
  const gpz = gpzList[gpzList.length - 1];
  const snBus = (snapshot?.buses ?? [])
    .filter((b) => b.voltage_kv === 15)
    .reverse()[0];
  log(`GPZ.${gpzKey}`, `OK GPZ=${gpz?.ref_id} bus=${snBus?.ref_id}`);

  log(`POLE.${gpzKey}`, `Pole SN liniowe ${designation}...`);
  const bayRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
    project_id: projectId,
    operation: {
      name: 'add_sn_bay',
      idempotency_key: `ref_network_bay_${gpzKey}_${designation.toLowerCase()}`,
      payload: {
        bus_ref: snBus.ref_id,
        bay_role: 'LINE_OUT',
        catalog_ref: 'sw-ls-abb-nal-12kv-630a',
        designation_q: designation,
      },
    },
  });
  if (!bayRes.ok || bayRes.json?.error_code) {
    console.error(`POLE.${gpzKey} FAIL:`, bayRes.json?.error_code);
    return null;
  }
  log(`POLE.${gpzKey}`, `OK ${designation}`);

  log(`ODCINEK.${gpzKey}`, `Odcinek początkowy SN 5000 m z ${gpzKey}...`);
  const enm = await api('GET', `/api/cases/${caseId}/enm`);
  const lineFields = (enm.json?.line_fields ?? []).filter((f) => f.bay_role === 'LINE_OUT');
  const lineField = lineFields[lineFields.length - 1];
  const trunkRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
    project_id: projectId,
    operation: {
      name: 'continue_trunk_segment_sn',
      idempotency_key: `ref_network_trunk_${gpzKey}`,
      payload: {
        field_ref: lineField?.ref_id,
        trunk_id: corridorRef,
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
    console.error(`ODCINEK.${gpzKey} FAIL:`, trunkRes.json?.error_code);
    return null;
  }
  const created = trunkRes.json?.changes?.created_element_ids ?? [];
  const segmentId = created.find((id) => typeof id === 'string' && id.startsWith('seg/')) ?? created[1];
  log(`ODCINEK.${gpzKey}`, `OK segment=${segmentId}`);

  return { gpz, snBus, segmentId, corridorRef };
}

async function main() {
  console.log('=================================================================');
  console.log('WARIANT REFERENCYJNY SN/OZE - 2 GPZ + 30 stacji');
  console.log('=================================================================');

  const ready = await api('GET', '/ready');
  if (!ready.ok) {
    console.error('Backend nieosiągalny:', ready);
    process.exit(1);
  }

  log('PROJEKT', 'Tworzę projekt referencyjny SN/OZE...');
  const project = await api('POST', '/api/projects', {
    name: 'Sieć referencyjna SN/OZE - układ przemysłowy',
    description: 'Złożony wariant terenowy do audytu SLD, obliczeń i konfiguracji OZE',
  });
  if (!project.ok) {
    console.error('Project create failed:', project);
    process.exit(1);
  }
  const projectId = project.json.id;

  const caseRes = await api('POST', '/api/study-cases', {
    project_id: projectId,
    name: 'Wariant bazowy sieci przemysłowej',
    description: 'Wariant do audytu topologii, materializacji ENM i raportów',
  });
  const caseId = caseRes.json.id;
  log('PROJEKT', `OK projectId=${projectId} caseId=${caseId}`);

  // GPZ-A: kabel EPR Al 150 mm² - typowy ciąg miejski.
  const trunkA = await buildGpzTrunk(
    caseId, projectId, 'a_main', 'GPZ-A Główny 110/15 kV',
    'Q01', 'cable-base-epr-al-1c-150',
  );
  if (!trunkA) process.exit(2);

  // GPZ-B: kabel XLPE Cu 240 mm² - ciąg przemysłowy o większym przekroju.
  const trunkB = await buildGpzTrunk(
    caseId, projectId, 'b_backup', 'GPZ-B Rezerwowy 110/15 kV',
    'Q01B', 'cable-base-xlpe-cu-1c-240',
  );
  if (!trunkB) {
    console.warn('Nie utworzono GPZ-B - kontynuuję z pojedynczym ciągiem SN');
  }

  // Pętla stacji per feeder_source ('A' lub 'B')
  let currentSegmentA = trunkA.segmentId;
  let currentSegmentB = trunkB?.segmentId ?? null;
  const stationResults = [];
  // Progresywny podział odcinka utrzymuje równomierny rozkład stacji w ciągu SN.
  //
  // Counter per ACTUAL target segment (A lub B). Gdy GPZ-B fail i fallback do
  // Przy pracy bez GPZ-B wszystkie stacje liczone są w ciągu A.
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
      log(`STACJA.${cfg.id}`, 'FAIL: brak dostępnego odcinka ciągu');
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
        idempotency_key: `ref_network_station_${cfg.id}`,
        payload: {
          segment_id: targetSegment,
          insert_at: { mode: 'RATIO', value: insertRatio },
          station: {
            name: cfg.name,
            station_name: cfg.name,
            name_pl: cfg.name,
            station_type: cfg.station_type,
            sn_voltage_kv: 15,
            nn_voltage_kv: 0.4,
          },
          transformer: {
            transformer_catalog_ref: 'tr-sn-nn-15-04-1000kva-dyn11',
          },
          sn_fields: ['IN', 'OUT', 'TR'],
          // B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
          field_apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
        },
      },
    });
    const ok = stationRes.ok && !stationRes.json?.error_code;
    if (!ok) {
      stationResults.push({ id: cfg.id, status: 'FAIL', error: stationRes.json?.error_code, feeder: cfg.feeder_source });
      log(`STACJA.${cfg.id}`, `FAIL: ${stationRes.json?.error_code}`);
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
    log(`STACJA.${cfg.id}`, `OK (ciąg ${cfg.feeder_source}) station=${stationRefFromCreate?.slice(0, 40) ?? '?'} nn=${nnBus?.ref_id?.slice(0, 40) ?? '?'}`);
  }

  // Dodaj źródła i magazyny per stacja.
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
      const usesStationNnBus = variant === 'nn_side' || variant === 'LV_BEHIND_STATION_TRANSFORMER';
      if (usesStationNnBus && stRes.nnBusRef) {
        payload.bus_nn_ref = stRes.nnBusRef;
      }
      const derRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
        project_id: projectId,
        operation: {
          name: 'add_converter_source',
          idempotency_key: `ref_network_${stRes.id}_${der.kind}_${d}`,
          payload,
        },
      });
      const ok = derRes.ok && !derRes.json?.error_code;
      if (!ok) {
        log(`DER.${stRes.id}.${der.kind}`, `FAIL: ${derRes.json?.error_code ?? derRes.json?.detail ?? 'unknown'}`);
      }
      derResults.push({
        id: stRes.id,
        kind: der.kind,
        variant,
        status: ok ? 'PASS' : `FAIL: ${derRes.json?.error_code ?? derRes.json?.detail ?? ''}`,
      });
    }
  }

  // Odgałęzienia: wstaw słupy ZKSN co kilka stacji i wyprowadź krótkie odcinki boczne.
  // Każde odgałęzienie reprezentuje promień do peryferyjnej części sieci.
  const enmAfterK10 = await api('GET', `/api/cases/${caseId}/enm`);
  const allBranches = enmAfterK10.json?.branches ?? [];
  const trunkASegments = allBranches.filter(
    (b) => b.type === 'cable' && b.ref_id?.startsWith('seg/')
      && b.length_km && b.length_km > 0.05
  );
  // Wybierz cztery odcinki w pozycjach kwartylowych.
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
    // 1. Wstaw słup odgałęźny na odcinku.
    const poleRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
      project_id: projectId,
      operation: {
        name: 'insert_zksn_on_segment_sn',
        idempotency_key: `ref_network_branch_pole_${i}`,
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
      log(`ODGALEZIENIE.${i}.slup`, `FAIL: ${errMsg}`);
      branchResults.push({ idx: i, status: `POLE_FAIL: ${errMsg}` });
      continue;
    }
    const poleCreated = poleRes.json?.changes?.created_element_ids ?? [];
    const poleRefId = poleCreated.find((id) => typeof id === 'string' && (id.includes('/zksn') || id.includes('/branch_pole')));
    if (!poleRefId) {
      log(`ODGALEZIENIE.${i}.slup`, 'NO_POLE_REF');
      branchResults.push({ idx: i, status: 'NO_POLE_REF' });
      continue;
    }
    // Pobierz bus ref dla BRANCH port (per ZKSN.ports.BRANCH[0])
    const snapAfterPole = await api('GET', `/api/cases/${caseId}/enm`);
    const bps = snapAfterPole.json?.branch_points ?? [];
    const myBp = bps.find((b) => b.ref_id === poleRefId);
    const branchBusRef = myBp?.ports?.BRANCH?.[0];
    if (!branchBusRef) {
      log(`ODGALEZIENIE.${i}.odcinek`, 'NO_BRANCH_BUS');
      branchResults.push({ idx: i, status: 'NO_BRANCH_BUS' });
      continue;
    }
    // 2. Wyprowadź odcinek boczny ze słupa ZKSN.
    const branchSegRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
      project_id: projectId,
      operation: {
        name: 'start_branch_segment_sn',
        idempotency_key: `ref_network_branch_seg_${i}`,
        payload: {
          from_bus_ref: branchBusRef,
          segment: {
            rodzaj: 'KABEL',
            dlugosc_m: 1500 + (i * 200),
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
      log(`ODGALEZIENIE.${i}.odcinek`, `FAIL: ${branchSegRes.json?.error_code ?? ''}`);
    }
  }
  const branchOk = branchResults.filter((r) => r.status === 'PASS').length;
  log('ODGALEZIENIA', `Odgałęzienia: ${branchOk}/${branchResults.length} PASS`);

  // Odpływy nN per stacja.
  const NN_FEEDER_CATALOG = 'cb_nn_400a';
  const loadResults = [];
  for (const stRes of stationResults) {
    if (stRes.status !== 'PASS' || !stRes.nnBusRef) continue;

    // Jawne odpływy nN albo pojedynczy odbiór z konfiguracji stacji.
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
          idempotency_key: `ref_network_${stRes.id}_nn_feeder_${fi}`,
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

      // Podłącz odbiór, jeśli odpływ ma moc czynną.
      if (feeder.p_kw && feeder.p_kw > 0) {
        let loadCatalog = 'load_mieszk_15kw';
        if (feeder.kind === 'przemyslowy') loadCatalog = 'load_przem_75kw';
        else if (feeder.kind === 'komunalny') loadCatalog = 'load_uslugi_30kw';

        const loadRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
          project_id: projectId,
          operation: {
            name: 'add_nn_load',
            idempotency_key: `ref_network_${stRes.id}_load_${fi}`,
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
        // Odpływ bez odbioru jest jawnie zamodelowanym polem rezerwowym.
        loadResults.push({
          id: `${stRes.id}#${fi}`,
          kind: 'rezerwowy',
          p_kw: 0,
          status: 'PASS',
        });
      }
    }
  }

  // Podsumowanie końcowe.
  const sumOk = stationResults.filter((r) => r.status === 'PASS').length;
  const sumFail = stationResults.length - sumOk;
  const derOk = derResults.filter((r) => r.status === 'PASS').length;
  const derFail = derResults.length - derOk;
  const loadOk = loadResults.filter((r) => r.status === 'PASS').length;
  const loadFail = loadResults.length - loadOk;
  const aOk = stationResults.filter((r) => r.status === 'PASS' && r.feeder === 'A').length;
  const bOk = stationResults.filter((r) => r.status === 'PASS' && r.feeder === 'B').length;

  console.log('=================================================================');
  console.log('PODSUMOWANIE WARIANTU REFERENCYJNEGO');
  console.log('=================================================================');
  console.log(`Stacje:   ${sumOk}/${stationResults.length} PASS (A=${aOk}, B=${bOk}) ${sumFail} FAIL`);
  console.log(`DER:      ${derOk}/${derResults.length} PASS, ${derFail} FAIL`);
  console.log(`Odbiory:  ${loadOk}/${loadResults.length} PASS, ${loadFail} FAIL`);
  console.log(`Projekt:  ${projectId}`);
  console.log(`Przypadek: ${caseId}`);
  console.log('-----------------------------------------------------------------');
  console.log('Szczegóły stacji:');
  for (const r of stationResults) {
    console.log(`  ${r.id} (ciąg ${r.cfg?.feeder_source ?? r.feeder ?? '?'}): ${r.status}${r.error ? ` (${r.error})` : ''}`);
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
