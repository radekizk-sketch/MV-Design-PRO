import { describe, expect, it } from 'vitest';

import type {
  EngineeringConnection,
  EngineeringElement,
  EngineeringPort,
  EngineeringSemanticModel,
  NetworkPosition,
} from '../types';
import { defaultReportEligibility } from '../types';

const reportEligibility = defaultReportEligibility('RAPORTOWALNY');

function position(overrides: Partial<NetworkPosition> = {}): NetworkPosition {
  return {
    projectRefId: 'project-1',
    parentRefId: null,
    containerRefId: null,
    voltageLevelRefId: 'vl-sn',
    switchgearRefId: 'gpz-switchgear',
    busbarSectionRefId: null,
    bayRefId: null,
    feederRefId: null,
    branchRefId: null,
    stationRefId: null,
    orderIndex: null,
    ...overrides,
  };
}

function port(ownerRefId: string, portId: string, role: EngineeringPort['role']): EngineeringPort {
  return {
    ownerRefId,
    portId,
    role,
    voltageDomain: role === 'BUSBAR_NN' || role === 'TRANSFORMER_NN' ? 'NN' : 'SN',
    nominalVoltageKv: role === 'BUSBAR_NN' || role === 'TRANSFORMER_NN' ? 0.4 : 15,
    phaseSystem: role === 'BUSBAR_NN' || role === 'TRANSFORMER_NN' ? 'ABCN' : 'ABC',
    connectionSide: role === 'BAY_SN_OUT' || role === 'SEGMENT_SN_OUT' ? 'WYJSCIE' : 'WEJSCIE',
    minConnections: 0,
    maxConnections: 1,
    connectionPolicyRef: 'policy:mv-workflow',
    requiredConnectionKinds: ['TOR_MOCY'],
    forbiddenConnectionKinds: ['TOR_LOGICZNY', 'POWIAZANIE_RAPORTOWE'],
  };
}

function element(
  refId: string,
  overrides: Partial<EngineeringElement>,
  ports: EngineeringPort[],
): EngineeringElement {
  return {
    refId,
    elementKind: 'BUSBAR_SECTION',
    engineeringRole: 'BUSBAR_SECTION',
    functionalRole: 'NOT_APPLICABLE',
    networkPosition: position(),
    voltageDomain: 'SN',
    completeness: 'MODEL_TECHNICZNY_PELNY',
    reportEligibility,
    dataQualityState: 'PELNA',
    ports,
    terminals: [],
    ...overrides,
  } as EngineeringElement;
}

function connection(
  connectionId: string,
  fromPortId: string,
  toPortId: string,
  voltageDomain: EngineeringConnection['voltageDomain'] = 'SN',
): EngineeringConnection {
  return {
    connectionId,
    fromPortId,
    toPortId,
    orientation: 'BEZKIERUNKOWE',
    connectionKind: 'TOR_MOCY',
    voltageDomain,
    normalState: 'POLACZONE',
    switchingDeviceRefId: null,
    validatedByRuleRefs: [`rule:${voltageDomain ?? 'none'}-workflow`],
  };
}

