import { withDiagnosticsHash } from './projections';
import { validateConnectionKindVoltageDomain, validateProductionConnection } from './ontology';
import type {
  EngineeringDiagnosticsProjection,
  EngineeringElement,
  EngineeringSemanticModel,
  EngineeringSemanticViolation,
  SemanticRepairAction,
} from './types';

export interface EngineeringDiagnosticsOptions {
  diagnosticsRuleRegistryHash?: string;
  generatedAt?: string;
}

const OPEN_SEMANTIC_MAPPING_ACTION: SemanticRepairAction = {
  actionId: 'OPEN_SEMANTIC_MAPPING',
  labelPl: 'Otworz mapowanie semantyczne',
  targetElementRefId: null,
  domainOperationKind: 'ASSIGN_SEMANTIC_ROLE',
  opensScreenId: 'DIAGNOSTYKA_SEMANTYCZNA',
  opensInspectorSection: 'Karta semantyczna',
  requiredPermission: 'semantic:edit',
  visibilityPolicy: 'POKAZ_JAKO_ZABLOKOWANA',
};

export function buildEngineeringDiagnosticsProjection(
  model: EngineeringSemanticModel,
  options: EngineeringDiagnosticsOptions = {},
): EngineeringDiagnosticsProjection {
  const violations: EngineeringSemanticViolation[] = [];

  for (const element of model.elements) {
    violations.push(...diagnoseElement(element));
  }

  for (const connection of model.connections) {
    for (const code of validateProductionConnection(connection)) {
      violations.push({
        code,
        severity: 'BLOKADA_OBLICZEN',
        elementRefId: elementRefFromPort(connection.fromPortId) ?? elementRefFromPort(connection.toPortId),
        messagePl: 'Polaczenie produkcyjne nie spelnia reguly semantycznej.',
        technicalCausePl: 'Brakuje reguly walidujacej albo rodzaj polaczenia nie jest zgodny z domena napieciowa.',
        repairActionPl: 'Popraw porty i reguly polaczenia w modelu semantycznym.',
        repairActions: [OPEN_SEMANTIC_MAPPING_ACTION],
        affectedAreas: ['SLD', 'OBLICZENIA', 'GOTOWOSC'],
        params: {
          connectionId: connection.connectionId,
          connectionKind: connection.connectionKind,
          voltageDomain: connection.voltageDomain,
        },
      });
    }

    if (!validateConnectionKindVoltageDomain(connection.connectionKind, connection.voltageDomain)) {
      violations.push({
        code: 'SEM-CONNECTION-002',
        severity: 'BLOKADA_OBLICZEN',
        elementRefId: elementRefFromPort(connection.fromPortId) ?? elementRefFromPort(connection.toPortId),
        messagePl: 'Rodzaj polaczenia nie jest zgodny z domena napieciowa.',
        technicalCausePl: 'TOR_MOCY, TOR_POMIAROWY, TOR_STEROWNICZY, TOR_LOGICZNY i POWIAZANIE_RAPORTOWE maja rozne reguly domen.',
        repairActionPl: 'Zmien connectionKind albo voltageDomain zgodnie z rejestrem reguly polaczen.',
        repairActions: [OPEN_SEMANTIC_MAPPING_ACTION],
        affectedAreas: ['SLD', 'OBLICZENIA', 'GOTOWOSC'],
        params: {
          connectionId: connection.connectionId,
          connectionKind: connection.connectionKind,
          voltageDomain: connection.voltageDomain,
        },
      });
    }
  }

  return withDiagnosticsHash({
    schemaVersion: 'v12-diagnostics-v1',
    projectRefId: model.projectRefId,
    semanticHash: model.semanticHash,
    diagnosticsRuleRegistryHash: options.diagnosticsRuleRegistryHash ?? 'diagnostics-rules-v8',
    generatedAt: options.generatedAt ?? '1970-01-01T00:00:00.000Z',
    violations: violations.sort((left, right) =>
      left.code.localeCompare(right.code) || (left.elementRefId ?? '').localeCompare(right.elementRefId ?? ''),
    ),
  });
}

function diagnoseElement(element: EngineeringElement): EngineeringSemanticViolation[] {
  const violations: EngineeringSemanticViolation[] = [];
  if (!element.refId || !element.engineeringRole || !element.elementKind) {
    violations.push({
      code: 'SEM-SLD-001',
      severity: 'BLOKADA_RENDERU',
      elementRefId: element.refId || null,
      messagePl: 'Element bez zdefiniowanej funkcji elektroenergetycznej.',
      technicalCausePl: 'Brakuje refId, elementKind albo engineeringRole.',
      repairActionPl: 'Przypisz funkcje elektroenergetyczna elementu.',
      repairActions: [OPEN_SEMANTIC_MAPPING_ACTION],
      affectedAreas: ['SLD', 'INSPEKTOR', 'MENU', 'GOTOWOSC'],
    });
  }

  const isPowerElement = [
    'BUSBAR_SECTION',
    'MV_BAY',
    'MV_CABLE_SEGMENT',
    'LV_CABLE_SEGMENT',
    'MV_OVERHEAD_SEGMENT',
    'TRANSFORMER',
    'SOURCE',
    'LV_LOAD',
  ].includes(element.elementKind);

  if (isPowerElement && element.ports.length === 0) {
    violations.push({
      code: 'SEM-PORT-001',
      severity: 'BLOKADA_RENDERU',
      elementRefId: element.refId,
      messagePl: 'Element toru mocy nie ma portow energetycznych.',
      technicalCausePl: 'Topologia semantyczna nie moze zostac zbudowana bez portow.',
      repairActionPl: 'Dodaj wymagane porty dla roli elementu.',
      repairActions: [OPEN_SEMANTIC_MAPPING_ACTION],
      affectedAreas: ['SLD', 'MENU', 'OBLICZENIA', 'GOTOWOSC'],
    });
  }

  return violations;
}

function elementRefFromPort(portId: string): string | null {
  const [ownerRef] = portId.split(':');
  return ownerRef || null;
}
