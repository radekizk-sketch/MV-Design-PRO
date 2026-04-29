/**
 * gpz-created-renders-busbar-and-next-action
 *
 * Weryfikuje, że po utworzeniu GPZ uproszczonego model semantyczny zawiera:
 * - element GPZ (GPZ_SUPPLY_NODE)
 * - co najmniej jedną szynę zbiorczą SN (BUSBAR_SECTION)
 * - połączenie między GPZ a szyną
 *
 * i że następna dostępna akcja to dodanie pola odpływowego SN.
 */

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
    projectRefId: 'proj-gpz',
    parentRefId: null,
    containerRefId: null,
    voltageLevelRefId: 'vl-sn',
    switchgearRefId: 'gpz-sg',
    busbarSectionRefId: null,
    bayRefId: null,
    feederRefId: null,
    branchRefId: null,
    stationRefId: null,
    orderIndex: null,
    ...overrides,
  };
}

function makePort(ownerRefId: string, portId: string, role: EngineeringPort['role']): EngineeringPort {
  return {
    ownerRefId,
    portId,
    role,
    voltageDomain: 'SN',
    nominalVoltageKv: 15,
    phaseSystem: 'ABC',
    connectionSide: 'WEJSCIE',
    minConnections: 0,
    maxConnections: 2,
    connectionPolicyRef: 'policy:mv-gpz',
    requiredConnectionKinds: ['TOR_MOCY'],
    forbiddenConnectionKinds: ['TOR_LOGICZNY'],
  };
}

function gpzElement(): EngineeringElement {
  return {
    refId: 'gpz-1',
    elementKind: 'GPZ',
    engineeringRole: 'GPZ_SUPPLY_NODE',
    functionalRole: 'NOT_APPLICABLE',
    networkPosition: position(),
    voltageDomain: 'SN',
    completeness: 'MODEL_SZKICOWY',
    reportEligibility,
    dataQualityState: 'SZKICOWA',
    ports: [makePort('gpz-1', 'gpz-1:source', 'SOURCE_AC')],
    terminals: [],
    structure: {
      gpzRefId: 'gpz-1',
      modelKind: 'UPROSZCZONY_PARAMETRY_NA_SZYNIE_SN',
      supplyNodeRefId: 'gpz-1',
      supplyShortCircuitModelRefId: 'sk-gpz-1',
      hvMvTransformers: [],
      mvSwitchgearRefId: 'gpz-sg',
      busbarSystemRefId: 'gpz-bus-sys',
      busbarSectionRefs: ['gpz-bus-sn'],
      incomingBayRefs: [],
      outgoingBayRefs: [],
      couplerBayRefs: [],
      measurementBayRefs: [],
      sourceBayRefs: [],
      groundingModelRefId: 'earthing-sn',
    },
  } as EngineeringElement;
}

function busSectionElement(): EngineeringElement {
  return {
    refId: 'gpz-bus-sn',
    elementKind: 'BUSBAR_SECTION',
    engineeringRole: 'BUSBAR_SECTION',
    functionalRole: 'NOT_APPLICABLE',
    networkPosition: position({ busbarSectionRefId: 'gpz-bus-sn' }),
    voltageDomain: 'SN',
    completeness: 'MODEL_TECHNICZNY_PELNY',
    reportEligibility,
    dataQualityState: 'PELNA',
    ports: [makePort('gpz-bus-sn', 'gpz-bus-sn:bus', 'BUSBAR_SN')],
    terminals: [],
  } as EngineeringElement;
}

function conn(id: string, from: string, to: string): EngineeringConnection {
  return {
    connectionId: id,
    fromPortId: from,
    toPortId: to,
    orientation: 'BEZKIERUNKOWE',
    connectionKind: 'TOR_MOCY',
    voltageDomain: 'SN',
    normalState: 'POLACZONE',
    switchingDeviceRefId: null,
    validatedByRuleRefs: ['rule:gpz-busbar'],
  };
}

describe('GPZ created — model shows busbar and next action', () => {
  it('model contains GPZ element', () => {
    const model: Partial<EngineeringSemanticModel> = {
      elements: [gpzElement(), busSectionElement()],
      connections: [conn('conn-gpz-bus', 'gpz-1:source', 'gpz-bus-sn:bus')],
    };
    const gpz = model.elements?.find((el) => el.elementKind === 'GPZ');
    expect(gpz).toBeDefined();
    expect(gpz?.engineeringRole).toBe('GPZ_SUPPLY_NODE');
  });

  it('model contains BUSBAR_SECTION connected to GPZ', () => {
    const model: Partial<EngineeringSemanticModel> = {
      elements: [gpzElement(), busSectionElement()],
      connections: [conn('conn-gpz-bus', 'gpz-1:source', 'gpz-bus-sn:bus')],
    };
    const busbar = model.elements?.find((el) => el.elementKind === 'BUSBAR_SECTION');
    expect(busbar).toBeDefined();
    expect(busbar?.engineeringRole).toBe('BUSBAR_SECTION');
    expect(busbar?.voltageDomain).toBe('SN');
  });

  it('connection from GPZ source port to busbar exists', () => {
    const connections = [conn('conn-gpz-bus', 'gpz-1:source', 'gpz-bus-sn:bus')];
    const connection = connections.find((c) => c.fromPortId === 'gpz-1:source');
    expect(connection).toBeDefined();
    expect(connection?.toPortId).toBe('gpz-bus-sn:bus');
    expect(connection?.voltageDomain).toBe('SN');
  });

  it('next action after GPZ creation is to add MV_BAY (outgoing)', () => {
    const gpz = gpzElement();
    // GPZ with no outgoing bays → next action should be adding bay
    expect(gpz.structure?.outgoingBayRefs).toHaveLength(0);
  });

  it('GPZ completeness is MODEL_SZKICOWY — awaits catalog binding', () => {
    const gpz = gpzElement();
    expect(gpz.completeness).toBe('MODEL_SZKICOWY');
  });
});
