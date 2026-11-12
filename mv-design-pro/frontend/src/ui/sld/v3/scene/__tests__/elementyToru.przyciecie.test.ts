// @vitest-environment node
/**
 * Łącznik na torze — przycięcie odcinków do portów glifu (`scene/elementyToru.ts`).
 *
 * Defekt z pomiaru 2026-11-05 (`koordynacja_scena_migawka`, L0, `…/segment_L_SL`): łącznik
 * stał na krótkim biegu pionowym tuż przy narożniku trasy, port glifu wypadł DOKŁADNIE
 * w narożniku, a przycięcie zostawiło wierzchołek powtórzony — wyrocznia fikstur
 * (`wierzcholkiWspolliniowe`) widziała w nim wierzchołek współliniowy (krawędź zerowa),
 * w którym skrzyżowanie nie byłoby wnętrzem żadnej krawędzi.
 *
 * Cechy iloczynu: położenie portu względem narożnika {w narożniku, za narożnikiem,
 * przed narożnikiem} × strona dobiegu {od dołu (bieg pionowy w górę), od góry} × rodzaj
 * łącznika {wyłącznik, rozłącznik}. Orzeczenia: łamana bez powtórzeń i bez wierzchołków
 * współliniowych; odcinek wchodzący kończy się, a wychodzący zaczyna na porcie glifu.
 */
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import type { PreviewSegment } from '../../compose/preview';
import type { RouteVertex } from '../../layout/route';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { elementyToru } from '../elementyToru';
import { wierzcholkiWspolliniowe } from '../stykiCzlonow';

const P = (x: number, y: number): RouteVertex => ({ x, y });

function siec(typLacznika: 'breaker' | 'switch'): EnergyNetworkModel {
  const galaz = (ref_id: string, type: string, from_bus_ref: string, to_bus_ref: string) => ({
    ref_id,
    name: ref_id,
    type,
    from_bus_ref,
    to_bus_ref,
    status: 'closed',
  });
  return {
    buses: [],
    branches: [galaz('A', 'cable', 'b0', 'b1'), galaz('S', typLacznika, 'b1', 'b2'), galaz('B', 'cable', 'b2', 'b3')],
  } as unknown as EnergyNetworkModel;
}

const odcinek = (ref: string, points: readonly RouteVertex[]): PreviewSegment => ({
  points,
  meta: { kind: 'snTrunk', ownerRef: ref, elementKind: 'segment' },
});

function bezPowtorzen(points: readonly RouteVertex[]): boolean {
  return points.every((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
}

describe('łącznik na torze przy narożniku trasy — przycięcie do portu glifu', () => {
  for (const typ of ['breaker', 'switch'] as const) {
    // Punkt łącznika a = (200, ya) na biegu pionowym; narożnik A w (200, 32).
    for (const [opis, ya] of [
      ['port w narożniku', 24],
      ['port za narożnikiem', 16],
      ['port przed narożnikiem', 8],
    ] as const) {
      for (const strona of ['od dołu', 'od góry'] as const) {
        it(`${typ} · ${opis} · dobieg ${strona}`, () => {
          // Dobieg od dołu: A biegnie poziomo w y=32, skręca w górę do a; B dalej w górę.
          // Dobieg od góry: lustro w osi y (narożnik w y=-32, a w -ya).
          const z = strona === 'od dołu' ? 1 : -1;
          const segA = odcinek('A', [P(0, 100 * z), P(0, 32 * z), P(200, 32 * z), P(200, ya * z)]);
          const segB = odcinek('B', [P(200, ya * z), P(200, -80 * z), P(400, -80 * z)]);
          const wynik = elementyToru(siec(typ), [segA, segB]);
          expect(wynik.stopNotes).toEqual([]);
          expect(wynik.symbols).toHaveLength(1);
          const glif = wynik.symbols[0];
          const def = SYMBOL_DEFS[glif.symbolId];
          const a = wynik.segments.find((s) => s.meta?.ownerRef === 'A')!;
          const b = wynik.segments.find((s) => s.meta?.ownerRef === 'B')!;
          for (const s of [a, b]) expect(bezPowtorzen(s.points), JSON.stringify(s.points)).toBe(true);
          expect(wierzcholkiWspolliniowe(wynik.segments)).toEqual([]);
          const porty = [P(200, glif.y), P(200, glif.y + def.height)].map((p) => `${p.x},${p.y}`);
          const koniecA = a.points[a.points.length - 1];
          const poczatekB = b.points[0];
          expect(porty).toContain(`${koniecA.x},${koniecA.y}`);
          expect(porty).toContain(`${poczatekB.x},${poczatekB.y}`);
          expect(`${koniecA.x},${koniecA.y}`).not.toBe(`${poczatekB.x},${poczatekB.y}`);
        });
      }
    }
  }
});
