/**
 * Stan obiektu łącznika — lustro reguły backendu (`enm.gaz_fluorowany_pola.stan_obiektu_lacznika`).
 *
 * Fikstura powstaje z WYNIKU backendu (`backend/tests/ci/test_parytet_stanu_obiektu.py` — strażnik
 * równości fikstury z backendem) na iloczynie cech {aparat pola wskazujący gałąź: brak,
 * istniejący, projektowany, bez stanu} × {stan własny gałęzi: brak, istniejący, projektowany} ×
 * {pole wymieniające gałąź: brak, istniejące, projektowane, bez stanu}. Lustro daje na każdym
 * przypadku ten sam stan co backend.
 */
import { describe, expect, it } from 'vitest';

import type { StanObiektu } from '../../../types/enm';
import { nazwaStanuObiektuPl, STAN_OBIEKTU_NIEUSTALONY_PL, stanObiektuLacznika } from '../stanObiektu';
import przypadki from './fixtures/stan_obiektu_lacznika.json';

interface Przypadek {
  readonly nazwa: string;
  readonly enm: { readonly bays: Parameters<typeof stanObiektuLacznika>[0]; readonly branches: readonly { ref_id: string; stan_obiektu?: StanObiektu | null }[] };
  readonly stan: StanObiektu | null;
}

const PRZYPADKI = przypadki as unknown as readonly Przypadek[];

describe('stanObiektuLacznika — parytet z backendem', () => {
  it('fikstura pokrywa iloczyn 4 × 3 × 4 i każdy wynik reguły', () => {
    expect(PRZYPADKI).toHaveLength(48);
    expect(new Set(PRZYPADKI.map((p) => p.stan))).toEqual(new Set(['ISTNIEJACY', 'PROJEKTOWANY', null]));
  });

  for (const p of PRZYPADKI) {
    it(`${p.nazwa}: stan = backend (${String(p.stan)})`, () => {
      expect(stanObiektuLacznika(p.enm.bays, p.enm.branches[0])).toBe(p.stan);
    });
  }

  it('stan nieustalony ma własne zdanie, nie „istniejący"', () => {
    expect(nazwaStanuObiektuPl(null)).toBe(STAN_OBIEKTU_NIEUSTALONY_PL);
    expect(nazwaStanuObiektuPl('ISTNIEJACY')).toBe('istniejący');
  });
});
