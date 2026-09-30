/**
 * Pola karty falownika w proweniencji SSCI — parytet z KODEM backendu (karta #145).
 *
 * Ekran pokazywał „Pola źródłowe: control_delay_ms, current_loop_bandwidth_hz…" — nazwy
 * pól kontraktu. Teraz nazywa je mapą `POLA_KARTY_SSCI` typowaną zamkniętą unią; ten test
 * czyta krotki `SSCI_MANDATORY_FIELDS` i `SSCI_OPTIONAL_FIELDS` z `models.py` analizy
 * i wymaga RÓWNOŚCI zbiorów w obie strony.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { POLA_KARTY_SSCI } from '../strings';

const MODELE = join(
  process.cwd(),
  '..',
  'backend',
  'src',
  'analysis',
  'ssci_stability',
  'models.py',
);

function poleKrotki(zrodlo: string, nazwa: string): string[] {
  const poczatek = zrodlo.indexOf(`${nazwa}: tuple[str, ...] = (`);
  expect(poczatek, `krotka ${nazwa} w models.py`).toBeGreaterThan(-1);
  const koniec = zrodlo.indexOf(')', poczatek + nazwa.length + 20);
  return [...zrodlo.slice(poczatek, koniec).matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

describe('pola karty falownika SSCI — parytet z backendem', () => {
  it('każde pole obowiązkowe i opcjonalne ma polską nazwę i każda nazwa ma pole', () => {
    const zrodlo = readFileSync(MODELE, 'utf-8');
    const pola = [
      ...poleKrotki(zrodlo, 'SSCI_MANDATORY_FIELDS'),
      ...poleKrotki(zrodlo, 'SSCI_OPTIONAL_FIELDS'),
    ];
    expect(pola.length).toBeGreaterThan(0);
    expect([...new Set(pola)].sort()).toEqual(Object.keys(POLA_KARTY_SSCI).sort());
  });

  it('żadna nazwa pola nie jest kluczem kontraktu (snake_case)', () => {
    Object.values(POLA_KARTY_SSCI).forEach((etykieta) => {
      expect(etykieta).not.toMatch(/\b[a-z]+_[a-z0-9_]+\b/);
    });
  });
});
