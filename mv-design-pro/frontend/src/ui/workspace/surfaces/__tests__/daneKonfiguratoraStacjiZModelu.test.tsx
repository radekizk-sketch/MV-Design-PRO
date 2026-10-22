/**
 * Konfigurator stacji (E-13) — przekaźniki, pola pomiarowe i strona nN z modelu / projekcji nN.
 *
 * Dawniej powierzchnia przekazywała stałe puste listy bazowe (przekaźniki, automatyka,
 * rozdzielnice nN, odbiory) i stałe bez źródła („Liczniki 0”, „Telepomiary 0”, „Sterowanie
 * lokalne”, „Uzależnienia do konfiguracji”) niezależnie od modelu. Ścieżka natywna: klik
 * w zakładkę (`userEvent`); projekcja nN to DOKŁADNIE odpowiedź backendu
 * (`fixtures/generated/14_sub_boards.json`, pilnowana testem backendu).
 *
 * ILOCZYN CECH: przypadek aktywny {jest, brak} × odpowiedź projekcji {graf OK, HTTP 500};
 * pole SN {z zabezpieczeniem włączonym, z wyłączonym, bez, z ref nierozwiązywalnym};
 * pole pomiarowe {układ energii, napięcie szyn} × przekładnik w polu.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithQueryClient as render } from '../../../../test/queryClientTestUtils';
import { useAppStateStore } from '../../../app-state';
import { scenariusz } from '../../../sld/v3/lv-domain/fixtures/scenariusze';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import type { WorkspaceSurfaceDescriptor } from '../../types';
import { StationConfiguratorSurface } from '../StationConfiguratorSurface';

const PROJEKCJA = scenariusz('14_sub_boards');
const STACJA = PROJEKCJA.station_ref;

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

function pole(ref: string, rola: string, dodatki: Record<string, unknown> = {}) {
  return { ref_id: ref, name: ref, bay_role: rola, substation_ref: STACJA, bus_ref: 'sn', equipment_refs: [], tags: [], meta: {}, ...dodatki };
}

function zabezpieczenie(ref: string, typ: string, funkcje: string[], wlaczone: boolean) {
  return {
    ref_id: ref, name: ref, breaker_ref: `cb/${ref}`, device_type: typ, is_enabled: wlaczone,
    settings: funkcje.map((function_type) => ({ function_type })), tags: [], meta: {},
  };
}

function ustawModel(): void {
  useSnapshotStore.setState({
    snapshot: {
      header: { enm_version: '1.0', name: 'S', created_at: '', updated_at: '', revision: 1, hash_sha256: 'x', defaults: { frequency_hz: 50, unit_system: 'SI' } },
      buses: [{ id: 'sn', ref_id: 'sn', name: 'Szyna SN', voltage_kv: 15, tags: [], meta: {} }],
      branches: [], transformers: [], sources: [], loads: [], generators: [],
      substations: [{ id: 's', ref_id: STACJA, name: 'Stacja z podrozdzielnicami', tags: [], meta: {}, station_type: 'inline', bus_refs: ['sn'], transformer_refs: [] }],
      bays: [
        pole('pole/we', 'IN', { protection_ref: 'pz/we' }),
        pole('pole/wy', 'OUT', { protection_ref: 'pz/wy' }),
        pole('pole/tr', 'TR'),
        pole('pole/zly', 'OUT', { protection_ref: 'pz/nie-ma' }),
        pole('pole/pom', 'MEASUREMENT', { funkcja_pomiaru: 'UKLAD_ENERGII', rodzaj_pomiaru: 'PODSTAWOWY' }),
        pole('pole/szyny', 'MEASUREMENT', { funkcja_pomiaru: 'NAPIECIA_SZYN' }),
      ],
      junctions: [], corridors: [],
      measurements: [
        { ref_id: 'ct/pom', name: 'ct', measurement_type: 'CT', bus_ref: 'sn', bay_ref: 'pole/pom', rating: { ratio_primary: 100, ratio_secondary: 5 }, connection: 'star', purpose: 'metering', tags: [], meta: {} },
      ],
      protection_assignments: [
        zabezpieczenie('pz/we', 'directional_overcurrent', ['directional_67', 'directional_67N'], true),
        zabezpieczenie('pz/wy', 'overcurrent', ['overcurrent_50', 'overcurrent_51'], false),
      ],
      branch_points: [], line_runs: [], connection_nodes: [],
    } as never,
  });
}

function stubFetch(projekcja: Response | null) {
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/lv-domain/') && projekcja) return projekcja.clone();
    return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

beforeEach(() => {
  ustawModel();
  useAppStateStore.setState({ activeCaseId: PROJEKCJA.case_id });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useAppStateStore.setState({ activeCaseId: null });
});

describe('Konfigurator stacji — dane z modelu (klik w zakładkę)', () => {
  it('Strona nN: sekcje rozdzielnic i odbiory z projekcji backendu (jedno żądanie projekcji stacji)', async () => {
    const fetchMock = stubFetch(new Response(JSON.stringify(PROJEKCJA), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    render(<StationConfiguratorSurface surface={powierzchnia} />);
    await userEvent.setup().click(screen.getByTestId('station-config-tab-nn-switchgear'));
    await waitFor(() => expect(screen.getByTestId('station-config-nn-switchgear')).toHaveAttribute('data-stan', 'gotowe'));
    const glowna = screen.getByTestId('nn-switchgear-RGnN-1');
    expect(glowna).toHaveTextContent('rozdzielnica główna');
    expect(glowna).toHaveTextContent('Zasilania: 1');
    expect(glowna).toHaveTextContent('Odpływy: 2');
    expect(glowna).toHaveTextContent('do podrozdzielnic: 1');
    expect(screen.getByTestId('nn-switchgear-RGN-2_szyna')).toHaveTextContent('podrozdzielnica');
    expect(screen.getByTestId('load-row-QF-01_odbior')).toHaveTextContent('Odbiór główny');
    expect(screen.getByTestId('station-config-loads')).toHaveTextContent('Odbiory (4)');
    const zadaniaProjekcji = fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.includes('/lv-domain/'));
    expect(zadaniaProjekcji.length).toBeGreaterThan(0);
    for (const u of zadaniaProjekcji) {
      expect(u).toContain(`/api/cases/${encodeURIComponent(PROJEKCJA.case_id)}/enm/lv-domain/${encodeURIComponent(STACJA)}/projection/v1`);
    }
  });

  it('Strona nN: błąd backendu jest komunikatem, nie pustą rozdzielnicą', async () => {
    stubFetch(new Response(JSON.stringify({ detail: 'awaria' }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
    render(<StationConfiguratorSurface surface={powierzchnia} />);
    await userEvent.setup().click(screen.getByTestId('station-config-tab-nn-switchgear'));
    await waitFor(() => expect(screen.getByTestId('station-config-nn-switchgear')).toHaveAttribute('data-stan', 'blad'));
    expect(screen.getByTestId('nn-switchgear-stan').textContent).toMatch(/awaria|HTTP 500/);
  });

  it('Strona nN bez aktywnego przypadku: jawny stan, bez żądania projekcji', async () => {
    const fetchMock = stubFetch(null);
    useAppStateStore.setState({ activeCaseId: null });
    render(<StationConfiguratorSurface surface={powierzchnia} />);
    await userEvent.setup().click(screen.getByTestId('station-config-tab-nn-switchgear'));
    expect(screen.getByTestId('station-config-nn-switchgear')).toHaveAttribute('data-stan', 'brak_przypadku');
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/lv-domain/'))).toBe(false);
  });

  it('Zabezpieczenia: przekaźniki pól z modelu, wyłączone oznaczone, ref nierozwiązywalny pominięty; bez sekcji bez źródła', async () => {
    stubFetch(null);
    render(<StationConfiguratorSurface surface={powierzchnia} />);
    await userEvent.setup().click(screen.getByTestId('station-config-tab-protection'));
    const lista = screen.getByTestId('protection-relays-list');
    expect(lista).toHaveTextContent('Przekaźniki (2)');
    expect(screen.getByTestId('relay-row-pz/we')).toHaveTextContent('Nadprądowe kierunkowe');
    expect(screen.getByTestId('relay-row-pz/we')).toHaveTextContent('67, 67N');
    expect(screen.getByTestId('relay-wylaczone-pz/wy')).toBeInTheDocument();
    expect(screen.queryByTestId('relay-wylaczone-pz/we')).toBeNull();
    const karta = screen.getByTestId('station-config-content-protection');
    expect(karta.textContent).not.toMatch(/Automatyka|Uzależnienia łączeniowe|Sterowanie:/);
    expect(screen.queryByTestId('protection-automation')).toBeNull();
  });

  it('Pola pomiarowe: deklaracja pomiaru z modelu i przekładniki pola; bez liczników i telepomiarów', async () => {
    stubFetch(null);
    render(<StationConfiguratorSurface surface={powierzchnia} />);
    await userEvent.setup().click(screen.getByTestId('station-config-tab-measurements'));
    expect(screen.getByTestId('station-metering-bay-pole/pom')).toHaveTextContent('rozliczeniowy podstawowy');
    expect(screen.getByTestId('station-metering-bay-pole/pom')).toHaveTextContent(/1\s*0$/);
    expect(screen.getByTestId('station-metering-bay-pole/szyny')).toHaveTextContent('napięcia szyn');
    expect(screen.queryByTestId('station-metering-bay-pole/we')).toBeNull();
    const karta = screen.getByTestId('station-config-content-measurements');
    expect(karta.textContent).not.toMatch(/Liczniki|Telepomiary/);
  });

  it('krok „SCADA i infrastruktura” nie istnieje (zasilały go wyłącznie stałe bez źródła)', () => {
    stubFetch(null);
    render(<StationConfiguratorSurface surface={powierzchnia} />);
    expect(screen.queryByTestId('station-config-tab-infrastructure')).toBeNull();
    expect(screen.queryByRole('tab', { name: /SCADA i infrastruktura/ })).toBeNull();
  });
});
