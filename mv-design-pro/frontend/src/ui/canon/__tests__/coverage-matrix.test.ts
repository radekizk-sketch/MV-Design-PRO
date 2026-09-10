import { describe, expect, it } from 'vitest';

import { COVERAGE_MATRIX } from '../coverageMatrix';
import { TECHNICAL_DEBT_REGISTRY, hasRegisteredDebt } from '../technicalDebtRegistry';
import { hasTechnicalIcon } from '../../icons/technicalIconRegistry';

const REQUIRED_SCOPES = [
  'GPZ uproszczony i pełny',
  'pola SN',
  'magistrale i odgałęzienia',
  'ZKSN',
  'słupy rozgałęźne',
  'stacje SN/nN',
  'strona nN',
  'obciążenia',
  'Układy PV',
  'magazyny energii',
  'farmy wiatrowe PMSG/DFIG/SCIG',
  'profile operatora',
  'profile źródeł',
  'profile Q(U)',
  'profile cos φ(P)',
  'profile FRT/LVRT/HVRT',
  'przypadki obliczeniowe',
  'warianty pracy',
  'migawki stanów łączników',
  'pełne zwarcia 3F/1F/2F/2F+Z',
  'sieć zerowa',
  'pojemności doziemne',
  'cewka Petersena',
  'rozpływ mocy NR',
  'GS diagnostyczny',
  'FD wydajnościowy',
  'stan fazowy SN',
  'stabilność dynamiczna',
  'zabezpieczenia',
  'automatyka SPZ/SZR/SCO/FDIR',
  'selektywność',
  'wyniki na SLD',
  'uzasadnienie inżynierskie',
  'raporty OSD i audytowe',
];

describe('coverage-matrix - zakres obowiązkowy', () => {
  it('ma wiersz dla każdego zakresu obowiązkowego', () => {
    expect(COVERAGE_MATRIX.map((row) => row.scope.toLocaleLowerCase('pl-PL'))).toEqual(
      REQUIRED_SCOPES.map((scope) => scope.toLocaleLowerCase('pl-PL')),
    );
  });

  it('każdy wiersz ma obszar, ekran, ikonę, panel, menu, klik, wynik, raport i status', () => {
    for (const row of COVERAGE_MATRIX) {
      expect(row.area).toBeTruthy();
      expect(row.screen).toBeTruthy();
      expect(hasTechnicalIcon(row.icon)).toBe(true);
      expect(row.panel).toBeTruthy();
      expect(row.menu).toBeTruthy();
      expect(row.click).toBeTruthy();
      expect(row.result).toBeTruthy();
      expect(row.report).toBeTruthy();
      expect(row.status).toBeTruthy();
      // INTENCJA (zachowana): zaden wiersz macierzy nie moze po cichu zglosic
      // dlugu technicznego. Poprzednia wersja pilnowala tego galezia
      // `if (row.status.startsWith('dług techniczny')) → row.debtCode`, ktora
      // NIGDY nie mogla sie wykonac: `CoverageStatus` jest unia
      // JEDNOELEMENTOWA ('pełne pokrycie'), a pola `debtCode` kontrakt
      // `CoverageMatrixRow` nie ma (TS2339 — test powstal w tym samym commicie
      // co kontrakt i od poczatku celowal w pole widmo). Ten sam warunek,
      // sprawdzalny: status kazdego wiersza jest DOKLADNIE kanonicznym
      // pelnym pokryciem, wiec wpisanie dlugu wymaga zmiany kontraktu — i
      // wywroci ten test razem z typem.
      expect(row.status).toBe('pełne pokrycie');
    }
  });
});

/**
 * Rejestr dlugu, na ktory wskazywala martwa galaz powyzej, byl do tej pory bez
 * ZADNEJ wyroczni — a niesie mocne deklaracje ("ZAMKNIĘTY"). Deklaracja bez
 * testu to falszywa pewnosc (CLAUDE.md, regula KLASA, pkt 4).
 */
describe('rejestr dlugu technicznego', () => {
  it('nie zawiera pozycji otwartej — kazda ma status ZAMKNIĘTY i unikalny kod', () => {
    expect(TECHNICAL_DEBT_REGISTRY.length).toBeGreaterThan(0);
    for (const pozycja of TECHNICAL_DEBT_REGISTRY) {
      expect(pozycja.status).toBe('ZAMKNIĘTY');
      expect(pozycja.closedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(pozycja.changedFiles.length).toBeGreaterThan(0);
      expect(pozycja.tests.length).toBeGreaterThan(0);
    }
    const kody = TECHNICAL_DEBT_REGISTRY.map((pozycja) => pozycja.code);
    expect(new Set(kody).size).toBe(kody.length);
  });

  it('hasRegisteredDebt odpowiada zgodnie z rejestrem', () => {
    for (const pozycja of TECHNICAL_DEBT_REGISTRY) {
      expect(hasRegisteredDebt(pozycja.code)).toBe(true);
    }
    expect(hasRegisteredDebt('KOD-SPOZA-REJESTRU')).toBe(false);
  });
});
