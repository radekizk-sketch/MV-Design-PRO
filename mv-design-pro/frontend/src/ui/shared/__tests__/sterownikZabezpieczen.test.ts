// @vitest-environment node
/**
 * `sterownikPola` — jedno przejście listy sterowników bez sortowania (koszt liniowy; budżet
 * czasu sceny rodziny H w `buildScene.schemat10s7p6.test.ts` przypina koszt całego adaptera).
 * Wynik musi być identyczny z regułą kolejności `sterowniki` (pierwszy po identyfikatorze).
 *
 * Iloczyn cech: liczba sterowników pola {0, 1, 2, 3} × kolejność listy {rosnąca, malejąca,
 * przeplot z sterownikami innych pól} × odwołanie pola {pole z listy, pole spoza listy, pusty
 * napis, null, undefined} × model {z listą, bez listy, null}.
 */
import { describe, expect, it } from 'vitest';

import type { ProtectionAssignment } from '../../../types/enm';
import { sterowniki, sterownikPola } from '../sterownikZabezpieczen';
import { sterownikTestowy } from '../../../test/sterownik';

const POLE = 'pole/A';

function lista(liczba: number, kolejnosc: 'rosnaca' | 'malejaca' | 'przeplot'): ProtectionAssignment[] {
  const wlasne = Array.from({ length: liczba }, (_, i) => sterownikTestowy({ ref: `s/${i + 1}`, bayRef: POLE, kody: ['51'] }));
  const obce = [sterownikTestowy({ ref: 's/0', bayRef: 'pole/B' }), sterownikTestowy({ ref: 's/9', bayRef: 'pole/C' })];
  if (kolejnosc === 'rosnaca') return [...obce, ...wlasne];
  if (kolejnosc === 'malejaca') return [...wlasne].reverse().concat(obce);
  return wlasne.flatMap((s, i) => (obce[i] ? [obce[i], s] : [s])).reverse();
}

describe('sterownikPola — iloczyn cech', () => {
  for (const liczba of [0, 1, 2, 3]) {
    for (const kolejnosc of ['rosnaca', 'malejaca', 'przeplot'] as const) {
      it(`${liczba} sterowników pola · kolejność ${kolejnosc}`, () => {
        const model = { protection_assignments: lista(liczba, kolejnosc) };
        const wzorzec = (ref: string | null | undefined) => (ref ? (sterowniki(model).find((s) => s.bay_ref === ref) ?? null) : null);
        for (const ref of [POLE, 'pole/B', 'pole/spoza', '', null, undefined]) {
          expect(sterownikPola(model, ref), String(ref)).toBe(wzorzec(ref));
        }
        expect(sterownikPola(model, POLE)?.ref_id ?? null).toBe(liczba === 0 ? null : 's/1');
      });
    }
  }

  it('model bez listy sterowników i model pusty — brak sterownika', () => {
    expect(sterownikPola({}, POLE)).toBeNull();
    expect(sterownikPola(null, POLE)).toBeNull();
    expect(sterownikPola(undefined, POLE)).toBeNull();
  });
});
