import { withInputHash, withOverlayHash, withResultHash, withSemanticHash, withViewHash } from '../projections';
import { normalizeEngineeringQuantity } from '../quantity';
import type {
  CalculationInputSnapshot,
  EngineeringConnection,
  EngineeringQuantity,
  EngineeringSemanticModel,
  EngineeringSide,
  NetworkPosition,
  ReportEligibilityByKind,
  ResultBinding,
  SldBaseProjectionViewModel,
  SldOverlayProjection,
  SldRoute,
  SldSymbolInstance,
  TransformerElement,
} from '../types';

export const reportEligibility: ReportEligibilityByKind = {
  RAPORT_TECHNICZNY: 'RAPORTOWALNY',
  RAPORT_OSD: 'RAPORTOWALNY',
  RAPORT_AUDYTOWY: 'RAPORTOWALNY',
  RAPORT_ZGODNOSCI_ZRODLA: 'NIE_DOTYCZY',
  RAPORT_ZABEZPIECZEN: 'NIE_DOTYCZY',
};

export const networkPosition: NetworkPosition = {
  projectRefId: 'project-1',
  parentRefId: null,
  containerRefId: 'gpz-1',
  voltageLevelRefId: 'vl-sn-15',
  switchgearRefId: 'switchgear-1',
  busbarSectionRefId: 'busbar-a',
  bayRefId: null,
  feederRefId: null,
  branchRefId: null,
  stationRefId: null,
  orderIndex: 1,
};

export function quantity(value: number, unit: string, precision = 6): EngineeringQuantity {
  return normalizeEngineeringQuantity({
    value,
    unit,
    source: 'KATALOG',
    qualityState: 'PELNA',
    normalizationPrecision: precision,
  });
}

export const highSide: EngineeringSide = {
  sideId: 'tr-1-high',
  ownerRefId: 'tr-1',
  labelPl: 'Strona SN',
  sideRole: 'STRONA_SN',
  voltageDomain: 'SN',
  nominalVoltageKv: 15,
  phaseSystem: 'ABC',
  portRefs: ['tr-1-p-high'],
  terminalRefs: ['tr-1-t-high'],
  earthingContextRefId: 'earth-sn-1',
};

export const lowSide: EngineeringSide = {
  sideId: 'tr-1-low',
  ownerRefId: 'tr-1',
  labelPl: 'Strona nN',
  sideRole: 'STRONA_NN',
  voltageDomain: 'NN',
  nominalVoltageKv: 0.4,
  phaseSystem: 'ABCN',
  portRefs: ['tr-1-p-low'],
  terminalRefs: ['tr-1-t-low'],
  earthingContextRefId: 'earth-nn-1',
};

export function transformerElement(): TransformerElement {
  return {
    refId: 'tr-1',
    elementKind: 'TRANSFORMER',
    engineeringRole: 'MV_LV_TRANSFORMER',
    functionalRole: 'TRANSFORMS_MV_TO_LV',
    networkPosition: { ...networkPosition, parentRefId: 'bay-tr-1' },
    voltageDomain: 'SN',
    completeness: 'MODEL_TECHNICZNY_PELNY',
    reportEligibility,
    dataQualityState: 'PELNA',
    ports: [],
    terminals: [],
    transformerKind: 'SN_NN',
    highSide,
    lowSide,
    ratedPower: quantity(630, 'kW'),
    voltageRatio: '15/0.4 kV',
    vectorGroup: 'Dyn5',
    shortCircuitVoltagePercent: 6,
    zeroSequenceModelRefId: 'z0-tr-1',
  };
}

export function semanticModel(overrides: Partial<EngineeringSemanticModel> = {}): EngineeringSemanticModel {
  return withSemanticHash({
    schemaVersion: 'v12-semantic-v8',
    projectRefId: 'project-1',
    modelId: 'model-1',
    enmSnapshotRef: 'enm-1',
    catalogSnapshotRef: 'catalog-full-1',
    usedCatalogMaterializationHash: 'materializations-used-1',
    semanticVersion: 'v8',
    ontologyVersion: 'ontology-v8',
    ontologyHash: 'ontology-hash-1',
    roleRegistryHash: 'role-registry-1',
    connectionRuleRegistryHash: 'connection-rule-registry-1',
    generatedAt: '2026-04-28T10:00:00Z',
    elements: [],
    connections: [],
    physicalTopologyGraph: {
      graphId: 'physical-1',
      elementRefs: [],
      connectionRefs: [],
    },
    earthingContexts: [],
    ...overrides,
  });
}

