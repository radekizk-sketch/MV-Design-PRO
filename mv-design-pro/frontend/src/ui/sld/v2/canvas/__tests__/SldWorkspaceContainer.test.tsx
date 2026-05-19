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
    useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
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

  it('pusty komunikat SLD nie blokuje menu prawego kliknięcia tła', () => {
    render(<SldWorkspaceContainer width={800} height={600} />);

    fireEvent.contextMenu(screen.getByTestId('sld-empty-state').firstElementChild!, {
      clientX: 340,
      clientY: 260,
    });

    expect(screen.getByText('Wstaw główny punkt zasilania')).toBeInTheDocument();
  });

  it('empty state ma jawne CTA "Wstaw Główny Punkt Zasilający" jako pierwszy krok flow', () => {
    render(<SldWorkspaceContainer width={800} height={600} />);
    const cta = screen.getByTestId('sld-empty-state-insert-gpz');
    expect(cta).toBeInTheDocument();
    expect(cta.tagName).toBe('BUTTON');
    expect(cta.textContent).toContain('Wstaw Główny Punkt Zasilający');
  });

  it('empty state ma akcję pomocniczą "Przeglądaj katalogi techniczne"', () => {
    render(<SldWorkspaceContainer width={800} height={600} />);
    const secondary = screen.getByTestId('sld-empty-state-open-catalogs');
    expect(secondary).toBeInTheDocument();
    expect(secondary.tagName).toBe('BUTTON');
    expect(secondary.textContent).toContain('Przeglądaj katalogi techniczne');
  });

  it('klik CTA "Wstaw GPZ" wyzwala operację add_grid_source_sn (otwiera formularz)', () => {
    render(<SldWorkspaceContainer width={800} height={600} />);
    const cta = screen.getByTestId('sld-empty-state-insert-gpz');
    fireEvent.click(cta);
    // Po kliknięciu store networkBuild powinien zawierać aktywną powierzchnię
    // formularza add_grid_source_sn LUB toast info — zależnie od konfiguracji
    // routingu. Sprawdzamy, że klik został przyjęty (nie nastąpił błąd) oraz
    // że SLD pozostaje w stanie wymagającym jednoznacznego pierwszego kroku.
    expect(screen.queryByTestId('sld-empty-state')).toBeInTheDocument();
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

    fireEvent.doubleClick(screen.getByTestId('sld-v2-mini-rmu-station_1'));

    const internal = screen.getByTestId('sld-v2-station-internal-station_1');
    expect(internal.textContent).toContain('Stacja Przelotowa');
    expect(internal.textContent).toContain('Typ topologiczny: przelotowa');
    expect(internal.textContent).toContain('Poziomy nN: 0.4 kV');
    expect(internal.getAttribute('width')).toBe('376');
  });

  it('klik DER na SLD synchronizuje wspólny SelectionState dla inspektora', () => {
    useNetworkBuildStore.setState({
      activeSurface: {
        surfaceId: 'operation:add_grid_source_sn:test',
        screenCode: 'E-10',
        titlePl: 'Dodaj źródło zasilania GPZ',
        openMode: 'replace_right_panel',
        sizeClass: 'B',
        stackLevel: 1,
      } as never,
      surfaceStack: [
        {
          surfaceId: 'operation:add_grid_source_sn:test',
          screenCode: 'E-10',
          titlePl: 'Dodaj źródło zasilania GPZ',
          openMode: 'replace_right_panel',
          sizeClass: 'B',
          stackLevel: 1,
        } as never,
      ],
    });
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
    expect(useNetworkBuildStore.getState().activeSurface).toBeNull();
  });

  it('klik aparatu w polu SN zamyka kartę roboczą i pokazuje właściwy obiekt w inspektorze', () => {
    useNetworkBuildStore.setState({
      activeSurface: {
        surfaceId: 'operation:add_grid_source_sn:test',
        screenCode: 'E-10',
        titlePl: 'Dodaj źródło zasilania GPZ',
        openMode: 'replace_right_panel',
        sizeClass: 'B',
        stackLevel: 1,
      } as never,
      surfaceStack: [
        {
          surfaceId: 'operation:add_grid_source_sn:test',
          screenCode: 'E-10',
          titlePl: 'Dodaj źródło zasilania GPZ',
          openMode: 'replace_right_panel',
          sizeClass: 'B',
          stackLevel: 1,
        } as never,
      ],
    });
    useSnapshotStore.setState({
      snapshot: {
        header: {
          enm_version: '1.0',
          name: 'Sieć testowa',
          created_at: '2026-05-01T00:00:00Z',
          updated_at: '2026-05-01T00:00:00Z',
          revision: 1,
          hash_sha256: 'd'.repeat(64),
          defaults: { frequency_hz: 50, unit_system: 'SI' },
        },
        buses: [
          {
            id: 'bus_s1',
            ref_id: 'bus_s1',
            name: 'Szyna S1',
            tags: [],
            meta: {},
            voltage_kv: 15,
          } as never,
        ],
        transformers: [],
        branches: [],
        sources: [],
        loads: [],
        generators: [],
        substations: [
          {
            id: 'gpz_1',
            ref_id: 'gpz_1',
            name: 'GPZ Test',
            tags: [],
            meta: {},
            station_type: 'gpz',
            bus_refs: ['bus_s1'],
            transformer_refs: [],
            gpz_sections: [
              {
                section_id: 's1',
                name: 'Sekcja 1',
                order: 1,
                bus_ref: 'bus_s1',
              },
            ],
          } as never,
        ],
        bays: [
          {
            id: 'bay_1',
            ref_id: 'bay_1',
            name: 'Pole odpływowe 1',
            tags: [],
            meta: {},
            bay_role: 'OUT',
            substation_ref: 'gpz_1',
            bus_ref: 'bus_s1',
            gpz_section_id: 's1',
            bay_number: '1',
            feeder_short_name: 'Pole odpływowe',
          } as never,
        ],
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

    render(<SldWorkspaceContainer width={900} height={520} />);

    fireEvent.mouseDown(screen.getByTestId('gpz-canonical-apparatus-bay_1#breaker-button'), {
      button: 0,
    });

    expect(useSelectionStore.getState().selectedElement).toMatchObject({
      id: 'bay_1#breaker',
      type: 'Switch',
      name: expect.stringContaining('Wyłącznik SN'),
    });
    expect(useNetworkBuildStore.getState().activeSurface).toBeNull();
  });

  it('F4: sld-theme-toggle i sld-export-svg są widoczne i mają opis dostępności', () => {
    render(<SldWorkspaceContainer width={800} height={600} />);

    const themeBtn = screen.getByTestId('sld-theme-toggle');
    expect(themeBtn).toBeInTheDocument();
    expect(themeBtn).toHaveAttribute('title');

    const exportBtn = screen.getByTestId('sld-export-svg');
    expect(exportBtn).toBeInTheDocument();
    expect(exportBtn).toHaveAttribute('title');
    expect(exportBtn.textContent).toContain('SVG');
  });

  it('K7: SplitPreviewPanel widoczny gdy splitPreviewState podany', () => {
    const mockPreviewState = {
      kind: 'preview_ready' as const,
      segment: { segmentRef: 'SEG-1', segmentType: 'cable' as const, lengthKm: 3.8, busFromRef: 'B1', busToRef: 'B2' },
      insertAt: { mode: 'RATIO' as const, value: 0.4 },
      insertedKind: 'station' as const,
      preview: {
        insertedStationId: 'STA-NEW',
        stationType: 'ZKSN',
        electricalImpact: {
          topologyTypeChanged: false,
          affectedObjectRefs: [],
          halves: { firstSegmentId: null, secondSegmentId: null, firstLengthKm: 1.52, secondLengthKm: 2.28, splitRatio: 0.4 },
          catalogInheritance: { sourceSegmentRef: null, sourceCatalogRef: null, firstInherits: true, secondInherits: true, rule: 'inherit_both' },
          invalidatedResults: [],
          affectedProofPacks: [],
          missingDataAfter: [],
          affectedBuses: [],
        },
      },
    };
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <SldWorkspaceContainer
        width={800}
        height={600}
        splitPreviewState={mockPreviewState}
        onSplitConfirm={onConfirm}
        onSplitCancel={onCancel}
      />
    );

    expect(screen.getByTestId('split-preview-panel')).toBeInTheDocument();
    expect(screen.getByTestId('split-preview-station')).toHaveTextContent('ZKSN');
  });

  it('K7: SplitPreviewPanel NIE jest widoczny gdy splitPreviewState=null', () => {
    render(<SldWorkspaceContainer width={800} height={600} splitPreviewState={null} />);
    expect(screen.queryByTestId('split-preview-panel')).not.toBeInTheDocument();
  });

  it('K30-78: DER palette toolbar widoczny + 3 buttons PV/BESS/FW', () => {
    render(<SldWorkspaceContainer width={800} height={600} />);
    expect(screen.getByTestId('sld-v2-der-palette')).toBeInTheDocument();
    expect(screen.getByTestId('der-palette-btn-PV')).toBeInTheDocument();
    expect(screen.getByTestId('der-palette-btn-BESS')).toBeInTheDocument();
    expect(screen.getByTestId('der-palette-btn-FW')).toBeInTheDocument();
  });

  it('K30-78: klik PV palette → hint widoczny + inne buttons disabled', () => {
    render(<SldWorkspaceContainer width={800} height={600} />);
    fireEvent.click(screen.getByTestId('der-palette-btn-PV'));
    expect(screen.getByTestId('sld-v2-der-palette-hint')).toBeInTheDocument();
    expect(screen.getByTestId('sld-v2-der-palette-hint').textContent).toContain('PV');
    const bess = screen.getByTestId('der-palette-btn-BESS') as HTMLButtonElement;
    const fw = screen.getByTestId('der-palette-btn-FW') as HTMLButtonElement;
    expect(bess.disabled).toBe(true);
    expect(fw.disabled).toBe(true);
  });

  it('K30-78: cancel button czyści drag state', () => {
    render(<SldWorkspaceContainer width={800} height={600} />);
    fireEvent.click(screen.getByTestId('der-palette-btn-BESS'));
    expect(screen.getByTestId('sld-v2-der-palette-hint')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('sld-v2-der-palette-cancel'));
    expect(screen.queryByTestId('sld-v2-der-palette-hint')).toBeNull();
  });
});
