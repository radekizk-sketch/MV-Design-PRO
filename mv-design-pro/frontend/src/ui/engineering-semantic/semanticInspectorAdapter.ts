import type {
  DataQualityState,
  EngineeringCompleteness,
  EngineeringElement,
  EngineeringElementKind,
  EngineeringPort,
  EngineeringRole,
  EngineeringSemanticModel,
  FunctionalRole,
  NetworkPosition,
  ReportEligibility,
  ReportKind,
  VoltageDomain,
} from './types';

export type SemanticInspectorCardStatus =
  | 'SEMANTYKA_OK'
  | 'BLOKADA_SEMANTYCZNA';

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
  elementKind: EngineeringElementKind | null;
  engineeringRole: EngineeringRole | null;
  functionalRole: FunctionalRole | null;
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
  parentRefId: 'Element nadrzedny',
  containerRefId: 'Kontener',
  voltageLevelRefId: 'Poziom napiecia',
  switchgearRefId: 'Rozdzielnia',
  busbarSectionRefId: 'Sekcja szyn',
  bayRefId: 'Pole',
  feederRefId: 'Ciag / feeder',
  branchRefId: 'Odcinek',
  stationRefId: 'Stacja',
  orderIndex: 'Kolejnosc',
};

export interface BuildSemanticInspectorCardModelOptions {
  semanticModel: EngineeringSemanticModel | null;
  elementRefId: string | null;
  fallbackVisualLabel?: string | null;
}

export function buildSemanticInspectorCardModel({
  semanticModel,
  elementRefId,
  fallbackVisualLabel = null,
}: BuildSemanticInspectorCardModelOptions): SemanticInspectorCardModel {
  const refId = elementRefId ?? 'BRAK_WYBORU';
  const element = semanticModel?.elements.find((candidate) => candidate.refId === elementRefId) ?? null;

  if (!element) {
    return {
      status: 'BLOKADA_SEMANTYCZNA',
      titlePl: 'Brak funkcji elektroenergetycznej',
      semanticHash: semanticModel?.semanticHash ?? null,
      refId,
      displayName: refId,
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
        'Wybrany obiekt nie ma odpowiadajacego elementu w EngineeringSemanticModel albo projekcja semantyczna jest nieaktualna.',
      repairActionPl: 'Otworz mapowanie semantyczne i przypisz funkcje elektroenergetyczna elementu.',
      fallbackVisualLabel,
    };
  }

  return {
    status: 'SEMANTYKA_OK',
    titlePl: 'Karta semantyczna',
    semanticHash: semanticModel.semanticHash,
    refId: element.refId,
    displayName: element.refId,
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

function buildReportRows(element: EngineeringElement): SemanticInspectorReportRow[] {
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
