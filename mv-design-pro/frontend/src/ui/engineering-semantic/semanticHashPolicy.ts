export interface CanonicalHashPolicy<T> {
  schemaVersion: string;
  normalize(input: T): unknown;
  stableStringify(normalized: unknown): string;
  hash(normalized: unknown): string;
}

const HASH_IGNORED_KEYS = new Set([
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
  'displayLabel',
  'text',
]);

export function normalizeForDeterministicHash(input: unknown): unknown {
  return normalizeValue(input);
}

function normalizeValue(value: unknown, parentKey?: string): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Number(value.toFixed(12)) : String(value);
  }
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    const normalized = value.map((item) => normalizeValue(item, parentKey));
    if (parentKey === 'pathPoints') return normalized;
    return normalized.sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
  }

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .filter((key) => !HASH_IGNORED_KEYS.has(key))
      .sort()
      .map((key) => [key, normalizeValue(record[key], key)] as const),
  );
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

export function stableHash(value: unknown): string {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `h${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function createCanonicalHashPolicy<T>(schemaVersion: string): CanonicalHashPolicy<T> {
  return {
    schemaVersion,
    normalize: normalizeForDeterministicHash,
    stableStringify,
    hash: stableHash,
  };
}

export const semanticHashPolicy = createCanonicalHashPolicy<unknown>('v12-hash-policy-v8');
