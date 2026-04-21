/**
 * Compare Utilities — PR-SLD-08
 *
 * Narzędzia do porównywania pól elementów w inspektorze SLD.
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Porównanie właściwości (120% CANONICAL)
 * - sld_rules.md § G.1: Deterministyczne porównanie
 *
 * FEATURES:
 * - Porównanie wartości pól
 * - Wykrywanie różnic
 * - Sortowanie deterministyczne
 * - 100% READ-ONLY (brak mutacji)
 *
 * 100% POLISH UI
 */

import type { InspectorPropertySection } from '../types';
import type {
  ComparePropertySection,
  ComparePropertyField,
  FieldDiffStatus,
  CompareElement,
} from './types';

// =============================================================================
// PORÓWNANIE WARTOŚCI
// =============================================================================

/**
 * Porównuje dwie wartości i zwraca status różnicy.
 *
 * INVARIANT: Porównanie jest symetryczne i deterministyczne.
 */
export function compareValues(
  valueA: string | number | boolean | null | undefined,
  valueB: string | number | boolean | null | undefined
): FieldDiffStatus {
  // Normalizuj undefined do null
  const normalizedA = valueA === undefined ? null : valueA;
  const normalizedB = valueB === undefined ? null : valueB;

  // Brak wartości
  if (normalizedA === null && normalizedB === null) {
    return 'equal';
  }
  if (normalizedA === null) {
    return 'missing_a';
  }
  if (normalizedB === null) {
    return 'missing_b';
  }

  // Porównanie typów
  if (typeof normalizedA !== typeof normalizedB) {
    return 'different';
  }

  // Porównanie wartości liczbowych (z tolerancją dla zaokrągleń)
  if (typeof normalizedA === 'number' && typeof normalizedB === 'number') {
    const epsilon = 1e-9;
    return Math.abs(normalizedA - normalizedB) < epsilon ? 'equal' : 'different';
  }

  // Porównanie pozostałych typów
  return normalizedA === normalizedB ? 'equal' : 'different';
}

/**
 * Sprawdza czy status oznacza różnicę.
 */
export function isDifferent(status: FieldDiffStatus): boolean {
  return status !== 'equal';
}

// =============================================================================
// PORÓWNANIE SEKCJI
// =============================================================================

/**
 * Porównuje dwie sekcje właściwości i tworzy sekcję porównawczą.
 *
 * INVARIANT:
 * - Kolejność pól jest deterministyczna (zachowuje kolejność z sekcji A)
 * - Pola obecne tylko w B są dodawane na końcu (sortowane po kluczu)
 */
export function compareSections(
  sectionA: InspectorPropertySection,
  sectionB: InspectorPropertySection | null
): ComparePropertySection {
  const fieldsMap = new Map<string, ComparePropertyField>();

  // Przetwórz pola z sekcji A
  for (const fieldA of sectionA.fields) {
    const fieldB = sectionB?.fields.find((f) => f.key === fieldA.key) ?? null;
    const diffStatus = fieldB
      ? compareValues(fieldA.value, fieldB.value)
      : 'missing_b';

    fieldsMap.set(fieldA.key, {
      key: fieldA.key,
      label: fieldA.label,
      valueA: fieldA.value,
      valueB: fieldB?.value ?? null,
      unit: fieldA.unit || fieldB?.unit,
      diffStatus,
      source: fieldA.source || fieldB?.source,
    });
  }

  // Dodaj pola obecne tylko w sekcji B
  if (sectionB) {
    const keysInA = new Set(sectionA.fields.map((f) => f.key));
    const onlyInB = sectionB.fields
      .filter((f) => !keysInA.has(f.key))
      .sort((a, b) => a.key.localeCompare(b.key));

    for (const fieldB of onlyInB) {
      fieldsMap.set(fieldB.key, {
        key: fieldB.key,
        label: fieldB.label,
        valueA: null,
        valueB: fieldB.value,
        unit: fieldB.unit,
        diffStatus: 'missing_a',
        source: fieldB.source,
      });
    }
  }

  // Konwertuj mapę na tablicę (zachowując kolejność)
  const fields: ComparePropertyField[] = [];

  // Najpierw pola z A (w oryginalnej kolejności)
  for (const fieldA of sectionA.fields) {
    const compareField = fieldsMap.get(fieldA.key);
    if (compareField) {
      fields.push(compareField);
    }
  }

  // Potem pola tylko z B (sortowane)
  if (sectionB) {
    const keysInA = new Set(sectionA.fields.map((f) => f.key));
    for (const fieldB of sectionB.fields) {
      if (!keysInA.has(fieldB.key)) {
        const compareField = fieldsMap.get(fieldB.key);
        if (compareField) {
          fields.push(compareField);
        }
      }
    }
  }

  // Sprawdź czy są różnice
  const hasDifferences = fields.some((f) => isDifferent(f.diffStatus));

  return {
    id: sectionA.id,
    label: sectionA.label,
    fields,
    hasDifferences,
    collapsed: sectionA.collapsed,
  };
}

