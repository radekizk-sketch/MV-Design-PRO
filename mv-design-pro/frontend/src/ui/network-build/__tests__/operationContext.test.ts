import { describe, expect, it } from 'vitest';

import { buildOperationContext } from '../operationContext';
import {
  resolveNopCandidates,
  resolveBranchSourceContextFromOperation,
  resolveElementNetworkContext,
} from '../operationContextResolvers';

const snapshot = {
  substations: [
    {
      id: 'st-1',
      ref_id: 'st-1',
      name: 'ST-1',
      station_type: 'mv_lv',
      bus_refs: ['bus-sn-1', 'bus-nn-1'],
      transformer_refs: [],
    },
    {
      id: 'gpz-1',
      ref_id: 'gpz-1',
      name: 'GPZ-1',
      station_type: 'gpz',
      bus_refs: ['bus-gpz-1'],
      transformer_refs: [],
    },
  ],
  bays: [
    {
      id: 'bay-out-1',
      ref_id: 'bay-out-1',
      substation_ref: 'st-1',
      bus_ref: 'bus-sn-1',
      bay_role: 'OUT',
      equipment_refs: [],
      meta: {
        terminal_bus_ref: 'bus-st-field-out',
      },
    },
    {
      id: 'bay-feeder-1',
      ref_id: 'bay-feeder-1',
      substation_ref: 'st-1',
      bus_ref: 'bus-sn-1',
      bay_role: 'FEEDER',
      equipment_refs: [],
    },
  ],
  buses: [
    { id: 'bus-sn-1', ref_id: 'bus-sn-1', name: 'Szyna SN 1', voltage_kv: 15 },
    { id: 'bus-nn-1', ref_id: 'bus-nn-1', name: 'Szyna nN 1', voltage_kv: 0.4 },
    { id: 'bus-zksn-main', ref_id: 'bus-zksn-main', name: 'ZKSN MAIN', voltage_kv: 15 },
    { id: 'bus-zksn-branch-1', ref_id: 'bus-zksn-branch-1', name: 'ZKSN BRANCH 1', voltage_kv: 15 },
    { id: 'bus-zksn-branch-2', ref_id: 'bus-zksn-branch-2', name: 'ZKSN BRANCH 2', voltage_kv: 15 },
    { id: 'bus-ring-a', ref_id: 'bus-ring-a', name: 'Ring A', voltage_kv: 15 },
    { id: 'bus-ring-b', ref_id: 'bus-ring-b', name: 'Ring B', voltage_kv: 15 },
    { id: 'bus-gpz-1', ref_id: 'bus-gpz-1', name: 'Szyna GPZ 1', voltage_kv: 15 },
    { id: 'bus-st-field-out', ref_id: 'bus-st-field-out', name: 'Zacisk pola OUT ST-1', voltage_kv: 15 },
    { id: 'bus-trunk-start', ref_id: 'bus-trunk-start', name: 'Zacisk pola GPZ', voltage_kv: 15 },
    { id: 'bus-trunk-mid', ref_id: 'bus-trunk-mid', name: 'Węzeł pośredni ciągu', voltage_kv: 15 },
    { id: 'bus-trunk-end', ref_id: 'bus-trunk-end', name: 'Koniec ciągu M1', voltage_kv: 15 },
  ],
  sources: [
    { id: 'source-gpz-1', ref_id: 'source-gpz-1', name: 'GPZ 1', bus_ref: 'bus-sn-1' },
    { id: 'source-system-1', ref_id: 'source-system-1', name: 'Source System 1', bus_ref: 'bus-gpz-1' },
  ],
  generators: [
    {
      id: 'pv-1',
      ref_id: 'pv-1',
      name: 'PV-1',
      bus_ref: 'bus-nn-1',
      station_ref: 'st-1',
    },
  ],
  loads: [
    {
      id: 'load-1',
      ref_id: 'load-1',
      name: 'Obciazenie 1',
      bus_ref: 'bus-nn-1',
      p_mw: 0.12,
      q_mvar: 0.04,
      model: 'pq',
      meta: {
        feeder_ref: 'feeder-1',
      },
    },
  ],
  transformers: [],
  branches: [
    { ref_id: 'sw-a', name: 'Lacznik A', type: 'switch' },
    { ref_id: 'sw-b', name: 'Lacznik B', type: 'disconnector' },
    { ref_id: 'line-1', name: 'Linia 1', type: 'cable' },
    {
      ref_id: 'seg-1',
      name: 'Odcinek 1',
      type: 'cable',
      from_bus_ref: 'bus-trunk-start',
      to_bus_ref: 'bus-trunk-mid',
    },
    {
      ref_id: 'seg-2',
      name: 'Odcinek 2',
      type: 'cable',
      from_bus_ref: 'bus-trunk-mid',
      to_bus_ref: 'bus-trunk-end',
    },
  ],
  branch_points: [
    {
      id: 'zksn-1',
      ref_id: 'zksn-1',
      branch_point_type: 'zksn',
      bus_ref: 'bus-zksn-main',
      ports: {
        MAIN_IN: 'bus-zksn-main',
        MAIN_OUT: 'bus-zksn-main',
        BRANCH: ['bus-zksn-branch-1', 'bus-zksn-branch-2'],
      },
      branch_occupied: {
        BRANCH_1: true,
        BRANCH_2: false,
      },
    },
  ],
  corridors: [
    {
      id: 'trunk-1',
      ref_id: 'trunk-1',
      ordered_segment_refs: ['seg-1', 'seg-2'],
    },
  ],
} as any;

