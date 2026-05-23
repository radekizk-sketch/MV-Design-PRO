import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { executeDomainOp } from '../domainApi';

describe('executeDomainOp', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('wysyła żądanie do kanonicznego endpointu domain-ops i normalizuje odpowiedź', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        snapshot: { header: { hash_sha256: 'snap-1' } },
        logical_views: {
          trunks: [],
          branches: [],
          secondary_connectors: [],
          terminals: [],
        },
        readiness: {
          ready: false,
          blockers: [
            {
              code: 'operation.catalog_required',
              message_pl: 'Wymagany katalog.',
              element_ref: 'branch_ref_1',
              severity: 'BLOKUJACE',
            },
          ],
          warnings: [],
        },
        fix_actions: [
          {
            code: 'select_catalog',
            action_type: 'SELECT_CATALOG',
            element_ref: 'branch_ref_1',
            panel: 'catalog',
            step: 'segment',
            focus: 'catalog_ref',
            message_pl: 'Wybierz katalog.',
          },
        ],
        changes: {
          created_element_ids: ['branch_ref_1'],
          updated_element_ids: [],
          deleted_element_ids: [],
        },
        selection_hint: {
          element_id: null,
          element_type: 'branch',
          zoom_to: true,
        },
        audit_trail: [{ step: 1, action: 'create', element_id: 'branch_ref_1', detail: 'ok' }],
        domain_events: [{ event_seq: 1, event_type: 'branch.created', element_id: 'branch_ref_1' }],
        materialized_params: {
          lines_sn: {
            branch_ref_1: {
              catalog_item_id: 'line-cat',
              catalog_item_version: 'v1',
              r_ohm_per_km: 0.31,
              x_ohm_per_km: 0.08,
              i_max_a: 320,
            },
          },
          transformers_sn_nn: {
            tr_ref_1: {
              catalog_item_id: 'tr-cat',
              catalog_item_version: 'v2',
              u_k_percent: 6,
              p0_kw: 1.2,
              pk_kw: 7.4,
              s_n_kva: 630,
            },
          },
        },
        layout: {
          layout_hash: 'layout-1',
          layout_version: 'v1',
        },
      }),
    } as Response);

    const response = await executeDomainOp('case-1', 'continue_trunk_segment_sn', {
      trunk_id: 'trunk-1',
      segment: { length_km: 1.2 },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/cases/case-1/enm/domain-ops'); // domain-ops-ignore
    expect(init.method).toBe('POST');

    const body = JSON.parse(String(init.body));
    expect(body.project_id).toBe('case-1');
    expect(body.snapshot_base_hash).toBe('');
    expect(body.operation.name).toBe('continue_trunk_segment_sn');
    expect(body.operation.idempotency_key).toMatch(/^op:continue_trunk_segment_sn:root:/);
    expect(body.operation.payload).toEqual({
      trunk_id: 'trunk-1',
      segment: { length_km: 1.2 },
    });

    expect(response.fix_actions[0]?.modal_type).toBe('catalog');
    expect(response.selection_hint).toBeNull();
    expect(response.materialized_params.lines_sn.branch_ref_1).toEqual({
      catalog_item_id: 'line-cat',
      catalog_item_version: 'v1',
      r_ohm_per_km: 0.31,
      x_ohm_per_km: 0.08,
      i_max_a: 320,
    });
    expect(response.materialized_params.transformers_sn_nn.tr_ref_1?.s_n_kva).toBe(630);
    expect(response.layout.layout_hash).toBe('layout-1');
  });

  it('zgłasza błąd z kodem HTTP dla odpowiedzi niepoprawnej', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: async () => ({ detail: 'bad request' }),
    } as Response);

    await expect(executeDomainOp('case-1', 'refresh_snapshot', {})).rejects.toThrow(
      'API 422 Unprocessable Entity: /api/cases/case-1/enm/domain-ops',
    );
  });
});
