/**
 * Test rejestru mostu legacy (E1.7b §4): każda przestrzeń MA wpis —
 * nowa zawartość albo powierzchnia legacy z jawnym planem wygaszenia.
 */

import { describe, expect, it } from 'vitest';

import { SPACE_IDS } from '../../shell/spaces';
import { REJESTR_LEGACY } from '../legacyRegistry';

describe('E1.7b — rejestr mostu legacy (lista wygaszania)', () => {
  it('każda z 7 przestrzeni ma wpis w rejestrze', () => {
    expect(SPACE_IDS).toHaveLength(7);
    for (const space of SPACE_IDS) {
      const wpis = REJESTR_LEGACY[space];
      expect(wpis, `brak wpisu rejestru dla przestrzeni "${space}"`).toBeTruthy();
      expect(wpis.przestrzen).toBe(space);
      expect(['nowa-powloka', 'legacy']).toContain(wpis.zrodlo);
      expect(wpis.montaz.length).toBeGreaterThan(0);
      expect(wpis.wygaszenie.length).toBeGreaterThan(0);
    }
  });

  it('przestrzenie przejęte przez nową powłokę: projekt (U1) i gotowość (U2/E6.1); pozostałe mostem legacy', () => {
    const przejete: readonly string[] = ['projekt', 'gotowosc'];
    for (const space of SPACE_IDS) {
      const oczekiwane = przejete.includes(space) ? 'nowa-powloka' : 'legacy';
      expect(REJESTR_LEGACY[space].zrodlo, `przestrzeń "${space}"`).toBe(oczekiwane);
    }
  });

  it('każdy wpis legacy deklaruje pokrywane obszary starej nawigacji (mapowanie §3a)', () => {
    for (const space of SPACE_IDS) {
      const wpis = REJESTR_LEGACY[space];
      if (wpis.zrodlo === 'legacy') {
        expect(wpis.obszaryLegacy.length, `przestrzeń "${space}"`).toBeGreaterThan(0);
      }
    }
  });
});
