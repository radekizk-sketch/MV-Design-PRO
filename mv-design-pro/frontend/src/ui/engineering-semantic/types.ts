export const ENGINEERING_SEMANTIC_SCHEMA_VERSION = 'v12-semantic-v8' as const;

export type VoltageDomain = 'WN' | 'SN' | 'NN' | 'DC' | 'POMIAR' | 'STEROWANIE' | 'LOGIKA';
export type PhaseSystem = 'ABC' | 'ABCN' | 'N' | 'DC_PLUS_MINUS' | 'SYGNAL';

export type DataQualityState =
  | 'PELNA'
  | 'CZESCIOWA'
  | 'BRAK'
  | 'NIEZWERYFIKOWANA'
  | 'OSZACOWANA';

export type EngineeringCompleteness =
  | 'SZKIC_LOGICZNY'
  | 'MODEL_TECHNICZNY_NIEPELNY'
  | 'MODEL_TECHNICZNY_PELNY';

export type LegacySemanticMappingStatus =
  | 'ZMAPOWANY_PELNIE'
  | 'ZMAPOWANY_CZESCIOWO'
  | 'WYMAGA_DECYZJI_UZYTKOWNIKA'
  | 'NIEZGODNY_Z_KANONEM'
  | 'ODRZUCONY';

export type ReportEligibility =
  | 'RAPORTOWALNY'
  | 'RAPORTOWALNY_Z_OSTRZEZENIEM'
  | 'NIERAPORTOWALNY_BRAK_DANYCH'
  | 'NIERAPORTOWALNY_SZKIC'
  | 'NIE_DOTYCZY';

export type ReportKind =
  | 'RAPORT_TECHNICZNY'
  | 'RAPORT_OSD'
  | 'RAPORT_AUDYTOWY'
  | 'RAPORT_ZGODNOSCI_ZRODLA'
  | 'RAPORT_ZABEZPIECZEN';

export type ReportEligibilityByKind = Record<ReportKind, ReportEligibility>;

export type EngineeringElementKind =
  | 'GPZ'
  | 'MV_SWITCHGEAR'
  | 'MV_LV_STATION'
  | 'MV_SWITCHING_STATION'
  | 'BRANCH_POINT_SN'
  | 'BUSBAR_SYSTEM'
  | 'BUSBAR_SECTION'
  | 'MV_BAY'
  | 'MV_CABLE_SEGMENT'
  | 'LV_CABLE_SEGMENT'
  | 'MV_OVERHEAD_SEGMENT'
  | 'TRANSFORMER'
  | 'CONVERTER'
  | 'SWITCHGEAR_DEVICE'
  | 'MEASUREMENT'
  | 'PROTECTION_RELAY'
  | 'AUTOMATION_CONTROLLER'
  | 'SOURCE'
  | 'LV_LOAD';

export type EngineeringRole =
  | 'GPZ_SUPPLY_NODE'
  | 'HV_MV_TRANSFORMATION_NODE'
  | 'MV_SWITCHGEAR'
  | 'MV_LV_STATION'
  | 'BUSBAR_SYSTEM'
  | 'BUSBAR_SECTION'
  | 'INCOMING_SUPPLY_BAY'
  | 'LINE_FEEDER_BAY'
  | 'TRANSFORMER_BAY'
  | 'MEASUREMENT_BAY'
  | 'COUPLER_BAY'
  | 'SOURCE_CONNECTION_BAY'
  | 'RESERVE_BAY'
  | 'BUSBAR_DISCONNECTOR'
  | 'CIRCUIT_BREAKER'
  | 'LOAD_BREAK_SWITCH'
  | 'LINE_DISCONNECTOR'
  | 'EARTHING_SWITCH'
  | 'CURRENT_TRANSFORMER'
  | 'VOLTAGE_TRANSFORMER'
  | 'PROTECTION_RELAY'
  | 'AUTOMATION_CONTROLLER'
  | 'SCADA_CONTROL_POINT'
  | 'MV_CABLE_SEGMENT'
  | 'MV_OVERHEAD_SEGMENT'
  | 'MV_BRANCH_POINT'
  | 'MV_NORMAL_OPEN_POINT'
  | 'MV_LV_TRANSFORMER'
  | 'LV_SWITCHBOARD'
  | 'LV_BUSBAR'
  | 'LV_FEEDER'
  | 'LV_LOAD_NODE'
  | 'PV_INVERTER'
  | 'BESS_CONVERTER'
  | 'WIND_SOURCE'
  | 'SOURCE_COMPLIANCE_PROFILE';

