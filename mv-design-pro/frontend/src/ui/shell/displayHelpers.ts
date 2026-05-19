/**
 * displayHelpers — formatowanie identyfikatorów technicznych dla UI.
 *
 * Wyekstrahowane z `CanonicalLayoutV3.tsx:120-130` jako wspólny moduł.
 * Eliminuje "szum programisty" (UUID/hex/SHA stringi) widoczne dla
 * inżyniera.
 *
 * Reguła:
 *   - Nazwa human-readable → pokazuj nazwę
 *   - Technical ID (UUID/hex16/E2E_*) → pokaż "Element #ABCD1234"
 *   - Pusty/brak → fallback per kontekst
 */

/**
 * Wykrywa technical identifier (UUID/SHA/hex16/E2E_).
 *
 * Pattern:
 *   - UUID: `12345678-1234-1234-1234-123456789012`
 *   - E2E test ID: `E2E_xxx`, `E2E-xxx`
 *   - Hex 16+: `0123456789abcdef`
 */
export function looksLikeTechnicalId(value: string | null | undefined): boolean {
  if (!value) return false;
  const t = value.trim();
  if (t.length === 0) return false;
  return /[0-9a-f]{8}-[0-9a-f]{4}/i.test(t)
    || /^E2E[_-]/i.test(t)
    || /^[0-9a-f]{16,}$/i.test(t);
}

/**
 * Formatuje nazwę projektu dla wyświetlenia.
 *
 * - Nazwa nie-techniczna → zwraca nazwę
 * - Nazwa wygląda jak technical ID + istnieje ID → "Projekt bez nazwy"
 * - Brak nazwy + brak ID → "—" (semantyczny "no data")
 */
export function projectDisplayName(
  name: string | null | undefined,
  id: string | null | undefined,
): string {
  if (name && !looksLikeTechnicalId(name)) return name;
  if (id) return 'Projekt bez nazwy';
  return '—';
}

/**
 * Formatuje display ID dla element-level wyświetleń (Inspector, Tree).
 *
 * - `name` nie-technical → zwraca name
 * - `name` to technical ID lub brak → "Element #ABCD1234" (8 hex chars
 *   z `id`)
 * - Oba puste → `fallback` (domyślnie "—")
 *
 * Użycie:
 *   <Field label="Oznaczenie" value={formatDisplayId(elem.id, elem.name)} />
 *
 * Pełen ID pozostaje dostępny dla developerów przez data-* atrybuty
 * lub tooltip.
 */
export function formatDisplayId(
  id: string | null | undefined,
  name: string | null | undefined,
  fallback: string = '—',
): string {
  if (name && !looksLikeTechnicalId(name)) return name;
  if (id) {
    const trimmed = id.trim();
    if (trimmed.length === 0) return fallback;
    // Usuń myślniki i wez 8 chars hex.
    const condensed = trimmed.replace(/-/g, '');
    const head = condensed.slice(0, 8).toUpperCase();
    return `Element #${head}`;
  }
  return fallback;
}

/**
 * Sanitize wartość dla wyświetlenia w field (filtruje technical IDs
 * gdy są bezpośrednio przekazane).
 *
 * Użycie: zamień `<Field value={raw}/>` na `<Field value={sanitizeDisplayValue(raw)}/>`
 * gdy `raw` może być technical ID.
 */
export function sanitizeDisplayValue(
  value: string | null | undefined,
  options?: { readonly hideTechnicalIds?: boolean; readonly fallback?: string },
): string {
  const fallback = options?.fallback ?? '—';
  if (value == null || value === '') return fallback;
  const trimmed = String(value).trim();
  if (trimmed === '') return fallback;
  if ((options?.hideTechnicalIds ?? true) && looksLikeTechnicalId(trimmed)) {
    return formatDisplayId(trimmed, null, fallback);
  }
  return trimmed;
}
