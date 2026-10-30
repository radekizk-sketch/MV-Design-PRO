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
 *
 * WYJĄTEK ZACISKÓW PRZEKŁADNIKA (karta UX-04/POLE-LINIOWE-WZORZEC, decyzja architekta §11.7 pkt 6):
 * oznaczenia zacisków pierwotnych P1/P2 (PN-EN 61869-2) w JEDNYM wierszu deklaracji jednego pliku.
 * Plik, wiersz kontekstu i zbiór oznaczeń są czytane ze strażnika Pythona
 * (`PLIK_ZACISKOW_PRZEKLADNIKA`, `KONTEKST_ZACISKOW_PRZEKLADNIKA`,
 * `OZNACZENIA_ZACISKOW_PRZEKLADNIKA`) — jedno źródło prawdy dla obu strażników, bez kopii listy.
 */

import { describe, it, expect } from 'vitest'; // no-codenames-ignore
import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.join(__dirname, '..', '..');
const KORZEN_PROJEKTU = path.join(SRC_DIR, '..', '..');
const ZRODLO_STRAZNIKA = fs.readFileSync(path.join(KORZEN_PROJEKTU, 'scripts', 'no_codenames_guard.py'), 'utf-8');

/** Wyjątek zacisków przekładnika czytany ze strażnika Pythona (jedno źródło prawdy). */
function wyjatekZaciskowPrzekladnika(): { plik: string; kontekst: RegExp; oznaczenia: ReadonlySet<string> } {
  const plik = /^PLIK_ZACISKOW_PRZEKLADNIKA = "([^"]+)"$/m.exec(ZRODLO_STRAZNIKA);
  const kontekst = /^KONTEKST_ZACISKOW_PRZEKLADNIKA = re\.compile\(r"([^"]+)"\)$/m.exec(ZRODLO_STRAZNIKA);
  const oznaczenia = /^OZNACZENIA_ZACISKOW_PRZEKLADNIKA = frozenset\(\{([^}]*)\}\)$/m.exec(ZRODLO_STRAZNIKA);
  if (!plik || !kontekst || !oznaczenia) {
    throw new Error('Strażnik scripts/no_codenames_guard.py nie niesie definicji wyjątku zacisków przekładnika');
  }
  return {
    plik: plik[1],
    // Składnia `\b` i `^` jest wspólna dla `re` Pythona i RegExp JavaScriptu.
    kontekst: new RegExp(kontekst[1]),
    oznaczenia: new Set([...oznaczenia[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])),
  };
}

const WYJATEK_ZACISKOW = wyjatekZaciskowPrzekladnika();
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

/** Wiersz z wyjątku zacisków przekładnika: literały RÓWNE oznaczeniu zacisku są pomijane, każdy
 *  inny literał wiersza (np. „P1 rozpływ", „P3") jest skanowany jak wszędzie. */
function bezLiteralowZaciskow(sciezkaProjektu: string, line: string): string {
  if (sciezkaProjektu !== WYJATEK_ZACISKOW.plik || !WYJATEK_ZACISKOW.kontekst.test(line)) return line;
  return line.replace(/(['"`])([^'"`]*)\1/g, (literal, _cudzyslow: string, tresc: string) =>
    WYJATEK_ZACISKOW.oznaczenia.has(tresc) ? '0' : literal,
  );
}

function findCodenameViolations(filePath: string): { line: number; content: string }[] {
  return findCodenameViolationsInText(
    path.relative(KORZEN_PROJEKTU, filePath).split(path.sep).join('/'),
    fs.readFileSync(filePath, 'utf-8'),
  );
}

function findCodenameViolationsInText(sciezkaProjektu: string, content: string): { line: number; content: string }[] {
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

    const matches = bezLiteralowZaciskow(sciezkaProjektu, line).match(CODENAME_IN_STRING_REGEX);
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

describe('wyjątek zacisków przekładnika — wąski w pliku, wierszu i literale (iniekcje)', () => {
  const plik = WYJATEK_ZACISKOW.plik;
  const deklaracja = "export const ZACISKI_PRZEKLADNIKA_PRADOWEGO = { pierwotne: ['P1', 'P2'], wtorne: ['S1', 'S2'] } as const;";

  it('definicja wyjątku czytana ze strażnika Pythona: jeden plik, kontekst deklaracji, oznaczenia PN-EN 61869-2', () => {
    expect(plik).toBe('frontend/src/ui/sld/v3/compose/zaciskiPrzekladnika.ts');
    expect([...WYJATEK_ZACISKOW.oznaczenia].sort()).toEqual(['P1', 'P2', 'S1', 'S2']);
    expect(fs.existsSync(path.join(KORZEN_PROJEKTU, plik))).toBe(true);
  });

  it('wiersz deklaracji w pliku wyjątku przechodzi', () => {
    expect(findCodenameViolationsInText(plik, deklaracja)).toEqual([]);
  });

  it('iniekcja: ten sam wiersz w INNYM pliku jest naruszeniem', () => {
    expect(findCodenameViolationsInText('frontend/src/ui/sld/v3/compose/inny.ts', deklaracja)).toHaveLength(1);
  });

  it('iniekcja: literał z „P1" w innym wierszu pliku wyjątku jest naruszeniem', () => {
    expect(findCodenameViolationsInText(plik, "export const PODPIS = 'P1';")).toHaveLength(1);
  });

  it('iniekcja: w wierszu deklaracji literał nierówny oznaczeniu („P1 rozpływ", „P3") jest naruszeniem', () => {
    const zDopiskiem = deklaracja.replace("'P2'", "'P1 rozpływ'");
    const zKryptonimem = deklaracja.replace("'S2'", "'P3'");
    expect(findCodenameViolationsInText(plik, zDopiskiem)).toHaveLength(1);
    expect(findCodenameViolationsInText(plik, zKryptonimem)).toHaveLength(1);
  });
});
