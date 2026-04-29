export type ArchitectureGuardCode =
  | 'ARCH-SEMANTIC-CORE-001'
  | 'ARCH-SLD-ROUTE-001'
  | 'ARCH-POLICY-001'
  | 'ARCH-UI-SEMANTICS-001';

export interface ArchitectureGuardViolation {
  code: ArchitectureGuardCode;
  context: string;
  messagePl: string;
}

export interface EngineeringConnectionLike {
  connectionId: string;
}

export interface EngineeringSemanticModelLike {
  semanticHash?: string;
  connections?: EngineeringConnectionLike[];
}

export interface SldRouteLike {
  routeId: string;
  connectionId: string;
  pathPoints?: { x: number; y: number }[];
}

export interface SldViewLike {
  semanticHash?: string;
  routes?: SldRouteLike[];
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

const HASH_IGNORED_FIELDS = new Set([
  'generatedAt',
  'createdAt',
  'updatedAt',
  'buildStartedAt',
  'buildFinishedAt',
  'author',
  'messagePl',
  'technicalCausePl',
  'repairActionPl',
  'labelPl',
  'descriptionPl',
  'text',
]);

const UI_DERIVED_SEMANTICS_ALLOWED_CONTEXT_PATTERNS = [
  /(^|[\\/])__tests__([\\/]|$)/,
  /\.(test|spec)\.[tj]sx?$/,
  /(^|[\\/])legacy([\\/]|$)/,
  /(^|[\\/])__legacy__([\\/]|$)/,
] as const;

const UI_DERIVED_SEMANTICS_PATTERNS = [
  {
    id: 'data-element-type',
    pattern: /data-element-type/,
    messagePl: 'Kod produkcyjny nie moze wywodzic semantyki z atrybutu UI data-element-type.',
  },
  {
    id: 'elementName.includes',
    pattern: /\belementName\s*\.\s*includes\s*\(/,
    messagePl: 'Kod produkcyjny nie moze rozpoznawac semantyki po fragmencie elementName.',
  },
  {
    id: 'BUILDER_REGISTRY[elementType]',
    pattern: /\bBUILDER_REGISTRY\s*\[\s*elementType\s*\]/,
    messagePl: 'Kod produkcyjny nie moze wybierac semantyki przez lokalny BUILDER_REGISTRY[elementType].',
  },
  {
    id: 'pathPoints-topology',
    pattern: /\bpathPoints\b[\s\S]{0,160}\b(topolog\w*|graph|nodes?|edges?|connections?)\b|\b(topolog\w*|graph|nodes?|edges?|connections?)\b[\s\S]{0,160}\bpathPoints\b/i,
    messagePl: 'Kod produkcyjny nie moze budowac topologii z SldRoute.pathPoints. Topologia musi pochodzic z EngineeringConnection.',
  },
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
  model: EngineeringSemanticModelLike,
  view: SldViewLike,
  context = 'SldBaseProjectionViewModel.routes',
): ArchitectureGuardViolation[] {
  const connectionIds = new Set((model.connections ?? []).map((connection) => connection.connectionId));

  return (view.routes ?? [])
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

export function isUiDerivedSemanticsAllowedContext(context: string): boolean {
  return UI_DERIVED_SEMANTICS_ALLOWED_CONTEXT_PATTERNS.some((pattern) => pattern.test(context));
}

export function assertNoUiDerivedSemantics(
  sourceText: string,
  context = 'production-source',
): ArchitectureGuardViolation[] {
  if (isUiDerivedSemanticsAllowedContext(context)) {
    return [];
  }

  return UI_DERIVED_SEMANTICS_PATTERNS
    .filter(({ pattern }) => pattern.test(sourceText))
    .map(({ id, messagePl }) => ({
      code: 'ARCH-UI-SEMANTICS-001',
      context: `${context}:${id}`,
      messagePl,
    }));
}

export function normalizeProjectionForGuardHash(input: unknown): unknown {
  return normalizeValue(input);
}

function normalizeValue(value: unknown, parentKey?: string): unknown {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Number(value.toFixed(12)) : String(value);
  }
  if (typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    const normalized = value.map((item) => normalizeValue(item, parentKey));
    if (parentKey === 'pathPoints') {
      return normalized;
    }
    return normalized.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .filter((key) => !HASH_IGNORED_FIELDS.has(key))
      .sort()
      .map((key) => [key, normalizeValue(record[key], key)] as const),
  );
}