export type FunctionalRole =
  | 'FEEDS_MV_TRUNK'
  | 'CONNECTS_BUSBAR_SECTIONS'
  | 'MEASURES_RESIDUAL_CURRENT'
  | 'TRIPS_CIRCUIT_BREAKER'
  | 'TRANSFORMS_MV_TO_LV'
  | 'TRANSFORMS_HV_TO_MV'
  | 'CONVERTS_DC_TO_AC'
  | 'PROTECTS_ELEMENT'
  | 'REPORTS_RESULT'
  | 'NOT_APPLICABLE';

export type PortRole =
  | 'BUSBAR_WN'
  | 'BUSBAR_SN'
  | 'BUSBAR_NN'
  | 'BAY_SN_IN'
  | 'BAY_SN_OUT'
  | 'BAY_SN_TRANSFORMER'
  | 'BAY_COUPLER_A'
  | 'BAY_COUPLER_B'
  | 'SEGMENT_SN_IN'
  | 'SEGMENT_SN_OUT'
  | 'TRANSFORMER_HIGH'
  | 'TRANSFORMER_LOW'
  | 'TRANSFORMER_SN'
  | 'TRANSFORMER_NN'
  | 'SOURCE_AC'
  | 'SOURCE_DC'
  | 'LV_FEEDER_OUT'
  | 'MEASUREMENT_INPUT'
  | 'CONTROL_OUTPUT'
  | 'LOGIC_LINK'
  | 'REPORT_LINK';

export type ConnectionSide =
  | 'WEJSCIE'
  | 'WYJSCIE'
  | 'STRONA_SZYN'
  | 'STRONA_LINII'
  | 'STRONA_TRANSFORMATORA'
  | 'STRONA_ZRODLA'
  | 'NIE_DOTYCZY';

export type ConnectionKind =
  | 'TOR_MOCY'
  | 'TOR_POMIAROWY'
  | 'TOR_STEROWNICZY'
  | 'TOR_LOGICZNY'
  | 'POWIAZANIE_RAPORTOWE';

export type ConnectionOrientation = 'BEZKIERUNKOWE' | 'KIERUNKOWE';

export type CalculationAnalysisType =
  | 'ZWARCIE_3F'
  | 'ZWARCIE_1F'
  | 'ZWARCIE_2F'
  | 'ZWARCIE_2F_Z_ZIEMIA'
  | 'ROZPLYW_NR'
  | 'ROZPLYW_GS_DIAGNOSTYCZNY'
  | 'ROZPLYW_FD_WYDAJNOSCIOWY'
  | 'STAN_FAZOWY_SN'
  | 'ZGODNOSC_ZRODLA'
  | 'STABILNOSC_DYNAMICZNA'
  | 'SELEKTYWNOSC';

export type ResultKind =
  | 'PRAD'
  | 'NAPIECIE'
  | 'MOC'
  | 'ZWARCIE'
  | 'ZGODNOSC'
  | 'STABILNOSC'
  | 'SELEKTYWNOSC';

export type ResultFreshnessState =
  | 'AKTUALNY'
  | 'NIEAKTUALNY_SEMANTYKA'
  | 'NIEAKTUALNY_KATALOG'
  | 'NIEAKTUALNY_WARIANT'
  | 'NIEAKTUALNY_PRZYPADEK'
  | 'NIEAKTUALNY_WEJSCIE_SOLVERA'
  | 'CZESCIOWY'
  | 'BLEDNY';

export type EngineeringSideRole =
  | 'STRONA_WN'
  | 'STRONA_SN'
  | 'STRONA_NN'
  | 'STRONA_DC'
  | 'STRONA_AC'
  | 'STRONA_PIERWOTNA'
  | 'STRONA_WTORNA'
  | 'STRONA_POMIAROWA'
  | 'STRONA_STEROWNICZA';

export type TransformerKind =
  | 'WN_SN'
  | 'SN_NN'
  | 'BLOKOWY_NN_SN'
  | 'POTRZEB_WLASNYCH'
  | 'POMIAROWY';

