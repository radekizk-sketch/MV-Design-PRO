/**
 * Parytet nazw pól śladu porównania zabezpieczeń z KODEM backendu (karta #145).
 *
 * Ślad porównania (`GET /protection-comparisons/{id}/trace`) niesie pary pole → wartość,
 * a ekran nazywa pola po polsku z mapy `ETYKIETY_POL_SLADU_ZABEZPIECZEN`, typowanej
 * zamkniętą unią `PoleSladuPorownaniaZabezpieczen`. Typ pilnuje frontu, ale nie widzi
 * backendu: nowe pole dopisane w `service.py` bez nazwy trafiłoby na ekran jako klucz
 * `snake_case`. Ten test czyta źródło backendu (literały kluczy słowników w krokach śladu
 * i w licznikach `_count_state_changes` / `_count_severities`) i wymaga, żeby zbiór pól
 * backendu był RÓWNY zbiorowi nazwanemu we froncie — w obie strony (martwa etykieta też
 * jest defektem).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ETYKIETY_POL_SLADU_ZABEZPIECZEN } from '../strings';

const SERWIS = join(
  process.cwd(),
  '..',
  'backend',
  'src',
  'application',
  'protection_comparison',
  'service.py',
);

/** Klucze słowników w fragmencie kodu Pythona (`"klucz": wartość`). */
function kluczeSlownikow(fragment: string): string[] {
  return [...fragment.matchAll(/"([a-z][a-z0-9_]*)"\s*:/g)].map((m) => m[1]);
}

/** Treść funkcji Pythona `def <nazwa>(` do następnej definicji na tym samym wcięciu. */
function trescFunkcji(zrodlo: string, nazwa: string): string {
  const poczatek = zrodlo.indexOf(`def ${nazwa}(`);
  expect(poczatek, `funkcja ${nazwa} w service.py`).toBeGreaterThan(-1);
  const koniec = zrodlo.indexOf('\n    def ', poczatek + 1);
  return zrodlo.slice(poczatek, koniec === -1 ? undefined : koniec);
}

describe('pola śladu porównania zabezpieczeń — parytet z kodem backendu', () => {
  it('każde pole wejść/wyjść kroków śladu ma polską nazwę i każda nazwa ma pole', () => {
    const zrodlo = readFileSync(SERWIS, 'utf-8');
    const kroki = zrodlo.slice(
      zrodlo.indexOf('trace_steps: list[ProtectionComparisonTraceStep] = []'),
      zrodlo.indexOf('summary = self._build_summary(rows, ranking)'),
    );
    expect(kroki.length).toBeGreaterThan(0);
    const zBackendu = new Set([
      ...kluczeSlownikow(kroki),
      ...kluczeSlownikow(trescFunkcji(zrodlo, '_count_state_changes')),
      ...kluczeSlownikow(trescFunkcji(zrodlo, '_count_severities')),
    ]);
    expect([...zBackendu].sort()).toEqual(Object.keys(ETYKIETY_POL_SLADU_ZABEZPIECZEN).sort());
  });

  it('żadna nazwa pola nie jest kluczem technicznym (snake_case) ani pustym napisem', () => {
    Object.values(ETYKIETY_POL_SLADU_ZABEZPIECZEN).forEach((etykieta) => {
      expect(etykieta.trim()).not.toBe('');
      expect(etykieta).not.toMatch(/\b[a-z]+_[a-z0-9_]+\b/);
    });
  });
});
