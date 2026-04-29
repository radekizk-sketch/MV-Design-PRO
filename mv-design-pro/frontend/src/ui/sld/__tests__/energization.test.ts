import { describe, expect, it } from 'vitest';

import { calculateEnergization } from '../energization';
import type { AnySldSymbol } from '../../sld-editor/types';
import type {
  EngineeringConnection,
  EngineeringElement,
  EngineeringSemanticModel,
  EngineeringElementKind,
  EngineeringRole,
  PortRole,
} from '../../engineering-semantic';

function element(
  refId: string,
  elementKind: EngineeringElementKind,
  engineeringRole: EngineeringRole,
  portRole: PortRole,
): EngineeringElement {
  return {
    refId,
    elementKind,
    engineeringRole,
    functionalRole: 'NOT_APPLICABLE',
    networkPosition: {
      projectRefId: 'project-1',
      parentRefId: null,
      containerRefId: null,
      voltageLevelRefId: null,
      switchgearRefId: null,
      busbarSectionRefId: null,
      bayRefId: null,
      feederRefId: null,
      branchRefId: null,
      stationRefId: null,
      orderIndex: null,
    },
    voltageDomain: 'SN',
    completeness: 'MODEL_TECHNICZNY_PELNY',
    reportEligibility: {} as EngineeringElement['reportEligibility'],
    dataQualityState: 'PELNA',
    ports: [{
      portId: `${refId}:p`,
      ownerRefId: refId,
      role: portRole,
      voltageDomain: 'SN',
      nominalVoltageKv: 15,
      phaseSystem: 'ABC',
      connectionSide: 'NIE_DOTYCZY',
      minConnections: 0,
      maxConnections: 2,
      connectionPolicyRef: `policy:${portRole}`,
      requiredConnectionKinds: ['TOR_MOCY'],
      forbiddenConnectionKinds: [],
    }],
    terminals: [],
  };
}

function connection(
  connectionId: string,
  fromRef: string,
  toRef: string,
  normalState: EngineeringConnection['normalState'] = 'POLACZONE',
  switchingDeviceRefId: string | null = null,
): EngineeringConnection {
  return {
    connectionId,
    fromPortId: `${fromRef}:p`,
    toPortId: `${toRef}:p`,
    orientation: 'BEZKIERUNKOWE',
    connectionKind: 'TOR_MOCY',
    voltageDomain: 'SN',
    normalState,
    switchingDeviceRefId,
    validatedByRuleRefs: [],
  };
}

function model(elements: EngineeringElement[], connections: EngineeringConnection[]): EngineeringSemanticModel {
  return {
    schemaVersion: 'v-test',
    projectRefId: 'project-1',
    modelId: 'model-1',
    enmSnapshotRef: 'enm-1',
    catalogSnapshotRef: 'catalog-1',
    usedCatalogMaterializationHash: 'catalog-hash',
    semanticVersion: '1',
    semanticHash: 'sem-hash-1',
    ontologyVersion: '1',
    ontologyHash: 'ontology-hash',
    roleRegistryHash: 'role-hash',
    connectionRuleRegistryHash: 'connection-rule-hash',
    generatedAt: '2026-04-28T00:00:00.000Z',
    elements,
    connections,
    physicalTopologyGraph: {
      graphId: 'graph-1',
      connectionRefs: connections.map((item) => item.connectionId),
      elementRefs: elements.map((item) => item.refId),
    },
    earthingContexts: [],
  };
}

describe('calculateEnergization semantic projection', () => {
  it('does not classify a source from visual ElementType or source-like names', () => {
    const semanticModel = model(
      [
        element('visual-source', 'BUSBAR_SECTION', 'BUSBAR_SECTION', 'BUSBAR_SN'),
        element('load-1', 'LV_LOAD', 'LV_LOAD_NODE', 'LV_FEEDER_OUT'),
      ],
      [connection('c-1', 'visual-source', 'load-1')],
    );
    const symbols = [{
      id: 'symbol-visual-source',
      elementId: 'visual-source',
      elementType: 'Source',
      elementName: 'utility_feeder grid PV source',
      position: { x: 0, y: 0 },
      inService: true,
      connectedToNodeId: 'load-1',
    }] as AnySldSymbol[];

    const state = calculateEnergization(semanticModel, semanticModel.semanticHash, symbols);

    expect(state.sourceElements).toEqual([]);
    expect(state.energizedElements.get('visual-source')).toBe(false);
    expect(state.energizedElements.get('symbol-visual-source')).toBe(false);
    expect(state.energizedElements.get('load-1')).toBe(false);
  });

  it('uses EngineeringConnection topology instead of local symbol topology', () => {
    const semanticModel = model(
      [
        element('source-1', 'SOURCE', 'GPZ_SUPPLY_NODE', 'SOURCE_AC'),
        element('bay-1', 'MV_BAY', 'LINE_FEEDER_BAY', 'BAY_SN_OUT'),
      ],
      [connection('c-1', 'source-1', 'bay-1')],
    );
    const symbols = [{
      id: 'bay-symbol',
      elementId: 'bay-1',
      elementType: 'Load',
      elementName: 'Bay visual placed far away',
      position: { x: 9000, y: 9000 },
      inService: true,
      connectedToNodeId: 'unconnected-local-node',
    }] as AnySldSymbol[];

    const state = calculateEnergization(semanticModel, semanticModel.semanticHash, symbols);

    expect(state.sourceElements).toEqual(['source-1']);
    expect(state.energizedElements.get('bay-1')).toBe(true);
    expect(state.energizedElements.get('bay-symbol')).toBe(true);
  });

  it('reports deenergized elements blocked by semantic open switching connection', () => {
    const semanticModel = model(
      [
        element('source-1', 'SOURCE', 'GPZ_SUPPLY_NODE', 'SOURCE_AC'),
        element('bay-1', 'MV_BAY', 'LINE_FEEDER_BAY', 'BAY_SN_OUT'),
      ],
      [connection('c-open', 'source-1', 'bay-1', 'ROZLACZONE', 'switch-1')],
    );

    const state = calculateEnergization(semanticModel, semanticModel.semanticHash);

    expect(state.energizedElements.get('source-1')).toBe(true);
    expect(state.energizedElements.get('bay-1')).toBe(false);
    expect(state.deenergizedBySwitch.get('bay-1')).toBe('switch-1');
  });

  it('rejects stale semanticHash', () => {
    const semanticModel = model(
      [element('source-1', 'SOURCE', 'GPZ_SUPPLY_NODE', 'SOURCE_AC')],
      [],
    );

    expect(() => calculateEnergization(semanticModel, 'stale-hash')).toThrow(/semanticHash/);
  });
});