export type MvBayFunction =
  | 'ZASILAJACE_SZYNE'
  | 'ODPLYWOWE_LINIOWE'
  | 'TRANSFORMATOROWE'
  | 'POMIAROWE'
  | 'SPRZEGLOWE'
  | 'ZRODLOWE'
  | 'REZERWOWE';

export type SldVisibilityStatus =
  | 'WIDOCZNY'
  | 'AGREGOWANY'
  | 'UKRYTY_PRZEZ_LOD'
  | 'UKRYTY_PRZEZ_FILTR'
  | 'BLOKADA_SEMANTYCZNA';

export type SldRenderClass =
  | 'PRODUKCYJNY_TECHNICZNY'
  | 'PLANOWANY_SZKIC'
  | 'BLOKADA_SEMANTYCZNA'
  | 'AUDYTOWY_ARCHIWALNY';

export type SldDetailLevel =
  | 'LOD_0'
  | 'LOD_1'
  | 'LOD_2'
  | 'LOD_3'
  | 'LOD_4'
  | 'LOD_5'
  | 'LOD_6'
  | 'LOD_7';

export type SldOverlayKind =
  | 'PRADY_FAZOWE'
  | 'MOC_PQ'
  | 'NAPIECIE'
  | 'ZWARCIA'
  | 'GOTOWOSC'
  | 'AUDYT';

export type SldRendererKey = string;

export interface NetworkPosition {
  projectRefId: string;
  parentRefId: string | null;
  containerRefId: string | null;
  voltageLevelRefId: string | null;
  switchgearRefId: string | null;
  busbarSectionRefId: string | null;
  bayRefId: string | null;
  feederRefId: string | null;
  branchRefId: string | null;
  stationRefId: string | null;
  orderIndex: number | null;
}

export interface EngineeringQuantity {
  value: number;
  unit: string;
  normalizedValue: number;
  normalizedUnit: string;
  normalizationPrecision: number;
  source: 'KATALOG' | 'KONTRAKT_ROWNOWAZNY' | 'REKA_PROJEKTANTA' | 'OBLICZONE' | 'OSZACOWANE';
  qualityState: DataQualityState;
}

export interface EquivalentTechnicalContract {
  contractRefId: string;
  elementRefId: string;
  contractKind:
    | 'DANE_PROJEKTANTA'
    | 'DANE_OPERATORA'
    | 'DANE_PRODUCENTA_POZA_KATALOGIEM'
    | 'DANE_POMIAROWE'
    | 'DANE_EKSPERCKIE';
  solverFieldCoverage: {
    analysisType: CalculationAnalysisType;
    requiredFields: string[];
    providedFields: string[];
    missingFields: string[];
    coverageStatus: 'PELNE' | 'CZESCIOWE' | 'BRAK';
  }[];
  providedValues: Record<string, EngineeringQuantity>;
  applicabilityScope: {
    voltageDomain: VoltageDomain | null;
    nominalVoltageKv: number | null;
    validForAnalysisTypes: CalculationAnalysisType[];
    validForReportKinds: ReportKind[];
  };
  author: string;
  justificationPl: string;
  qualityState: DataQualityState;
  reportEligibility: ReportEligibilityByKind;
  createdAt: string;
  expiresAt: string | null;
}

export interface EngineeringPort {
  portId: string;
  ownerRefId: string;
  role: PortRole;
  voltageDomain: VoltageDomain;
  nominalVoltageKv: number | null;
  phaseSystem: PhaseSystem;
  connectionSide: ConnectionSide;
  minConnections: number;
  maxConnections: number;
  connectionPolicyRef: string;
  requiredConnectionKinds: ConnectionKind[];
  forbiddenConnectionKinds: ConnectionKind[];
}

export interface EngineeringTerminal {
  terminalId: string;
  ownerRefId: string;
  labelPl: string;
  voltageDomain: VoltageDomain;
  nominalVoltageKv: number | null;
  terminalKind: 'ENERGETYCZNY' | 'POMIAROWY' | 'STEROWNICZY' | 'LOGICZNY';
  phaseSystem: PhaseSystem;
}

export interface EngineeringSide {
  sideId: string;
  ownerRefId: string;
  labelPl: string;
  sideRole: EngineeringSideRole;
  voltageDomain: VoltageDomain;
  nominalVoltageKv: number | null;
  phaseSystem: PhaseSystem;
  portRefs: string[];
  terminalRefs: string[];
  earthingContextRefId: string | null;
}

