import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { describe, expect, it } from 'vitest';

function collectUiSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory() && !entry.startsWith('__tests__') && entry !== 'node_modules') {
      files.push(...collectUiSourceFiles(fullPath));
      continue;
    }
    if (
      (entry.endsWith('.tsx') || entry.endsWith('.ts')) &&
      !entry.endsWith('.test.tsx') &&
      !entry.endsWith('.test.ts')
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

function extractUiStrings(content: string): { line: number; text: string }[] {
  const results: { line: number; text: string }[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('/**') ||
      trimmed.startsWith('import ') ||
      trimmed.startsWith('export type') ||
      trimmed.startsWith('export interface')
    ) {
      continue;
    }

    const attrMatches = line.matchAll(/(?:title|placeholder|aria-label|data-tooltip)=["']([^"']+)["']/g);
    for (const match of attrMatches) {
      results.push({ line: i + 1, text: match[1] });
    }

    const jsxTextMatch = line.match(/>([^<>{]+)</);
    if (jsxTextMatch && jsxTextMatch[1].trim().length > 0) {
      results.push({ line: i + 1, text: jsxTextMatch[1] });
    }

    const objectCopyMatches = line.matchAll(
      /\b(?:label|title|description|message|placeholder|reason|hiddenReason|nextStep|titlePl|descriptionPl)\s*:\s*['"`]([^'"`]+)['"`]/g,
    );
    for (const match of objectCopyMatches) {
      results.push({ line: i + 1, text: match[1] });
    }

    const publicFallbackMatches = line.matchAll(/(?:return|const\s+\w+\s*=)\s*['"`]([^'"`]+)['"`]/g);
    for (const match of publicFallbackMatches) {
      // Literały tras backendu ("/api/...") nie są napisami widocznymi dla
      // użytkownika — pythonowy strażnik terminologii (scripts/
      // ui_terminology_guard.py) już je pomija; ten skaner musi trzymać TĘ
      // SAMĄ semantykę (dwa strażniki, jedna intencja: terminologia UI, nie
      // nazwy zasobów API). Odbiór P0.9/P0.10: bez tego wyjątku stała
      // API_BASE='/api/nn-proof' czerwieniła test, choć nic z niej nie trafia
      // na ekran.
      if (match[1].startsWith('/api/')) {
        continue;
      }
      results.push({ line: i + 1, text: match[1] });
    }
  }

  return results;
}

// `skipUi2` — wyjątek zakresu ui2 (każdy z uzasadnieniem w komentarzu obok).
const FORBIDDEN_UI_TERMS: { term: RegExp; replacement: string; skipUi2?: boolean }[] = [
  // Pre-existing tokeny techniczne (DRIFT/BLOCKER/etc.)
  { term: /\bmaterializacj/i, replacement: 'Wczytanie parametrow z katalogu' },
  { term: /\brematerializuj/i, replacement: 'Odswiez parametry z katalogu' },
  { term: /\bbinding\b/i, replacement: 'Powiazanie z katalogiem' },
  { term: /\bnamespace\b/i, replacement: 'Kategoria katalogu' },
  { term: /\bdrift\b/i, replacement: 'Rozbieznosc katalogu' },
  { term: /\breadiness\b/i, replacement: 'Gotowosc obliczen' },
  { term: /\bfix.?actions?\b/i, replacement: 'Szybkie naprawy' },
  { term: /\bblocker\b/i, replacement: 'Brak wymaganych danych' },
  // Brief 1 §2 + Brief 2 §2 — 12 zakazanych tokenów PR-2
  { term: /\bmigawka\b/i, replacement: 'Wersja modelu' },
  { term: /\buruchomienie\b/i, replacement: 'Ostatnie obliczenie / Obliczenie' },
  { term: /\bprzypadek\b/i, replacement: 'Zakres obliczeń / Zakres i warunki obliczeń' },
  { term: /\bproof\b/i, replacement: 'uzasadnienie inżynierskie' },
  { term: /\brun\b/i, replacement: 'obliczenie' },
  { term: /\bsnapshot\b/i, replacement: 'wersja modelu' },
  { term: /\bfeeder\b/i, replacement: 'pole liniowe / odpływ' },
  { term: /\bbranch\b/i, replacement: 'gałąź / odgałęzienie' },
  { term: /\bcase\b/i, replacement: 'zakres obliczeń' },
  { term: /\bwizard\b/i, replacement: 'konfiguracja' },
  // WYJĄTEK ui2 (K10): „Kreator" to ugruntowana nazwa własna modułów kreatorów
  // ui2 (`ui2/kreatory/**` — „Kreator studium…", „kreator prowadzi krok po
  // kroku") potwierdzona w konwencji nazewniczej strings tych modułów; w starym
  // src/ui token pozostaje zakazany (tam kanonem jest „konfiguracja").
  { term: /\bkreator\b/i, replacement: 'konfiguracja', skipUi2: true },
  { term: /\bfallback\b/i, replacement: 'rozwiązanie zapasowe / brak danych' },
  { term: /\blegacy\b/i, replacement: 'archiwalny' },
  // K10 (dyrektywa 2026-07-29): anglicyzmy techniczne w treści dla inżyniera.
  { term: /\bhash\b/i, replacement: 'skrót / odcisk' },
  { term: /\bwhite\s?box\b/i, replacement: 'pełna jawność obliczeń' },
];

const ALLOW_PROGRAMMATIC_PATTERNS = [
  /\$\{[^}]*\.(?:branch|run|snapshot|case|proof|wizard)[^}]*\}/i,  // template literal var refs
  // K10: odwołania do ZMIENNYCH w template literals (`${run.id}`, `${hash.slice(...)}`,
  // `${binding.observed_value}`) to kod, nie treść dla inżyniera.
  /\$\{[^}]*\b(?:run|hash|binding)\b[^}]*\}/i,
  /\bstate\.(?:branch|run|snapshot|case|proof|wizard)\b/i,
  /\bNormativeLabels\.terms\.\w+/i,
  /^[a-z0-9_-]+$/i,  // pojedyncze identyfikatory
  /\$\{[^}]+\}\.BRANCH$/,  // template ID typu `${ref}.BRANCH`
  /^edge_\$\{/,  // `edge_${branch.id}` — programmatic edge ID
];

