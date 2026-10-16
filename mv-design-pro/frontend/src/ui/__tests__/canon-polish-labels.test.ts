import * as fs from 'fs';
import * as path from 'path';

import { describe, expect, it } from 'vitest';

const UI_DIR = path.join(__dirname, '..');

function fileContains(
  relPath: string,
  expected: string[],
): { missing: string[] } {
  const fullPath = path.join(UI_DIR, relPath);
  // Brak pliku = CZERWONO. Dawniej `if (fileExists)` w każdym teście czyniło go pustym,
  // gdy plik przeniesiono (pasek aktywnego przypadku i `case-manager` zniknęły dawno,
  // a testy dalej „przechodziły") — deklaracja bez testu (karta K1 POWLOKA).
  expect(fs.existsSync(fullPath), `Brak pliku sprawdzanego przez kanon etykiet: ${relPath}`).toBe(true);
  const content = fs.readFileSync(fullPath, 'utf-8');
  const missing = expected.filter((label) => !content.includes(label));
  return { missing };
}

describe('Canon Guard: polskie etykiety w aktywnym UI', () => {
  it('ma polskie etykiety zakladek w kontrakcie wynikow', () => {
    const { missing } = fileContains('results-inspector/types.ts', [
      'Szyny',
      'Gałęzie',
      'Zwarcia',
      'Ślad obliczeń',
    ]);
    expect(
      missing,
      `Missing Polish labels in results-inspector/types.ts: ${missing.join(', ')}`,
    ).toHaveLength(0);
  });

  it('ma polskie etykiety w pasku projektu powłoki', () => {
    // Dawny pasek aktywnego przypadku zastąpił pasek projektu (karta K1 POWLOKA);
    // jego teksty żyją w jednym module tekstów powłoki.
    const { missing } = fileContains('../ui2/shell/strings.ts', [
      'Zakres',
      'Oblicz',
      'Obliczanie…',
      'Wyniki: aktualne',
      'Wyniki: nieaktualne',
      'Szczegóły audytowe',
    ]);
    expect(
      missing,
      `Missing Polish labels in pasku projektu: ${missing.join(', ')}`,
    ).toHaveLength(0);
  });

  it('ma polskie etykiety w bibliotece katalogowej', () => {
    const { missing } = fileContains('catalog/TypeLibraryBrowser.tsx', [
      'Typy linii',
      'Typy kabli',
      'Typy transformatorów',
      'Typy aparatury łączeniowej',
    ]);
    expect(
      missing,
      `Missing Polish labels in TypeLibraryBrowser: ${missing.join(', ')}`,
    ).toHaveLength(0);
  });

  it('ma polskie komunikaty blokad w warstwie mode gate', () => {
    const { missing } = fileContains('mode-gate/ModeGate.tsx', [
      'Edycja modelu zablokowana',
      'Akcja niedostepna w analizie i wynikach',
    ]);
    expect(
      missing,
      `Missing Polish labels in ModeGate: ${missing.join(', ')}`,
    ).toHaveLength(0);
  });

  it('ma polskie komunikaty blokad w zarzadzaniu przypadkami', () => {
    const { missing } = fileContains('study-cases/modeGating.ts', [
      'Tworzenie przypadkow',
      'Zmiana nazwy przypadku',
      'Usuwanie przypadkow',
      'Klonowanie przypadkow',
    ]);
    expect(
      missing,
      `Missing Polish labels in useModeGating: ${missing.join(', ')}`,
    ).toHaveLength(0);
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