export interface EngineeringConnection {
  connectionId: string;
  fromPortId: string;
  toPortId: string;
  orientation: ConnectionOrientation;
  connectionKind: ConnectionKind;
  voltageDomain: VoltageDomain | null;
  normalState: 'POLACZONE' | 'ROZLACZONE' | 'NIE_DOTYCZY';
  switchingDeviceRefId: string | null;
  validatedByRuleRefs: string[];
}

export interface EarthingContext {
  earthingContextRefId: string;
  voltageDomain: VoltageDomain;
  voltageLevelRefId: string;
  neutralPointRefId: string | null;
  earthingMode: 'IZOLOWANY' | 'BEZPOSREDNIO_UZIEMIONY' | 'REZYSTOR' | 'CEWKA_PETERSENA' | 'NIE_DOTYCZY';
  resistorRefId: string | null;
  petersenCoilRefId: string | null;
  relatedTransformerRefs: string[];
  relatedBusbarSectionRefs: string[];
  relatedLineSegmentRefs: string[];
  totalCapacitiveCurrentA: number | null;
  residualEarthFaultCurrentA: number | null;
  qualityState: DataQualityState;
}

export interface PhysicalTopologyGraph {
  graphId: string;
  connectionRefs: string[];
  elementRefs: string[];
}

export interface EngineeringElementBase {
  refId: string;
  elementKind: EngineeringElementKind;
  engineeringRole: EngineeringRole;
  functionalRole: FunctionalRole;
  networkPosition: NetworkPosition;
  voltageDomain: VoltageDomain;
  completeness: EngineeringCompleteness;
  reportEligibility: ReportEligibilityByKind;
  dataQualityState: DataQualityState;
  ports: EngineeringPort[];
  terminals: EngineeringTerminal[];
}

export interface GpzSemanticStructure {
  gpzRefId: string;
  modelKind: 'UPROSZCZONY_PARAMETRY_NA_SZYNIE_SN' | 'PELNY_WN_TRANSFORMATOR_SN';
  supplyNodeRefId: string;
  supplyShortCircuitModelRefId: string | null;
  hvMvTransformers: string[];
  mvSwitchgearRefId: string;
  busbarSystemRefId: string;
  busbarSectionRefs: string[];
  incomingBayRefs: string[];
  outgoingBayRefs: string[];
  couplerBayRefs: string[];
  measurementBayRefs: string[];
  sourceBayRefs: string[];
  groundingModelRefId: string | null;
}

export interface MvBayFunctionPolicy {
  bayFunction: MvBayFunction;
  mayFeedMvSegment: boolean;
  mayFeedTransformer: boolean;
  mayConnectBusbarSections: boolean;
  mayMeasureBusbarVoltage: boolean;
  mayConnectSource: boolean;
  mayRemainUnconnected: boolean;
  requiresMainSwitchingDevice: boolean;
  allowedMainSwitchingDeviceRoles: EngineeringRole[];
  requiresProtection: boolean;
  requiresCurrentTransformer: boolean;
  requiresVoltageTransformer: boolean;
  requiresSourceComplianceProfile: boolean;
  allowedOutgoingPortRoles: PortRole[];
}

export interface GenericEngineeringElement extends EngineeringElementBase {
  nominalVoltageKv?: number | null;
  structure?: GpzSemanticStructure;
  transformerKind?: TransformerKind;
  highSide?: EngineeringSide;
  lowSide?: EngineeringSide;
  ratedPower?: EngineeringQuantity | null;
  voltageRatio?: string | null;
  vectorGroup?: string | null;
  shortCircuitVoltagePercent?: number | null;
  zeroSequenceModelRefId?: string | null;
  bayFunction?: MvBayFunction;
  connectedBusbarSectionRefId?: string | null;
  mainSwitchingDeviceRefId?: string | null;
  outgoingPortRefId?: string | null;
}

export interface TransformerElement extends EngineeringElementBase {
  elementKind: 'TRANSFORMER';
  transformerKind: TransformerKind;
  highSide: EngineeringSide;
  lowSide: EngineeringSide;
  ratedPower: EngineeringQuantity | null;
  voltageRatio: string | null;
  vectorGroup: string;
  shortCircuitVoltagePercent: number | null;
  zeroSequenceModelRefId: string | null;
}

