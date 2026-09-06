/**
 * Testy Etapu 4 — sieć terenowa (E-12 odcinek, E-14 ZK SN, E-15 słup, E-16 odgałęzienie, E-17 NOP).
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { SnSegmentSurface } from '../SnSegmentSurface';
import { useNetworkBuildStore } from '../../../network-build/networkBuildStore';
import { useSelectionStore } from '../../../selection/store';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import type { EnergyNetworkModel } from '../../../../types/enm';
import {
  ZksnSurface,
  BranchPoleSurface,
  BranchSurface,
  NopSurface,
} from '../InfrastructureSurfaces';
import type { WorkspaceSurfaceDescriptor } from '../../types';

// Kompletny `WorkspaceSurfaceDescriptor` (nie `as never`) — `never` przechodzi
// bezposrednie przypisanie do propa `surface`, ale `{ ...minimalSurface, ... }`
// wymaga realnego typu obiektowego (TS2698), wiec kazde uzycie musi byc
// prawdziwie typowane, nie obchodzone rzutowaniem.
const minimalSurface: WorkspaceSurfaceDescriptor = {
  surfaceId: 'surface-test',
  screenCode: 'E-12',
  surfaceKind: 'pomocniczy',
  titlePl: 'Test',
  entityRef: null,
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

const segmentSurface = {
  ...minimalSurface,
  entityRef: 'seg-1',
  entityType: 'branch',
} as never;

const openOperationFormMock = vi.fn();
const openRouteSurfaceMock = vi.fn();

function buildSnapshot(endpointBusy = false): EnergyNetworkModel {
  return {
    header: {
      enm_version: '1.0',
      name: 'test',
      created_at: '2026-05-19T00:00:00Z',
      updated_at: '2026-05-19T00:00:00Z',
      revision: 1,
      hash_sha256: 'hash',
      defaults: { frequency_hz: 50, unit_system: 'SI' },
    },
    buses: [
      {
        id: 'bus-a',
        ref_id: 'bus-a',
        name: 'Zacisk pola SN',
        tags: [],
        meta: {},
        voltage_kv: 15,
        phase_system: '3ph',
      },
      {
        id: 'bus-end',
        ref_id: 'bus-end',
        name: 'Zacisk końcowy odcinka SN',
        tags: endpointBusy ? ['substation_bus'] : ['helper_bus', 'topology_terminal'],
        meta: {},
        voltage_kv: 15,
        phase_system: '3ph',
      },
    ],
    branches: [
      {
        id: 'seg-1',
        ref_id: 'seg-1',
        name: 'Odcinek /segment',
        tags: [],
        meta: {},
        type: 'cable',
        from_bus_ref: 'bus-a',
        to_bus_ref: 'bus-end',
        status: 'closed',
        length_km: 0.5,
        r_ohm_per_km: 0.12,
        x_ohm_per_km: 0.08,
      },
    ],
    transformers: [],
    sources: [],
    loads: [],
    generators: [],
    substations: endpointBusy
      ? [
          {
            id: 'st-1',
            ref_id: 'st-1',
            name: 'Stacja Końcowa',
            tags: [],
            meta: {},
            station_type: 'terminal',
            bus_refs: ['bus-end'],
            transformer_refs: [],
          },
        ]
      : [],
    bays: [],
    junctions: [],
    branch_points: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
  };
}

describe('Etap 4 — surface\'y sieci terenowej', () => {
  beforeEach(() => {
    openOperationFormMock.mockReset();
    openRouteSurfaceMock.mockReset();
    useSnapshotStore.getState().reset();
    useNetworkBuildStore.setState({
      openOperationForm: openOperationFormMock,
      openRouteSurface: openRouteSurfaceMock,
    });
    useSelectionStore.getState().selectElement(null);
    useSelectionStore.getState().centerSldOnElement(null);
  });

  it('SnSegmentSurface (E-12) renderuje 4 karty i przełączanie rodziny zmienia katalog', () => {
    render(<SnSegmentSurface surface={minimalSurface} />);
    expect(screen.getByTestId('sn-segment-surface')).toBeInTheDocument();
    expect(screen.getByText('Identyfikacja')).toBeInTheDocument();
    expect(screen.getByText('Typ katalogowy i przewód')).toBeInTheDocument();
    expect(screen.getByText('Trasa i ułożenie')).toBeInTheDocument();
    expect(screen.getByText('Obciążalność')).toBeInTheDocument();

    // Domyślnie kabel SN
    const familySelect = screen.getByDisplayValue('Kabel SN') as HTMLSelectElement;
    expect(familySelect).toBeInTheDocument();

    // Przełączanie na linię napowietrzną
    fireEvent.change(familySelect, { target: { value: 'linia_napowietrzna_sn' } });

    // Karta "Typ katalogowy i przewód"
    fireEvent.click(screen.getByTestId('segment-tab-catalog'));
    expect(screen.getAllByText(/AFL-6 50 mm²/).length).toBeGreaterThan(0);
  });

  it('SnSegmentSurface otwiera zakończenie stacją tylko dla wolnego zacisku końcowego', () => {
    useSnapshotStore.getState().setSnapshot({ snapshot: buildSnapshot(false) } as never);

    render(<SnSegmentSurface surface={segmentSurface} />);
    expect(screen.getByRole('heading', { name: 'Odcinek 01' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('segment-action-append-station'));

    expect(openOperationFormMock).toHaveBeenCalledWith(
      'insert_station_on_segment_sn',
      expect.objectContaining({
        segment_id: 'seg-1',
        endpoint_bus_ref: 'bus-end',
        placement_mode: 'ENDPOINT_APPEND',
      }),
    );
  });

  it('SnSegmentSurface nie pozwala zakończyć odcinka na zacisku zajętym przez stację', () => {
    useSnapshotStore.getState().setSnapshot({ snapshot: buildSnapshot(true) } as never);

    render(<SnSegmentSurface surface={segmentSurface} />);

    expect(screen.queryByTestId('segment-action-append-station')).not.toBeInTheDocument();
    expect(screen.queryByTestId('segment-action-append-zksn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('segment-action-append-branch-pole')).not.toBeInTheDocument();
    expect(screen.queryByTestId('segment-termination-standard')).not.toBeInTheDocument();
    expect(screen.getByTestId('segment-endpoint-occupied')).toHaveTextContent(
      'Dalszą budowę prowadź z karty tej stacji',
    );

    fireEvent.click(screen.getByTestId('segment-action-open-end-station'));

    expect(openOperationFormMock).not.toHaveBeenCalled();
    expect(openRouteSurfaceMock).toHaveBeenCalledWith(
      'E-13',
      expect.objectContaining({ entityRef: 'st-1', entityType: 'station' }),
    );
  });

  it('SnSegmentSurface pokazuje publiczny opis kabla bez klucza katalogowego operatora', () => {
    const snapshot = buildSnapshot(false);
    snapshot.branches[0] = {
      ...snapshot.branches[0],
      catalog_ref: 'cable-enea-operator-na2xs2y-1x150',
      conductor_material: 'AL',
      cross_section_mm2: 150,
      number_of_cores: 1,
      return_conductor_cross_section_mm2: 25,
      rating: { in_a: 310 },
    } as never;
    useSnapshotStore.getState().setSnapshot({ snapshot } as never);

    render(<SnSegmentSurface surface={segmentSurface} />);

    const summary = screen.getByTestId('segment-technical-summary');
    expect(summary).toHaveTextContent('3 × NA2XS2Y 1×150/25 mm²');
    expect(summary).not.toHaveTextContent('cable-enea-operator');
    expect(summary).toHaveTextContent('Al 150/25 mm²');
  });

  it('SnSegmentSurface ukrywa roboczą nazwę segmentu i opisuje odcinek napowietrzny technicznie', () => {
    const snapshot = buildSnapshot(false);
    snapshot.branches[0] = {
      ...snapshot.branches[0],
      name: 'Odcinek /segment - za punktem rozgałęzienia',
      type: 'line_overhead',
      catalog_ref: 'line-base-al-150',
      cross_section_mm2: 150,
      materialized_params: { conductor_material: 'AL' },
      rating: { in_a: 365 },
    } as never;
    useSnapshotStore.getState().setSnapshot({ snapshot } as never);

    render(<SnSegmentSurface surface={segmentSurface} />);

    expect(screen.getByRole('heading', { name: 'Odcinek 01' })).toBeInTheDocument();
    const summary = screen.getByTestId('segment-technical-summary');
    expect(summary).toHaveTextContent('Linia napowietrzna Al 150 mm²');
    expect(summary).toHaveTextContent('Al 150 mm²');
    expect(summary).not.toHaveTextContent('line-base-al-150');
    expect(screen.queryByText('Odcinek /segment - za punktem rozgałęzienia')).not.toBeInTheDocument();
  });

  it('SnSegmentSurface pokazuje tylko standardowe zakończenia dla kabla i linii napowietrznej', () => {
    const cableSnapshot = buildSnapshot(false);
    useSnapshotStore.getState().setSnapshot({ snapshot: cableSnapshot } as never);

    const { rerender } = render(<SnSegmentSurface surface={segmentSurface} />);

    expect(screen.getByTestId('segment-action-append-station')).toBeInTheDocument();
    expect(screen.getByTestId('segment-action-append-zksn')).toBeInTheDocument();
    expect(screen.queryByTestId('segment-action-append-branch-pole')).not.toBeInTheDocument();
    expect(screen.getByTestId('segment-termination-standard')).toHaveTextContent('Kabel SN');

    const overheadSnapshot = buildSnapshot(false);
    overheadSnapshot.branches[0] = {
      ...overheadSnapshot.branches[0],
      type: 'line_overhead',
      catalog_ref: 'line-base-al-150',
      materialized_params: { catalog_item_id: 'line-base-al-150', conductor_material: 'AL' },
    } as never;
    act(() => {
      useSnapshotStore.getState().setSnapshot({ snapshot: overheadSnapshot } as never);
    });

    rerender(<SnSegmentSurface surface={segmentSurface} />);

    expect(screen.getByTestId('segment-action-append-station')).toBeInTheDocument();
    expect(screen.queryByTestId('segment-action-append-zksn')).not.toBeInTheDocument();
    expect(screen.getByTestId('segment-action-append-branch-pole')).toBeInTheDocument();
    expect(screen.getByTestId('segment-termination-standard')).toHaveTextContent('Linia napowietrzna');
  });

  it('ZksnSurface (E-14) pokazuje rozdzielnicę kablową SN i start odgałęzienia z pola ODG', () => {
    const snapshot = buildSnapshot(false);
    snapshot.branches[0] = {
      ...snapshot.branches[0],
      catalog_ref: 'cable-na2xs2y-1x150-25',
      materialized_params: { catalog_item_id: 'cable-na2xs2y-1x150-25' },
    } as never;
    snapshot.buses.push(
      {
        id: 'bus-zksn-branch-1',
        ref_id: 'bus-zksn-branch-1',
        name: 'Pole odgałęźne ZK SN 1',
        tags: ['helper_bus', 'branch_port'],
        meta: {},
        voltage_kv: 15,
        phase_system: '3ph',
      },
      {
        id: 'bus-zksn-branch-2',
        ref_id: 'bus-zksn-branch-2',
        name: 'Pole odgałęźne ZK SN 2',
        tags: ['helper_bus', 'branch_port'],
        meta: {},
        voltage_kv: 15,
        phase_system: '3ph',
      },
    );
    snapshot.branch_points = [
      {
        id: 'zksn-1',
        ref_id: 'zksn-1',
        name: 'ZK SN 1',
        tags: [],
        meta: {},
        branch_point_type: 'zksn',
        parent_segment_id: 'seg-1',
        bus_ref: 'bus-end',
        catalog_ref: 'zksn-2odg-630a',
        catalog_namespace: 'mv_branch_points',
        ports: {
          MAIN_IN: 'bus-a',
          MAIN_OUT: 'bus-end',
          BRANCH: ['bus-zksn-branch-1', 'bus-zksn-branch-2'],
        },
        branch_occupied: {},
        switch_state: 'closed',
        materialized_params: {
          switchgear_field_specs: [
            { code: 'WE', bay_role: 'INCOMING' },
            { code: 'WY', bay_role: 'OUTGOING' },
            { code: 'ODG1', bay_role: 'FEEDER' },
            { code: 'ODG2', bay_role: 'FEEDER' },
          ],
        },
        runtime_inputs: {
          operation_semantics: 'insert_point_in_run',
          main_segment_refs: ['seg-1'],
        },
      },
    ];
    useSnapshotStore.getState().setSnapshot({ snapshot } as never);

    render(<ZksnSurface surface={{ ...minimalSurface, entityRef: 'zksn-1', titlePl: 'ZK SN 1' } as never} />);

    expect(screen.getByTestId('zksn-surface')).toBeInTheDocument();
    expect(screen.getByText('Rozdzielnica kablowa SN bez transformatora')).toBeInTheDocument();
    expect(screen.getByText(/nie zawiera transformatora SN\/nN/)).toBeInTheDocument();
    expect(screen.getByText('Transformator')).toBeInTheDocument();
    expect(screen.getByText('nie występuje')).toBeInTheDocument();
    expect(screen.getByText('Układ pól SN')).toBeInTheDocument();
    expect(screen.getByText('WE / WY / ODG 1 / ODG 2')).toBeInTheDocument();
    expect(screen.getByText('Porty odgałęźne')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('zksn-action-start-branch-BRANCH_1'));

    expect(openOperationFormMock).toHaveBeenCalledWith(
      'start_branch_segment_sn',
      expect.objectContaining({
        from_ref: 'zksn-1.BRANCH_1',
        element_ref: 'zksn-1',
        source_bus_ref: 'bus-zksn-branch-1',
        source_type_label: 'ZKSN',
        source_name: 'ZK SN 1',
        source_port_label: 'port boczny odgałęzienia',
        segment: expect.objectContaining({
          rodzaj: 'cable',
          catalog_binding: expect.objectContaining({
            catalog_namespace: 'KABEL_SN',
            catalog_item_id: 'cable-na2xs2y-1x150-25',
          }),
        }),
      }),
    );
  });

  it('ZksnSurface pozwala kontynuować tor kablowy z pola WY, gdy ZKSN jest końcem ciągu', () => {
    const snapshot = buildSnapshot(false);
    snapshot.branches[0] = {
      ...snapshot.branches[0],
      catalog_ref: 'cable-na2xs2y-1x150-25',
      materialized_params: { catalog_item_id: 'cable-na2xs2y-1x150-25' },
    } as never;
    snapshot.buses.push({
      id: 'bus-zksn-branch-1',
      ref_id: 'bus-zksn-branch-1',
      name: 'Pole odgałęźne ZK SN 1',
      tags: ['helper_bus', 'branch_port'],
      meta: {},
      voltage_kv: 15,
      phase_system: '3ph',
    });
    snapshot.branch_points = [
      {
        id: 'zksn-1',
        ref_id: 'zksn-1',
        name: 'ZK SN 1',
        tags: [],
        meta: {},
        branch_point_type: 'zksn',
        parent_segment_id: 'seg-1',
        bus_ref: 'bus-end',
        catalog_ref: 'zksn-1odg-630a',
        catalog_namespace: 'mv_branch_points',
        ports: {
          MAIN_IN: 'bus-a',
          MAIN_OUT: 'bus-end',
          BRANCH: ['bus-zksn-branch-1'],
        },
        branch_occupied: {},
        switch_state: 'closed',
        materialized_params: {
          switchgear_field_specs: [
            { code: 'WE', bay_role: 'INCOMING' },
            { code: 'WY', bay_role: 'OUTGOING' },
            { code: 'ODG1', bay_role: 'FEEDER' },
          ],
        },
        runtime_inputs: {
          operation_semantics: 'insert_point_in_run',
          main_segment_refs: ['seg-1'],
        },
      },
    ];
    useSnapshotStore.getState().setSnapshot({ snapshot } as never);

    render(<ZksnSurface surface={{ ...minimalSurface, entityRef: 'zksn-1', titlePl: 'ZK SN 1' } as never} />);

    fireEvent.click(screen.getByTestId('zksn-action-continue-main'));

    expect(openOperationFormMock).toHaveBeenCalledWith(
      'continue_trunk_segment_sn',
      expect.objectContaining({
        from_terminal_id: 'bus-end',
        terminal_id: 'bus-end',
        terminal_port_id: 'zksn-1.MAIN_OUT',
        element_ref: 'zksn-1',
        element_type: 'ZKSN',
        source_type_label: 'ZKSN',
        source_port_label: 'pole wyjściowe ciągu głównego',
        segment_kind: 'KABEL_SN',
        segment: expect.objectContaining({
          rodzaj: 'cable',
          catalog_binding: expect.objectContaining({
            catalog_namespace: 'KABEL_SN',
            catalog_item_id: 'cable-na2xs2y-1x150-25',
          }),
        }),
      }),
    );
  });

  it('ZksnSurface pokazuje zajęte pole WY, gdy ZKSN jest już wpięty między dwa odcinki ciągu', () => {
    const snapshot = buildSnapshot(false);
    snapshot.branch_points = [
      {
        id: 'zksn-1',
        ref_id: 'zksn-1',
        name: 'ZK SN 1',
        tags: [],
        meta: {},
        branch_point_type: 'zksn',
        parent_segment_id: 'seg-1',
        bus_ref: 'bus-end',
        catalog_ref: 'zksn-1odg-630a',
        catalog_namespace: 'mv_branch_points',
        ports: {
          MAIN_IN: 'bus-a',
          MAIN_OUT: 'bus-end',
          BRANCH: [],
        },
        branch_occupied: {},
        switch_state: 'closed',
        materialized_params: {
          switchgear_field_specs: [
            { code: 'WE', bay_role: 'INCOMING' },
            { code: 'WY', bay_role: 'OUTGOING' },
          ],
        },
        runtime_inputs: {
          operation_semantics: 'insert_point_in_run',
          main_segment_refs: ['seg-1-left', 'seg-1-right'],
        },
      },
    ];
    useSnapshotStore.getState().setSnapshot({ snapshot } as never);

    render(<ZksnSurface surface={{ ...minimalSurface, entityRef: 'zksn-1', titlePl: 'ZK SN 1' } as never} />);

    expect(screen.getByTestId('zksn-main-out-state')).toHaveTextContent(
      'Pole WY ciągu głównego jest już połączone z następnym odcinkiem kablowym.',
    );
    expect(screen.queryByTestId('zksn-action-continue-main')).not.toBeInTheDocument();
  });

  it('ZksnSurface blokuje zajety pojedynczy port ODG po wyprowadzeniu odgalezienia', () => {
    const snapshot = buildSnapshot(false);
    snapshot.branches.push({
      id: 'seg-zksn-branch',
      ref_id: 'seg-zksn-branch',
      type: 'cable',
      catalog_ref: 'cable-na2xs2y-1x150-25',
      length_m: 500,
    } as never);
    snapshot.buses.push({
      id: 'bus-zksn-branch',
      ref_id: 'bus-zksn-branch',
      name: 'Pole odgalezne ZK SN',
      tags: ['helper_bus', 'branch_port'],
      meta: {},
      voltage_kv: 15,
      phase_system: '3ph',
    });
    snapshot.branch_points = [
      {
        id: 'zksn-1',
        ref_id: 'zksn-1',
        name: 'ZK SN 1',
        tags: [],
        meta: {},
        branch_point_type: 'zksn',
        parent_segment_id: 'seg-1',
        bus_ref: 'bus-end',
        catalog_ref: 'zksn-1odg-630a',
        catalog_namespace: 'mv_branch_points',
        ports: {
          MAIN_IN: 'bus-a',
          MAIN_OUT: 'bus-end',
          BRANCH: ['bus-zksn-branch'],
        },
        branch_occupied: { BRANCH: 'seg-zksn-branch' },
        switch_state: 'closed',
        materialized_params: {
          switchgear_field_specs: [
            { code: 'WE', bay_role: 'INCOMING' },
            { code: 'WY', bay_role: 'OUTGOING' },
            { code: 'ODG1', bay_role: 'FEEDER' },
          ],
        },
        runtime_inputs: {
          operation_semantics: 'insert_point_in_run',
          main_segment_refs: ['seg-1'],
        },
      },
    ];
    useSnapshotStore.getState().setSnapshot({ snapshot } as never);

    render(<ZksnSurface surface={{ ...minimalSurface, entityRef: 'zksn-1', titlePl: 'ZK SN 1' } as never} />);

    const action = screen.getByTestId('zksn-action-start-branch-BRANCH');
    expect(action).toBeDisabled();
    expect(action).toHaveTextContent('ODG 1');

    fireEvent.click(action);
    expect(openOperationFormMock).not.toHaveBeenCalled();
  });

  it('ZksnSurface rozpoznaje zajety port ODG po realnym polaczeniu odcinka nawet bez mapy branch_occupied', () => {
    const snapshot = buildSnapshot(false);
    snapshot.branches.push({
      id: 'seg-zksn-branch',
      ref_id: 'seg-zksn-branch',
      type: 'cable',
      from_bus_ref: 'bus-zksn-branch',
      to_bus_ref: 'bus-zksn-end',
      catalog_ref: 'cable-na2xs2y-1x150-25',
      length_m: 500,
    } as never);
    snapshot.buses.push({
      id: 'bus-zksn-branch',
      ref_id: 'bus-zksn-branch',
      name: 'Pole odgalezne ZK SN',
      tags: ['helper_bus', 'branch_port'],
      meta: {},
      voltage_kv: 15,
      phase_system: '3ph',
    });
    snapshot.branch_points = [
      {
        id: 'zksn-1',
        ref_id: 'zksn-1',
        name: 'ZK SN 1',
        tags: [],
        meta: {},
        branch_point_type: 'zksn',
        parent_segment_id: 'seg-1',
        bus_ref: 'bus-end',
        catalog_ref: 'zksn-1odg-630a',
        catalog_namespace: 'mv_branch_points',
        ports: {
          MAIN_IN: 'bus-a',
          MAIN_OUT: 'bus-end',
          BRANCH: ['bus-zksn-branch'],
        },
        branch_occupied: {},
        switch_state: 'closed',
        materialized_params: {
          switchgear_field_specs: [
            { code: 'WE', bay_role: 'INCOMING' },
            { code: 'WY', bay_role: 'OUTGOING' },
            { code: 'ODG1', bay_role: 'FEEDER' },
          ],
        },
        runtime_inputs: {
          operation_semantics: 'insert_point_in_run',
          main_segment_refs: ['seg-1'],
        },
      },
    ];
    useSnapshotStore.getState().setSnapshot({ snapshot } as never);

    render(<ZksnSurface surface={{ ...minimalSurface, entityRef: 'zksn-1', titlePl: 'ZK SN 1' } as never} />);

    const action = screen.getByTestId('zksn-action-start-branch-BRANCH');
    expect(action).toBeDisabled();
    expect(action).toHaveTextContent('już wyprowadzone');

    fireEvent.click(action);
    expect(openOperationFormMock).not.toHaveBeenCalled();
  });

  it('BranchPoleSurface pokazuje kartę techniczną słupa i start odgałęzienia z portu trasy', () => {
    const snapshot = buildSnapshot(false);
    snapshot.branches[0] = {
      ...snapshot.branches[0],
      id: 'seg-1_L_branch_pole',
      ref_id: 'seg-1_L_branch_pole',
      type: 'line_overhead',
      catalog_ref: 'line-base-al-150',
    } as never;
    snapshot.buses.push({
      id: 'bus-bp-branch',
      ref_id: 'bus-bp-branch',
      name: 'Port odgałęzienia słupa',
      tags: ['helper_bus', 'branch_port'],
      meta: {},
      voltage_kv: 15,
      phase_system: '3ph',
    });
    snapshot.branch_points = [
      {
        id: 'bp-1',
        ref_id: 'bp-1',
        name: 'Słup rozgałęźny SN',
        tags: [],
        meta: {},
        branch_point_type: 'branch_pole',
        parent_segment_id: 'seg-original-deleted',
        bus_ref: 'bus-end',
        catalog_ref: 'branch-pole-afl',
        catalog_namespace: 'mv_branch_points',
        ports: {
          MAIN_IN: 'bus-a',
          MAIN_OUT: 'bus-end',
          BRANCH: ['bus-bp-branch'],
        },
        branch_occupied: {},
        switch_state: 'closed',
        runtime_inputs: {
          operation_semantics: 'insert_point_in_run',
          main_segment_refs: ['seg-1_L_branch_pole'],
        },
      },
    ];
    useSnapshotStore.getState().setSnapshot({ snapshot } as never);

    render(<BranchPoleSurface surface={{ ...minimalSurface, entityRef: 'bp-1', titlePl: 'Słup rozgałęźny SN' } as never} />);

    expect(screen.getByTestId('branch-pole-surface')).toBeInTheDocument();
    expect(screen.getByText('Słup linii napowietrznej SN')).toBeInTheDocument();
    expect(screen.queryByText(/E-15/)).not.toBeInTheDocument();
    expect(screen.getByText(/Słup jest węzłem trasy/)).toBeInTheDocument();
    expect(screen.getByTestId('branch-pole-surface')).not.toHaveTextContent('BRANCH');

    fireEvent.click(screen.getByTestId('branch-pole-action-start-branch'));

    expect(openOperationFormMock).toHaveBeenCalledWith(
      'start_branch_segment_sn',
      expect.objectContaining({
        from_ref: 'bp-1.BRANCH',
        element_ref: 'bp-1',
        source_bus_ref: 'bus-bp-branch',
        source_type_label: 'Słup rozgałęźny',
        source_port_label: 'port boczny odgałęzienia',
        segment: expect.objectContaining({
          rodzaj: 'line_overhead',
          catalog_binding: expect.objectContaining({
            catalog_namespace: 'LINIA_SN',
            catalog_item_id: 'line-base-al-150',
          }),
        }),
      }),
    );
  });

  it('BranchPoleSurface nie oferuje ponownego wyprowadzenia, gdy port słupa jest zajęty', () => {
    const snapshot = buildSnapshot(false);
    snapshot.branches.push({
      id: 'seg-branch-line',
      ref_id: 'seg-branch-line',
      type: 'line_overhead',
      catalog_ref: 'line-base-al-150',
      length_m: 1000,
    } as never);
    snapshot.buses.push({
      id: 'bus-bp-branch',
      ref_id: 'bus-bp-branch',
      name: 'Port odgałęzienia słupa',
      tags: ['helper_bus', 'branch_port'],
      meta: {},
      voltage_kv: 15,
      phase_system: '3ph',
    });
    snapshot.branch_points = [
      {
        id: 'bp-1',
        ref_id: 'bp-1',
        name: 'Słup rozgałęźny SN',
        tags: [],
        meta: {},
        branch_point_type: 'branch_pole',
        parent_segment_id: 'seg-original-deleted',
        bus_ref: 'bus-end',
        catalog_ref: 'branch-pole-afl',
        catalog_namespace: 'mv_branch_points',
        ports: {
          MAIN_IN: 'bus-a',
          MAIN_OUT: 'bus-end',
          BRANCH: ['bus-bp-branch'],
        },
        branch_occupied: { BRANCH: 'seg-branch-line' },
        switch_state: 'closed',
        runtime_inputs: {
          operation_semantics: 'insert_point_in_run',
          main_segment_refs: ['seg-1_L_branch_pole'],
        },
      },
    ];
    useSnapshotStore.getState().setSnapshot({ snapshot } as never);

    render(<BranchPoleSurface surface={{ ...minimalSurface, entityRef: 'bp-1', titlePl: 'Słup rozgałęźny SN' } as never} />);

    expect(screen.getByText('Odgałęzienie wyprowadzone')).toBeInTheDocument();
    expect(screen.getByText(/Port odgałęźny jest zajęty/)).toBeInTheDocument();
    expect(screen.queryByTestId('branch-pole-action-start-branch')).not.toBeInTheDocument();
    expect(screen.getByTestId('branch-pole-surface')).not.toHaveTextContent('seg-branch-line');
  });

  it('BranchSurface (E-16) renderuje pola informacyjne odgałęzienia', () => {
    render(<BranchSurface surface={minimalSurface} />);
    expect(screen.getByTestId('branch-surface')).toBeInTheDocument();
    expect(screen.getByText(/Odgałęzienie podporządkowane/)).toBeInTheDocument();
    expect(screen.getByText('Liczba stacji')).toBeInTheDocument();
    expect(screen.getByText('Długość całkowita')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('NopSurface (E-17) renderuje konfigurator NOP z 3 checkboxami', () => {
    render(<NopSurface surface={minimalSurface} />);
    expect(screen.getByTestId('nop-surface')).toBeInTheDocument();
    expect(screen.getByText(/Punkt normalnie otwarty/)).toBeInTheDocument();
    expect(screen.getByText(/Stan normalny: otwarty/)).toBeInTheDocument();
    expect(screen.getByText(/Możliwość przełączania pod obciążeniem/)).toBeInTheDocument();
    expect(screen.getByText(/Sterowanie zdalne \(SCADA\)/)).toBeInTheDocument();
  });
});
