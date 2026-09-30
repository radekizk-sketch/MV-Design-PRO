/**
 * Canon Guard: Global Codename BAN
 *
 * BINDING RULE:
 * - Project codenames (P7, P11, P14, P15, P17, P20, FIX-) must NEVER appear
 *   in UI-visible strings (string literals in .tsx/.ts source files)
 * - Comments and test files are excluded
 * - Use Polish labels instead
 *
 * This test scans ALL TypeScript source files to catch codename leaks.
 * Mirrors the Python-based scripts/no_codenames_guard.py for CI.
 */

import { describe, it, expect } from 'vitest'; // no-codenames-ignore
import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.join(__dirname, '..', '..');
// Dawny wyjątek `DATA_SOURCE_ALLOWLIST` (jedyny wpis: `station-der/ptpireeCertifiedInverters.ts`)
// usunięty razem z RĘCZNĄ listą rekordów wykazu PTPiREE (karta AB-1a Pakiet D1): moduł nie niesie
// już danych wykazu (nazw modeli w rodzaju „…-P3-…"), tylko kod pobierający je z backendu —
// skanowany jak każdy inny plik źródłowy, bez wyjątku. Z tego samego powodu zniknął wyjątek
// sufiksowy dla artefaktów generowanych: jedynym takim plikiem była frontowa kopia wykazu
// (skasowana), a wyjątek bez celu poszerzałby się po cichu na każdy przyszły plik generowany.

// Codename pattern: P followed by digits (excluding P0 — technical parameter)
// Matches: P7, P11, P14, P15, P17, P20, P22, P30, etc.
// Excludes: P0 (straty jałowe transformatora — legitimate engineering term)
const CODENAME_IN_STRING_REGEX = /['"`].*?\b[pP](?!0\b)\d{1,2}\b.*?['"`]/g; // no-codenames-ignore

function getAllTsxFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === 'e2e') {
        continue;
      }
      results.push(...getAllTsxFiles(fullPath));
    } else if (
      (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx') &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.spec.tsx') &&
      !entry.name.endsWith('.d.ts')
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

function findCodenameViolations(filePath: string): { line: number; content: string }[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations: { line: number; content: string }[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      return;
    }
    // Skip lines with no-codenames-ignore marker
    if (line.includes('no-codenames-ignore')) {
      return;
    }
    // Skip import lines
    if (trimmed.startsWith('import ')) {
      return;
    }

    const matches = line.match(CODENAME_IN_STRING_REGEX);
    if (matches) {
      violations.push({ line: index + 1, content: trimmed });
    }
  });

  return violations;
}

describe('Canon Guard: Global Codename BAN', () => { // no-codenames-ignore
  it('should have zero project codenames in UI-visible strings', () => { // no-codenames-ignore
    const files = getAllTsxFiles(SRC_DIR);
    const allViolations: { file: string; line: number; content: string }[] = [];

    for (const filePath of files) {
      const violations = findCodenameViolations(filePath);
      for (const v of violations) {
        allViolations.push({
          file: path.relative(SRC_DIR, filePath),
          ...v,
        });
      }
    }

    if (allViolations.length > 0) {
      const messages = allViolations
        .map((v) => `  ${v.file}:${v.line}: ${v.content}`)
        .join('\n');
      // no-codenames-ignore
      expect.fail(
        `Found ${allViolations.length} codename violation(s) in UI strings:\n${messages}\n\n` +
          'Project codenames (P7, P11, P14, etc.) must NEVER appear in UI. Use Polish labels.'
      );
    }

    expect(allViolations).toHaveLength(0);
  });
});