const logicalViews = {
  terminals: [
    {
      element_id: 'bay-out-1',
      port_id: 'bay-out-1:OUT',
      trunk_id: 'trunk-1',
      status: 'OTWARTY',
    },
    {
      element_id: 'bus-ring-a',
      port_id: 'ring-a-port',
      trunk_id: 'trunk-a',
      status: 'OTWARTY',
    },
    {
      element_id: 'bus-ring-b',
      port_id: 'ring-b-port',
      trunk_id: 'trunk-b',
      status: 'ZAREZERWOWANY_DLA_RINGU',
    },
  ],
} as any;

describe('buildOperationContext', () => {
  it('kanoniczny resolver elementu scala station, bus nn i feeder bez lokalnych fallbackow w adapterze', () => {
    const generatorContext = resolveElementNetworkContext(snapshot, 'pv-1', 'PVInverter');
    expect(generatorContext.stationRef).toBe('st-1');
    expect(generatorContext.busRef).toBe('bus-nn-1');
    expect(generatorContext.busNnRef).toBe('bus-nn-1');

    const loadContext = resolveElementNetworkContext(snapshot, 'load-1', 'LoadNN');
    expect(loadContext.stationRef).toBe('st-1');
    expect(loadContext.busRef).toBe('bus-nn-1');
    expect(loadContext.busNnRef).toBe('bus-nn-1');
    expect(loadContext.feederRef).toBe('feeder-1');
  });

  it('zachowuje aliasy trunk i terminal dla kontynuacji magistrali z pola SN', () => {
    const context = buildOperationContext({
      canonicalOp: 'continue_trunk_segment_sn',
      elementId: 'bay-out-1',
      elementType: 'BaySN',
      snapshot,
      logicalViews,
    });

    expect(context.station_ref).toBe('st-1');
    expect(context.trunk_id).toBe('trunk-1');
    expect(context.trunkId).toBe('trunk-1');
    expect(context.from_terminal_id).toBe('bay-out-1');
    expect(context.terminal_id).toBe('bay-out-1');
    expect(context.terminalId).toBe('bay-out-1');
    expect(context.terminal_port_id).toBe('bay-out-1:OUT');
    expect(context.port_id).toBe('bay-out-1:OUT');
    expect(context.from_bus_ref).toBe('bus-st-field-out');
    expect(context.terminal_name).toBe('Zacisk pola OUT ST-1');
    expect(context.terminal_voltage_label).toBe('15 kV');
    expect(context.is_first_trunk_segment).toBe(false);
    expect(context.existing_segment_count).toBe(2);
  });

  it('kontynuuje ciąg ze stacji przez dostępny terminal pola SN tej stacji', () => {
    const context = buildOperationContext({
      canonicalOp: 'continue_trunk_segment_sn',
      elementId: 'st-1',
      elementType: 'Station',
      snapshot,
      logicalViews,
    });

    expect(context.station_ref).toBe('st-1');
    expect(context.trunk_id).toBe('trunk-1');
    expect(context.trunkId).toBe('trunk-1');
    expect(context.from_terminal_id).toBe('bay-out-1');
    expect(context.terminal_id).toBe('bay-out-1');
    expect(context.terminalId).toBe('bay-out-1');
    expect(context.terminal_port_id).toBe('station_out');
    expect(context.port_id).toBe('station_out');
    expect(context.from_bus_ref).toBe('bus-st-field-out');
    expect(context.terminal_name).toBe('ST-1 - port wyjściowy SN');
    expect(context.terminal_voltage_label).toBe('15 kV');
    expect(context.is_first_trunk_segment).toBe(false);
    expect(context.existing_segment_count).toBe(2);
  });

  it('kontynuuje ciąg ze stacji przez techniczny koniec korytarza, gdy terminal logiczny nie istnieje', () => {
    const stationCorridorSnapshot = {
      ...snapshot,
      buses: [
        ...snapshot.buses,
        { id: 'bus-st-open', ref_id: 'bus-st-open', name: 'Koniec za ST-1', voltage_kv: 15 },
      ],
      branches: [
        ...snapshot.branches,
        {
          ref_id: 'seg-st-out',
          name: 'Odcinek za ST-1',
          type: 'cable',
          from_bus_ref: 'bus-sn-1',
          to_bus_ref: 'bus-st-open',
        },
      ],
      corridors: [
        {
          id: 'corr-st',
          ref_id: 'corr-st',
          ordered_segment_refs: ['seg-st-out'],
        },
      ],
    } as any;

    const context = buildOperationContext({
      canonicalOp: 'continue_trunk_segment_sn',
      elementId: 'st-1',
      elementType: 'Station',
      snapshot: stationCorridorSnapshot,
      logicalViews: { terminals: [] } as any,
    });

    expect(context.station_ref).toBe('st-1');
    expect(context.trunk_id).toBe('corr-st');
    expect(context.trunkId).toBe('corr-st');
    expect(context.from_terminal_id).toBe('bay-out-1');
    expect(context.terminal_id).toBe('bay-out-1');
    expect(context.terminalId).toBe('bay-out-1');
    expect(context.terminal_port_id).toBe('station_out');
    expect(context.port_id).toBe('station_out');
    expect(context.from_bus_ref).toBe('bus-st-field-out');
    expect(context.terminal_name).toBe('ST-1 - port wyjściowy SN');
    expect(context.terminal_voltage_label).toBe('15 kV');
    expect(context.is_first_trunk_segment).toBe(false);
    expect(context.existing_segment_count).toBe(1);
  });

  it('nie kontynuuje ciagu ze stacji przez szyne, gdy pole wyjsciowe jest zajete', () => {
    const occupiedOutFieldSnapshot = {
      ...snapshot,
      branches: [
        ...snapshot.branches,
        {
          ref_id: 'seg-from-station-out',
          name: 'Odcinek za ST-1',
          type: 'cable',
          from_bus_ref: 'bus-st-field-out',
          to_bus_ref: 'bus-trunk-end',
        },
      ],
    } as any;

    const context = buildOperationContext({
      canonicalOp: 'continue_trunk_segment_sn',
      elementId: 'st-1',
      elementType: 'Station',
      snapshot: occupiedOutFieldSnapshot,
      logicalViews,
    });

    expect(context.station_ref).toBe('st-1');
    expect(context.from_terminal_id).toBeUndefined();
    expect(context.terminal_id).toBeUndefined();
    expect(context.terminalId).toBeUndefined();
    expect(context.field_ref).toBeUndefined();
    expect(context.from_bus_ref).toBeUndefined();
    expect(context.terminal_name).toBe('ST-1 - port wyjściowy SN');
  });

  it('blokuje kontynuacje z szyny, gdy terminal pola nie jest jednoznaczny w logicalViews', () => {
    const context = buildOperationContext({
      canonicalOp: 'continue_trunk_segment_sn',
      elementId: 'bus-sn-1',
      elementType: 'Bus',
      snapshot,
      logicalViews: {
        terminals: [
          {
            element_id: 'bay-out-1',
            port_id: 'bay-out-1:OUT',
            trunk_id: 'trunk-out',
            status: 'DOSTEPNY',
          },
          {
            element_id: 'bay-feeder-1',
            port_id: 'bay-feeder-1:FEEDER',
            trunk_id: 'trunk-feeder',
            status: 'DOSTEPNY',
          },
        ],
      } as any,
    });

    expect(context.station_ref).toBe('st-1');
    expect(context.from_bus_ref).toBe('bus-sn-1');
    expect(context.trunk_id).toBeUndefined();
    expect(context.trunkId).toBeUndefined();
    expect(context.from_terminal_id).toBeUndefined();
    expect(context.terminal_id).toBeUndefined();
    expect(context.terminalId).toBeUndefined();
    expect(context.port_id).toBeUndefined();
    expect(context.terminal_name).toBe('Szyna SN 1');
    expect(context.is_first_trunk_segment).toBe(true);
  });

  it('nie wyprowadza magistrali bezposrednio z obiektu zrodla SN', () => {
    const context = buildOperationContext({
      canonicalOp: 'continue_trunk_segment_sn',
      elementId: 'source-gpz-1',
      elementType: 'Source',
      snapshot,
      logicalViews,
    });

    expect(context.station_ref).toBe('st-1');
    expect(context.trunk_id).toBeUndefined();
    expect(context.trunkId).toBeUndefined();
    expect(context.from_terminal_id).toBeUndefined();
    expect(context.terminal_id).toBeUndefined();
    expect(context.terminalId).toBeUndefined();
    expect(context.port_id).toBeUndefined();
    expect(context.from_bus_ref).toBe('bus-sn-1');
    expect(context.terminal_name).toBe('Szyna SN 1');
    expect(context.terminal_voltage_label).toBe('15 kV');
    expect(context.is_first_trunk_segment).toBe(true);
  });

  it('kontynuuje ciąg z końca istniejącego odcinka zamiast blokować formularz bez pola SN', () => {
    const context = buildOperationContext({
      canonicalOp: 'continue_trunk_segment_sn',
      elementId: 'trunk-1',
      elementType: 'LineBranch',
      snapshot,
      logicalViews,
    });

    expect(context.trunk_id).toBe('trunk-1');
    expect(context.trunkId).toBe('trunk-1');
    expect(context.from_terminal_id).toBe('bus-trunk-end');
    expect(context.terminal_id).toBe('bus-trunk-end');
    expect(context.terminalId).toBe('bus-trunk-end');
    expect(context.terminal_port_id).toBe('trunk_end');
    expect(context.from_bus_ref).toBe('bus-trunk-end');
    expect(context.terminal_name).toBe('Koniec ciągu M1');
    expect(context.terminal_voltage_label).toBe('15 kV');
    expect(context.is_first_trunk_segment).toBe(false);
    expect(context.existing_segment_count).toBe(2);
  });

  it('dla pierwszego odcinka z obiektu zrodla nie tworzy sztucznego terminala ani trunk_id', () => {
    const context = buildOperationContext({
      canonicalOp: 'continue_trunk_segment_sn',
      elementId: 'source-gpz-1',
      elementType: 'Source',
      snapshot,
      logicalViews: { terminals: [] } as any,
    });

    expect(context.trunk_id).toBeUndefined();
    expect(context.trunkId).toBeUndefined();
    expect(context.from_terminal_id).toBeUndefined();
    expect(context.terminal_id).toBeUndefined();
    expect(context.terminalId).toBeUndefined();
    expect(context.from_bus_ref).toBe('bus-sn-1');
    expect(context.terminal_name).toBe('Szyna SN 1');
    expect(context.terminal_voltage_label).toBe('15 kV');
    expect(context.is_first_trunk_segment).toBe(true);
  });

  it('buduje from_ref dla odgałęzienia ze stacji przez konkretne pole liniowe', () => {
    const context = buildOperationContext({
      canonicalOp: 'start_branch_segment_sn',
      elementId: 'st-1',
      elementType: 'Station',
      snapshot,
      logicalViews,
    });

    expect(context.station_ref).toBe('st-1');
    expect(context.from_ref).toBe('bay-feeder-1.BRANCH');
    expect(context.source_type_label).toBe('Pole liniowe SN');
    expect(context.source_name).toBe('ST-1');
    expect(context.source_bus_ref).toBe('bus-sn-1');
    expect(context.from_bus_ref).toBe('bus-sn-1');
    expect(context.source_port_label).toBe('BRANCH');
  });

  it('buduje from_ref dla odgałęzienia ze stacji przez pole SN zapisane w meta.field_specs', () => {
    const stationFieldSnapshot = {
      ...snapshot,
      bays: [],
      substations: [
        {
          id: 'st-field-1',
          ref_id: 'st-field-1',
          name: 'ST-FIELD-1',
          station_type: 'mv_lv',
          bus_refs: ['bus-sn-1', 'bus-nn-1'],
          transformer_refs: [],
          meta: {
            field_specs: [
              {
                field_ref: 'field-in-1',
                bay_role: 'IN',
                bus_ref: 'bus-sn-1',
                meta: { terminal_bus_ref: 'bus-field-in-terminal' },
              },
              {
                field_ref: 'field-branch-1',
                bay_role: 'FEEDER',
                bus_ref: 'bus-sn-1',
                meta: { terminal_bus_ref: 'bus-field-branch-terminal' },
              },
            ],
          },
        },
      ],
      buses: [
        ...snapshot.buses,
        { id: 'bus-field-in-terminal', ref_id: 'bus-field-in-terminal', name: 'Zacisk IN', voltage_kv: 15 },
        {
          id: 'bus-field-branch-terminal',
          ref_id: 'bus-field-branch-terminal',
          name: 'Zacisk pola odgałęźnego',
          voltage_kv: 15,
        },
      ],
    } as any;

    const context = buildOperationContext({
      canonicalOp: 'start_branch_segment_sn',
      elementId: 'st-field-1',
      elementType: 'Station',
      snapshot: stationFieldSnapshot,
      logicalViews,
    });

    expect(context.station_ref).toBe('st-field-1');
    expect(context.from_ref).toBe('field-branch-1.BRANCH');
    expect(context.source_type_label).toBe('Pole liniowe SN');
    expect(context.source_name).toBe('ST-FIELD-1');
    expect(context.source_bus_ref).toBe('bus-field-branch-terminal');
    expect(context.from_bus_ref).toBe('bus-field-branch-terminal');
  });

  it('nie traktuje pola OUT jako pola odgałęźnego stacji', () => {
    const stationOutOnlySnapshot = {
      ...snapshot,
      bays: [],
      substations: [
        {
          id: 'st-out-only',
          ref_id: 'st-out-only',
          name: 'ST-OUT-ONLY',
          station_type: 'mv_lv',
          bus_refs: ['bus-station-main'],
          transformer_refs: [],
          meta: {
            field_specs: [
              {
                field_ref: 'field-in-real-terminal',
                bay_role: 'IN',
                bus_ref: 'bus-station-main',
                meta: {
                  field_terminal_bus_ref: 'bus-field-in-terminal',
                },
              },
              {
                field_ref: 'field-out-real-terminal',
                bay_role: 'OUT',
                bus_ref: 'bus-station-main',
                meta: {
                  field_terminal_bus_ref: 'bus-field-out-terminal',
                },
              },
            ],
          },
        },
      ],
      buses: [
        ...snapshot.buses,
        { id: 'bus-station-main', ref_id: 'bus-station-main', name: 'Szyna SN stacji', voltage_kv: 15 },
        { id: 'bus-field-in-terminal', ref_id: 'bus-field-in-terminal', name: 'Zacisk pola IN', voltage_kv: 15 },
        { id: 'bus-field-out-terminal', ref_id: 'bus-field-out-terminal', name: 'Zacisk pola OUT', voltage_kv: 15 },
      ],
    } as any;

    const context = buildOperationContext({
      canonicalOp: 'start_branch_segment_sn',
      elementId: 'st-out-only',
      elementType: 'Station',
      snapshot: stationOutOnlySnapshot,
      logicalViews,
    });

    expect(context.station_ref).toBe('st-out-only');
    expect(context.from_ref).toBeUndefined();
    expect(context.from_bus_ref).toBeUndefined();
  });

  it('nie pozwala rozpocząć odgałęzienia z zajętego pola ODG stacji', () => {
    const occupiedBranchFieldSnapshot = {
      ...snapshot,
      bays: [],
      substations: [
        {
          id: 'st-branch-used',
          ref_id: 'st-branch-used',
          name: 'ST-BRANCH-USED',
          station_type: 'mv_lv',
          bus_refs: ['bus-station-main'],
          transformer_refs: [],
          meta: {
            field_specs: [
              {
                field_ref: 'field-branch-used',
                bay_role: 'FEEDER',
                bus_ref: 'bus-station-main',
                meta: {
                  field_terminal_bus_ref: 'bus-field-branch-used-terminal',
                },
              },
            ],
          },
        },
      ],
      buses: [
        ...snapshot.buses,
        { id: 'bus-station-main', ref_id: 'bus-station-main', name: 'Szyna SN stacji', voltage_kv: 15 },
        {
          id: 'bus-field-branch-used-terminal',
          ref_id: 'bus-field-branch-used-terminal',
          name: 'Zacisk pola ODG',
          voltage_kv: 15,
        },
        { id: 'bus-branch-end', ref_id: 'bus-branch-end', name: 'Koniec odgałęzienia', voltage_kv: 15 },
      ],
      branches: [
        ...snapshot.branches,
        {
          ref_id: 'seg-used-branch',
          name: 'Odcinek odgałęzienia',
          type: 'cable',
          from_bus_ref: 'bus-field-branch-used-terminal',
          to_bus_ref: 'bus-branch-end',
        },
      ],
    } as any;

    const stationContext = buildOperationContext({
      canonicalOp: 'start_branch_segment_sn',
      elementId: 'st-branch-used',
      elementType: 'Station',
      snapshot: occupiedBranchFieldSnapshot,
      logicalViews,
    });
    const fieldContext = buildOperationContext({
      canonicalOp: 'start_branch_segment_sn',
      elementId: 'field-branch-used',
      elementType: 'BaySN',
      snapshot: occupiedBranchFieldSnapshot,
      logicalViews,
    });

    expect(stationContext.from_ref).toBeUndefined();
    expect(stationContext.from_bus_ref).toBeUndefined();
    expect(fieldContext.from_ref).toBeUndefined();
    expect(fieldContext.from_bus_ref).toBeUndefined();
  });

  it('kontynuuje ciag z zacisku pola OUT, nie z szyny rozdzielnicy stacji', () => {
    const stationFieldSnapshot = {
      ...snapshot,
      bays: [],
      substations: [
        {
          id: 'st-field-out',
          ref_id: 'st-field-out',
          name: 'ST-FIELD-OUT',
          station_type: 'mv_lv',
          bus_refs: ['bus-station-main'],
          transformer_refs: [],
          meta: {
            field_specs: [
              {
                field_ref: 'field-out-real-terminal',
                bay_role: 'OUT',
                bus_ref: 'bus-station-main',
                meta: {
                  terminal_bus_ref: 'bus-station-main',
                  field_terminal_bus_ref: 'bus-field-out-terminal',
                },
              },
            ],
          },
        },
      ],
      buses: [
        ...snapshot.buses,
        { id: 'bus-station-main', ref_id: 'bus-station-main', name: 'Szyna SN stacji', voltage_kv: 15 },
        {
          id: 'bus-field-out-terminal',
          ref_id: 'bus-field-out-terminal',
          name: 'Zacisk pola wyjsciowego',
          voltage_kv: 15,
        },
      ],
      branches: [
        ...snapshot.branches,
        {
          ref_id: 'seg-station-incoming',
          name: 'Odcinek do stacji',
          type: 'cable',
          from_bus_ref: 'bus-trunk-end',
          to_bus_ref: 'bus-station-main',
        },
      ],
    } as any;

    const context = buildOperationContext({
      canonicalOp: 'continue_trunk_segment_sn',
      elementId: 'st-field-out',
      elementType: 'Station',
      snapshot: stationFieldSnapshot,
      logicalViews: {
        terminals: [
          {
            element_id: 'field-out-real-terminal',
            port_id: 'field-out-real-terminal:OUT',
            trunk_id: 'trunk-field-out',
            status: 'OTWARTY',
          },
        ],
      } as any,
    });

    expect(context.station_ref).toBe('st-field-out');
    expect(context.from_terminal_id).toBe('field-out-real-terminal');
    expect(context.from_bus_ref).toBe('bus-field-out-terminal');
    expect(context.field_ref).toBe('field-out-real-terminal');
    expect(context.trunk_id).toBe('trunk-field-out');
  });

  it('kontynuuje ciag z kanonicznego zacisku pola w pakiecie sn_field_template', () => {
    const stationFieldSnapshot = {
      ...snapshot,
      substations: [
        {
          id: 'st-template-out',
          ref_id: 'st-template-out',
          name: 'ST-TEMPLATE-OUT',
          station_type: 'mv_lv',
          bus_refs: ['bus-station-main'],
          transformer_refs: [],
          meta: {},
        },
      ],
      bays: [
        {
          id: 'bay-template-out',
          ref_id: 'bay-template-out',
          name: 'Pole OUT',
          substation_ref: 'st-template-out',
          bay_role: 'OUT',
          bus_ref: 'bus-station-main',
          meta: {
            sn_field_template: {
              field_ref: 'field-template-out',
              bay_role: 'OUT',
              meta: {
                terminal_bus_ref: 'bus-station-main',
                field_terminal_bus_ref: 'bus-template-field-terminal',
              },
            },
          },
        },
      ],
      buses: [
        ...snapshot.buses,
        { id: 'bus-station-main', ref_id: 'bus-station-main', name: 'Szyna SN stacji', voltage_kv: 15 },
        {
          id: 'bus-template-field-terminal',
          ref_id: 'bus-template-field-terminal',
          name: 'Zacisk pola wyjsciowego',
          voltage_kv: 15,
        },
      ],
      branches: [
        ...snapshot.branches,
        {
          ref_id: 'seg-template-incoming',
          name: 'Odcinek do stacji',
          type: 'cable',
          from_bus_ref: 'bus-trunk-end',
          to_bus_ref: 'bus-station-main',
        },
      ],
    } as any;

    const context = buildOperationContext({
      canonicalOp: 'continue_trunk_segment_sn',
      elementId: 'st-template-out',
      elementType: 'Station',
      snapshot: stationFieldSnapshot,
      logicalViews: {
        terminals: [
          {
            element_id: 'field-template-out',
            port_id: 'field-template-out:OUT',
            trunk_id: 'trunk-template-out',
            status: 'OTWARTY',
          },
        ],
      } as any,
    });

    expect(context.station_ref).toBe('st-template-out');
    expect(context.from_terminal_id).toBe('field-template-out');
    expect(context.from_bus_ref).toBe('bus-template-field-terminal');
    expect(context.field_ref).toBe('field-template-out');
    expect(context.trunk_id).toBe('trunk-template-out');
  });

  it('nie tworzy odgałęzienia z pola transformatorowego', () => {
    const transformerOnlySnapshot = {
      ...snapshot,
      bays: [
        {
          id: 'bay-tr-only',
          ref_id: 'bay-tr-only',
          substation_ref: 'st-1',
          bus_ref: 'bus-sn-1',
          bay_role: 'TR',
          equipment_refs: [],
        },
      ],
    } as any;

    const context = buildOperationContext({
      canonicalOp: 'start_branch_segment_sn',
      elementId: 'bay-tr-only',
      elementType: 'BaySN',
      snapshot: transformerOnlySnapshot,
      logicalViews,
    });

    expect(context.station_ref).toBe('st-1');
    expect(context.from_ref).toBeUndefined();
  });

  it('formularz odgalezienia czyta wyłącznie kanoniczny from_ref i nie odtwarza go z pobocznych aliasów', () => {
    const displayContext = resolveBranchSourceContextFromOperation(snapshot, {
      element_ref: 'st-1',
      station_ref: 'st-1',
      from_bus_ref: 'bus-sn-1',
      source_name: 'ST-1',
    });

    expect(displayContext.fromRef).toBe('');
    expect(displayContext.sourceName).toBe('ST-1');
    expect(displayContext.sourceType).toBe('Nie ustalono');
  });

  it('wybiera wolny port BRANCH dla ZKSN i zachowuje from_bus_ref', () => {
    const context = buildOperationContext({
      canonicalOp: 'start_branch_segment_sn',
      elementId: 'bus-zksn-main',
      elementType: 'Bus',
      snapshot,
      logicalViews,
    });

    expect(context.from_ref).toBe('zksn-1.BRANCH_2');
    expect(context.from_bus_ref).toBe('bus-zksn-branch-2');
    expect(context.source_type_label).toBe('ZKSN');
    expect(context.source_bus_ref).toBe('bus-zksn-branch-2');
    expect(context.source_port_label).toBe('BRANCH_2');
  });

  it('buduje pare pierscienia z biezacego terminala i partnera', () => {
    const context = buildOperationContext({
      canonicalOp: 'connect_secondary_ring_sn',
      elementId: 'bus-ring-a',
      elementType: 'Bus',
      snapshot,
      logicalViews,
    });

    expect(context.terminalA_id).toBe('bus-ring-a');
    expect(context.terminalB_id).toBe('bus-ring-b');
    expect(Array.isArray(context.nop_candidates)).toBe(true);
  });

  it('nie buduje kandydatow NOP z lokalnego branch.type bez widoku logicznego', () => {
    expect(resolveNopCandidates(snapshot, null)).toEqual([]);
  });

  it('buduje kandydatow NOP z logicalViews.no_point_ref, a nie z typu galezi', () => {
    const candidates = resolveNopCandidates(snapshot, {
      ...logicalViews,
      trunks: [
        {
          corridor_ref: 'trunk-1',
          corridor_type: 'main',
          segments: [],
          no_point_ref: 'sw-a',
          terminals: [],
        },
      ],
    } as any);

    expect(candidates).toEqual([
      {
        id: 'sw-a',
        label: 'Lacznik A',
        elementType: 'NORMAL_OPEN_POINT',
      },
    ]);
  });

  it('adapter add_converter_source dziedziczy kontekst nn z resolvera kanonicznego', () => {
    const context = buildOperationContext({
      canonicalOp: 'add_converter_source',
      elementId: 'pv-1',
      elementType: 'PVInverter',
      snapshot,
      logicalViews,
      extraContext: {
        source_technology: 'PV',
      },
    });

    expect(context.station_ref).toBe('st-1');
    expect(context.bus_nn_ref).toBe('bus-nn-1');
    expect(context.source_field_kind).toBe('PV');
  });

  it('dodaje kontekst szyn SN i nN dla transformatora wywolanego ze stacji', () => {
    const context = buildOperationContext({
      canonicalOp: 'add_transformer_sn_nn',
      elementId: 'st-1',
      elementType: 'Station',
      snapshot,
      logicalViews,
    });

    expect(context.station_ref).toBe('st-1');
    expect(context.hv_bus_ref).toBe('bus-sn-1');
    expect(context.lv_bus_ref).toBe('bus-nn-1');
    expect(context.transformer_context_valid).toBe(true);
    expect(context.transformer_block_reason).toBeNull();
  });

  it('blokuje dodanie transformatora z kontekstu GPZ lub zrodla systemowego', () => {
    const context = buildOperationContext({
      canonicalOp: 'add_transformer_sn_nn',
      elementId: 'source-system-1',
      elementType: 'Source',
      snapshot,
      logicalViews,
    });

    expect(context.station_ref).toBe('gpz-1');
    expect(context.hv_bus_ref).toBeUndefined();
    expect(context.lv_bus_ref).toBeUndefined();
    expect(context.transformer_context_valid).toBe(false);
    expect(context.transformer_block_reason).toBe('Transformator SN/nN nie nalezy do ukladu GPZ lub zrodla systemowego.');
  });
});
