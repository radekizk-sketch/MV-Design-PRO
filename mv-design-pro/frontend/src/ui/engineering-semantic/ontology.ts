import type {
  ConnectionKind,
  EngineeringConnection,
  EngineeringRole,
  GpzSemanticStructure,
  MvBayFunction,
  MvBayFunctionPolicy,
  PortRole,
  VoltageDomain,
} from './types';

export const SEMANTIC_VIOLATION_CODES = {
  SN_NN_WITHOUT_TRANSFORMER: 'SEM-VOLTAGE-001',
  DC_AC_WITHOUT_CONVERTER: 'SEM-VOLTAGE-002',
  TRANSFORMER_BAY_FEEDS_SEGMENT: 'SEM-BAY-001',
  MEASUREMENT_BAY_FEEDS_POWER: 'SEM-BAY-002',
  COUPLER_BAY_ONLY_BUS_SECTIONS: 'SEM-BAY-003',
  GPZ_AS_MV_LV_STATION: 'SEM-GPZ-001',
  THROUGH_STATION_MV_THROUGH_LV: 'SEM-STATION-001',
  FULL_TECHNICAL_MODEL_REQUIRES_MATERIALIZATION: 'SEM-CATALOG-001',
  PRODUCTION_RENDER_WITHOUT_ROLE: 'SEM-SLD-001',
  RESULT_WITHOUT_ELEMENT_REF: 'SEM-RESULT-001',
} as const;

export const MV_BAY_FUNCTION_POLICIES: Record<MvBayFunction, MvBayFunctionPolicy> = {
  ZASILAJACE_SZYNE: {
    bayFunction: 'ZASILAJACE_SZYNE',
    mayFeedMvSegment: false,
    mayFeedTransformer: false,
    mayConnectBusbarSections: false,
    mayMeasureBusbarVoltage: false,
    mayConnectSource: false,
    mayRemainUnconnected: false,
    requiresMainSwitchingDevice: true,
    allowedMainSwitchingDeviceRoles: ['CIRCUIT_BREAKER', 'LOAD_BREAK_SWITCH'],
    requiresProtection: true,
    requiresCurrentTransformer: true,
    requiresVoltageTransformer: false,
    requiresSourceComplianceProfile: false,
    allowedOutgoingPortRoles: ['BAY_SN_IN'],
  },
  ODPLYWOWE_LINIOWE: {
    bayFunction: 'ODPLYWOWE_LINIOWE',
    mayFeedMvSegment: true,
    mayFeedTransformer: false,
    mayConnectBusbarSections: false,
    mayMeasureBusbarVoltage: false,
    mayConnectSource: false,
    mayRemainUnconnected: false,
    requiresMainSwitchingDevice: true,
    allowedMainSwitchingDeviceRoles: ['CIRCUIT_BREAKER', 'LOAD_BREAK_SWITCH'],
    requiresProtection: true,
    requiresCurrentTransformer: true,
    requiresVoltageTransformer: false,
    requiresSourceComplianceProfile: false,
    allowedOutgoingPortRoles: ['BAY_SN_OUT', 'SEGMENT_SN_IN'],
  },
  TRANSFORMATOROWE: {
    bayFunction: 'TRANSFORMATOROWE',
    mayFeedMvSegment: false,
    mayFeedTransformer: true,
    mayConnectBusbarSections: false,
    mayMeasureBusbarVoltage: false,
    mayConnectSource: false,
    mayRemainUnconnected: false,
    requiresMainSwitchingDevice: true,
    allowedMainSwitchingDeviceRoles: ['CIRCUIT_BREAKER', 'LOAD_BREAK_SWITCH'],
    requiresProtection: true,
    requiresCurrentTransformer: true,
    requiresVoltageTransformer: false,
    requiresSourceComplianceProfile: false,
    allowedOutgoingPortRoles: ['BAY_SN_TRANSFORMER', 'TRANSFORMER_SN'],
  },
  POMIAROWE: {
    bayFunction: 'POMIAROWE',
    mayFeedMvSegment: false,
    mayFeedTransformer: false,
    mayConnectBusbarSections: false,
    mayMeasureBusbarVoltage: true,
    mayConnectSource: false,
    mayRemainUnconnected: false,
    requiresMainSwitchingDevice: false,
    allowedMainSwitchingDeviceRoles: [],
    requiresProtection: false,
    requiresCurrentTransformer: false,
    requiresVoltageTransformer: true,
    requiresSourceComplianceProfile: false,
    allowedOutgoingPortRoles: ['MEASUREMENT_INPUT'],
  },
  SPRZEGLOWE: {
    bayFunction: 'SPRZEGLOWE',
    mayFeedMvSegment: false,
    mayFeedTransformer: false,
    mayConnectBusbarSections: true,
    mayMeasureBusbarVoltage: false,
    mayConnectSource: false,
    mayRemainUnconnected: false,
    requiresMainSwitchingDevice: true,
    allowedMainSwitchingDeviceRoles: ['CIRCUIT_BREAKER', 'LOAD_BREAK_SWITCH'],
    requiresProtection: true,
    requiresCurrentTransformer: true,
    requiresVoltageTransformer: false,
    requiresSourceComplianceProfile: false,
    allowedOutgoingPortRoles: ['BAY_COUPLER_A', 'BAY_COUPLER_B'],
  },
  ZRODLOWE: {
    bayFunction: 'ZRODLOWE',
    mayFeedMvSegment: false,
    mayFeedTransformer: false,
    mayConnectBusbarSections: false,
    mayMeasureBusbarVoltage: false,
    mayConnectSource: true,
    mayRemainUnconnected: false,
    requiresMainSwitchingDevice: true,
    allowedMainSwitchingDeviceRoles: ['CIRCUIT_BREAKER', 'LOAD_BREAK_SWITCH'],
    requiresProtection: true,
    requiresCurrentTransformer: true,
    requiresVoltageTransformer: true,
    requiresSourceComplianceProfile: true,
    allowedOutgoingPortRoles: ['SOURCE_AC', 'BAY_SN_OUT'],
  },
  REZERWOWE: {
    bayFunction: 'REZERWOWE',
    mayFeedMvSegment: false,
    mayFeedTransformer: false,
    mayConnectBusbarSections: false,
    mayMeasureBusbarVoltage: false,
    mayConnectSource: false,
    mayRemainUnconnected: true,
    requiresMainSwitchingDevice: false,
    allowedMainSwitchingDeviceRoles: [],
    requiresProtection: false,
    requiresCurrentTransformer: false,
    requiresVoltageTransformer: false,
    requiresSourceComplianceProfile: false,
    allowedOutgoingPortRoles: [],
  },
};

