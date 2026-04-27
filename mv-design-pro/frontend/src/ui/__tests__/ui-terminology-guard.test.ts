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
      results.push({ line: i + 1, text: match[1] });
    }
  }

  return results;
}

const FORBIDDEN_UI_TERMS = [
  { term: /\bmaterializacj/i, replacement: 'Wczytanie parametrow z katalogu' },
  { term: /\brematerializuj/i, replacement: 'Odswiez parametry z katalogu' },
  { term: /\bbinding\b/i, replacement: 'Powiazanie z katalogiem' },
  { term: /\bnamespace\b/i, replacement: 'Kategoria katalogu' },
  { term: /\bdrift\b/i, replacement: 'Rozbieznosc katalogu' },
  { term: /\breadiness\b/i, replacement: 'Gotowosc obliczen' },
  { term: /\bfix.?actions?\b/i, replacement: 'Szybkie naprawy' },
  { term: /\bblocker\b/i, replacement: 'Brak wymaganych danych' },
];

describe('UI Terminology Guard - public UI strings', () => {
  const uiDir = join(__dirname, '..');
  const uiFiles = collectUiSourceFiles(uiDir);

  it('found UI source files to check', () => {
    expect(uiFiles.length).toBeGreaterThan(0);
  });

  it('no forbidden English implementation terms in UI-visible strings', () => {
    const violations: string[] = [];

    for (const filePath of uiFiles) {
      const content = readFileSync(filePath, 'utf-8');
      const uiStrings = extractUiStrings(content);

      for (const { line, text } of uiStrings) {
        if (/^[a-z0-9_-]+$/i.test(text)) {
          continue;
        }
        for (const { term, replacement } of FORBIDDEN_UI_TERMS) {
          if (term.test(text)) {
            const relPath = relative(uiDir, filePath);
            violations.push(`${relPath}:${line} - "${text}" contains ${term}. Use: "${replacement}"`);
          }
        }
      }
    }

    if (violations.length > 0) {
      expect.fail(`Found ${violations.length} forbidden UI string issue(s):\n${violations.join('\n')}`);
    }
  });
});
