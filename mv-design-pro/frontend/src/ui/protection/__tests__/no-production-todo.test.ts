/**
 * Test guard: brak produkcyjnych TODO w hookach protection module (Etap 8).
 *
 * Weryfikuje że hooki useSanityChecks i useProtectionAssignment nie zawierają
 * "TODO: Implementacja…" w produkcyjnym kodzie. Etap 8 zastępuje TODO jasnym
 * komentarzem architektonicznym o stanie API + zwraca poprawnie typowane
 * empty results zamiast fałszywych danych.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PROTECTION_DIR = path.join(__dirname, '..');

const FILES_UNDER_GUARD = [
  'useSanityChecks.ts',
  'useProtectionAssignment.ts',
];

describe('protection module — brak produkcyjnych TODO (Etap 8)', () => {
  for (const file of FILES_UNDER_GUARD) {
    it(`${file} nie zawiera "TODO: Implementacja"`, () => {
      const fullPath = path.join(PROTECTION_DIR, file);
      const content = fs.readFileSync(fullPath, 'utf-8');
      expect(content).not.toMatch(/TODO:\s*Implementacja/);
    });

    it(`${file} odwoluje sie do endpointu API zamiast TODO`, () => {
      const fullPath = path.join(PROTECTION_DIR, file);
      const content = fs.readFileSync(fullPath, 'utf-8');
      // Wymagamy, aby plik odwoływał się do endpointu API (real bądź planowany
      // bulk), a nie ukrywał braku implementacji pod TODO.
      expect(content).toMatch(/endpoint/i);
    });
  }
});
