import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * GUARD KONTRAKTOWY — zakaz „0.00 spam" w widokach inżynierskich SLD.
 *
 * Definicja antypatternu:
 *   `(value ?? 0).toFixed(...)`           — domyśla zera, gdy brak danych
 *   `(value ?? 0).toLocaleString(...)`    — j.w.
 *   `(value || 0).toFixed(...)`           — j.w. (i błędny dla wartości 0)
 *
 * Zalecenie kanoniczne:
 *   `formatPolishValue(value, ...)`       z `ui/shared/formatPolishValue.ts`
 *
 * Patrz: docs/sld/SLD_CAD_SCADA_REBUILD.md §3 (zakaz 0.00).
 *
 * Test skanuje katalog `src/ui/sld*` (bo to widoki SLD są w briefie zaznaczone
 * jako te, które obecnie generują „ścianę zer"). Reszta repo zostanie
 * zmigrowana stopniowo w PR-1.x.
 */

const FRONTEND_SRC = join(__dirname, '..', '..');
const SLD_GLOB = [
  'ui/sld',
  'ui/sld-editor',
  'ui/sld-overlay',
  'ui/power-flow-results',
  'ui/wizard',
  'ui/results',
  'ui/results-browser',
  'ui/results-inspector',
  'ui/results-workspace',
  'ui/run-results-inspector',
  'ui/protection-results',
  'ui/protection-coordination',
  'ui/protection-curves',
  'ui/protection-diagnostics',
  'ui/voltage-profile',
  'ui/reference-patterns',
  'ui/proof',
];

interface Violation {
  file: string;
  line: number;
  snippet: string;
  pattern: string;
}

const FORBIDDEN_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  {
    name: '(... ?? 0).toFixed(',
    regex: /\?\?\s*0\s*\)\s*\.toFixed\s*\(/,
  },
  {
    name: '(... ?? 0).toLocaleString(',
    regex: /\?\?\s*0\s*\)\s*\.toLocaleString\s*\(/,
  },
  {
    name: '(... || 0).toFixed(',
    regex: /\|\|\s*0\s*\)\s*\.toFixed\s*\(/,
  },
];

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === '__tests__' || entry === 'node_modules' || entry.startsWith('.')) continue;
    const p = join(dir, entry);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      yield* walk(p);
    } else if (
      (entry.endsWith('.ts') || entry.endsWith('.tsx')) &&
      !entry.endsWith('.d.ts') &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('.test.tsx') &&
      !entry.endsWith('.spec.ts') &&
      !entry.endsWith('.spec.tsx')
    ) {
      yield p;
    }
  }
}

function scanFile(path: string): Violation[] {
  const content = readFileSync(path, 'utf8');
  const lines = content.split('\n');
  const violations: Violation[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.regex.test(line)) {
        violations.push({
          file: relative(FRONTEND_SRC, path),
          line: i + 1,
          snippet: line.trim().slice(0, 200),
          pattern: pattern.name,
        });
      }
    }
  }
  return violations;
}

describe('SLD: zakaz 0.00 spam (kanon CAD/SCADA rebuild)', () => {
  for (const sub of SLD_GLOB) {
    it(`${sub} — brak antypatternu (... ?? 0).toFixed / .toLocaleString`, () => {
      const root = join(FRONTEND_SRC, sub);
      const violations: Violation[] = [];
      for (const file of walk(root)) {
        violations.push(...scanFile(file));
      }
      if (violations.length > 0) {
        const message =
          `Znaleziono ${violations.length} naruszenie(ń) zakazu 0.00 spam:\n` +
          violations
            .map((v) => `  ${v.file}:${v.line}  [${v.pattern}]\n    ${v.snippet}`)
            .join('\n') +
          '\n\nUżyj formatPolishValue() z ui/shared/formatPolishValue.ts zamiast (value ?? 0).toFixed(...)' +
          '\nDokumentacja: docs/sld/SLD_CAD_SCADA_REBUILD.md §3.';
        // Wymuszamy czytelny komunikat błędu.
        expect(violations, message).toEqual([]);
      } else {
        expect(violations).toEqual([]);
      }
    });
  }
});
