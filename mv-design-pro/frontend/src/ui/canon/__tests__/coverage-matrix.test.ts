import { describe, expect, it } from 'vitest';

import { COVERAGE_MATRIX } from '../coverageMatrix';
import { hasRegisteredDebt } from '../technicalDebtRegistry';
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
      if (row.status.startsWith('dług techniczny')) {
        expect(row.debtCode).toBeTruthy();
        expect(hasRegisteredDebt(row.debtCode!)).toBe(true);
      }
    }
  });
});
