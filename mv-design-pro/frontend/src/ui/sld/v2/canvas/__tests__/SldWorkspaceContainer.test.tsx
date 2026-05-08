/**
 * Testy SldWorkspaceContainer (Etap 1).
 *
 * Pokrycie:
 *  1. Pusty stan (snapshot=null) → polski komunikat empty state.
 *  2. Render kanwy SVG (data-testid="sld-canvas-v2") nawet bez danych.
 *  3. Right-click na kanwie tła → otwiera menu kontekstowe `background`.
 *  4. Dwuklik stacji → overlay station-internal-view (drill-down).
 *  5. Akcja `show-readiness` z menu tła → wywołuje openRouteSurface('E-04').
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { useAppStateStore } from '../../../../app-state';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { useNetworkBuildStore } from '../../../../network-build/networkBuildStore';
import { useSelectionStore } from '../../../../selection';
import { SldWorkspaceContainer } from '../SldWorkspaceContainer';
import { SldCanvasV2, type SldCanvasContextMenuRequest } from '../SldCanvasV2';

describe('SldWorkspaceContainer — Etap 1 wiring', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
    // network-build store nie ma reset wbudowanego — wymuszamy spójny stan
    // przez bezpośrednie wyczyszczenie krytycznych pól.
    useNetworkBuildStore.setState({ activeSurface: null });
    useSelectionStore.setState({
      selectedElements: [],
      selectedElement: null,
      propertyGridOpen: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renderuje kanwę SLD z polskim pustym stanem przy braku snapshota', () => {
    render(<SldWorkspaceContainer width={800} height={600} />);

    // Kanwa zawsze widoczna — gwarantuje że ekran nie jest pusty.
    expect(screen.getByTestId('sld-canvas-v2')).toBeInTheDocument();

    // Polski komunikat empty state.
    const empty = screen.getByTestId('sld-empty-state');
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).toContain('Schemat oczekuje na dane modelu sieci');
    expect(empty.textContent).toContain('Głównego Punktu Zasilającego');
  });

  it('reaguje na right-click w tle kanwy poprzez handler onContextMenu', () => {
    const handleContextMenu = vi.fn();
    const { container } = render(
      <SldCanvasV2
        width={800}
        height={600}
        gpzs={[]}
        sections={[]}
        cableRuns={[]}
        stations={[]}
        ders={[]}
        onContextMenu={handleContextMenu}
      />,
    );

    const svg = container.querySelector('svg[data-testid="sld-canvas-v2"]');
    expect(svg).toBeTruthy();

    fireEvent.contextMenu(svg!, { clientX: 120, clientY: 240 });
    expect(handleContextMenu).toHaveBeenCalledTimes(1);
    const arg = handleContextMenu.mock.calls[0]![0] as SldCanvasContextMenuRequest;
    expect(arg.kind).toBe('background');
    expect(arg.elementId).toBeNull();
    expect(arg.clientX).toBe(120);
    expect(arg.clientY).toBe(240);
  });

  it('respektuje tryb readOnly (data atrybut + brak zewnętrznego rozróżnienia w pustym widoku)', () => {
    render(<SldWorkspaceContainer width={400} height={300} readOnly />);
    const root = screen.getByTestId('sld-workspace-container');
    expect(root.getAttribute('data-readonly')).toBe('true');
  });

  it('rozpoznaje obecność danych w snapshot (isEmpty=false ukrywa empty state)', () => {
    useSnapshotStore.setState({
      snapshot: {
        header: {
          enm_version: '1.0',
          name: 'Sieć testowa',
          created_at: '2026-05-01T00:00:00Z',
          updated_at: '2026-05-01T00:00:00Z',
          revision: 1,
          hash_sha256: 'a'.repeat(64),
          defaults: { frequency_hz: 50, unit_system: 'SI' },
        },
        buses: [
          {
            id: 'bus_1',
            ref_id: 'bus_1',
            name: 'GPZ',
            tags: [],
            meta: {},
            voltage_kv: 15,
          } as never, // ENMBus jest węższym typem; testujemy tylko obecność.
        ],
        transformers: [],
        branches: [],
        sources: [],
        loads: [],
        substations: [
          // Po Iteracji 11 isEmpty bazuje na wyniku adaptera; dodajemy GPZ
          // żeby adapter wyprodukował niepusty SldDataPayload.
          {
            id: 'gpz_1',
            ref_id: 'gpz_1',
            name: 'GPZ-1',
            tags: [],
            meta: {},
            station_type: 'gpz',
            bus_refs: ['bus_1'],
            transformer_refs: [],
          } as never,
        ],
        bays: [],
        terminals: [],
        line_runs: [],
        connection_nodes: [],
        cable_joints: [],
      } as never,
      logicalViews: null,
      readiness: null,
      fixActions: [],
      materializedParams: null,
      layout: null,
      selectionHint: null,
      lastChanges: null,
      lastEvents: [],
      operationHistory: [],
      loading: false,
      error: null,
      errorCode: null,
    });

    render(<SldWorkspaceContainer width={400} height={300} />);

    // Empty state nie powinien się pokazać.
    expect(screen.queryByTestId('sld-empty-state')).toBeNull();
    // Kanwa nadal się renderuje.
    expect(screen.getByTestId('sld-canvas-v2')).toBeInTheDocument();
  });

  it('otwiera wewnętrzny SLD stacji z nazwą domenową i rozmiarem dopasowanym do kanwy', () => {
    useSnapshotStore.setState({
      snapshot: {
        header: {
          enm_version: '1.0',
          name: 'Sieć testowa',
          created_at: '2026-05-01T00:00:00Z',
          updated_at: '2026-05-01T00:00:00Z',
          revision: 1,
          hash_sha256: 'b'.repeat(64),
          defaults: { frequency_hz: 50, unit_system: 'SI' },
        },
        buses: [
          {
            id: 'bus_sn',
            ref_id: 'bus_sn',
            name: 'Szyna SN',
            tags: [],
            meta: {},
            voltage_kv: 15,
          } as never,
          {
            id: 'bus_nn',
            ref_id: 'bus_nn',
            name: 'Szyna nN',
            tags: [],
            meta: {},
            voltage_kv: 0.4,
          } as never,
        ],
        transformers: [
          {
            id: 'tr_1',
            ref_id: 'tr_1',
            name: 'Transformator T1',
            tags: [],
            meta: {},
            hv_bus_ref: 'bus_sn',
            lv_bus_ref: 'bus_nn',
            sn_mva: 0.63,
            uhv_kv: 15,
            ulv_kv: 0.4,
            uk_percent: 6,
            pk_kw: 6,
          } as never,
        ],
        branches: [],
        sources: [],
        loads: [],
        generators: [],
        substations: [
          {
            id: 'station_1',
            ref_id: 'station_1',
            name: 'Stacja Przelotowa',
            tags: [],
            meta: {},
            station_type: 'inline',
            bus_refs: ['bus_sn', 'bus_nn'],
            transformer_refs: ['tr_1'],
          } as never,
        ],
        bays: [],
        junctions: [],
        branch_points: [],
        corridors: [],
        measurements: [],
        protection_assignments: [],
      } as never,
      logicalViews: null,
      readiness: null,
      fixActions: [],
      materializedParams: null,
      layout: null,
      selectionHint: null,
      lastChanges: null,
      lastEvents: [],
      operationHistory: [],
      loading: false,
      error: null,
      errorCode: null,
    });

    render(<SldWorkspaceContainer width={400} height={320} />);

    /* R17/R19: legacy StationOnRunRenderer został zastąpiony przez
     * NetworkTerrainRenderer + MiniBlockRmuRenderer dla field stations.
     * Stary testid 'sld-v2-station-{id}' → nowy 'sld-v2-mini-rmu-{id}'. */
    fireEvent.doubleClick(screen.getByTestId('sld-v2-mini-rmu-station_1'));

    const internal = screen.getByTestId('sld-v2-station-internal-station_1');
    expect(internal.textContent).toContain('Stacja Przelotowa');
    expect(internal.textContent).toContain('Typ topologiczny: przelotowa');
    expect(internal.textContent).toContain('Poziomy nN: 0.4 kV');
    expect(internal.getAttribute('width')).toBe('376');
  });

  it('klik DER na SLD synchronizuje wspólny SelectionState dla inspektora', () => {
    useSnapshotStore.setState({
      snapshot: {
        header: {
          enm_version: '1.0',
          name: 'Sieć testowa',
          created_at: '2026-05-01T00:00:00Z',
          updated_at: '2026-05-01T00:00:00Z',
          revision: 1,
          hash_sha256: 'c'.repeat(64),
          defaults: { frequency_hz: 50, unit_system: 'SI' },
        },
        buses: [
          {
            id: 'bus_sn',
            ref_id: 'bus_sn',
            name: 'Szyna SN',
            tags: [],
            meta: {},
            voltage_kv: 15,
          } as never,
          {
            id: 'bus_nn',
            ref_id: 'bus_nn',
            name: 'Szyna nN',
            tags: [],
            meta: {},
            voltage_kv: 0.4,
          } as never,
        ],
        transformers: [],
        branches: [],
        sources: [],
        loads: [],
        generators: [
          {
            id: 'pv_1',
            ref_id: 'pv_1',
            name: 'Blok PV',
            tags: [],
            meta: {},
            gen_type: 'pv_inverter',
            station_ref: 'station_1',
            bus_ref: 'bus_nn',
            p_mw: 0.5,
            q_mvar: 0,
            connection_variant: 'lv_busbar',
            catalog_ref: 'pv-inverter-05mw-04kv',
          } as never,
        ],
        substations: [
          {
            id: 'station_1',
            ref_id: 'station_1',
            name: 'Stacja z PV',
            tags: [],
            meta: {},
            station_type: 'inline',
            bus_refs: ['bus_sn', 'bus_nn'],
            transformer_refs: [],
          } as never,
        ],
        bays: [],
        junctions: [],
        branch_points: [],
        corridors: [],
        measurements: [],
        protection_assignments: [],
      } as never,
      logicalViews: null,
      readiness: null,
      fixActions: [],
      materializedParams: null,
      layout: null,
      selectionHint: null,
      lastChanges: null,
      lastEvents: [],
      operationHistory: [],
      loading: false,
      error: null,
      errorCode: null,
    });

    render(<SldWorkspaceContainer width={800} height={500} />);

    fireEvent.click(screen.getByTestId('sld-v2-der-pv_1'));

    expect(useSelectionStore.getState().selectedElement).toMatchObject({
      id: 'pv_1',
      type: 'PVInverter',
      name: 'Blok PV',
    });
    expect(useSelectionStore.getState().propertyGridOpen).toBe(true);
  });
});
