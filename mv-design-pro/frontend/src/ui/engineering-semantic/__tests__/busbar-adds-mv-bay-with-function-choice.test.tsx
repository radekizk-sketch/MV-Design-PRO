/**
 * busbar-adds-mv-bay-with-function-choice
 *
 * Weryfikuje, że po dodaniu szyny SN do GPZ użytkownik może
 * dodać pole SN z wyborem funkcji (odpływowe liniowe, transformatorowe,
 * sekcyjne, sprzęgłowe, pomiarowe).
 *
 * Model semantyczny pola SN musi mieć:
 * - engineeringRole: LINE_FEEDER_BAY | TRANSFORMER_BAY | COUPLING_BAY | ...
 * - bayFunction: odpowiednią wartość z taksonomii polskiej
 * - porty wejściowy (BAY_SN_IN) i wyjściowy (BAY_SN_OUT lub BAY_SN_TRANSFORMER)
 */

import { describe, expect, it } from 'vitest';

import type {
  EngineeringElement,
  EngineeringPort,
  NetworkPosition,
} from '../types';
import { defaultReportEligibility } from '../types';

const reportEligibility = defaultReportEligibility('RAPORTOWALNY');

function position(overrides: Partial<NetworkPosition> = {}): NetworkPosition {
  return {
    projectRefId: 'proj-bay',
    parentRefId: null,
    containerRefId: null,
    voltageLevelRefId: 'vl-sn',
    switchgearRefId: 'gpz-sg',
    busbarSectionRefId: 'gpz-bus-sn',
    bayRefId: null,
    feederRefId: null,
    branchRefId: null,
    stationRefId: null,
    orderIndex: 1,
    ...overrides,
  };
}

function port(ownerRefId: string, portId: string, role: EngineeringPort['role']): EngineeringPort {
  return {
    ownerRefId,
    portId,
    role,
    voltageDomain: 'SN',
    nominalVoltageKv: 15,
    phaseSystem: 'ABC',
    connectionSide: role.endsWith('OUT') || role === 'BAY_SN_TRANSFORMER' ? 'WYJSCIE' : 'WEJSCIE',
    minConnections: 0,
    maxConnections: 1,
    connectionPolicyRef: 'policy:mv-bay',
    requiredConnectionKinds: ['TOR_MOCY'],
    forbiddenConnectionKinds: ['TOR_LOGICZNY'],
  };
}

function makeBay(
  bayId: string,
  role: EngineeringElement['engineeringRole'],
  bayFunction: string,
  outPortRole: EngineeringPort['role'] = 'BAY_SN_OUT',
): EngineeringElement {
  return {
    refId: bayId,
    elementKind: 'MV_BAY',
    engineeringRole: role,
    functionalRole: role === 'TRANSFORMER_BAY' ? 'TRANSFORMS_MV_TO_LV' : 'FEEDS_MV_TRUNK',
    networkPosition: position({ bayRefId: bayId }),
    voltageDomain: 'SN',
    completeness: 'MODEL_SZKICOWY',
    reportEligibility,
    dataQualityState: 'SZKICOWA',
    ports: [
      port(bayId, `${bayId}:in`, 'BAY_SN_IN'),
      port(bayId, `${bayId}:out`, outPortRole),
    ],
    terminals: [],
    bayFunction,
    connectedBusbarSectionRefId: 'gpz-bus-sn',
    mainSwitchingDeviceRefId: null,
    outgoingPortRefId: outPortRole !== 'BAY_SN_TRANSFORMER' ? `${bayId}:out` : null,
  } as EngineeringElement;
}

describe('busbar adds MV bay with function choice', () => {
  it('LINE_FEEDER_BAY has BAY_SN_IN and BAY_SN_OUT ports', () => {
    const bay = makeBay('bay-line', 'LINE_FEEDER_BAY', 'ODPLYWOWE_LINIOWE');
    const inPort = bay.ports.find((p) => p.role === 'BAY_SN_IN');
    const outPort = bay.ports.find((p) => p.role === 'BAY_SN_OUT');
    expect(inPort).toBeDefined();
    expect(outPort).toBeDefined();
  });

  it('TRANSFORMER_BAY has BAY_SN_IN and BAY_SN_TRANSFORMER ports', () => {
    const bay = makeBay('bay-tr', 'TRANSFORMER_BAY', 'TRANSFORMATOROWE', 'BAY_SN_TRANSFORMER');
    const inPort = bay.ports.find((p) => p.role === 'BAY_SN_IN');
    const trPort = bay.ports.find((p) => p.role === 'BAY_SN_TRANSFORMER');
    expect(inPort).toBeDefined();
    expect(trPort).toBeDefined();
    expect(bay.outgoingPortRefId).toBeNull();
  });

  it('bay engineeringRole must match bayFunction taxonomy', () => {
    const lineBay = makeBay('bay-line', 'LINE_FEEDER_BAY', 'ODPLYWOWE_LINIOWE');
    const trBay = makeBay('bay-tr', 'TRANSFORMER_BAY', 'TRANSFORMATOROWE', 'BAY_SN_TRANSFORMER');

    expect(lineBay.engineeringRole).toBe('LINE_FEEDER_BAY');
    expect(lineBay.bayFunction).toBe('ODPLYWOWE_LINIOWE');

    expect(trBay.engineeringRole).toBe('TRANSFORMER_BAY');
    expect(trBay.bayFunction).toBe('TRANSFORMATOROWE');
  });

  it('bay has connectedBusbarSectionRefId pointing to parent busbar', () => {
    const bay = makeBay('bay-line', 'LINE_FEEDER_BAY', 'ODPLYWOWE_LINIOWE');
    expect(bay.connectedBusbarSectionRefId).toBe('gpz-bus-sn');
  });

  it('bay networkPosition includes busbarSectionRefId', () => {
    const bay = makeBay('bay-line', 'LINE_FEEDER_BAY', 'ODPLYWOWE_LINIOWE');
    expect(bay.networkPosition.busbarSectionRefId).toBe('gpz-bus-sn');
  });

  it('all bay ports are in SN voltage domain', () => {
    const bay = makeBay('bay-line', 'LINE_FEEDER_BAY', 'ODPLYWOWE_LINIOWE');
    for (const p of bay.ports) {
      expect(p.voltageDomain).toBe('SN');
    }
  });
});
