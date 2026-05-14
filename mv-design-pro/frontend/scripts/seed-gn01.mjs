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

  log('K_final', 'Weryfikuję topology końcową...');
  const summaryFinal = await api('GET', `/api/cases/${caseId}/enm/topology/summary`);

  console.log('\n=== SEEDER GN01 SUMMARY ===');
  console.log(JSON.stringify(
    {
      projectId,
      caseId,
      bus_count_final: summaryFinal.json.bus_count ?? 0,
      source_count_final: summaryFinal.json.source_count ?? 0,
      revision_final: summaryFinal.json.enm_revision ?? 1,
      k1_status: project.ok && caseRes.ok ? 'PASS' : 'FAIL',
      k2_status:
        gpzRes.ok && !gpzRes.json?.error_code
          ? 'PASS'
          : `FAIL: ${gpzRes.status} ${gpzRes.json?.error_code ?? ''}`,
      k3_status: k3Status,
      k4_status: k4Status,
    },
    null,
    2,
  ));
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
