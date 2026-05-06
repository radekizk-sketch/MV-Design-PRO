/**
 * E2E real-backend test dla persystencji audit2 station config (Punkt 3 Phase 6).
 *
 * Pelen lifecycle:
 *   1. Tworzy projekt (POST /api/projects).
 *   2. PUT pierwsza konfiguracje stacji (UPSERT).
 *   3. GET zwraca zapisana konfiguracje.
 *   4. PUT druga konfiguracje tej samej stacji (UPDATE, ten sam id).
 *   5. PUT konfiguracji innej stacji w tym samym projekcie.
 *   6. GET listy zwraca obie stacje.
 *   7. DELETE pierwszej stacji.
 *   8. GET zwraca 404.
 *   9. Lista zawiera tylko druga stacje.
 *
 * Wymaga: PLAYWRIGHT_BACKEND_URL lub default 127.0.0.1:8000.
 */

import { test, expect, type APIRequestContext } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';

async function backendUp(request: APIRequestContext): Promise<boolean> {
  try {
    const res = await request.get(`${BACKEND_BASE}/api/v1/catalog/audit2/snapshot`);
    return res.ok();
  } catch {
    return false;
  }
}

async function createProject(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: { name: `E2E Audit2 Persistence ${Date.now()}` },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).id;
}

test.describe('Audit2 Station Config Persistence (full lifecycle)', () => {
  test.beforeAll(async ({ request }) => {
    test.skip(!(await backendUp(request)), `Backend nie uruchomiony.`);
  });

  test('full CRUD lifecycle: PUT -> GET -> UPDATE -> LIST -> DELETE -> 404', async ({ request }) => {
    const pid = await createProject(request);
    const baseUrl = `${BACKEND_BASE}/api/v1/projects/${pid}/audit2-station-config`;

    // 1. PUT pierwsza konfiguracja.
    const putRes1 = await request.put(`${baseUrl}/station-A`, {
      data: {
        mv_neutral_grounding_ref: 'mng_petersen',
        tap_changer_refs: ['tc_oltc_110sn_19_125'],
        der_specs: [
          {
            der_id: 'der_pv_001',
            der_kind: 'PV',
            block_transformer_catalog_ref: 'btr_pv_15_069_2500',
            pf_curve_ref: 'pf_pse_b',
          },
        ],
      },
    });
    expect(putRes1.ok()).toBeTruthy();
    const created = await putRes1.json();
    expect(created.mv_neutral_grounding_ref).toBe('mng_petersen');
    const initialId = created.id;

    // 2. GET zwraca zapisana konfiguracje.
    const getRes1 = await request.get(`${baseUrl}/station-A`);
    expect(getRes1.ok()).toBeTruthy();
    const fetched = await getRes1.json();
    expect(fetched.id).toBe(initialId);
    expect(fetched.tap_changer_refs).toEqual(['tc_oltc_110sn_19_125']);
    expect(fetched.der_specs[0].der_id).toBe('der_pv_001');

    // 3. PUT update — ten sam id.
    const putRes2 = await request.put(`${baseUrl}/station-A`, {
      data: {
        mv_neutral_grounding_ref: 'mng_resistor_low',
        tap_changer_refs: [],
        der_specs: [],
      },
    });
    expect(putRes2.ok()).toBeTruthy();
    const updated = await putRes2.json();
    expect(updated.id).toBe(initialId); // ID niezmieniony
    expect(updated.mv_neutral_grounding_ref).toBe('mng_resistor_low');
    expect(updated.der_specs).toEqual([]);

    // 4. PUT konfiguracja innej stacji.
    const putRes3 = await request.put(`${baseUrl}/station-B`, {
      data: {
        mv_neutral_grounding_ref: 'mng_isolated',
        tap_changer_refs: [],
        der_specs: [
          {
            der_id: 'der_bess_001',
            der_kind: 'BESS',
            bess_operation_mode_refs: ['mode_fcr_n', 'mode_voltage_support'],
          },
        ],
      },
    });
    expect(putRes3.ok()).toBeTruthy();

    // 5. GET listy obu stacji.
    const listRes = await request.get(baseUrl);
    expect(listRes.ok()).toBeTruthy();
    const list = await listRes.json();
    expect(list).toHaveLength(2);
    expect(list.map((c: { station_id: string }) => c.station_id).sort()).toEqual([
      'station-A',
      'station-B',
    ]);

    // 6. DELETE pierwszej.
    const delRes = await request.delete(`${baseUrl}/station-A`);
    expect(delRes.status()).toBe(204);

    // 7. GET 404.
    const get404 = await request.get(`${baseUrl}/station-A`);
    expect(get404.status()).toBe(404);

    // 8. Lista zawiera tylko station-B.
    const listRes2 = await request.get(baseUrl);
    const list2 = await listRes2.json();
    expect(list2).toHaveLength(1);
    expect(list2[0].station_id).toBe('station-B');
    expect(list2[0].der_specs[0].der_id).toBe('der_bess_001');
  });

  test('isolation between projects', async ({ request }) => {
    const pid1 = await createProject(request);
    const pid2 = await createProject(request);

    await request.put(`${BACKEND_BASE}/api/v1/projects/${pid1}/audit2-station-config/X`, {
      data: { mv_neutral_grounding_ref: 'mng_petersen', tap_changer_refs: [], der_specs: [] },
    });

    const list1 = await (
      await request.get(`${BACKEND_BASE}/api/v1/projects/${pid1}/audit2-station-config`)
    ).json();
    expect(list1).toHaveLength(1);

    const list2 = await (
      await request.get(`${BACKEND_BASE}/api/v1/projects/${pid2}/audit2-station-config`)
    ).json();
    expect(list2).toEqual([]);
  });
});