/**
 * Porównuje dwie listy sekcji i tworzy listę sekcji porównawczych.
 *
 * INVARIANT:
 * - Kolejność sekcji jest deterministyczna (zachowuje kolejność z sectionsA)
 * - Sekcje obecne tylko w B są dodawane na końcu (sortowane po id)
 */
export function compareAllSections(
  sectionsA: InspectorPropertySection[],
  sectionsB: InspectorPropertySection[]
): ComparePropertySection[] {
  const result: ComparePropertySection[] = [];
  const sectionsBMap = new Map(sectionsB.map((s) => [s.id, s]));
  const processedIds = new Set<string>();

  // Przetwórz sekcje z A
  for (const sectionA of sectionsA) {
    const sectionB = sectionsBMap.get(sectionA.id) ?? null;
    result.push(compareSections(sectionA, sectionB));
    processedIds.add(sectionA.id);
  }

  // Dodaj sekcje obecne tylko w B
  const onlyInB = sectionsB
    .filter((s) => !processedIds.has(s.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const sectionB of onlyInB) {
    // Utwórz sekcję porównawczą z pustą sekcją A
    const emptyA: InspectorPropertySection = {
      id: sectionB.id,
      label: sectionB.label,
      fields: [],
    };
    result.push(compareSections(emptyA, sectionB));
  }

  return result;
}

// =============================================================================
// SORTOWANIE DETERMINISTYCZNE
// =============================================================================

/**
 * Sortuje elementy w kolejności deterministycznej (po elementId).
 *
 * INVARIANT: Ten sam zestaw elementów zawsze daje tę samą kolejność.
 *
 * @returns Tuple [elementA, elementB] gdzie elementA.elementId < elementB.elementId
 */
export function sortElementsForCompare(
  element1: CompareElement,
  element2: CompareElement
): [CompareElement, CompareElement] {
  if (element1.elementId.localeCompare(element2.elementId) <= 0) {
    return [element1, element2];
  }
  return [element2, element1];
}

// =============================================================================
// STATYSTYKI PORÓWNANIA
// =============================================================================

/**
 * Zlicza całkowitą liczbę różnic w sekcjach porównawczych.
 */
export function countTotalDifferences(sections: ComparePropertySection[]): number {
  let count = 0;
  for (const section of sections) {
    for (const field of section.fields) {
      if (isDifferent(field.diffStatus)) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Sprawdza czy wszystkie pola są identyczne.
 */
export function areAllFieldsEqual(sections: ComparePropertySection[]): boolean {
  return countTotalDifferences(sections) === 0;
}

// =============================================================================
// FORMATOWANIE
// =============================================================================

/**
 * Formatuje wartość liczbową z polskim formatowaniem.
 */
export function formatNumber(value: number | null | undefined, decimals = 3): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('pl-PL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Formatuje wartość boolean na polski tekst.
 */
export function formatBoolean(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value ? 'Tak' : 'Nie';
}

/**
 * Formatuje dowolną wartość do wyświetlenia.
 */
export function formatValue(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return formatBoolean(value);
  if (typeof value === 'number') return formatNumber(value);
  return String(value);
}

/**
 * Zwraca odpowiednią formę słowa "różnica" w zależności od liczby.
 */
export function getDifferenceLabel(count: number): string {
  if (count === 1) return 'różnica';
  if (count >= 2 && count <= 4) return 'różnice';
  return 'różnic';
}
