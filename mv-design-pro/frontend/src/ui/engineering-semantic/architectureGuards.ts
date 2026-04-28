import type {
  EngineeringSemanticModel,
  SldBaseProjectionViewModel,
} from './types';

export type ArchitectureGuardCode =
  | 'ARCH-SEMANTIC-CORE-001'
  | 'ARCH-SLD-ROUTE-001'
  | 'ARCH-POLICY-001';

export interface ArchitectureGuardViolation {
  code: ArchitectureGuardCode;
  context: string;
  messagePl: string;
}

const SEMANTIC_CORE_FORBIDDEN_FIELDS = [
  'violations',
  'diagnosticsHash',
  'readinessHash',
  'reportEligibilityHash',
  'viewHash',
  'overlayHash',
  'inputHash',
] as const;

export function assertEngineeringSemanticModelCoreOnly(
  candidate: unknown,
  context = 'EngineeringSemanticModel',
): ArchitectureGuardViolation[] {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return [{
      code: 'ARCH-SEMANTIC-CORE-001',
      context,
      messagePl: 'Model semantyczny musi byc obiektem projekcji tylko do odczytu.',
    }];
  }

  const record = candidate as Record<string, unknown>;
  return SEMANTIC_CORE_FORBIDDEN_FIELDS
    .filter((field) => Object.prototype.hasOwnProperty.call(record, field))
    .map((field) => ({
      code: 'ARCH-SEMANTIC-CORE-001',
      context: `${context}.${field}`,
      messagePl: 'Diagnostyka, gotowosc, wejscie solvera, raportowalnosc i widok nie moga byc czescia rdzenia EngineeringSemanticModel.',
    }));
}

export function assertSldRoutesReferenceEngineeringConnections(
  model: EngineeringSemanticModel,
  view: Pick<SldBaseProjectionViewModel, 'routes'>,
  context = 'SldBaseProjectionViewModel.routes',
): ArchitectureGuardViolation[] {
  const connectionIds = new Set(model.connections.map((connection) => connection.connectionId));

  return view.routes
    .filter((route) => !connectionIds.has(route.connectionId))
    .map((route) => ({
      code: 'ARCH-SLD-ROUTE-001',
      context: `${context}.${route.routeId}`,
      messagePl: 'SldRoute.pathPoints nie tworzy topologii. Trasa SLD musi wskazywac istniejace EngineeringConnection.',
    }));
}

export function assertSemanticPolicyInputs(
  sourceText: string,
  context = 'policy-source',
): ArchitectureGuardViolation[] {
  const referencesBareElementType = /\bElementType\b|\belementType\s*[?:]/.test(sourceText);
  const referencesSemanticContract = /\bEngineeringElement\b|\bEngineeringSemanticModel\b|\bsemanticHash\b/.test(sourceText);

  if (referencesBareElementType && !referencesSemanticContract) {
    return [{
      code: 'ARCH-POLICY-001',
      context,
      messagePl: 'Polityka menu albo Inspektora nie moze rozpoznawac elementu po golym ElementType. Musi przyjmowac EngineeringElement, EngineeringSemanticModel albo semanticHash.',
    }];
  }

  return [];
}
