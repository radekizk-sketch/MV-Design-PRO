#!/usr/bin/env node
/**
 * GN20 reference network seeder — K20 SCADA-CAD grade target.
 *
 * Buduje sieć K20: 1 GPZ + 2 sekcje SN + 20 stacji unique config
 * (każda z innym OZE/odbiór/connection_variant). Plus dodatkowo ZKSN
 * branch points + odgałęzienia kabli SN.
 *
 * USAGE: node scripts/seed-gn20.mjs
 * REQUIRES: backend at BACKEND_URL (default http://127.0.0.1:8000)
 *
 * OUTPUT: JSON summary stations PASS/FAIL + projectId/caseId do dalszych
 * iteracji audit loop (seedingu + scr + 7-specialist review).
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
 * STATION_CONFIGS — 20 unique stacje per § 2 macierz PROMPT_AUDIT_K20.
 *
 * Każda stacja ma:
 *  - id: unique key (idempotency)
 *  - name: polska nazwa
 *  - station_type: 'inline' | 'branch' | 'terminal' | 'sectional'
 *  - der: [{kind:'PV'|'BESS'|'FW', p_mw, catalog_ref, connection_variant}]
 *  - load: {p_kw, kind:'bytowy'|'komunalny'|'przemyslowy'|'rolniczy'}
 *  - description: kontekst inżynierski
 */
