/**
 * Guard kanonu: KAŻDA nazwa operacji domenowej wołana z UI musi być na białej liście
 * `CANONICAL_OPERATION_NAMES`.
 *
 * DLACZEGO TEN TEST ISTNIEJE (defekt, który go wymusił):
 * `executeDomainOp` (ui/topology/domainApi.ts) przepuszcza nazwę operacji przez
 * `assertCanonicalOpName`, który RZUCA WYJĄTEK dla nazwy spoza białej listy — zanim
 * poleci żądanie sieciowe. Nazwa pominięta na liście oznacza więc kontrolkę, która
 * NIGDY nie zadziała, mimo poprawnego kreatora w UI i poprawnego handlera w backendzie.
 * Tak długo martwe były trzy ścieżki: kreator baterii kondensatorów SN
 * (`add_shunt_compensator_sn`), kreator ogranicznika przepięć SN
 * (`add_surge_arrester_sn`) i formularz warunków przyłączenia OSD
 * (`set_connection_conditions`).
 *
 * Testy jednostkowe tych kreatorów tego nie łapały, bo mockują `executeDomainOperation`
 * na poziomie store'u — czyli PONAD bramką (wzorzec „test maskujący defekt produktu"
 * z CLAUDE.md §Zero-Debt). Ten guard działa na źródłach, więc jest niewrażliwy na mocki.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { CANONICAL_OPERATION_NAMES, isCanonicalOpName } from '../domainOps';

const SRC_DIR = path.join(__dirname, '..', '..');

/** Nazwy używane wyłącznie jako dane testowe niekanoniczności — nie są wywołaniami. */
const NIEKANONICZNE_ATRAPY_TESTOWE = new Set(['some_new_op', 'nieznana_operacja']);

function zbierzPlikiZrodlowe(dir: string): string[] {
  const wynik: string[] = [];
  for (const wpis of fs.readdirSync(dir, { withFileTypes: true })) {
    const pelna = path.join(dir, wpis.name);
    if (wpis.isDirectory()) {
      if (wpis.name === 'node_modules' || wpis.name === '__tests__' || wpis.name === 'e2e') {
        continue;
      }
      wynik.push(...zbierzPlikiZrodlowe(pelna));
    } else if (
      (wpis.name.endsWith('.ts') || wpis.name.endsWith('.tsx')) &&
      !wpis.name.endsWith('.test.ts') &&
      !wpis.name.endsWith('.test.tsx') &&
      !wpis.name.endsWith('.spec.ts') &&
      !wpis.name.endsWith('.spec.tsx') &&
      !wpis.name.endsWith('.d.ts')
    ) {
      wynik.push(pelna);
    }
  }
  return wynik;
}

/**
 * Tnie listę argumentów wywołania na argumenty najwyższego poziomu, od pozycji tuż za
 * nawiasem otwierającym do zbalansowanego nawiasu zamykającego. Zwraca `null`, gdy
 * wywołanie nie jest domknięte w pliku (nie powinno się zdarzyć w poprawnym źródle).
 */
function argumentyWywolania(tresc: string, poNawiasie: number): string[] | null {
  const argumenty: string[] = [];
  let biezacy = '';
  let glebokosc = 0;
  let cudzyslow: string | null = null;
  for (let i = poNawiasie; i < tresc.length; i += 1) {
    const znak = tresc[i];
    if (cudzyslow) {
      biezacy += znak;
      if (znak === '\\') {
        biezacy += tresc[i + 1] ?? '';
        i += 1;
      } else if (znak === cudzyslow) {
        cudzyslow = null;
      }
      continue;
    }
    if (znak === "'" || znak === '"' || znak === '`') {
      cudzyslow = znak;
      biezacy += znak;
      continue;
    }
    if ('([{'.includes(znak)) {
      glebokosc += 1;
      biezacy += znak;
      continue;
    }
    if (')]}'.includes(znak)) {
      if (znak === ')' && glebokosc === 0) {
        argumenty.push(biezacy);
        return argumenty;
      }
      glebokosc -= 1;
      biezacy += znak;
      continue;
    }
    if (znak === ',' && glebokosc === 0) {
      argumenty.push(biezacy);
      biezacy = '';
      continue;
    }
    biezacy += znak;
  }
  return null;
}

/**
 * Wyławia literały nazw operacji z wywołań `executeDomainOperation(...)` /
 * `executeDomainOp(...)`. Nazwa operacji stoi w pozycji 1. (`executeDomainOp` bywa
 * wołany z caseId) albo 2. — bierzemy tylko argumenty będące CZYSTYM literałem, więc
 * wywołania przekazujące nazwę zmienną (np. przelotowy `opName` w store) są pomijane;
 * ich nazwy weryfikuje bramka runtime w miejscu, gdzie literał faktycznie powstaje.
 */
function wyluskajNazwyOperacji(tresc: string): { nazwa: string; indeks: number }[] {
  const znalezione: { nazwa: string; indeks: number }[] = [];
  const wywolanie = /execute(?:DomainOperation|DomainOp)\s*\(/g;
  let dopasowanie: RegExpExecArray | null;
  while ((dopasowanie = wywolanie.exec(tresc)) !== null) {
    const argumenty = argumentyWywolania(tresc, dopasowanie.index + dopasowanie[0].length);
    if (!argumenty) continue;
    for (const argument of argumenty.slice(0, 2)) {
      const literal = /^\s*'([a-zA-Z][a-zA-Z0-9_]*)'\s*$/.exec(argument);
      if (literal) {
        znalezione.push({ nazwa: literal[1], indeks: dopasowanie.index });
      }
    }
  }
  return znalezione;
}

function numerLinii(tresc: string, indeks: number): number {
  return tresc.slice(0, indeks).split('\n').length;
}

describe('Biała lista operacji domenowych — zgodność z realnymi wywołaniami z UI', () => {
  it('każda operacja wołana z UI przechodzi bramkę assertCanonicalOpName', () => {
    const naruszenia: string[] = [];
    for (const plik of zbierzPlikiZrodlowe(SRC_DIR)) {
      const tresc = fs.readFileSync(plik, 'utf-8');
      if (!tresc.includes('executeDomainOp')) continue;
      for (const { nazwa, indeks } of wyluskajNazwyOperacji(tresc)) {
        if (NIEKANONICZNE_ATRAPY_TESTOWE.has(nazwa)) continue;
        if (!isCanonicalOpName(nazwa)) {
          const wzgledna = path.relative(SRC_DIR, plik);
          naruszenia.push(
            `${wzgledna}:${numerLinii(tresc, indeks)} → '${nazwa}' (bramka rzuci wyjątek: martwa kontrolka)`,
          );
        }
      }
    }
    expect(naruszenia).toEqual([]);
  });

  it('biała lista nie zawiera duplikatów', () => {
    const unikalne = new Set<string>(CANONICAL_OPERATION_NAMES);
    expect(unikalne.size).toBe(CANONICAL_OPERATION_NAMES.length);
  });

  it('operacje z martwych ścieżek są na liście (regresja: kompensator, ogranicznik, warunki OSD)', () => {
    // Dowód wprost dla trzech nazw, których brak unieruchamiał gotowe kreatory.
    expect(isCanonicalOpName('add_shunt_compensator_sn')).toBe(true);
    expect(isCanonicalOpName('add_surge_arrester_sn')).toBe(true);
    expect(isCanonicalOpName('set_connection_conditions')).toBe(true);
  });
});
