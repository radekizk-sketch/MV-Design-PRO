/**
 * profileSerializers — deterministic JSON canonicalization dla profili PV/BESS/FW.
 *
 * KRYTYCZNE: snapshot hash zależy od kanonicznej serializacji.
 * - Klucze obiektów sortowane lexycznie (rekursywnie).
 * - Floaty kwantyzowane do 6 miejsc po przecinku (round-half-even).
 * - Tablice zachowują kolejność (znaczy ona dla profili czasowych).
 *
 * UŻYCIE:
 *   const json = canonicalizeProfile(profile);
 *   const hash = await sha256Hex(json);
 *
 * Round-trip property: parseProfile(canonicalize(p)) ≡ p (modulo float quantization).
 */

/** Liczba miejsc po przecinku zachowanych dla floatów (6 = mikro-jednostka). */
export const FLOAT_PRECISION = 6;

/**
 * Kwantyzacja floata do `FLOAT_PRECISION` miejsc.
 * Używa `Math.round` (round-half-away-from-zero) — deterministyczne i czytelne.
 *
 * NaN i Infinity są niedozwolone — rzucają błąd (profile muszą być finite).
 *
 * Idempotency: quantizeFloat(quantizeFloat(x)) === quantizeFloat(x).
 */
export function quantizeFloat(x: number): number {
  if (!Number.isFinite(x)) {
    throw new Error(`profileSerializers: non-finite value ${x} not allowed`);
  }
  const factor = 10 ** FLOAT_PRECISION;
  return Math.round(x * factor) / factor;
}

/**
 * Rekursywna kanonikalizacja:
 * - obiekty: sort kluczy ASC, rekurencja na wartości
 * - tablice: rekurencja na elementy, kolejność zachowana
 * - liczby: kwantyzacja
 * - null/string/bool: pass-through
 * - undefined: pomijane (jak JSON.stringify)
 */
type CanonValue =
  | null
  | boolean
  | string
  | number
  | CanonValue[]
  | { [key: string]: CanonValue };

export function canonicalizeValue(value: unknown): CanonValue {
  if (value === null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return quantizeFloat(value);
  if (Array.isArray(value)) {
    return value.filter((v) => v !== undefined).map((v) => canonicalizeValue(v));
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const out: { [key: string]: CanonValue } = {};
    for (const k of sortedKeys) {
      const v = obj[k];
      if (v === undefined) continue;
      out[k] = canonicalizeValue(v);
    }
    return out;
  }
  // undefined / function / symbol — niedozwolone w profilu
  throw new Error(`profileSerializers: unsupported value type ${typeof value}`);
}

/**
 * Deterministyczna serializacja profilu do string'a.
 * Wynik jest stabilny przy round-trip i bezpieczny do hashowania.
 */
export function canonicalizeProfile(value: unknown): string {
  return JSON.stringify(canonicalizeValue(value));
}

/**
 * Walidacja monotoniczności tablicy punktów po wybranym kluczu.
 * Zwraca null gdy OK, lub string z opisem naruszenia.
 *
 * Tryby:
 *   - `asc`: strict ascending (curr > prev) — typowe dla Q(U), cos φ(P)
 *   - `desc`: strict descending
 *   - `asc_non_strict`: curr ≥ prev — dopuszcza duplikaty (FRT step changes)
 */
export function validateMonotonic<K extends string>(
  points: ReadonlyArray<{ readonly [P in K]: number }>,
  key: K,
  order: 'asc' | 'desc' | 'asc_non_strict',
): string | null {
  if (points.length < 2) return null;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1][key];
    const curr = points[i][key];
    if (order === 'asc' && !(curr > prev)) {
      return `Monotonicity violation at index ${i}: ${key}[${i}]=${curr} ≤ ${key}[${i - 1}]=${prev} (expected strictly ascending)`;
    }
    if (order === 'asc_non_strict' && !(curr >= prev)) {
      return `Monotonicity violation at index ${i}: ${key}[${i}]=${curr} < ${key}[${i - 1}]=${prev} (expected non-decreasing)`;
    }
    if (order === 'desc' && !(curr < prev)) {
      return `Monotonicity violation at index ${i}: ${key}[${i}]=${curr} ≥ ${key}[${i - 1}]=${prev} (expected strictly descending)`;
    }
  }
  return null;
}

/**
 * Walidacja, czy każda wartość liczbowa w tablicy jest w zakresie [min, max].
 * Zwraca null gdy OK, lub string z opisem naruszenia.
 */
export function validateRange<K extends string>(
  points: ReadonlyArray<{ readonly [P in K]: number }>,
  key: K,
  min: number,
  max: number,
): string | null {
  for (let i = 0; i < points.length; i += 1) {
    const v = points[i][key];
    if (!(v >= min && v <= max)) {
      return `Range violation at index ${i}: ${key}=${v} outside [${min}, ${max}]`;
    }
  }
  return null;
}
