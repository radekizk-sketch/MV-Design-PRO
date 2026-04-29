import type {
  EngineeringDiagnosticsProjection,
  EngineeringSemanticModel,
  EngineeringSemanticViolation,
} from './types';
import { normalizeForDeterministicHash, stableHash } from './semanticHashPolicy';

const DIAGNOSTICS_RULE_REGISTRY_HASH = 'diagnostics-rules-v8';

function missingRoleViolation(elementRefId: string): EngineeringSemanticViolation {
  return {
    code: 'SEM-SLD-001',
    severity: 'BLOKADA_RENDERU',
    elementRefId,
    messagePl: 'Element bez zdefiniowanej funkcji elektroenergetycznej.',
    technicalCausePl: 'Obiekt nie ma roli w EngineeringSemanticModel.',
    repairActionPl: 'Otworz mapowanie semantyczne i przypisz funkcje elektroenergetyczna.',
    repairActions: [{
      actionId: 'OPEN_SEMANTIC_MAPPING',
      labelPl: 'Otworz mapowanie semantyczne',
      targetElementRefId: elementRefId,
      domainOperationKind: null,
      opensScreenId: 'DIAGNOSTYKA_SEMANTYCZNA',
      opensInspectorSection: 'Karta semantyczna',
      requiredPermission: null,
      visibilityPolicy: 'POKAZ_ZAWSZE',
    }],
    affectedAreas: ['SLD', 'INSPEKTOR', 'MENU'],
  };
}

export function buildEngineeringDiagnosticsProjection(
  semanticModel: EngineeringSemanticModel | null,
): EngineeringDiagnosticsProjection | null {
  if (!semanticModel) return null;

  const violations = semanticModel.elements.flatMap((element) => {
    if (!element.engineeringRole) {
      return [missingRoleViolation(element.refId)];
    }
    return [];
  });

  const diagnosticsCore = normalizeForDeterministicHash({
    semanticHash: semanticModel.semanticHash,
    diagnosticsRuleRegistryHash: DIAGNOSTICS_RULE_REGISTRY_HASH,
    violations: violations.map((violation) => ({
      code: violation.code,
      severity: violation.severity,
      elementRefId: violation.elementRefId,
      affectedAreas: violation.affectedAreas,
      repairActions: violation.repairActions.map((action) => ({ actionId: action.actionId })),
      params: violation.params ?? null,
    })),
  });

  return {
    schemaVersion: 'v12-diagnostics-v8',
    projectRefId: semanticModel.projectRefId,
    semanticHash: semanticModel.semanticHash,
    diagnosticsRuleRegistryHash: DIAGNOSTICS_RULE_REGISTRY_HASH,
    diagnosticsHash: stableHash(diagnosticsCore),
    generatedAt: new Date(0).toISOString(),
    violations,
  };
}
