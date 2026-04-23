import * as fs from 'fs';
import * as path from 'path';

import { describe, expect, it } from 'vitest';

const UI_DIR = path.join(__dirname, '..');

function fileContains(
  relPath: string,
  expected: string[],
): { missing: string[]; fileExists: boolean } {
  const fullPath = path.join(UI_DIR, relPath);
  if (!fs.existsSync(fullPath)) {
    return { missing: expected, fileExists: false };
  }
  const content = fs.readFileSync(fullPath, 'utf-8');
  const missing = expected.filter((label) => !content.includes(label));
  return { missing, fileExists: true };
}

describe('Canon Guard: polskie etykiety w aktywnym UI', () => {
  it('ma polskie etykiety zakladek w kontrakcie wynikow', () => {
    const { missing, fileExists } = fileContains('results-inspector/types.ts', [
      'Szyny',
      'Gałęzie',
      'Zwarcia',
      'Ślad obliczeń',
    ]);
    if (fileExists) {
      expect(
        missing,
        `Missing Polish labels in results-inspector/types.ts: ${missing.join(', ')}`,
      ).toHaveLength(0);
    }
  });

  it('ma polskie etykiety w pasku zakresu obliczen', () => {
    const { missing, fileExists } = fileContains('active-case-bar/ActiveCaseBar.tsx', [
      'Zmien zakres',
      'Warunki obliczen',
      'Oblicz',
      'Podglad wynikow',
    ]);
    if (fileExists) {
      expect(
        missing,
        `Missing Polish labels in ActiveCaseBar: ${missing.join(', ')}`,
      ).toHaveLength(0);
    }
  });

  it('ma polskie etykiety w bibliotece katalogowej', () => {
    const { missing, fileExists } = fileContains('catalog/TypeLibraryBrowser.tsx', [
      'Typy linii',
      'Typy kabli',
      'Typy transformatorów',
      'Typy aparatury łączeniowej',
    ]);
    if (fileExists) {
      expect(
        missing,
        `Missing Polish labels in TypeLibraryBrowser: ${missing.join(', ')}`,
      ).toHaveLength(0);
    }
  });

  it('ma polskie komunikaty blokad w warstwie mode gate', () => {
    const { missing, fileExists } = fileContains('mode-gate/ModeGate.tsx', [
      'Edycja modelu zablokowana',
      'Akcja niedostepna w analizie i wynikach',
    ]);
    if (fileExists) {
      expect(
        missing,
        `Missing Polish labels in ModeGate: ${missing.join(', ')}`,
      ).toHaveLength(0);
    }
  });

  it('ma polskie komunikaty blokad w zarzadzaniu przypadkami', () => {
    const { missing, fileExists } = fileContains('case-manager/useModeGating.ts', [
      'Tworzenie przypadkow',
      'Zmiana nazwy przypadku',
      'Usuwanie przypadkow',
      'Klonowanie przypadkow',
      'Uruchomienie obliczen',
    ]);
    if (fileExists) {
      expect(
        missing,
        `Missing Polish labels in useModeGating: ${missing.join(', ')}`,
      ).toHaveLength(0);
    }
  });

  it('nie dopuszcza prostych angielskich etykiet przyciskow w aktywnych plikach UI', () => {
    const englishTermsInStrings = [
      { pattern: "'Settings'", replacement: "'Ustawienia'" },
      { pattern: "'Delete'", replacement: "'Usun'" },
      { pattern: "'Save'", replacement: "'Zapisz'" },
      { pattern: "'Cancel'", replacement: "'Anuluj'" },
      { pattern: "'Close'", replacement: "'Zamknij'" },
      { pattern: "'Loading...'", replacement: "'Ladowanie...'" },
      { pattern: "'Error'", replacement: "'Blad'" },
    ];

    const violations: { file: string; term: string }[] = [];
    const checkDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__tests__' || entry.name === 'node_modules') {
            continue;
          }
          checkDir(fullPath);
        } else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          for (const { pattern, replacement } of englishTermsInStrings) {
            if (!content.includes(pattern)) {
              continue;
            }
            const lines = content.split('\n');
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
                continue;
              }
              if (line.includes(pattern)) {
                violations.push({
                  file: path.relative(UI_DIR, fullPath),
                  term: `${pattern} -> ${replacement}`,
                });
                break;
              }
            }
          }
        }
      }
    };

    checkDir(UI_DIR);

    if (violations.length > 0) {
      const messages = violations.map((violation) => `  ${violation.file}: ${violation.term}`).join('\n');
      expect.fail(
        `Found ${violations.length} English-only UI label(s):\n${messages}\n\nAll UI labels must be in Polish.`,
      );
    }
  });
});