export type EngineeringElement = GenericEngineeringElement | TransformerElement;

export interface EngineeringSemanticModel {
  schemaVersion: string;
  projectRefId: string;
  modelId: string;
  enmSnapshotRef: string;
  catalogSnapshotRef: string;
  usedCatalogMaterializationHash: string;
  semanticVersion: string;
  semanticHash: string;
  ontologyVersion: string;
  ontologyHash: string;
  roleRegistryHash: string;
  connectionRuleRegistryHash: string;
  generatedAt: string;
  elements: EngineeringElement[];
  connections: EngineeringConnection[];
  physicalTopologyGraph: PhysicalTopologyGraph;
  earthingContexts: EarthingContext[];
}

export interface SemanticRepairAction {
  actionId: string;
  labelPl: string;
  targetElementRefId: string | null;
  domainOperationKind: string | null;
  opensScreenId: string | null;
  opensInspectorSection: string | null;
  requiredPermission: string | null;
  visibilityPolicy?: 'POKAZ_ZAWSZE' | 'POKAZ_JAKO_ZABLOKOWANA' | 'UKRYJ_BEZ_UPRAWNIEN';
}

export interface EngineeringSemanticViolation {
  code: string;
  severity:
    | 'INFORMACJA'
    | 'OSTRZEZENIE'
    | 'BLAD'
    | 'BLOKADA_OBLICZEN'
    | 'BLOKADA_RAPORTU'
    | 'BLOKADA_RENDERU';
  elementRefId: string | null;
  messagePl: string;
  technicalCausePl: string;
  repairActionPl: string;
  repairActions: SemanticRepairAction[];
  affectedAreas: ('SLD' | 'INSPEKTOR' | 'MENU' | 'OBLICZENIA' | 'RAPORT' | 'GOTOWOSC')[];
  params?: Record<string, unknown>;
}

export interface EngineeringDiagnosticsProjection {
  schemaVersion: string;
  projectRefId: string;
  semanticHash: string;
  diagnosticsRuleRegistryHash: string;
  diagnosticsHash: string;
  generatedAt: string;
  violations: EngineeringSemanticViolation[];
}

export interface CalculationInputSnapshot {
  schemaVersion: string;
  projectRefId: string;
  inputSnapshotRefId: string;
  semanticHash: string;
  catalogSnapshotRef: string;
  materializationRefs: string[];
  caseRefId: string;
  caseHash: string;
  variantRefId: string;
  variantHash: string;
  switchingSnapshotRefId: string;
  switchingSnapshotHash: string;
  analysisType: CalculationAnalysisType;
  solverKind: string;
  solverSettingsHash: string;
  assumptionsHash: string;
  calculationGraphHash: string;
  generatedAt: string;
  inputHash: string;
}

export interface CalculationNode {
  nodeId: string;
  elementRefIds: string[];
}

export interface CalculationBranch {
  branchId: string;
  elementRefIds: string[];
}

export interface SolverEligibility {
  eligible: boolean;
  blockedReasonCodes: string[];
}

export interface CalculationTopologyProjection {
  schemaVersion: string;
  projectRefId: string;
  graphId: string;
  semanticHash: string;
  inputSnapshotRefId: string;
  caseRefId: string;
  caseHash: string;
  variantRefId: string;
  variantHash: string;
  switchingSnapshotRefId: string;
  switchingSnapshotHash: string;
  analysisType: CalculationAnalysisType;
  solverKind: string;
  solverSettingsHash: string;
  assumptionsHash: string;
  calculationGraphHash: string;
  includedElementRefs: string[];
  excludedElementRefs: string[];
  equivalentNodes: CalculationNode[];
  equivalentBranches: CalculationBranch[];
  solverEligibility: SolverEligibility;
  missingDataCodes: string[];
}

export interface ResultBinding {
  schemaVersion: string;
  projectRefId: string;
  resultId: string;
  resultHash: string;
  elementRefId: string;
  semanticHash: string;
  inputSnapshotRefId: string;
  inputHash: string;
  caseRefId: string;
  caseHash: string;
  variantRefId: string;
  variantHash: string;
  switchingSnapshotRefId: string;
  switchingSnapshotHash: string;
  catalogSnapshotRef: string;
  usedCatalogMaterializationHash: string;
  analysisType: CalculationAnalysisType;
  resultKind: ResultKind;
  qualityState: DataQualityState;
  freshnessState: ResultFreshnessState;
  proofRefId: string | null;
  reportEligibility: ReportEligibilityByKind;
}

