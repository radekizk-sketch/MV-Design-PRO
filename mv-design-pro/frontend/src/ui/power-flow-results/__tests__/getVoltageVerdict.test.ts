/**
 * Karta W3-J (2026-09-16): `getVoltageVerdict` (ui/inspector — legacy
 * `PowerFlowResultsInspectorPage.tsx`, dead-code bez trasy renderu, patrz
 * komentarz przy eksporcie) klasyfikowała napięcie wobec 0.95/1.05/0.90/1.10
 * ZASZYTYCH niezależnie od jednego źródła prawdy — druga, niezależna kopia
 * tej samej klasy defektu co `ui/inspector/InspectorPanel.tsx`. Test jako
 * iloczyn cech: {w paśmie ostrzeżenia, na granicy, w paśmie przekroczenia,
 * poza pasmem przekroczenia} × {kryteria obecne, kryteria nieobecne}.
 */

import { describe, expect, it } from 'vitest';

import type { KryteriaNapieciowe } from '../types';
import { getVoltageVerdict } from '../PowerFlowResultsInspectorPage';

const KRYTERIA: KryteriaNapieciowe = {
  ostrzezenie_pct: 5,
  przekroczenie_pct: 10,
  ostrzezenie_min_pu: 0.95,
  ostrzezenie_max_pu: 1.05,
  przekroczenie_min_pu: 0.9,
  przekroczenie_max_pu: 1.1,
  podstawa_ostrzezenie_pl: 'Praktyka projektowa SN / IRiESD.',
  podstawa_przekroczenie_pl: 'PN-EN 50160.',
  pasmo_wiarygodnosci_pct: 10,
};

describe('getVoltageVerdict — karta W3-J, kryteria WYŁĄCZNIE z odpowiedzi biegu', () => {
  it('w paśmie ostrzeżenia (interior) → PASS', () => {
    expect(getVoltageVerdict(1.0, KRYTERIA).verdict).toBe('PASS');
  });

  it('dokładnie na granicy dolnej ostrzeżenia → PASS (granica należy do pasma)', () => {
    expect(getVoltageVerdict(0.95, KRYTERIA).verdict).toBe('PASS');
  });

  it('dokładnie na granicy górnej ostrzeżenia → PASS', () => {
    expect(getVoltageVerdict(1.05, KRYTERIA).verdict).toBe('PASS');
  });

  it('w paśmie przekroczenia po stronie niskiej (interior) → MARGINAL', () => {
    expect(getVoltageVerdict(0.92, KRYTERIA).verdict).toBe('MARGINAL');
  });

  it('w paśmie przekroczenia po stronie wysokiej (interior) → MARGINAL', () => {
    expect(getVoltageVerdict(1.08, KRYTERIA).verdict).toBe('MARGINAL');
  });

  it('dokładnie na granicy przekroczenia (dolnej) → MARGINAL (granica należy do pasma)', () => {
    expect(getVoltageVerdict(0.9, KRYTERIA).verdict).toBe('MARGINAL');
  });

  it('poza pasmem przekroczenia (poniżej) → FAIL, notatka niesie realny limit z kryteriów', () => {
    const wynik = getVoltageVerdict(0.5, KRYTERIA);
    expect(wynik.verdict).toBe('FAIL');
    expect(wynik.notes).toContain('0.90');
  });

  it('poza pasmem przekroczenia (powyżej) → FAIL, notatka niesie realny limit z kryteriów', () => {
    const wynik = getVoltageVerdict(1.5, KRYTERIA);
    expect(wynik.verdict).toBe('FAIL');
    expect(wynik.notes).toContain('1.10');
  });

  it('karta W3-J: bez kryteriów (starszy zapisany wynik) → ERROR, nie domyślna liczba', () => {
    // Wartość, która przy DOMYŚLNYCH 0.95/1.05 bylaby PASS — dowod, ze brak
    // kryteriow naprawde blokuje klasyfikacje, a nie cichnie na starym progu.
    const wynik = getVoltageVerdict(1.0, undefined);
    expect(wynik.verdict).toBe('ERROR');
    expect(wynik.notes).not.toBe('');
  });
});
