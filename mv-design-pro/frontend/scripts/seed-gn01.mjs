#!/usr/bin/env node
/**
 * GN01 reference network seeder — Iter 12 (per workflow E2E auditor).
 *
 * Buduje sieć GN01 (single line GPZ → 1 RMU) krok po kroku via domain-ops API:
 *   K1: Project + Study Case
 *   K2: GPZ (add_grid_source_sn) z catalog binding
 *   K3: Sekcja SN (add_gpz_section) — gdy backend obsługuje
 *   K4: Pole SN (add_sn_bay) — wyprowadzenie
 *   K5: Wyprowadzenie odcinka (continue_trunk_segment_sn)
 *   K6: Stacja końcowa (insert_station_on_segment_sn)
 *
 * Po każdym kroku weryfikuje stan ENM przez topology/summary endpoint.
 *
 * USAGE: node scripts/seed-gn01.mjs
 * REQUIRES: backend up at http://127.0.0.1:8000
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

async function main() {
  log('K0', 'Sprawdzam backend...');
  const ready = await api('GET', '/ready');
  if (!ready.ok) {
    console.error('Backend nieosiągalny:', ready);
    process.exit(1);
  }

  log('K1', 'Tworzę projekt GN01...');
  const project = await api('POST', '/api/projects', {
    name: 'GN01 — Single line GPZ → 1 RMU',
    description: 'Reference network — iter 12 seeder',
  });
  if (!project.ok) {
    console.error('Project create failed:', project);
    process.exit(1);
  }
  const projectId = project.json.id;
  log('K1', `OK projectId=${projectId}`);

  log('K1', 'Tworzę study case...');
  const caseRes = await api('POST', '/api/study-cases', {
    project_id: projectId,
    name: 'Wariant bazowy',
    description: 'GN01 baseline calculation case',
  });
  if (!caseRes.ok) {
    console.error('Study case create failed:', caseRes);
    process.exit(1);
  }
  const caseId = caseRes.json.id;
  log('K1', `OK caseId=${caseId}`);

  log('K1', 'Pobieram snapshot bazowy...');
  const summary0 = await api('GET', `/api/cases/${caseId}/enm/topology/summary`);
  log('K1', 'snapshot0', {
    bus_count: summary0.json.bus_count,
    revision: summary0.json.enm_revision,
  });

  log('K2', 'Wstaw GPZ (add_grid_source_sn)...');
  const gpzRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
    project_id: projectId,
    operation: {
      name: 'add_grid_source_sn',
      idempotency_key: 'gn01_gpz_main_v1',
      payload: {
        source_id: 'src_gpz_main',
        name_pl: 'GPZ Główny 110/15 kV',
        voltage_kv: 15.0, // Wymagane: backend rzuca source.missing_voltage gdy brak
        // Backend syntezuje catalog_binding z payload.catalog_ref + namespace ZRODLO_SN
        // per backend/src/api/domain_ops_policy.py:194-201
        catalog_ref: 'src-gpz-15kv-100mva-rx008',
      },
    },
  });
  // Backend zwraca HTTP 200 nawet przy błędach domain — sprawdź error_code
  const gpzError = gpzRes.json?.error_code;
  if (!gpzRes.ok || gpzError) {
    console.error(
      'K2 GPZ insert failed:',
      gpzRes.status,
      gpzError ?? gpzRes.json?.detail,
      gpzRes.json?.error,
    );
  } else {
    log('K2', 'OK GPZ inserted', {
      created: gpzRes.json?.changes?.created_element_ids?.length ?? 0,
    });
  }

  log('K2', 'Weryfikuję topology po K2...');
  const summary2 = await api('GET', `/api/cases/${caseId}/enm/topology/summary`);
  log('K2', 'snapshot2', {
    bus_count: summary2.json.bus_count,
    source_count: summary2.json.source_count,
    revision: summary2.json.enm_revision,
  });

  // K3: Dodatkowa sekcja SN (2-sekcyjna rozdzielnia GPZ)
  let k3Status = 'NOT_REACHED';
  if (gpzRes.ok && !gpzRes.json?.error_code) {
    // Wyciągnij substation_ref z snapshot
    const snapshot = gpzRes.json?.snapshot;
    const substations = snapshot?.substations ?? [];
    const gpz = substations.find((s) => s.station_type === 'gpz');
    const existingBus = (snapshot?.buses ?? []).find((b) => b.voltage_kv === 15);
    if (gpz && existingBus) {
      log('K3', 'Dodatkowa sekcja SN (add_gpz_section)...');
      const sec2Res = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
        project_id: projectId,
        operation: {
          name: 'add_gpz_section',
          idempotency_key: 'gn01_section_002',
          payload: {
            substation_ref: gpz.ref_id,
            side: 'lv',
            section_id: `${gpz.ref_id}/section/002`,
            bus_ref: existingBus.ref_id, // ta sama szyna SN
            order: 1,
            name: 'Sekcja II',
          },
        },
      });
      if (sec2Res.ok && !sec2Res.json?.error_code) {
        k3Status = 'PASS';
        log('K3', 'OK section II added', {
          created: sec2Res.json?.changes?.created_element_ids?.length ?? 0,
        });
      } else {
        k3Status = `FAIL: ${sec2Res.status} ${sec2Res.json?.error_code ?? sec2Res.json?.error ?? ''}`;
        log('K3', k3Status);
      }
    } else {
      k3Status = 'FAIL: missing gpz/bus refs from K2 snapshot';
      log('K3', k3Status);
    }
  }

  // K4: Pole SN (add_sn_bay) — line_out bay z catalog binding APARAT_SN
  let k4Status = 'NOT_REACHED';
  if (k3Status === 'PASS') {
    const enmAfterK3 = await api('GET', `/api/cases/${caseId}/enm`);
    const snBus = (enmAfterK3.json?.buses ?? []).find(
      (b) => b.voltage_kv === 15,
    );
    if (snBus) {
      log('K4', 'Pole SN line_out (add_sn_bay)...');
      const bayRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
        project_id: projectId,
        operation: {
          name: 'add_sn_bay',
          idempotency_key: 'gn01_bay_q01_line_out',
          payload: {
            bus_ref: snBus.ref_id,
            bay_role: 'LINE_OUT',
            // namespace APARAT_SN syntezowane z catalog_ref per domain_ops_policy.py:212
            catalog_ref: 'sw-ls-abb-nal-12kv-630a',
            designation_q: 'Q01',
          },
        },
      });
      if (bayRes.ok && !bayRes.json?.error_code) {
        k4Status = 'PASS';
        log('K4', 'OK bay Q01 added', {
          created: bayRes.json?.changes?.created_element_ids?.length ?? 0,
        });
      } else {
        k4Status = `FAIL: ${bayRes.status} ${bayRes.json?.error_code ?? bayRes.json?.error ?? ''}`;
        log('K4', k4Status);
      }
    }
  }

  // K5: Wyprowadzenie odcinka magistrali SN (continue_trunk_segment_sn)
  let k5Status = 'NOT_REACHED';
  if (k4Status === 'PASS') {
    // K4 utworzyło bay — wyciągnij field_ref z snapshot
    const enmAfterK4 = await api('GET', `/api/cases/${caseId}/enm`);
    const fields = enmAfterK4.json?.line_fields ?? [];
    const lineOutField = fields.find((f) => f.bay_role === 'LINE_OUT');
    const snBus2 = (enmAfterK4.json?.buses ?? []).find(
      (b) => b.voltage_kv === 15,
    );
    if (lineOutField || snBus2) {
      log('K5', 'Wyprowadzenie kabla SN (continue_trunk_segment_sn)...');
      const trunkRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
        project_id: projectId,
        operation: {
          name: 'continue_trunk_segment_sn',
          idempotency_key: 'gn01_trunk_seg_001',
          payload: {
            field_ref: lineOutField?.ref_id,
            from_terminal_id: snBus2?.ref_id,
            segment: {
              rodzaj: 'KABEL',
              dlugosc_m: 1500,
              catalog_ref: 'cable-base-epr-al-1c-150',
            },
          },
        },
      });
      if (trunkRes.ok && !trunkRes.json?.error_code) {
        k5Status = 'PASS';
        const createdIds = trunkRes.json?.changes?.created_element_ids ?? [];
        // Segment ref ma prefix 'seg/' (vs 'bus/' dla downstream terminal).
        // Per K5 inspection: created = ['bus/.../downstream', 'seg/.../segment']
        globalThis._k5_segment_id =
          createdIds.find((id) => typeof id === 'string' && id.startsWith('seg/')) ??
          createdIds[1] ??
          createdIds[0] ??
          null;
        log('K5', 'OK trunk segment added', {
          created: createdIds.length,
          segment_id: globalThis._k5_segment_id,
        });
      } else {
        k5Status = `FAIL: ${trunkRes.status} ${trunkRes.json?.error_code ?? trunkRes.json?.error ?? ''}`;
        log('K5', k5Status);
      }
    }
  }

  // K6: Wstaw stację MV/LV na ciągu (insert_station_on_segment_sn)
  let k6Status = 'NOT_REACHED';
  let segmentId = null;
  if (k5Status === 'PASS') {
    // Użyj segment_id zapisanego z K5 createdElementIds (full ENM endpoint nie
    // zwraca cable_segments_sn collection — branch_count=2 widoczne tylko w
    // topology/summary; segment_id pochodzi z create operation response).
    segmentId = globalThis._k5_segment_id;
    if (segmentId) {
      log('K6', `Wstaw stację MV/LV (insert_station_on_segment_sn)...`);
      const stationRes = await api(
        'POST',
        `/api/cases/${caseId}/enm/domain-ops`,
        {
          project_id: projectId,
          operation: {
            name: 'insert_station_on_segment_sn',
            idempotency_key: 'gn01_station_001',
            payload: {
              segment_id: segmentId,
              insert_at: { mode: 'RATIO', value: 0.5 },
              station: {
                name_pl: 'Stacja S01 (15/0.4 kV)',
                // Backend wymaga: inline, branch, terminal, sectional lub A-D
                station_type: 'inline',
                // Napięcia — topologiczne dziedziczenie z segmentu, jawne dla pewności
                sn_voltage_kv: 15,
                nn_voltage_kv: 0.4,
              },
              transformer: {
                transformer_catalog_ref: 'tr-sn-nn-15-04-1000kva-dyn11',
              },
              sn_fields: ['IN', 'OUT', 'TR'],
            },
          },
        },
      );
      if (stationRes.ok && !stationRes.json?.error_code) {
        k6Status = 'PASS';
        log('K6', 'OK station S01 inserted', {
          created: stationRes.json?.changes?.created_element_ids?.length ?? 0,
        });
      } else {
        k6Status = `FAIL: ${stationRes.status} ${stationRes.json?.error_code ?? stationRes.json?.error ?? ''}`;
        log('K6', k6Status);
      }
    } else {
      k6Status = 'FAIL: no segment_id from K5';
      log('K6', k6Status);
    }
  }

  // K8: ZKSN słup na kablu SN (insert_zksn_on_segment_sn).
  // K6 mogło zmienić segment_id (split podczas insert station), więc
  // bierzemy segment z snapshot po K6 jeśli K6 PASS, inaczej z K5.
  let k8Status = 'NOT_REACHED';
  if (k5Status === 'PASS' && segmentId) {
    // Po K6 oryginalny segment K5 jest podzielony — bierz lewy half (z prefix _L)
    // lub jeden z nowo utworzonych. Dla safety: spróbuj original segment_id z K5
    // jeśli K6 NOT_PASS, lub wyszukaj segment z snapshot.
    let zksnSegId = segmentId;
    if (k6Status === 'PASS') {
      // K6 split — szukamy aktywnego cable segment w snapshot.
      const enmAfterK6 = await api('GET', `/api/cases/${caseId}/enm`);
      const branches = enmAfterK6.json?.branches ?? [];
      const cableSeg = branches.find(
        (b) =>
          typeof b.ref_id === 'string' &&
          b.ref_id.startsWith('seg/') &&
          b.type === 'cable',
      );
      if (cableSeg) zksnSegId = cableSeg.ref_id;
    }
    log('K8', `Wstaw ZKSN słup na kablu SN (segment=${zksnSegId})...`);
    const zksnRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
      project_id: projectId,
      operation: {
        name: 'insert_zksn_on_segment_sn',
        idempotency_key: 'gn01_zksn_001',
        payload: {
          segment_id: zksnSegId,
          insert_at: { mode: 'RATIO', value: 0.3 },
          catalog_ref: 'RSN-6', // ZKSN przelotowy z /api/catalog/branch-point-types
          // Wymagany jawny namespace dla branch_pole / zksn ops (per
          // backend/src/api/domain_ops_policy.py:221 _explicit_namespace).
          catalog_namespace: 'mv_branch_points',
          branch_ports_count: 2,
        },
      },
    });
    if (zksnRes.ok && !zksnRes.json?.error_code) {
      k8Status = 'PASS';
      log('K8', 'OK ZKSN inserted', {
        created: zksnRes.json?.changes?.created_element_ids?.length ?? 0,
      });
    } else {
      k8Status = `FAIL: ${zksnRes.status} ${zksnRes.json?.error_code ?? zksnRes.json?.error ?? ''}`;
      log('K8', k8Status);
    }
  }

  // K7: Odgałęzienie SN (start_branch_segment_sn) z portu BRANCH_1 ZKSN.
  // ZKSN udostępnia 2 porty branch: BRANCH_1 i BRANCH_2 (per zksn type w
  // /backend/src/enm/domain_operations.py:3650).
  // From_ref format: <element_ref>.BRANCH_<n> (np. bp/{hash}/zksn.BRANCH_1)
  let k7Status = 'NOT_REACHED';
  let zksnRef = null;
  if (k8Status === 'PASS') {
    // Znajdź ZKSN w ENM snapshot (utworzony w K8).
    const enmAfterK8 = await api('GET', `/api/cases/${caseId}/enm`);
    const bps = enmAfterK8.json?.branch_points ?? [];
    const zksn = bps.find((bp) => bp.branch_point_type === 'zksn');
    if (zksn) zksnRef = zksn.ref_id;
  }
  if (zksnRef) {
    log('K7', `Wyprowadzenie odgałęzienia z portu BRANCH_1 ZKSN ${zksnRef}...`);
    const branchRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
      project_id: projectId,
      operation: {
        name: 'start_branch_segment_sn',
        idempotency_key: 'gn01_branch_001',
        payload: {
          from_ref: `${zksnRef}.BRANCH_1`,
          segment: {
            rodzaj: 'KABEL',
            dlugosc_m: 800,
            catalog_ref: 'cable-base-epr-al-1c-120',
          },
        },
      },
    });
    if (branchRes.ok && !branchRes.json?.error_code) {
      k7Status = 'PASS';
      log('K7', 'OK branch segment added', {
        created: branchRes.json?.changes?.created_element_ids?.length ?? 0,
      });
    } else {
      k7Status = `FAIL: ${branchRes.status} ${branchRes.json?.error_code ?? branchRes.json?.error ?? ''}`;
      log('K7', k7Status);
    }
  }

  // K10: PV 0.5 MW 0.4 kV (add_converter_source) na nN szynie stacji.
  // Wymaga: source_technology=PV, connection_variant='nn_side',
  // station_ref + bus_nn_ref + catalog_ref pasujący do napięcia szyny.
  let k10Status = 'NOT_REACHED';
  if (k6Status === 'PASS') {
    log('K10', 'Dodaj PV 0.5 MW na nN stacji (add_converter_source)...');
    const enmAfterK6 = await api('GET', `/api/cases/${caseId}/enm`);
    const station = enmAfterK6.json?.substations?.find(
      (s) => s.station_type === 'inline',
    );
    const nnBus = enmAfterK6.json?.buses?.find(
      (b) => b.voltage_kv && b.voltage_kv <= 1.0,
    );
    if (station && nnBus) {
      const pvRes = await api('POST', `/api/cases/${caseId}/enm/domain-ops`, {
        project_id: projectId,
        operation: {
          name: 'add_converter_source',
          idempotency_key: 'gn01_pv_001',
          payload: {
            source_technology: 'PV',
            catalog_ref: 'conv-pv-nn-0p5mw-0p4kv',
            connection_variant: 'nn_side',
            station_ref: station.ref_id,
            bus_nn_ref: nnBus.ref_id,
          },
        },
      });
      if (pvRes.ok && !pvRes.json?.error_code) {
        k10Status = 'PASS';
        log('K10', 'OK PV inverter attached', {
          created: pvRes.json?.changes?.created_element_ids?.length ?? 0,
        });
      } else {
        k10Status = `FAIL: ${pvRes.status} ${pvRes.json?.error_code ?? ''}`;
        log('K10', k10Status);
      }
    } else {
      k10Status = 'FAIL: missing station/nn_bus';
    }
  }

  // K13: Solver runs (SC_3F + LOAD_FLOW) — IEC 60909 + NR power flow.
  async function runAnalysis(analysisType) {
    const createRes = await api(
      'POST',
      `/api/execution/study-cases/${caseId}/runs`,
      { analysis_type: analysisType, solver_input: {} },
    );
    if (!createRes.ok || !createRes.json?.id) return null;
    const execRes = await api(
      'POST',
      `/api/execution/runs/${createRes.json.id}/execute`,
    );
    return {
      runId: createRes.json.id,
      status: execRes.json?.status,
      error: execRes.json?.error_message,
    };
  }

  let k13Status = 'NOT_REACHED';
  let sc3fRunId = null;
  let lfRunId = null;
  if (k6Status === 'PASS') {
    log('K13', 'Uruchom SC_3F solver (IEC 60909)...');
    const sc3f = await runAnalysis('SC_3F');
    sc3fRunId = sc3f?.runId;
    log('K13', `SC_3F: ${sc3f?.status}`);

    log('K13', 'Uruchom LOAD_FLOW solver (Newton-Raphson)...');
    const lf = await runAnalysis('LOAD_FLOW');
    lfRunId = lf?.runId;
    log('K13', `LOAD_FLOW: ${lf?.status}`);

    if (sc3f?.status === 'DONE' && lf?.status === 'DONE') {
      k13Status = 'PASS';
    } else {
      k13Status = `PARTIAL: SC3F=${sc3f?.status} LF=${lf?.status}`;
    }
  }

  // K14: Proof pack eksport JSON+PDF dla SC_3F run.
  let k14Status = 'NOT_REACHED';
  if (sc3fRunId) {
    log('K14', `Eksport Proof Pack JSON+PDF dla SC_3F run ${sc3fRunId}...`);
    const proofJson = await api(
      'GET',
      `/api/analysis-runs/${sc3fRunId}/export/proof/json`,
    );
    const proofPdfRes = await fetch(
      `http://127.0.0.1:8000/api/analysis-runs/${sc3fRunId}/export/proof/pdf`,
    );
    const pdfSize = proofPdfRes.ok
      ? (await proofPdfRes.arrayBuffer()).byteLength
      : 0;
    if (proofJson.ok && pdfSize > 1000) {
      k14Status = `PASS: pdf=${pdfSize}B`;
      log('K14', `OK Proof Pack JSON + PDF ${pdfSize} bytes`);
    } else {
      k14Status = `FAIL: pdfSize=${pdfSize}`;
    }
  }

  log('K_final', 'Weryfikuję topology końcową...');
  const summaryFinal = await api('GET', `/api/cases/${caseId}/enm/topology/summary`);

  console.log('\n=== SEEDER GN01 SUMMARY ===');
  console.log(JSON.stringify(
    {
      projectId,
      caseId,
      bus_count_final: summaryFinal.json.bus_count ?? 0,
      branch_count_final: summaryFinal.json.branch_count ?? 0,
      source_count_final: summaryFinal.json.source_count ?? 0,
      revision_final: summaryFinal.json.enm_revision ?? 1,
      k1_status: project.ok && caseRes.ok ? 'PASS' : 'FAIL',
      k2_status:
        gpzRes.ok && !gpzRes.json?.error_code
          ? 'PASS'
          : `FAIL: ${gpzRes.status} ${gpzRes.json?.error_code ?? ''}`,
      k3_status: k3Status,
      k4_status: k4Status,
      k5_status: k5Status,
      k6_status: k6Status,
      k7_status: k7Status,
      k8_status: k8Status,
      k10_status: k10Status,
      k13_status: k13Status,
      sc3f_run_id: sc3fRunId,
      lf_run_id: lfRunId,
      k14_status: k14Status,
    },
    null,
    2,
  ));
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
