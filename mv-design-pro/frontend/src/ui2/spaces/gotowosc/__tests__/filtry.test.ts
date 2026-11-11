// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { FILTRY_PUSTE, czyFiltrPusty, filtrujProblemy } from '../filtry';
import { naProblemGotowosci } from '../grupowanieCelow';
import { readinessIssue } from './fixtures';

const problemy = [
  naProblemGotowosci(
    readinessIssue({
      code: 'protection.ct_required',
      severity: 'BLOCKER',
      element_ref: 'REL-1',
      element_refs: ['REL-1'],
    }),
  ),
  naProblemGotowosci(
    readinessIssue({
      code: 'protection.vt_required',
      severity: 'IMPORTANT',
      element_ref: 'REL-2',
      element_refs: ['REL-2'],
    }),
  ),
  naProblemGotowosci(
    readinessIssue({
      code: 'source.grid_supply_missing',
      severity: 'BLOCKER',
      element_ref: 'GPZ-1',
      element_refs: ['GPZ-1'],
    }),
  ),
];

describe('czyFiltrPusty', () => {
  it('FILTRY_PUSTE jest pusty', () => {
    expect(czyFiltrPusty(FILTRY_PUSTE)).toBe(true);
  });
  it('waga ustawiona -> niepusty', () => {
    expect(czyFiltrPusty({ ...FILTRY_PUSTE, waga: 'BLOKADA' })).toBe(false);
  });
  it('sama biała spacja we frazie -> traktowana jak pusta', () => {
    expect(czyFiltrPusty({ ...FILTRY_PUSTE, fraza: '   ' })).toBe(true);
  });
});

describe('filtrujProblemy — waga', () => {
  it('waga=BLOKADA zwraca tylko blokady', () => {
    const wynik = filtrujProblemy(problemy, { ...FILTRY_PUSTE, waga: 'BLOKADA' });
    expect(wynik.map((p) => p.code)).toEqual(['protection.ct_required', 'source.grid_supply_missing']);
  });

  it('waga=OSTRZEZENIE zwraca tylko ostrzeżenia', () => {
    const wynik = filtrujProblemy(problemy, { ...FILTRY_PUSTE, waga: 'OSTRZEZENIE' });
    expect(wynik.map((p) => p.code)).toEqual(['protection.vt_required']);
  });
});

describe('filtrujProblemy — cel (interpretacja „typ")', () => {
  it('cel=zabezpieczenia zwraca tylko problemy tego celu', () => {
    const wynik = filtrujProblemy(problemy, { ...FILTRY_PUSTE, cel: 'zabezpieczenia' });
    expect(wynik).toHaveLength(2);
    expect(wynik.every((p) => p.cel === 'zabezpieczenia')).toBe(true);
  });
});

describe('filtrujProblemy — fraza (referencja albo nazwa elementu)', () => {
  it('dopasowuje podłańcuch elementRef, bez rozróżniania wielkości liter', () => {
    const wynik = filtrujProblemy(problemy, { ...FILTRY_PUSTE, fraza: 'gpz' });
    expect(wynik.map((p) => p.code)).toEqual(['source.grid_supply_missing']);
  });

  it('pusta fraza nie ogranicza wyniku', () => {
    expect(filtrujProblemy(problemy, FILTRY_PUSTE)).toHaveLength(3);
  });

  // Pole obiecuje „Numer lub nazwa elementu…" — fraza pasuje także do NAZWY z modelu.
  const nazwa = (ref: string): string => ({ 'REL-2': 'Przekaźnik pola odpływowego' })[ref] ?? ref;

  it('dopasowuje nazwę elementu z modelu (numer × nazwa)', () => {
    const wynik = filtrujProblemy(problemy, { ...FILTRY_PUSTE, fraza: 'odpływow' }, nazwa);
    expect(wynik.map((p) => p.code)).toEqual(['protection.vt_required']);
    // Numer działa dalej z tym samym resolverem nazw.
    expect(filtrujProblemy(problemy, { ...FILTRY_PUSTE, fraza: 'rel-1' }, nazwa).map((p) => p.code)).toEqual([
      'protection.ct_required',
    ]);
  });

  it('bez resolvera nazw fraza nazwy nie pasuje (brak modelu ≠ dopasowanie)', () => {
    expect(filtrujProblemy(problemy, { ...FILTRY_PUSTE, fraza: 'odpływow' })).toEqual([]);
  });
});

describe('filtrujProblemy — koniunkcja filtrów', () => {
  it('łączy wagę + frazę (AND)', () => {
    const wynik = filtrujProblemy(problemy, { ...FILTRY_PUSTE, waga: 'BLOKADA', fraza: 'rel' });
    expect(wynik.map((p) => p.code)).toEqual(['protection.ct_required']);
  });

  it('brak dopasowania -> pusta lista (nie wyjątek)', () => {
    expect(filtrujProblemy(problemy, { ...FILTRY_PUSTE, fraza: 'nieistniejacy-element' })).toEqual([]);
  });
});