describe('engineer workflow GPZ -> bay -> segment -> through station', () => {
  it('keeps MV continuity through outgoing MV bay and keeps LV as transformer branch', () => {
    const elements: EngineeringElement[] = [
      element('gpz-1', {
        elementKind: 'GPZ',
        engineeringRole: 'GPZ_SUPPLY_NODE',
        structure: {
          gpzRefId: 'gpz-1',
          modelKind: 'UPROSZCZONY_PARAMETRY_NA_SZYNIE_SN',
          supplyNodeRefId: 'gpz-1',
          supplyShortCircuitModelRefId: 'sk-gpz-1',
          hvMvTransformers: [],
          mvSwitchgearRefId: 'gpz-switchgear',
          busbarSystemRefId: 'gpz-bus-system',
          busbarSectionRefs: ['gpz-bus-sn'],
          incomingBayRefs: [],
          outgoingBayRefs: ['bay-line-gpz'],
          couplerBayRefs: [],
          measurementBayRefs: [],
          sourceBayRefs: [],
          groundingModelRefId: 'earthing-sn',
        },
      }, [port('gpz-1', 'gpz-1:source', 'SOURCE_AC')]),
      element('gpz-bus-sn', {
        elementKind: 'BUSBAR_SECTION',
        engineeringRole: 'BUSBAR_SECTION',
        networkPosition: position({ busbarSectionRefId: 'gpz-bus-sn' }),
      }, [port('gpz-bus-sn', 'gpz-bus-sn:bus', 'BUSBAR_SN')]),
      element('bay-line-gpz', {
        elementKind: 'MV_BAY',
        engineeringRole: 'LINE_FEEDER_BAY',
        functionalRole: 'FEEDS_MV_TRUNK',
        networkPosition: position({ busbarSectionRefId: 'gpz-bus-sn', bayRefId: 'bay-line-gpz' }),
        bayFunction: 'ODPLYWOWE_LINIOWE',
        connectedBusbarSectionRefId: 'gpz-bus-sn',
        mainSwitchingDeviceRefId: 'cb-line-gpz',
        outgoingPortRefId: 'bay-line-gpz:out',
      }, [
        port('bay-line-gpz', 'bay-line-gpz:in', 'BAY_SN_IN'),
        port('bay-line-gpz', 'bay-line-gpz:out', 'BAY_SN_OUT'),
      ]),
      element('seg-gpz-station-in', {
        elementKind: 'MV_CABLE_SEGMENT',
        engineeringRole: 'MV_CABLE_SEGMENT',
        functionalRole: 'FEEDS_MV_TRUNK',
        networkPosition: position({ feederRefId: 'trunk-1', branchRefId: 'seg-gpz-station-in' }),
      }, [
        port('seg-gpz-station-in', 'seg-gpz-station-in:in', 'SEGMENT_SN_IN'),
        port('seg-gpz-station-in', 'seg-gpz-station-in:out', 'SEGMENT_SN_OUT'),
      ]),
      element('station-through-1', {
        elementKind: 'MV_LV_STATION',
        engineeringRole: 'MV_BRANCH_POINT',
        networkPosition: position({ stationRefId: 'station-through-1' }),
      }, []),
      element('station-bay-in', {
        elementKind: 'MV_BAY',
        engineeringRole: 'LINE_FEEDER_BAY',
        functionalRole: 'FEEDS_MV_TRUNK',
        networkPosition: position({ stationRefId: 'station-through-1', bayRefId: 'station-bay-in' }),
        bayFunction: 'ODPLYWOWE_LINIOWE',
      }, [
        port('station-bay-in', 'station-bay-in:in', 'BAY_SN_IN'),
        port('station-bay-in', 'station-bay-in:out', 'BAY_SN_OUT'),
      ]),
      element('station-bay-out', {
        elementKind: 'MV_BAY',
        engineeringRole: 'LINE_FEEDER_BAY',
        functionalRole: 'FEEDS_MV_TRUNK',
        networkPosition: position({ stationRefId: 'station-through-1', bayRefId: 'station-bay-out' }),
        bayFunction: 'ODPLYWOWE_LINIOWE',
        outgoingPortRefId: 'station-bay-out:out',
      }, [
        port('station-bay-out', 'station-bay-out:in', 'BAY_SN_IN'),
        port('station-bay-out', 'station-bay-out:out', 'BAY_SN_OUT'),
      ]),
      element('station-bay-tr', {
        elementKind: 'MV_BAY',
        engineeringRole: 'TRANSFORMER_BAY',
        functionalRole: 'TRANSFORMS_MV_TO_LV',
        networkPosition: position({ stationRefId: 'station-through-1', bayRefId: 'station-bay-tr' }),
        bayFunction: 'TRANSFORMATOROWE',
        outgoingPortRefId: null,
      }, [
        port('station-bay-tr', 'station-bay-tr:in', 'BAY_SN_IN'),
        port('station-bay-tr', 'station-bay-tr:tr', 'BAY_SN_TRANSFORMER'),
      ]),
      element('tr-sn-nn-1', {
        elementKind: 'TRANSFORMER',
        engineeringRole: 'MV_LV_TRANSFORMER',
        functionalRole: 'TRANSFORMS_MV_TO_LV',
        networkPosition: position({ stationRefId: 'station-through-1' }),
        transformerKind: 'SN_NN',
        highSide: {
          sideId: 'tr-sn-nn-1:high',
          ownerRefId: 'tr-sn-nn-1',
          labelPl: 'Strona SN',
          sideRole: 'STRONA_SN',
          voltageDomain: 'SN',
          nominalVoltageKv: 15,
          phaseSystem: 'ABC',
          portRefs: ['tr-sn-nn-1:sn'],
          terminalRefs: [],
          earthingContextRefId: 'earthing-sn',
        },
        lowSide: {
          sideId: 'tr-sn-nn-1:low',
          ownerRefId: 'tr-sn-nn-1',
          labelPl: 'Strona nN',
          sideRole: 'STRONA_NN',
          voltageDomain: 'NN',
          nominalVoltageKv: 0.4,
          phaseSystem: 'ABCN',
          portRefs: ['tr-sn-nn-1:nn'],
          terminalRefs: [],
          earthingContextRefId: null,
        },
        ratedPower: null,
        voltageRatio: '15/0.4 kV',
        vectorGroup: 'Dyn5',
        shortCircuitVoltagePercent: 6,
        zeroSequenceModelRefId: null,
      }, [
        port('tr-sn-nn-1', 'tr-sn-nn-1:sn', 'TRANSFORMER_SN'),
        port('tr-sn-nn-1', 'tr-sn-nn-1:nn', 'TRANSFORMER_NN'),
      ]),
      element('station-lv-bus', {
        elementKind: 'BUSBAR_SECTION',
        engineeringRole: 'LV_BUSBAR',
        voltageDomain: 'NN',
        networkPosition: position({ stationRefId: 'station-through-1' }),
      }, [port('station-lv-bus', 'station-lv-bus:bus', 'BUSBAR_NN')]),
      element('seg-station-out', {
        elementKind: 'MV_CABLE_SEGMENT',
        engineeringRole: 'MV_CABLE_SEGMENT',
        functionalRole: 'FEEDS_MV_TRUNK',
        networkPosition: position({ feederRefId: 'trunk-1', branchRefId: 'seg-station-out' }),
      }, [
        port('seg-station-out', 'seg-station-out:in', 'SEGMENT_SN_IN'),
        port('seg-station-out', 'seg-station-out:out', 'SEGMENT_SN_OUT'),
      ]),
    ];

    const connections = [
      connection('conn-gpz-bus', 'gpz-1:source', 'gpz-bus-sn:bus'),
      connection('conn-bus-bay', 'gpz-bus-sn:bus', 'bay-line-gpz:in'),
      connection('conn-bay-seg', 'bay-line-gpz:out', 'seg-gpz-station-in:in'),
      connection('conn-seg-st-inbay', 'seg-gpz-station-in:out', 'station-bay-in:in'),
      connection('conn-through-mv-bays', 'station-bay-in:out', 'station-bay-out:in'),
      connection('conn-through-next-segment', 'station-bay-out:out', 'seg-station-out:in'),
      connection('conn-tr-bay-to-tr', 'station-bay-tr:tr', 'tr-sn-nn-1:sn'),
      connection('conn-tr-to-lv', 'tr-sn-nn-1:nn', 'station-lv-bus:bus', 'NN'),
    ];

    const model: EngineeringSemanticModel = {
      schemaVersion: 'v12-semantic-v8',
      projectRefId: 'project-1',
      modelId: 'model-workflow-1',
      enmSnapshotRef: 'enm-workflow-1',
      catalogSnapshotRef: 'catalog-1',
      usedCatalogMaterializationHash: 'used-catalog-1',
      semanticVersion: 'v8',
      semanticHash: 'semantic-workflow-1',
      ontologyVersion: 'ontology-v8',
      ontologyHash: 'ontology-hash',
      roleRegistryHash: 'role-hash',
      connectionRuleRegistryHash: 'connection-rule-hash',
      generatedAt: '2026-04-28T00:00:00Z',
      elements,
      connections,
      physicalTopologyGraph: {
        graphId: 'physical-workflow',
        elementRefs: elements.map((item) => item.refId),
        connectionRefs: connections.map((item) => item.connectionId),
      },
      earthingContexts: [],
    };

    expect(model.elements.find((item) => item.refId === 'gpz-1')?.elementKind).toBe('GPZ');
    expect(model.elements.find((item) => item.refId === 'bay-line-gpz')?.engineeringRole).toBe('LINE_FEEDER_BAY');
    expect(model.elements.find((item) => item.refId === 'station-bay-tr')?.engineeringRole).toBe('TRANSFORMER_BAY');
    expect(model.connections.find((item) => item.connectionId === 'conn-through-next-segment')).toEqual(
      expect.objectContaining({
        fromPortId: 'station-bay-out:out',
        toPortId: 'seg-station-out:in',
        voltageDomain: 'SN',
      }),
    );
    expect(model.connections).not.toContainEqual(
      expect.objectContaining({
        fromPortId: 'station-lv-bus:bus',
        voltageDomain: 'SN',
      }),
    );
    expect(model.connections.find((item) => item.connectionId === 'conn-tr-to-lv')).toEqual(
      expect.objectContaining({
        fromPortId: 'tr-sn-nn-1:nn',
        toPortId: 'station-lv-bus:bus',
        voltageDomain: 'NN',
      }),
    );
    expect(model.connections.every((item) => item.validatedByRuleRefs.length > 0)).toBe(true);
  });
});
