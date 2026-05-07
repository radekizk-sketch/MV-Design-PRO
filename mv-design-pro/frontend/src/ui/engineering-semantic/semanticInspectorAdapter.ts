export type VoltageDomain = 'WN' | 'SN' | 'NN' | 'DC' | 'POMIAR' | 'STEROWANIE' | 'LOGIKA';

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

export type EngineeringElementKind = string;
export type EngineeringRole = string;
export type FunctionalRole = string;

export type ReportEligibilityByKind = Record<ReportKind, ReportEligibility>;

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

export interface EngineeringPort {
  portId: string;
  role: string;
  voltageDomain: VoltageDomain;
  nominalVoltageKv: number | null;
  phaseSystem: string;
  connectionSide: string;
  connectionPolicyRef: string;
}

export interface EngineeringElementForInspector {
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
}

export interface EngineeringSemanticModelForInspector {
  semanticHash: string;
  elements: EngineeringElementForInspector[];
}

export type SemanticInspectorCardStatus = 'SEMANTYKA_OK' | 'BLOKADA_SEMANTYCZNA';

export interface SemanticInspectorPortView {
  portId: string;
  role: string;
  voltageDomain: VoltageDomain;
  nominalVoltageKv: number | null;
  phaseSystem: string;
  connectionSide: string;
  connectionPolicyRef: string;
}

export interface SemanticInspectorPositionRow {
  key: keyof NetworkPosition;
  labelPl: string;
  value: string;
}

export interface SemanticInspectorReportRow {
  reportKind: ReportKind;
  status: ReportEligibility;
}

export interface SemanticInspectorCardModel {
  status: SemanticInspectorCardStatus;
  titlePl: string;
  semanticHash: string | null;
  refId: string;
  displayName: string;
  elementKind: string | null;
  engineeringRole: string | null;
  functionalRole: string | null;
  voltageDomain: VoltageDomain | null;
  completeness: EngineeringCompleteness | null;
  dataQualityState: DataQualityState | null;
  reportEligibility: SemanticInspectorReportRow[];
  networkPosition: SemanticInspectorPositionRow[];
  ports: SemanticInspectorPortView[];
  messagePl: string | null;
  repairActionPl: string | null;
  fallbackVisualLabel: string | null;
}

const REPORT_KIND_ORDER: ReportKind[] = [
  'RAPORT_TECHNICZNY',
  'RAPORT_OSD',
  'RAPORT_AUDYTOWY',
  'RAPORT_ZGODNOSCI_ZRODLA',
  'RAPORT_ZABEZPIECZEN',
];

const NETWORK_POSITION_LABELS: Record<keyof NetworkPosition, string> = {
  projectRefId: 'Projekt',
  parentRefId: 'Element nadrzędny',
  containerRefId: 'Kontener',
  voltageLevelRefId: 'Poziom napięcia',
  switchgearRefId: 'Rozdzielnia',
  busbarSectionRefId: 'Sekcja szyn',
  bayRefId: 'Pole',
  feederRefId: 'Ciąg / feeder',
  branchRefId: 'Odcinek',
  stationRefId: 'Stacja',
  orderIndex: 'Kolejność',
};

export interface BuildSemanticInspectorCardModelOptions {
  semanticModel: EngineeringSemanticModelForInspector | null;
  elementRefId: string | null;
  fallbackVisualLabel?: string | null;
}

export function buildSemanticInspectorCardModel({
  semanticModel,
  elementRefId,
  fallbackVisualLabel = null,
}: BuildSemanticInspectorCardModelOptions): SemanticInspectorCardModel {
  const refId = elementRefId ?? 'BRAK_WYBORU';
  const model = semanticModel;
  const element = model?.elements.find((candidate) => candidate.refId === elementRefId) ?? null;

  if (!element) {
    return {
      status: 'BLOKADA_SEMANTYCZNA',
      titlePl: 'Brak funkcji elektroenergetycznej',
      semanticHash: model?.semanticHash ?? null,
      refId,
      displayName: fallbackVisualLabel ?? 'Obiekt bez semantyki',
      elementKind: null,
      engineeringRole: null,
      functionalRole: null,
      voltageDomain: null,
      completeness: null,
      dataQualityState: null,
      reportEligibility: [],
      networkPosition: [],
      ports: [],
      messagePl:
        'Wybrany obiekt nie ma odpowiadającego elementu w modelu semantycznym albo projekcja semantyczna jest nieaktualna.',
      repairActionPl: 'Otwórz mapowanie semantyczne i przypisz funkcję elektroenergetyczną elementu.',
      fallbackVisualLabel,
    };
  }

  return {
    status: 'SEMANTYKA_OK',
    titlePl: 'Karta semantyczna',
    semanticHash: model?.semanticHash ?? null,
    refId: element.refId,
    displayName: buildDisplayName(element),
    elementKind: element.elementKind,
    engineeringRole: element.engineeringRole,
    functionalRole: element.functionalRole,
    voltageDomain: element.voltageDomain,
    completeness: element.completeness,
    dataQualityState: element.dataQualityState,
    reportEligibility: buildReportRows(element),
    networkPosition: buildNetworkPositionRows(element.networkPosition),
    ports: element.ports.map(mapPort),
    messagePl: null,
    repairActionPl: null,
    fallbackVisualLabel,
  };
}

function buildReportRows(element: EngineeringElementForInspector): SemanticInspectorReportRow[] {
  return REPORT_KIND_ORDER.map((reportKind) => ({
    reportKind,
    status: element.reportEligibility[reportKind],
  }));
}

function buildNetworkPositionRows(position: NetworkPosition): SemanticInspectorPositionRow[] {
  return (Object.keys(NETWORK_POSITION_LABELS) as Array<keyof NetworkPosition>).map((key) => ({
    key,
    labelPl: NETWORK_POSITION_LABELS[key],
    value: formatNullable(position[key]),
  }));
}

function mapPort(port: EngineeringPort): SemanticInspectorPortView {
  return {
    portId: port.portId,
    role: port.role,
    voltageDomain: port.voltageDomain,
    nominalVoltageKv: port.nominalVoltageKv,
    phaseSystem: port.phaseSystem,
    connectionSide: port.connectionSide,
    connectionPolicyRef: port.connectionPolicyRef,
  };
}

function formatNullable(value: string | number | null): string {
  if (value === null || value === '') {
    return '-';
  }
  return String(value);
}

function buildDisplayName(element: EngineeringElementForInspector): string {
  if (element.networkPosition.bayRefId) {
    return element.engineeringRole === 'LINE_FEEDER_BAY' ? 'Pole liniowe SN' : 'Pole rozdzielcze SN';
  }
  if (element.networkPosition.busbarSectionRefId) {
    return 'Sekcja szyn SN';
  }
  if (element.networkPosition.stationRefId) {
    return humanElementKind(element.elementKind);
  }
  return humanElementKind(element.elementKind);
}

function humanElementKind(value: string): string {
  const normalized = value.toUpperCase();
  if (normalized.includes('BAY')) return 'Pole rozdzielcze SN';
  if (normalized.includes('BUS')) return 'Sekcja szyn';
  if (normalized.includes('SUBSTATION') || normalized.includes('STATION')) return 'Stacja elektroenergetyczna';
  if (normalized.includes('LINE') || normalized.includes('CABLE')) return 'Odcinek sieci SN';
  if (normalized.includes('TRANSFORMER')) return 'Transformator';
  if (normalized.includes('SOURCE')) return 'Źródło zasilania';
  if (normalized.includes('LOAD')) return 'Odbiór';
  return 'Element sieci';
}
