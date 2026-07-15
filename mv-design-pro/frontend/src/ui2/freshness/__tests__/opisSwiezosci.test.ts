/**
 * Testy czystej funkcji opisSwiezosci (E15.2).
 * Kryteria: docs/uiux/karty/U1_E15_2_SWIEZOSC.md §3.2 — etykiety PL dokładnie jak w §2,
 * zgodne z formatem `znacznikNieaktualne` importowanym z ui2/inspector/strings.ts.
 */

import { describe, expect, it } from 'vitest';

import { INSPECTOR_STRINGS, znacznikNieaktualne } from '../../inspector/strings';
import { BRAK_WYNIKOW_LABEL, NIEAKTUALNE_BEZ_PARY_LABEL, opisSwiezosci } from '../opisSwiezosci';
import type { OpisSwiezosci } from '../freshnessModel';

describe('opisSwiezosci — etykieta PL dla wszystkich stanów (§3.2)', () => {
  it("stan 'aktualne' -> dokładnie INSPECTOR_STRINGS.aktualne ('aktualne')", () => {
    const opis: OpisSwiezosci = { stan: 'aktualne', rewizjaDanej: 5, rewizjaModelu: 5 };
    expect(opisSwiezosci(opis)).toBe(INSPECTOR_STRINGS.aktualne);
    expect(opisSwiezosci(opis)).toBe('aktualne');
  });

  it("stan 'brak' -> dokładnie 'brak wyników'", () => {
    const opis: OpisSwiezosci = { stan: 'brak', rewizjaModelu: 0 };
    expect(opisSwiezosci(opis)).toBe(BRAK_WYNIKOW_LABEL);
    expect(opisSwiezosci(opis)).toBe('brak wyników');
  });

  it("stan 'nieaktualne' z parą rewizji -> dokładnie znacznikNieaktualne(a, b) (import, bez duplikacji formatu)", () => {
    const opis: OpisSwiezosci = {
      stan: 'nieaktualne',
      rewizjaDanej: 214,
      rewizjaModelu: 215,
      przyczyna: 'model-zmieniony',
    };
    expect(opisSwiezosci(opis)).toBe(znacznikNieaktualne(214, 215));
    expect(opisSwiezosci(opis)).toBe('nieaktualne (rew. 214 → 215)');
  });

  it("stan 'nieaktualne' bez znanej rewizjaDanej -> zdegradowana etykieta bez pary (bez zmyślania liczb)", () => {
    const opis: OpisSwiezosci = { stan: 'nieaktualne', rewizjaModelu: 9, przyczyna: 'model-zmieniony' };
    expect(opisSwiezosci(opis)).toBe(NIEAKTUALNE_BEZ_PARY_LABEL);
    expect(opisSwiezosci(opis)).toBe('nieaktualne');
  });

  it('czysta funkcja — ten sam argument zawsze daje ten sam wynik (determinizm)', () => {
    const opis: OpisSwiezosci = { stan: 'nieaktualne', rewizjaDanej: 1, rewizjaModelu: 3 };
    expect(opisSwiezosci(opis)).toBe(opisSwiezosci({ ...opis }));
  });
});
