/**
 * Konfigurator stacji — lista typów transformatorów z katalogu nie wywraca się na typie
 * bez danych opcjonalnych (karta komunikatów, commit 5).
 *
 * Kontrakt serwera: `TransformerType.vector_group / i0_percent / p0_kw: … | None` (25 typów
 * katalogu ma `i0_percent: null`). Sortowanie dopasowania grupy połączeń wołało
 * `left.vector_group.toUpperCase()` — typ bez grupy wywracał zakładkę „Transformator”,
 * gdy transformator modelu miał grupę. Ścieżka natywna: klik w zakładkę (`userEvent`).
 *
 * Iloczyn cech: grupa transformatora modelu {jest, brak} × typ katalogu {pełny, bez grupy
 * i strat jałowych} × kolejność odpowiedzi katalogu {typ bez grupy pierwszy, typ pełny
 * pierwszy} — kolejność decyduje, po której stronie komparatora sortowania (lewej czy prawej)
 * trafia typ bez grupy, więc bez niej defekt jednej strony byłby niewidoczny. Niezmienniki: zakładka renderuje listę, typ bez grupy ma opis „grupa
 * połączeń: brak danych” (nie „null”), typ z pasującą grupą jest rekomendowany pierwszy.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithQueryClient as render } from '../../../../test/queryClientTestUtils';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import type { WorkspaceSurfaceDescriptor } from '../../types';
import { StationConfiguratorSurface } from '../StationConfiguratorSurface';

const STACJA = 'stacja/1';

const powierzchnia: WorkspaceSurfaceDescriptor = {
  surfaceId: 'surface-test',
  screenCode: 'E-13',
  surfaceKind: 'pomocniczy',
  titlePl: 'Test',
  entityRef: STACJA,
  entityType: null,
  parentSurfaceId: null,
  tabId: null,
  routeState: { route: 'unknown', payload: {} },
  breadcrumbs: [],
  supportsMiniSld: false,
  sizeClass: 'C',
  stackLevel: 0,
  openMode: 'expand_workspace',
  subjectKind: 'helper_context',
  subjectRef: null,
};

const TYP_PELNY = {
  id: 'tr-pelny',
  name: 'Typ pełny Dyn11',
  rated_power_mva: 0.63,
  voltage_hv_kv: 15,
  voltage_lv_kv: 0.4,
  uk_percent: 6,
  pk_kw: 6.5,
  i0_percent: 0.3,
  p0_kw: 0.86,
  vector_group: 'Dyn11',
  tap_min: -2,
  tap_max: 2,
  tap_step_percent: 2.5,
};

const TYP_BEZ_GRUPY = {
  ...TYP_PELNY,
  id: 'tr-bez-grupy',
  name: 'Typ bez grupy',
  i0_percent: null,
  p0_kw: null,
  vector_group: null,
};

function ustawModel(grupa: string | null): void {
  useSnapshotStore.setState({
    snapshot: {
      header: { enm_version: '1.0', name: 'S', created_at: '', updated_at: '', revision: 1, hash_sha256: 'x', defaults: { frequency_hz: 50, unit_system: 'SI' } },
      buses: [
        { id: 'sn', ref_id: 'sn', name: 'Szyna SN', voltage_kv: 15, tags: [], meta: {} },
        { id: 'nn', ref_id: 'nn', name: 'Szyna nN', voltage_kv: 0.4, tags: [], meta: {} },
      ],
      branches: [],
      transformers: [
        {
          id: 't1', ref_id: 'TR1', name: 'TR1', hv_bus_ref: 'sn', lv_bus_ref: 'nn',
          sn_mva: 0.63, uhv_kv: 15, ulv_kv: 0.4, uk_percent: 6, pk_kw: 6.5,
          vector_group: grupa, tags: [], meta: {},
        },
      ],
      sources: [], loads: [], generators: [],
      substations: [
        { id: 's', ref_id: STACJA, name: 'Stacja', tags: [], meta: {}, station_type: 'inline', bus_refs: ['sn', 'nn'], transformer_refs: ['TR1'] },
      ],
      bays: [], junctions: [], corridors: [], measurements: [], protection_assignments: [],
      branch_points: [], line_runs: [], connection_nodes: [],
    } as never,
  });
}

function stubKatalog(typy: readonly object[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/catalog/transformer-types')) {
        return new Response(JSON.stringify(typy), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  useSnapshotStore.setState({ snapshot: null });
});

describe('Konfigurator stacji — typy transformatorów bez danych opcjonalnych', () => {
  const GRUPY = [
    ['grupa modelu jest', 'Dyn11'],
    ['grupa modelu brak', null],
  ] as const;
  const KOLEJNOSCI = [
    ['typ bez grupy pierwszy', [TYP_BEZ_GRUPY, TYP_PELNY]],
    ['typ pełny pierwszy', [TYP_PELNY, TYP_BEZ_GRUPY]],
  ] as const;
  const PRZYPADKI = GRUPY.flatMap(([opisGrupy, grupa]) =>
    KOLEJNOSCI.map(([opisKolejnosci, typy]) => [`${opisGrupy}, ${opisKolejnosci}`, grupa, typy] as const),
  );

  it.each(PRZYPADKI)('%s', async (_opis, grupa, typy) => {
    ustawModel(grupa);
    stubKatalog(typy);
    render(<StationConfiguratorSurface surface={powierzchnia} />);
    await userEvent.setup().click(screen.getByTestId('station-config-tab-transformer'));
    const wybor = await screen.findByTestId('tr-catalog-TR1');
    const opcje = await within(wybor).findAllByRole('option', { name: /Typ bez grupy|Typ pełny/ });
    const teksty = opcje.map((o) => o.textContent ?? '');
    expect(teksty.find((t) => t.includes('Typ bez grupy'))).toContain('grupa połączeń: brak danych');
    expect(teksty.join(' ')).not.toMatch(/null|undefined|NaN/);
    if (grupa !== null) {
      // Typ z pasującą grupą połączeń jest pierwszy (rekomendowany).
      expect(teksty[0]).toContain('Typ pełny');
    }
  });
});
