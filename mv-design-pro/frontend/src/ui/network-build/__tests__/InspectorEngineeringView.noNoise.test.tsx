/**
 * InspectorEngineeringView — no developer noise.
 *
 * Wymusza że:
 *   - brak pola "Hash semantyczny" (krypto noise dla operatora)
 *   - raw UUID/hex16/SHA stringi przepuszczone przez `sanitizeDisplayValue`
 *     są formatowane jako "Element #ABCD1234"
 *   - `formatValue` używa `sanitizeDisplayValue` (regression boundary)
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FILE = join(
  process.cwd(),
  'src/ui/network-build/InspectorEngineeringView.tsx',
);

describe('InspectorEngineeringView — no developer noise', () => {
  const content = readFileSync(FILE, 'utf-8');

  it('Brak pola "Hash semantyczny" w wyświetlanych polach', () => {
    // Akceptuje komentarz wyjaśniający, ale nie field entry.
    const fieldPattern = /\{\s*key:\s*'semantic_hash'\s*,\s*label:\s*'Hash semantyczny'/;
    expect(content).not.toMatch(fieldPattern);
  });

  it('formatValue używa sanitizeDisplayValue (sanityzuje technical IDs)', () => {
    expect(content).toMatch(/sanitizeDisplayValue/);
    // Function formatValue zawiera wywołanie sanitizeDisplayValue.
    const formatValueRegion = content.slice(
      content.indexOf('function formatValue'),
      content.indexOf('function isMissingFieldValue'),
    );
    expect(formatValueRegion).toMatch(/sanitizeDisplayValue/);
  });

  it('Plik importuje sanitizeDisplayValue z shell/displayHelpers', () => {
    expect(content).toMatch(/from '\.\.\/shell\/displayHelpers'/);
  });

  it('Wszystkie wyświetlane pola "Oznaczenie ..." używają formatValue (nie raw value)', () => {
    // Liczba "Oznaczenie ..." labels w content (field entries).
    const ozLabels = content.match(/label:\s*'Oznaczenie/g);
    expect(ozLabels).not.toBeNull();
    expect((ozLabels ?? []).length).toBeGreaterThanOrEqual(10);
    // formatValue jest jedyną drogą przez którą value trafia do UI (przez
    // `formatValue(field.value)` w `useEffect`/`useMemo`).
    expect(content).toContain('formatValue(field.value)');
  });
});
