import type {
  EngineeringConnection,
  EngineeringElement,
  EngineeringQuantity,
  EngineeringSemanticModel,
  NetworkPosition,
  ReportEligibilityByKind,
} from '../types';
import { defaultReportEligibility } from '../types';

export const reportEligibility: ReportEligibilityByKind = defaultReportEligibility('RAPORTOWALNY');

export const networkPosition: NetworkPosition = {
  projectRefId: 'project-1',
  parentRefId: null,
  containerRefId: null,
  voltageLevelRefId: 'vl-sn',
  switchgearRefId: 'swg-1',
  busbarSectionRefId: 'bus-1',
  bayRefId: null,
  feederRefId: null,
  branchRefId: null,
  stationRefId: null,
  orderIndex: 1,
};

export const quantity: EngineeringQuantity = {
  value: 1,
  unit: 'MW',
  normalizedValue: 1,
  normalizedUnit: 'MW',
  normalizationPrecision: 6,
  source: 'KATALOG',
  qualityState: 'PELNA',
};

export const busbarElement: EngineeringElement = {
  refId: 'bus-1',
  elementKind: 'BUSBAR_SECTION',
  engineeringRole: 'BUSBAR_SECTION',
  functionalRole: 'NOT_APPLICABLE',
  networkPosition,
  voltageDomain: 'SN',
  completeness: 'MODEL_TECHNICZNY_PELNY',
  reportEligibility,
  dataQualityState: 'PELNA',
  ports: [],
  terminals: [],
};

export const connection: EngineeringConnection = {
  connectionId: 'conn-1',
  fromPortId: 'bay-1:out',
  toPortId: 'seg-1:in',
  orientation: 'BEZKIERUNKOWE',
  connectionKind: 'TOR_MOCY',
  voltageDomain: 'SN',
  normalState: 'POLACZONE',
  switchingDeviceRefId: null,
  validatedByRuleRefs: ['rule:sn-to-sn'],
};

export const semanticModel: EngineeringSemanticModel = {
  schemaVersion: 'v12-semantic-v8',
  projectRefId: 'project-1',
  modelId: 'model-1',
  enmSnapshotRef: 'enm-1',
  catalogSnapshotRef: 'catalog-1',
  usedCatalogMaterializationHash: 'used-catalog-1',
  semanticVersion: 'v8',
  semanticHash: 'semantic-1',
  ontologyVersion: 'ontology-v8',
  ontologyHash: 'ontology-hash',
  roleRegistryHash: 'role-hash',
  connectionRuleRegistryHash: 'connection-rule-hash',
  generatedAt: '2026-04-28T00:00:00Z',
  elements: [busbarElement],
  connections: [connection],
  physicalTopologyGraph: {
    graphId: 'physical-1',
    elementRefs: ['bus-1'],
    connectionRefs: ['conn-1'],
  },
  earthingContexts: [],
};