export function productionConnection(overrides: Partial<EngineeringConnection> = {}): EngineeringConnection {
  return {
    connectionId: 'conn-1',
    fromPortId: 'bay-1-out',
    toPortId: 'seg-1-in',
    orientation: 'BEZKIERUNKOWE',
    connectionKind: 'TOR_MOCY',
    voltageDomain: 'SN',
    normalState: 'POLACZONE',
    switchingDeviceRefId: null,
    validatedByRuleRefs: ['SEM-CONNECTION-SN-SN'],
    ...overrides,
  };
}

export function inputSnapshot(overrides: Partial<CalculationInputSnapshot> = {}): CalculationInputSnapshot {
  return withInputHash({
    schemaVersion: 'v12-input-v1',
    projectRefId: 'project-1',
    inputSnapshotRefId: 'input-1',
    semanticHash: 'sem-1',
    catalogSnapshotRef: 'catalog-1',
    materializationRefs: ['mat-1'],
    caseRefId: 'case-1',
    caseHash: 'case-hash-1',
    variantRefId: 'variant-1',
    variantHash: 'variant-hash-1',
    switchingSnapshotRefId: 'switching-1',
    switchingSnapshotHash: 'switching-hash-1',
    analysisType: 'ROZPLYW_NR',
    solverKind: 'NR',
    solverSettingsHash: 'solver-settings-1',
    assumptionsHash: 'assumptions-1',
    calculationGraphHash: 'calculation-graph-1',
    generatedAt: '2026-04-28T10:00:00Z',
    ...overrides,
  });
}

export function resultBinding(overrides: Partial<ResultBinding> = {}): ResultBinding {
  return withResultHash({
    schemaVersion: 'v12-result-v1',
    projectRefId: 'project-1',
    resultId: 'result-1',
    elementRefId: 'bay-1',
    semanticHash: 'sem-1',
    inputSnapshotRefId: 'input-1',
    inputHash: 'input-hash-1',
    caseRefId: 'case-1',
    caseHash: 'case-hash-1',
    variantRefId: 'variant-1',
    variantHash: 'variant-hash-1',
    switchingSnapshotRefId: 'switching-1',
    switchingSnapshotHash: 'switching-hash-1',
    catalogSnapshotRef: 'catalog-1',
    usedCatalogMaterializationHash: 'materializations-used-1',
    analysisType: 'ROZPLYW_NR',
    resultKind: 'MOC',
    qualityState: 'PELNA',
    freshnessState: 'AKTUALNY',
    proofRefId: 'proof-1',
    reportEligibility,
    ...overrides,
  });
}

export function baseView(overrides: Partial<SldBaseProjectionViewModel> = {}): SldBaseProjectionViewModel {
  return withViewHash({
    schemaVersion: 'v12-sld-view-v1',
    projectRefId: 'project-1',
    semanticHash: 'sem-1',
    rendererRegistryHash: 'renderer-1',
    layoutRegistryHash: 'layout-1',
    lodPolicyHash: 'lod-1',
    symbols: [],
    routes: [],
    labels: [],
    ...overrides,
  });
}

export function overlayProjection(overrides: Partial<SldOverlayProjection> = {}): SldOverlayProjection {
  return withOverlayHash({
    schemaVersion: 'v12-sld-overlay-v1',
    projectRefId: 'project-1',
    overlayId: 'overlay-1',
    semanticHash: 'sem-1',
    baseViewHash: 'view-1',
    resultSetRefId: 'result-set-1',
    resultHash: 'result-hash-1',
    inputSnapshotRefId: 'input-1',
    overlayKind: 'MOC_PQ',
    markers: [],
    labels: [],
    ...overrides,
  });
}

export function sldSymbol(overrides: Partial<SldSymbolInstance> = {}): SldSymbolInstance {
  return {
    symbolId: 'symbol-1',
    elementRefId: 'tr-1',
    semanticHash: 'sem-1',
    elementKind: 'TRANSFORMER',
    engineeringRole: 'MV_LV_TRANSFORMER',
    visibilityStatus: 'WIDOCZNY',
    renderClass: 'PRODUKCYJNY_TECHNICZNY',
    rendererKey: 'transformer',
    lodLevel: 'LOD_4',
    ...overrides,
  };
}

export function sldRoute(overrides: Partial<SldRoute> = {}): SldRoute {
  return {
    routeId: 'route-1',
    connectionId: 'conn-1',
    semanticHash: 'sem-1',
    pathPoints: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    routeClass: 'TOR_MOCY',
    ...overrides,
  };
}
