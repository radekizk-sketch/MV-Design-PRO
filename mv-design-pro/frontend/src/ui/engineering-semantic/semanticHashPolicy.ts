export interface CanonicalHashPolicy<T> {
  schemaVersion: string;
  normalize(input: T): unknown;
  stableStringify(normalized: unknown): string;
  hash(normalized: unknown): string;
}

const DEFAULT_IGNORED_FIELDS = new Set([
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

const IDENTITY_KEYS = [
  'refId',
  'portId',
  'terminalId',
  'connectionId',
  'sideId',
  'graphId',
  'islandId',
  'nodeId',
  'branchId',
  'code',
  'actionId',
  'materializationId',
  'inputSnapshotRefId',
  'resultId',
  'symbolId',
  'routeId',
  'labelId',
  'overlayId',
] as const;

const ORDERED_ARRAY_FIELDS = new Set([
  'pathPoints',
  'primaryPath',
]);

export interface CanonicalHashPolicyOptions {
  ignoredFields?: readonly string[];
  numberPrecision?: number;
  prefix?: string;
}

export const DETERMINISTIC_HASH_IGNORED_FIELDS = [...DEFAULT_IGNORED_FIELDS].sort();

export function createCanonicalHashPolicy<T>(
  schemaVersion: string,
  options: CanonicalHashPolicyOptions = {},
): CanonicalHashPolicy<T> {
  const ignoredFields = new Set([
    ...DEFAULT_IGNORED_FIELDS,
    ...(options.ignoredFields ?? []),
  ]);
  const numberPrecision = options.numberPrecision ?? 12;
  const prefix = options.prefix ?? 'v12h';

  return {
    schemaVersion,
    normalize(input: T): unknown {
      return normalizeValue(input, ignoredFields, numberPrecision);
    },
    stableStringify(normalized: unknown): string {
      return JSON.stringify(normalized);
    },
    hash(normalized: unknown): string {
      return `${prefix}-${fnv1a32(JSON.stringify(normalized))}`;
    },
  };
}

export function canonicalHash<T>(
  input: T,
  schemaVersion = 'v12-semantic-v8',
  options: CanonicalHashPolicyOptions = {},
): string {
  const policy = createCanonicalHashPolicy<T>(schemaVersion, options);
  return policy.hash(policy.normalize(input));
}

export function canonicalNormalize<T>(
  input: T,
  options: CanonicalHashPolicyOptions = {},
): unknown {
  return createCanonicalHashPolicy<T>('v12-semantic-v8', options).normalize(input);
}

function normalizeValue(
  value: unknown,
  ignoredFields: ReadonlySet<string>,
  numberPrecision: number,
  parentKey?: string,
): unknown {
  if (value === undefined) {
    return null;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return String(value);
    }
    return Number(value.toFixed(numberPrecision));
  }
  if (typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    const normalized = value.map((item) => normalizeValue(item, ignoredFields, numberPrecision));
    if (parentKey && ORDERED_ARRAY_FIELDS.has(parentKey)) {
      return normalized;
    }
    return normalized.sort(compareCanonicalValues);
  }

  const source = value as Record<string, unknown>;
  const normalizedEntries = Object.keys(source)
    .filter((key) => !ignoredFields.has(key))
    .sort()
    .map((key) => [key, normalizeValue(source[key], ignoredFields, numberPrecision, key)] as const);

  return Object.fromEntries(normalizedEntries);
}

function compareCanonicalValues(a: unknown, b: unknown): number {
  const aKey = identityKey(a) ?? JSON.stringify(a);
  const bKey = identityKey(b) ?? JSON.stringify(b);
  return aKey.localeCompare(bKey);
}

function identityKey(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const object = value as Record<string, unknown>;
  if (typeof object.code === 'string' && typeof object.elementRefId === 'string') {
    return `${object.code}:${object.elementRefId}`;
  }
  if (typeof object.variantRefId === 'string' && typeof object.switchingSnapshotRefId === 'string') {
    const analysisType = typeof object.analysisType === 'string' ? object.analysisType : '';
    return `${object.variantRefId}:${object.switchingSnapshotRefId}:${analysisType}`;
  }

  for (const key of IDENTITY_KEYS) {
    const candidate = object[key];
    if (typeof candidate === 'string') {
      return candidate;
    }
  }

  return null;
}

function fnv1a32(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