const STATION_CONFIGS = [
  // 1. (GPZ-ABG = osobno w K2)
  // 2. Słupowa ZKSN — PV 50 kW prosument
  { id: 'S02', name: 'Stacja S02 ZKSN prosument PV', station_type: 'inline', der: [{ kind: 'PV', p_mw: 0.05 }], description: 'Słupowa ZKSN, PV prosument 50 kW' },
  // 3. Słupowa ZKSN — bytowy odbiór 30 kVA
  { id: 'S03', name: 'Stacja S03 ZKSN bytowa', station_type: 'inline', load: { p_kw: 30, kind: 'bytowy' }, description: 'Słupowa ZKSN, klasyczna bytowa' },
  // 4. Kontenerowa typ K — PV 500 kW + przemysłowy 100 kW
  { id: 'S04', name: 'Stacja S04 K PV+przemysł', station_type: 'inline', der: [{ kind: 'PV', p_mw: 0.5 }], load: { p_kw: 100, kind: 'przemyslowy' }, description: 'Kontenerowa typ K, mini-block PV nN' },
  // 5. Kontenerowa K — BESS 1 MW
  { id: 'S05', name: 'Stacja S05 K BESS 1MW', station_type: 'inline', der: [{ kind: 'BESS', p_mw: 1.0, connection_variant: 'block_transformer' }], description: 'BESS 1 MW / 2 MWh block transformer 15 kV' },
  // 6. Kontenerowa K — FW 800 kW
  { id: 'S06', name: 'Stacja S06 K FW 800kW', station_type: 'inline', der: [{ kind: 'FW', p_mw: 0.8, connection_variant: 'DEDICATED_MV_CONNECTION' }], description: 'FW dedicated MV connection' },
  // 7. Kontenerowa K — PV+BESS hybrid + przemysłowy
  { id: 'S07', name: 'Stacja S07 K hybrid PV+BESS', station_type: 'inline', der: [{ kind: 'PV', p_mw: 2.0 }, { kind: 'BESS', p_mw: 0.5 }], load: { p_kw: 500, kind: 'przemyslowy' }, description: 'Hybrid PV+BESS dwa inwertery' },
  // 8. Wnętrzowa MV/LV — PV 1 MW + komunalny
  { id: 'S08', name: 'Stacja S08 wnętrzowa PV+komun', station_type: 'inline', der: [{ kind: 'PV', p_mw: 1.0, connection_variant: 'LV_BEHIND_STATION_TRANSFORMER' }], load: { p_kw: 200, kind: 'komunalny' }, description: 'Wnętrzowa LV_BEHIND_STATION_TRANSFORMER' },
  // 9. Wnętrzowa MV/LV — przemysłowy 2 MW
  { id: 'S09', name: 'Stacja S09 wnętrzowa przemysł 2MW', station_type: 'inline', load: { p_kw: 2000, kind: 'przemyslowy' }, description: 'Klasyczny duży odbiór 2 MW' },
  // 10. Kontenerowa K — PV 5 MW farma
  { id: 'S10', name: 'Stacja S10 K farma PV 5MW', station_type: 'inline', der: [{ kind: 'PV', p_mw: 5.0, connection_variant: 'SOURCE_CONNECTION_STATION' }], description: 'PV farma 5 MW source connection station' },
  // 11. Słupowa — PV 30 kW mikroinstalacja prosumencka
  { id: 'S11', name: 'Stacja S11 słupowa mikro PV', station_type: 'inline', der: [{ kind: 'PV', p_mw: 0.03 }], load: { p_kw: 20, kind: 'bytowy' }, description: 'Mikroinstalacja prosumencka 30 kW' },
  // 12. Wnętrzowa — BESS 4 MWh peak shaving
  { id: 'S12', name: 'Stacja S12 wnętrzowa BESS 4MWh', station_type: 'inline', der: [{ kind: 'BESS', p_mw: 2.0, connection_variant: 'block_transformer' }], description: 'BESS 4 MWh peak shaving block 15 kV' },
  // 13. Kontenerowa — FW 2x2 MW
  { id: 'S13', name: 'Stacja S13 K FW 2x2MW', station_type: 'inline', der: [{ kind: 'FW', p_mw: 2.0 }, { kind: 'FW', p_mw: 2.0 }], description: 'Dwa generatory asynchroniczne 2 MW' },
  // 14. Hybrid triple — PV+BESS+FW
  { id: 'S14', name: 'Stacja S14 hybrid triple', station_type: 'inline', der: [{ kind: 'PV', p_mw: 1.0 }, { kind: 'BESS', p_mw: 0.5 }, { kind: 'FW', p_mw: 0.5 }], description: 'Triple-source hybrid station' },
  // 15. Słupowa — rolnictwo 50 kVA
  { id: 'S15', name: 'Stacja S15 słupowa rolnictwo', station_type: 'inline', load: { p_kw: 50, kind: 'rolniczy' }, description: 'Rzadkie obciążenie sezonowe rolne' },
  // 16. Wnętrzowa — huta przemysłowy 5 MW
  { id: 'S16', name: 'Stacja S16 wnętrzowa huta 5MW', station_type: 'inline', load: { p_kw: 5000, kind: 'przemyslowy' }, description: 'Duży zakład profil płaski' },
  // 17. Kontenerowa — PV 800 kW + cos phi regulation
  { id: 'S17', name: 'Stacja S17 K PV+cos phi reg', station_type: 'inline', der: [{ kind: 'PV', p_mw: 0.8 }], load: { p_kw: 300, kind: 'przemyslowy' }, description: 'PV z regulacją cos φ' },
  // 18. Kontenerowa — BESS 2 MW FCR/SR
  { id: 'S18', name: 'Stacja S18 K BESS 2MW FCR', station_type: 'inline', der: [{ kind: 'BESS', p_mw: 2.0, connection_variant: 'block_transformer' }], description: 'BESS 2 MW / 4 MWh FCR/SR primary' },
  // 19. Słupowa prosument — PV 100 kW Q-U regulation
  { id: 'S19', name: 'Stacja S19 słupowa PV 100kW Q-U', station_type: 'inline', der: [{ kind: 'PV', p_mw: 0.1 }], load: { p_kw: 40, kind: 'bytowy' }, description: 'Prosument PV 100 kW Q-U regulation NC RFG' },
  // 20. Wnętrzowa — FW 3 MW single
  { id: 'S20', name: 'Stacja S20 wnętrzowa FW 3MW', station_type: 'inline', der: [{ kind: 'FW', p_mw: 3.0, connection_variant: 'DEDICATED_MV_CONNECTION' }], description: 'Single large wind turbine 3 MW' },
  // 21. Mini-block PV-only — odbiór bytowy
  { id: 'S21', name: 'Stacja S21 mini-block PV', station_type: 'inline', der: [{ kind: 'PV', p_mw: 0.3 }], load: { p_kw: 50, kind: 'bytowy' }, description: 'Mini-block PV-only variant rebuild' },
];