export interface ReportEligibilityProjection {
  schemaVersion: string;
  projectRefId: string;
  semanticHash: string;
  readinessHash: string;
  reportRuleRegistryHash: string;
  reportEligibilityHash: string;
  elementReportStatuses: Record<string, ReportEligibilityByKind>;
  resultReportStatuses: Record<string, ReportEligibilityByKind>;
  proofReportStatuses: Record<string, ReportEligibilityByKind>;
  reportPackageStatuses: Record<ReportKind, ReportEligibility>;
}

export interface LegacySemanticMapping {
  enmRefId: string;
  semanticElementRefId: string | null;
  status: LegacySemanticMappingStatus;
  completeness: EngineeringCompleteness;
  reportEligibility: ReportEligibilityByKind;
  canRenderProduction: boolean;
  canCalculate: boolean;
  canReport: boolean;
  recognizedFields: string[];
  missingFields: string[];
  violationCodes: string[];
}

export interface SemanticDiagnosticsReport {
  schemaVersion: string;
  projectRefId: string;
  semanticHash: string;
  diagnosticsHash: string;
  generatedAt: string;
  totals: {
    enmElements: number;
    semanticElements: number;
    sldSymbols: number;
    violations: number;
    legacyMappings: number;
  };
  enmElementsWithoutSemanticElement: string[];
  semanticElementsWithoutRole: string[];
  semanticElementsWithoutPorts: string[];
  semanticElementsWithoutNetworkPosition: string[];
  semanticElementsWithoutCatalogOrEquivalent: string[];
  enmElementsNotProductionRenderable: string[];
  elementsRenderedAsSketch: string[];
  elementsRenderedAsSemanticBlock: string[];
  legacyMappings: LegacySemanticMapping[];
  legacySilentPromotionRefIds: string[];
}

export interface SldSymbolInstance {
  symbolId: string;
  elementRefId: string;
  semanticHash: string;
  elementKind: EngineeringElementKind;
  engineeringRole: EngineeringRole;
  visibilityStatus: SldVisibilityStatus;
  renderClass: SldRenderClass;
  rendererKey: SldRendererKey;
  lodLevel: SldDetailLevel;
}

export interface SldRoute {
  routeId: string;
  connectionId: string;
  semanticHash: string;
  pathPoints: { x: number; y: number }[];
  routeClass: 'TOR_MOCY' | 'TOR_POMIAROWY' | 'TOR_STEROWNICZY' | 'TOR_LOGICZNY';
}

export interface SldLabel {
  labelId: string;
  elementRefId: string;
  text: string;
}

export interface SldOverlayMarker {
  markerId: string;
  elementRefId: string;
}

export interface SldOverlayLabel {
  labelId: string;
  elementRefId: string;
  text: string;
}

export interface SldBaseProjectionViewModel {
  schemaVersion: string;
  projectRefId: string;
  semanticHash: string;
  rendererRegistryHash: string;
  layoutRegistryHash: string;
  lodPolicyHash: string;
  viewHash: string;
  symbols: SldSymbolInstance[];
  routes: SldRoute[];
  labels: SldLabel[];
}

export interface SldOverlayProjection {
  schemaVersion: string;
  projectRefId: string;
  overlayId: string;
  semanticHash: string;
  baseViewHash: string;
  resultSetRefId: string | null;
  resultHash: string | null;
  inputSnapshotRefId: string | null;
  overlayKind: SldOverlayKind;
  overlayHash: string;
  markers: SldOverlayMarker[];
  labels: SldOverlayLabel[];
}

export const REPORT_KIND_ORDER: ReportKind[] = [
  'RAPORT_TECHNICZNY',
  'RAPORT_OSD',
  'RAPORT_AUDYTOWY',
  'RAPORT_ZGODNOSCI_ZRODLA',
  'RAPORT_ZABEZPIECZEN',
];

export function defaultReportEligibility(status: ReportEligibility): ReportEligibilityByKind {
  return {
    RAPORT_TECHNICZNY: status,
    RAPORT_OSD: status,
    RAPORT_AUDYTOWY: status,
    RAPORT_ZGODNOSCI_ZRODLA: status,
    RAPORT_ZABEZPIECZEN: status,
  };
}
