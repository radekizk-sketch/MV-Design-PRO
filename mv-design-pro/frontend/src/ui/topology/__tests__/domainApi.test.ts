import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { domainOpsEndpoint, executeDomainOp, executeDomainOpPreview } from '../domainApi';
import { CANONICAL_OPERATION_NAMES } from '../../../types/domainOps';

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
      `API 422 Unprocessable Entity: ${domainOpsEndpoint('case-1')}`,
    );
  });

  /**
   * Bramka kanoniczności jest w `executeDomainOp`, PRZED żądaniem sieciowym. Testy
   * kreatorów mockują `executeDomainOperation` na poziomie store'u, czyli PONAD bramką —
   * dlatego przez lata nie wykryły, że nazwy `add_shunt_compensator_sn`,
   * `add_surge_arrester_sn` i `set_connection_conditions` nie były na białej liście i ich
   * kontrolki były martwe. Ten blok ćwiczy REALNĄ ścieżkę: mockowany jest wyłącznie
   * `fetch`, więc każda nazwa musi faktycznie przejść przez `assertCanonicalOpName`.
   */
  describe('bramka kanoniczności na realnej ścieżce', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ snapshot: {}, logical_views: {} }),
      } as Response);
    });

    it.each([...CANONICAL_OPERATION_NAMES])(
      'przepuszcza operację z białej listy i wysyła żądanie: %s',
      async (nazwa) => {
        await expect(executeDomainOp('case-1', nazwa, {})).resolves.toBeDefined();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
        expect(body.operation.name).toBe(nazwa);
      },
    );

    it('odrzuca nazwę spoza białej listy ZANIM poleci żądanie', async () => {
      await expect(executeDomainOp('case-1', 'operacja_widmo', {})).rejects.toThrow(
        'Niekanoniczna nazwa operacji: operacja_widmo',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});

/**
 * Próba operacji (`dry_run`) idzie kanonicznym klientem: TEN SAM adres i TA SAMA koperta co
 * zapis (nazwa kanoniczna, klucz idempotencji z ładunku), z flagą `dry_run` w ładunku.
 * Iloczyn cech: wywołanie {zapis, próba} × ten sam ładunek → ten sam adres, różny klucz
 * idempotencji (próba nie może dzielić klucza z zapisem); odpowiedź {przyjęta, odrzucona HTTP,
 * błąd operacji} → koperta próby / komunikat backendu bez prefiksu technicznego.
 */
describe('executeDomainOpPreview', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const ladunek = { bus_ref: 'bus-1', bay_template_ref: 'tmpl-1' };

  it('ten sam adres i ta sama koperta co zapis, ładunek z dry_run, klucz różny od zapisu', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    await executeDomainOp('case-1', 'add_sn_bay', ladunek);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ dry_run: true, preview: { werdykt: 'VALID' } }),
    } as Response);
    const proba = await executeDomainOpPreview('case-1', 'add_sn_bay', ladunek);

    const [urlZapisu, initZapisu] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [urlProby, initProby] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(urlProby).toBe(urlZapisu);
    expect(urlProby).toBe(domainOpsEndpoint('case-1'));
    const zapis = JSON.parse(String(initZapisu.body));
    const cialo = JSON.parse(String(initProby.body));
    expect(cialo.project_id).toBe('case-1');
    expect(cialo.operation.name).toBe('add_sn_bay');
    expect(cialo.operation.payload).toEqual({ ...ladunek, dry_run: true });
    expect(cialo.operation.idempotency_key).toMatch(/^op:add_sn_bay:/);
    expect(cialo.operation.idempotency_key).not.toBe(zapis.operation.idempotency_key);
    expect(proba).toEqual({ dry_run: true, preview: { werdykt: 'VALID' } });
  });

  it('odrzucenie HTTP → komunikat backendu bez prefiksu technicznego', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: async () => ({ detail: { message_pl: 'Pole spoza rodziny rozdzielnicy.' } }),
    } as Response);
    await expect(executeDomainOpPreview('case-1', 'add_sn_bay', ladunek)).rejects.toThrow(
      /^Pole spoza rodziny rozdzielnicy\.$/,
    );
  });

  it('odrzucenie HTTP bez treści → kod i status HTTP', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => {
        throw new Error('brak JSON');
      },
    } as unknown as Response);
    await expect(executeDomainOpPreview('case-1', 'add_sn_bay', ladunek)).rejects.toThrow(
      /^Błąd HTTP 500: Internal Server Error$/,
    );
  });

  it('błąd operacji w odpowiedzi 200 jest zwracany w kopercie (rozstrzyga wołający)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ dry_run: true, error: 'Rodzina nie obsługuje napięcia.', error_code: 'x' }),
    } as Response);
    await expect(executeDomainOpPreview('case-1', 'add_sn_bay', ladunek)).resolves.toEqual({
      dry_run: true,
      error: 'Rodzina nie obsługuje napięcia.',
      error_code: 'x',
    });
  });

  it('nazwa spoza białej listy jest odrzucana ZANIM poleci żądanie', async () => {
    await expect(executeDomainOpPreview('case-1', 'operacja_widmo', {})).rejects.toThrow(
      'Niekanoniczna nazwa operacji: operacja_widmo',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