const PV_NN_CATALOG = 'conv-pv-nn-0p5mw-0p4kv';
const PV_MV_CATALOG = 'conv-pv-1mw-15kv';
// REAL catalog IDs (verified mv_converter_catalog.py):
const BESS_MV_CATALOG = 'conv-bess-1mw-2mwh-15kv';
const BESS_MV_LARGE = 'conv-bess-2mw-4mwh-15kv';
const FW_MV_CATALOG = 'conv-wind-2mw-15kv';
const FW_MV_LARGE = 'conv-wind-3mw-15kv';

function pickConverterCatalog(kind, pMw, variant) {
  if (kind === 'PV') {
    // nn_side ZAWSZE używa nN catalog 0.4 kV (voltage match z nn bus)
    if (variant === 'nn_side' || variant === 'LV_BEHIND_STATION_TRANSFORMER') return PV_NN_CATALOG;
    // MV variants używają 15 kV catalog per power range
    if (pMw <= 1.0) return 'conv-pv-1mw-15kv';
    if (pMw <= 2.0) return 'conv-pv-2mw-15kv';
    return 'conv-pv-5mw-15kv';
  }
  if (kind === 'BESS') {
    // BESS catalog: brak nN variant — wszystkie MV (block_transformer)
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

async function main() {
  console.log('=================================================================');
  console.log('GN20 K20 SEEDER — 1 GPZ + 20 unique stations (PV/BESS/FW/odbiór)');
  console.log('=================================================================');

  const ready = await api('GET', '/ready');
  if (!ready.ok) {
    console.error('Backend nieosiągalny:', ready);
    process.exit(1);
  }

  log('K1', 'Tworzę projekt GN20...');
  const project = await api('POST', '/api/projects', {
    name: 'GN20 — K20 reference network (20 stations unique config)',
    description: 'K20 SCADA-CAD grade target — audit loop seeder',
  });
  if (!project.ok) {
    console.error('Project create failed:', project);
    process.exit(1);
  }
  const projectId = project.json.id;

  const caseRes = await api('POST', '/api/study-cases', {
    project_id: projectId,
    name: 'Wariant bazowy K20',
    description: 'GN20 baseline — audit loop',
  });
  const caseId = caseRes.json.id;
  log('K1', `OK projectId=${projectId} caseId=${caseId}`);

  // K2: GPZ
  log('K2', 'Wstaw GPZ Główny 110/15 kV...');
  const gpzRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
    project_id: projectId,
    operation: {
      name: 'add_grid_source_sn',
      idempotency_key: 'gn20_gpz_main_v1',
      payload: {
        source_id: 'src_gpz_main_k20',
        name_pl: 'GPZ Główny 110/15 kV (K20)',
        voltage_kv: 15.0,
        catalog_ref: 'src-gpz-15kv-100mva-rx008',
      },
    },
  });
  if (!gpzRes.ok || gpzRes.json?.error_code) {
    console.error('K2 FAIL:', gpzRes.json?.error_code ?? gpzRes.json?.detail);
    process.exit(2);
  }
  const snapshot = gpzRes.json?.snapshot;
  const gpz = (snapshot?.substations ?? []).find((s) => s.station_type === 'gpz');
  const snBus = (snapshot?.buses ?? []).find((b) => b.voltage_kv === 15);
  log('K2', `OK GPZ=${gpz?.ref_id} bus=${snBus?.ref_id}`);

  // K3: Sekcja II
  log('K3', 'Dodatkowa sekcja SN (Sekcja II)...');
  const sec2Res = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
    project_id: projectId,
    operation: {
      name: 'add_gpz_section',
      idempotency_key: 'gn20_section_002',
      payload: {
        substation_ref: gpz.ref_id,
        side: 'lv',
        section_id: `${gpz.ref_id}/section/002`,
        bus_ref: snBus.ref_id,
        order: 1,
        name: 'Sekcja II',
      },
    },
  });
  log('K3', sec2Res.ok && !sec2Res.json?.error_code ? 'OK' : `FAIL: ${sec2Res.json?.error_code}`);

  // K4: Pole SN line_out
  log('K4', 'Pole SN line_out Q01...');
  const bayRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
    project_id: projectId,
    operation: {
      name: 'add_sn_bay',
      idempotency_key: 'gn20_bay_q01',
      payload: {
        bus_ref: snBus.ref_id,
        bay_role: 'LINE_OUT',
        catalog_ref: 'sw-ls-abb-nal-12kv-630a',
        designation_q: 'Q01',
      },
    },
  });
  if (!bayRes.ok || bayRes.json?.error_code) {
    console.error('K4 FAIL:', bayRes.json?.error_code);
    process.exit(4);
  }
  log('K4', 'OK Q01');

  // K4b: Pole SN line_out na Sekcji II (Q02) — symetria sekcji
  log('K4b', 'Pole SN line_out Q02 na Sekcji II...');
  const bay2Res = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
    project_id: projectId,
    operation: {
      name: 'add_sn_bay',
      idempotency_key: 'gn20_bay_q02',
      payload: {
        bus_ref: snBus.ref_id, // ta sama szyna SN (sec 1+2 współdzielą bus)
        bay_role: 'LINE_OUT',
        catalog_ref: 'sw-ls-abb-nal-12kv-630a',
        designation_q: 'Q02',
      },
    },
  });
  log('K4b', bay2Res.ok && !bay2Res.json?.error_code ? 'OK Q02' : `FAIL: ${bay2Res.json?.error_code}`);

  // K5: Trunk segment SN
  log('K5', 'Trunk segment SN 5000 m...');
  const enm4 = await api('GET', `/api/cases/${caseId}/enm`);
  const lineField = (enm4.json?.line_fields ?? []).find((f) => f.bay_role === 'LINE_OUT');
  const trunkRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
    project_id: projectId,
    operation: {
      name: 'continue_trunk_segment_sn',
      idempotency_key: 'gn20_trunk_main',
      payload: {
        field_ref: lineField?.ref_id,
        from_terminal_id: snBus.ref_id,
        segment: {
          rodzaj: 'KABEL',
          dlugosc_m: 5000,
          catalog_ref: 'cable-base-epr-al-1c-150',
        },
      },
    },
  });
  if (!trunkRes.ok || trunkRes.json?.error_code) {
    console.error('K5 FAIL:', trunkRes.json?.error_code);
    process.exit(5);
  }
  const createdK5 = trunkRes.json?.changes?.created_element_ids ?? [];
  let currentSegmentId = createdK5.find((id) => typeof id === 'string' && id.startsWith('seg/')) ?? createdK5[1];
  log('K5', `OK trunk segment=${currentSegmentId}`);

  // K6 loop: 20 stacji wzdłuż trunk (kolejne split punkty)
  const stationResults = [];
  for (let i = 0; i < STATION_CONFIGS.length; i++) {
    const cfg = STATION_CONFIGS[i];
    // Wstaw stację w mid (0.5) — backend wykonuje split
    const ratio = 0.5;
    const stationRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
      project_id: projectId,
      operation: {
        name: 'insert_station_on_segment_sn',
        idempotency_key: `gn20_station_${cfg.id}`,
        payload: {
          segment_id: currentSegmentId,
          insert_at: { mode: 'RATIO', value: ratio },
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
      stationResults.push({ id: cfg.id, status: 'FAIL', error: stationRes.json?.error_code });
      log(`K6.${cfg.id}`, `FAIL: ${stationRes.json?.error_code}`);
      continue;
    }
    // Capture station ref_id from snapshot — backend nie preserve name_pl,
    // więc szukamy nowo utworzonej stacji inline (po revision delta).
    const createdIds = stationRes.json?.changes?.created_element_ids ?? [];
    const stationRefFromCreate = createdIds.find(
      (id) => typeof id === 'string' && id.startsWith('stn/') && id.endsWith('/station'),
    );
    // Znajdź segment kontynuacji (RIGHT half po split) z snapshot
    const enmAfter = await api('GET', `/api/cases/${caseId}/enm`);
    const branches = enmAfter.json?.branches ?? [];
    const cableSegs = branches.filter(
      (b) => typeof b.ref_id === 'string' && b.ref_id.startsWith('seg/') && b.type === 'cable',
    );
    if (cableSegs.length > 0) {
      currentSegmentId = cableSegs[cableSegs.length - 1].ref_id;
    }
    // Znajdź nn_bus ref dla tej stacji
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
    });
    log(`K6.${cfg.id}`, `OK station=${stationRefFromCreate?.slice(0, 40) ?? '?'} nn=${nnBus?.ref_id?.slice(0, 40) ?? '?'}`);
  }

  // K10 loop: dodaj DER per station (PV/BESS/FW) — ref_id tracking
  const derResults = [];
  for (const stRes of stationResults) {
    if (stRes.status !== 'PASS' || !stRes.cfg.der || !stRes.stationRef) continue;
    for (let d = 0; d < stRes.cfg.der.length; d++) {
      const der = stRes.cfg.der[d];
      // BESS/FW domyślnie block_transformer (MV side), PV nn_side
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
          idempotency_key: `gn20_${stRes.id}_${der.kind}_${d}`,
          payload,
        },
      });
      const ok = derRes.ok && !derRes.json?.error_code;
      derResults.push({
        id: stRes.id,
        kind: der.kind,
        variant,
        status: ok ? 'PASS' : `FAIL: ${derRes.json?.error_code ?? ''}`,
      });
    }
  }

  // K11: Attach loads per STATION_CONFIGS (add_nn_outgoing_field +
  // add_nn_load). Wymaga: feeder nN field per stacja.
  // V12K-021 resolved: LV apparatus catalog endpoint is /api/catalog/lv-apparatus-types
  // (14 entries, ABB SACE Emax2 + Tmax XT + Jean Muller verified).
  const NN_FEEDER_CATALOG = 'cb_nn_400a'; // Wylacznik glowny nN 400 A ABB
  const loadResults = [];
  for (const stRes of stationResults) {
    if (stRes.status !== 'PASS' || !stRes.cfg.load || !stRes.nnBusRef) continue;
    // 1. Stwórz pole odpływowe nN
    const feederRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
      project_id: projectId,
      operation: {
        name: 'add_nn_outgoing_field',
        idempotency_key: `gn20_${stRes.id}_nn_feeder`,
        payload: {
          bus_nn_ref: stRes.nnBusRef,
          station_ref: stRes.stationRef,
          field_role: 'OUTGOING',
          field_name: `Odpływ nN ${stRes.cfg.id}`,
          catalog_ref: NN_FEEDER_CATALOG,
        },
      },
    });
    const feederOk = feederRes.ok && !feederRes.json?.error_code;
    if (!feederOk) {
      loadResults.push({ id: stRes.id, status: `FEEDER_FAIL: ${feederRes.json?.error_code ?? ''}` });
      continue;
    }
    const feederIds = feederRes.json?.changes?.created_element_ids ?? [];
    // Feeder ref format: nn/{hash}/outgoing per domain_operations_v2.add_nn_outgoing_field
    const feederRef = feederIds.find(
      (id) => typeof id === 'string' && id.startsWith('nn/') && id.endsWith('/outgoing'),
    );
    if (!feederRef) {
      loadResults.push({ id: stRes.id, status: 'NO_FEEDER_REF' });
      continue;
    }
    // 2. Attach load — wymaga catalog_ref OBCIAZENIE namespace
    // Wybór catalog per kind/p_kw:
    let loadCatalog = 'load_mieszk_15kw';
    if (stRes.cfg.load.kind === 'przemyslowy') loadCatalog = 'load_przem_75kw';
    else if (stRes.cfg.load.kind === 'komunalny') loadCatalog = 'load_uslugi_30kw';
    // bytowy/rolniczy -> load_mieszk_15kw (default)

    const loadRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
      project_id: projectId,
      operation: {
        name: 'add_nn_load',
        idempotency_key: `gn20_${stRes.id}_load`,
        payload: {
          feeder_ref: feederRef,
          bus_nn_ref: stRes.nnBusRef,
          active_power_kw: stRes.cfg.load.p_kw,
          reactive_power_kvar: stRes.cfg.load.p_kw * 0.33, // cos φ ~ 0.95
          load_kind: 'SKUPIONY',
          connection_type: 'TROJFAZOWY',
          load_name: `Odbiór ${stRes.cfg.load.kind} ${stRes.cfg.load.p_kw} kW`,
          cos_phi: 0.95,
          catalog_ref: loadCatalog,
        },
      },
    });
    const loadOk = loadRes.ok && !loadRes.json?.error_code;
    loadResults.push({
      id: stRes.id,
      kind: stRes.cfg.load.kind,
      p_kw: stRes.cfg.load.p_kw,
      status: loadOk ? 'PASS' : `FAIL: ${loadRes.json?.error_code ?? ''}`,
    });
  }

  // Final summary
  const sumOk = stationResults.filter((r) => r.status === 'PASS').length;
  const sumFail = stationResults.length - sumOk;
  const derOk = derResults.filter((r) => r.status === 'PASS').length;
  const derFail = derResults.length - derOk;

  console.log('=================================================================');
  console.log('GN20 K20 SEED FINAL SUMMARY');
  console.log('=================================================================');
  console.log(`Stacje: ${sumOk}/${stationResults.length} PASS, ${sumFail} FAIL`);
  console.log(`DER:    ${derOk}/${derResults.length} PASS, ${derFail} FAIL`);
  console.log(`Project: ${projectId}`);
  console.log(`Case:    ${caseId}`);
  console.log('-----------------------------------------------------------------');
  console.log('Station details:');
  for (const r of stationResults) {
    console.log(`  ${r.id}: ${r.status}${r.error ? ` (${r.error})` : ''}`);
  }
  console.log('-----------------------------------------------------------------');
  console.log('DER details:');
  for (const r of derResults) {
    console.log(`  ${r.id} ${r.kind} (${r.variant}): ${r.status}`);
  }
  console.log('-----------------------------------------------------------------');
  console.log('Load details:');
  const loadOk = loadResults.filter((r) => r.status === 'PASS').length;
  const loadFail = loadResults.length - loadOk;
  console.log(`Loads: ${loadOk}/${loadResults.length} PASS, ${loadFail} FAIL`);
  for (const r of loadResults) {
    console.log(`  ${r.id} ${r.kind ?? ''} ${r.p_kw ? r.p_kw + ' kW' : ''}: ${r.status}`);
  }

  // JSON output dla downstream scripts (audit loop)
  console.log('=================================================================');
  console.log('JSON:', JSON.stringify({
    projectId,
    caseId,
    stations: { pass: sumOk, fail: sumFail, total: stationResults.length },
    der: { pass: derOk, fail: derFail, total: derResults.length },
    loads: { pass: loadOk, fail: loadFail, total: loadResults.length },
  }));
}

main().catch((e) => {
  console.error('UNCAUGHT:', e);
  process.exit(99);
});