describe('UI Terminology Guard - public UI strings', () => {
  // K10: skan obejmuje oba drzewa UI — stare src/ui i przemysłowe src/ui2.
  const uiDir = join(__dirname, '..');
  const ui2Dir = join(__dirname, '../../ui2');
  const scanRoots: { dir: string; isUi2: boolean }[] = [
    { dir: uiDir, isUi2: false },
    { dir: ui2Dir, isUi2: true },
  ];

  it('found UI source files to check', () => {
    for (const { dir } of scanRoots) {
      expect(collectUiSourceFiles(dir).length).toBeGreaterThan(0);
    }
  });

  it('no forbidden English implementation terms in UI-visible strings', () => {
    const violations: string[] = [];

    for (const { dir, isUi2 } of scanRoots) {
      for (const filePath of collectUiSourceFiles(dir)) {
        const content = readFileSync(filePath, 'utf-8');
        const uiStrings = extractUiStrings(content);

        for (const { line, text } of uiStrings) {
          // Pomijamy programmatic references (np. ${branch.name} w error messages)
          if (ALLOW_PROGRAMMATIC_PATTERNS.some((p) => p.test(text))) {
            continue;
          }
          // Pomijamy linie oznaczone `// ui-terminology-ignore`
          // (sprawdzane na poziomie line content przez Python guard, tutaj duplikujemy)
          for (const { term, replacement, skipUi2 } of FORBIDDEN_UI_TERMS) {
            if (skipUi2 && isUi2) {
              continue;
            }
            if (term.test(text)) {
              const relPath = relative(dir, filePath);
              violations.push(
                `${isUi2 ? 'ui2/' : ''}${relPath}:${line} - "${text}" contains ${term}. Use: "${replacement}"`,
              );
            }
          }
        }
      }
    }

    if (violations.length > 0) {
      expect.fail(`Found ${violations.length} forbidden UI string issue(s):\n${violations.join('\n')}`);
    }
  });
});