export const MV_BAY_ROLE_TO_FUNCTION: Partial<Record<EngineeringRole, MvBayFunction>> = {
  INCOMING_SUPPLY_BAY: 'ZASILAJACE_SZYNE',
  LINE_FEEDER_BAY: 'ODPLYWOWE_LINIOWE',
  TRANSFORMER_BAY: 'TRANSFORMATOROWE',
  MEASUREMENT_BAY: 'POMIAROWE',
  COUPLER_BAY: 'SPRZEGLOWE',
  SOURCE_CONNECTION_BAY: 'ZRODLOWE',
  RESERVE_BAY: 'REZERWOWE',
};

export function isMvBayRoleFunctionConsistent(
  role: EngineeringRole,
  bayFunction: MvBayFunction,
): boolean {
  return MV_BAY_ROLE_TO_FUNCTION[role] === bayFunction;
}

export function validateConnectionKindVoltageDomain(
  connectionKind: ConnectionKind,
  voltageDomain: VoltageDomain | null,
): boolean {
  switch (connectionKind) {
    case 'TOR_MOCY':
      return voltageDomain === 'WN' || voltageDomain === 'SN' || voltageDomain === 'NN' || voltageDomain === 'DC';
    case 'TOR_POMIAROWY':
      return voltageDomain === 'POMIAR' || voltageDomain === 'WN' || voltageDomain === 'SN' || voltageDomain === 'NN' || voltageDomain === 'DC';
    case 'TOR_STEROWNICZY':
      return voltageDomain === 'STEROWANIE';
    case 'TOR_LOGICZNY':
      return voltageDomain === 'LOGIKA' || voltageDomain === null;
    case 'POWIAZANIE_RAPORTOWE':
      return voltageDomain === null;
  }
}

export function validateProductionConnection(connection: EngineeringConnection): string[] {
  const issues: string[] = [];
  if (connection.validatedByRuleRefs.length === 0) {
    issues.push('SEM-CONNECTION-001');
  }
  if (!validateConnectionKindVoltageDomain(connection.connectionKind, connection.voltageDomain)) {
    issues.push('SEM-CONNECTION-002');
  }
  return issues;
}

export function gpzStructureIssues(structure: GpzSemanticStructure): string[] {
  const issues: string[] = [];
  if (structure.modelKind === 'UPROSZCZONY_PARAMETRY_NA_SZYNIE_SN' && !structure.supplyShortCircuitModelRefId) {
    issues.push('SEM-GPZ-002');
  }
  if (structure.modelKind === 'PELNY_WN_TRANSFORMATOR_SN' && structure.hvMvTransformers.length === 0) {
    issues.push('SEM-GPZ-003');
  }
  return issues;
}

export function requiredPortRolesForBayFunction(bayFunction: MvBayFunction): readonly PortRole[] {
  return MV_BAY_FUNCTION_POLICIES[bayFunction].allowedOutgoingPortRoles;
}
