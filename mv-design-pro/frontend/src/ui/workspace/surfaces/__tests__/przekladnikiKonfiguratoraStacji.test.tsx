/**
 * Karty „Przekładniki prądowe / napięciowe” konfiguratora stacji (E-13) z modelu.
 * Dawniej obie karty dostawały wyłącznie puste listy bazowe — projektant widział „Dobierz
 * przekładniki…” także przy przekładnikach zapisanych w polach stacji.
 *
 * ILOCZYN CECH: przekładnik {CT, VT} × pole {tej stacji, innej stacji, bez pola} × klasa
 * dokładności {w modelu, brak} × moc znamionowa {w modelu, brak}; kolejność wierszy = kolejność
 * pól, w polu po `ref_id`. Ścieżka natywna: klik w zakładkę karty (`userEvent`).
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { renderWithQueryClient as render } from '../../../../test/queryClientTestUtils';
import { BRAK_KLASY_PL, przekladnikiStacji } from '../../../network-build/station-configurator/przekladnikiStacji';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import type { WorkspaceSurfaceDescriptor } from '../../types';
import { StationConfiguratorSurface } from '../StationConfiguratorSurface';

const powierzchnia: WorkspaceSurfaceDescriptor = {
  surfaceId: 'surface-test',
  screenCode: 'E-13',
  surfaceKind: 'pomocniczy',
  titlePl: 'Test',
  entityRef: 'stn/s1/station',
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

function pomiar(ref: string, typ: 'CT' | 'VT', bay: string | null, rating: Record<string, unknown>) {
  return { ref_id: ref, name: ref, measurement_type: typ, bus_ref: 'stn/s1/sn_bus', bay_ref: bay, rating, connection: 'star', purpose: 'protection', tags: [], meta: {} };
}

const POMIARY = [
  pomiar('ct/b', 'CT', 'pole/wy', { ratio_primary: 200, ratio_secondary: 5, accuracy_class: '5P20', burden_va: 10 }),
  pomiar('ct/a', 'CT', 'pole/wy', { ratio_primary: 300, ratio_secondary: 1 }),
  pomiar('ct/we', 'CT', 'pole/we', { ratio_primary: 400, ratio_secondary: 5, accuracy_class: '0,5' }),
  pomiar('vt/we', 'VT', 'pole/we', { ratio_primary: 15000, ratio_secondary: 100, accuracy_class: '0,5' }),
  pomiar('ct/obcy', 'CT', 'pole/inna-stacja', { ratio_primary: 100, ratio_secondary: 5 }),
  pomiar('ct/bez-pola', 'CT', null, { ratio_primary: 100, ratio_secondary: 5 }),
];

describe('przekladnikiStacji — model wierszy', () => {
  const pola = [
    { ref: 'pole/we', oznaczenie: 'Pole wejściowe' },
    { ref: 'pole/wy', oznaczenie: 'Pole wyjściowe' },
  ];

  it('tylko pola stacji; kolejność pól, w polu po ref_id; CT i VT rozdzielone', () => {
    const { cts, vts } = przekladnikiStacji(POMIARY as never, pola);
    expect(cts.map((w) => w.id)).toEqual(['ct/we', 'ct/a', 'ct/b']);
    expect(vts.map((w) => w.id)).toEqual(['vt/we']);
    expect(cts[0]).toMatchObject({ bayDesignation: 'Pole wejściowe', ratioPrimary: 400, ratioSecondary: 5 });
  });

  it('brak klasy i mocy w modelu = jawny brak, nie domysł', () => {
    const { cts } = przekladnikiStacji(POMIARY as never, pola);
    const bez = cts.find((w) => w.id === 'ct/a');
    expect(bez).toMatchObject({ accuracyClassPl: BRAK_KLASY_PL, burdenVa: null });
    expect(cts.find((w) => w.id === 'ct/b')).toMatchObject({ accuracyClassPl: '5P20', burdenVa: 10 });
  });

  it('stacja bez pól → puste listy', () => {
    expect(przekladnikiStacji(POMIARY as never, [])).toEqual({ cts: [], vts: [] });
  });
});

describe('Konfigurator stacji — karty przekładników z modelu (klik w zakładkę)', () => {
  beforeEach(() => {
    useSnapshotStore.setState({
      snapshot: {
        header: { enm_version: '1.0', name: 'S', created_at: '', updated_at: '', revision: 1, hash_sha256: 'x', defaults: { frequency_hz: 50, unit_system: 'SI' } },
        buses: [{ id: 'b', ref_id: 'stn/s1/sn_bus', name: 'Szyna SN', voltage_kv: 15, tags: [], meta: {} }],
        branches: [],
        transformers: [],
        sources: [],
        loads: [],
        substations: [
          { id: 's1', ref_id: 'stn/s1/station', name: 'Stacja S1', tags: [], meta: {}, station_type: 'inline', bus_refs: ['stn/s1/sn_bus'], transformer_refs: [] },
        ],
        generators: [],
        bays: [
          { ref_id: 'pole/we', name: 'Pole wejściowe', bay_role: 'IN', substation_ref: 'stn/s1/station', bus_ref: 'stn/s1/sn_bus', equipment_refs: [], tags: [], meta: {} },
          { ref_id: 'pole/wy', name: 'Pole wyjściowe', bay_role: 'OUT', substation_ref: 'stn/s1/station', bus_ref: 'stn/s1/sn_bus', equipment_refs: [], tags: [], meta: {} },
        ],
        junctions: [],
        corridors: [],
        measurements: POMIARY,
        protection_assignments: [],
        branch_points: [],
        line_runs: [],
        connection_nodes: [],
      } as never,
    });
  });

  it('karta CT pokazuje przekładniki pól tej stacji, bez obcych', async () => {
    render(<StationConfiguratorSurface surface={powierzchnia} />);
    await userEvent.setup().click(screen.getByTestId('station-config-tab-ct'));
    const karta = screen.getByTestId('station-config-content-ct');
    expect(karta.textContent).toContain('400 / 5 A');
    expect(karta.textContent).toContain('5P20');
    expect(karta.textContent).toContain('10 VA');
    expect(karta.textContent).toContain(BRAK_KLASY_PL);
    expect(karta.textContent).not.toContain('100 / 5 A');
    expect(karta.textContent).not.toContain('Dobierz przekładniki CT');
  });

  it('karta VT pokazuje przekładnik napięciowy pola wejściowego', async () => {
    render(<StationConfiguratorSurface surface={powierzchnia} />);
    await userEvent.setup().click(screen.getByTestId('station-config-tab-vt'));
    const karta = screen.getByTestId('station-config-content-vt');
    expect(karta.textContent).toContain('Pole wejściowe');
    expect(karta.textContent).toContain('15000 / 100 V');
  });
});
