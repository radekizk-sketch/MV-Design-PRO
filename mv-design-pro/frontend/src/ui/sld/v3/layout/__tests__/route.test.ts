/**
 * SLD V3 F3 — wyrocznie routingu (SLD_CAD_SPEC_V3 §5.4, §11.2–§11.4, §16).
 * Wszystkie testy na SYNTETYKACH jawnych — zero losowości (P7).
 *
 * Testy r1/r2/r3 (poprawki `bands.ts`/`columns.ts` zapisane w
 * `docs/execplans/SLD_CAD_REBUILD_PLAN_V3.md` §F2 jako dług) mieszkają w
 * `layout.test.ts` (obok `computeBands`/`computeColumns`, których dotyczą),
 * nie tutaj — ten plik testuje WYŁĄCZNIE `route.ts`.
 */
import { describe, expect, it } from 'vitest';

import { GRID, type PortDir, type V3Rect } from '../../core/grid';
import {
  allVerticesOnGrid,
  buildRoute,
  classifyRouteNodes,
  endsAtPorts,
  routeAvoidsObstacles,
  routeOrthogonal,
  type RoutePort,
  type RouteVertex,
} from '../route';

function port(x: number, y: number, dir: PortDir): RoutePort {
  return { x, y, dir };
}

describe('V3 route — routeOrthogonal (spec §5.4): trasa prosta i L-kształtna', () => {
  it('porty współliniowe w poziomie → linia prosta, wierzchołki na siatce, końce dokładnie w portach', () => {
    const from = port(0, 40, 'E');
    const to = port(120, 40, 'W');
    const route = { points: routeOrthogonal(from, to) };

    expect(allVerticesOnGrid(route)).toBe(true);
    expect(endsAtPorts(route, from, to)).toBe(true);
    expect(route.points).toEqual([
      { x: 0, y: 40 },
      { x: 120, y: 40 },
    ]);
  });

  it('porty współliniowe w pionie → linia prosta pionowa', () => {
    const from = port(64, 0, 'S');
    const to = port(64, 96, 'N');
    const route = { points: routeOrthogonal(from, to) };

    expect(allVerticesOnGrid(route)).toBe(true);
    expect(endsAtPorts(route, from, to)).toBe(true);
    expect(route.points.every((p) => p.x === 64)).toBe(true);
  });

  it('porty NIE współliniowe (dir pionowy z from) → kształt L/Z, wierzchołki na siatce, końce w portach', () => {
    const from = port(0, 0, 'S'); // wyjście w dół (np. odczep szyny)
    const to = port(80, 64, 'N'); // wejście od dołu (np. do pola sąsiedniej stacji)
    const route = { points: routeOrthogonal(from, to) };

    expect(allVerticesOnGrid(route)).toBe(true);
    expect(endsAtPorts(route, from, to)).toBe(true);
    // Wyłącznie odcinki ortogonalne (każda para kolejnych wierzchołków
    // zgadza się w X LUB w Y).
    for (let i = 0; i + 1 < route.points.length; i++) {
      const a = route.points[i];
      const b = route.points[i + 1];
      expect(a.x === b.x || a.y === b.y).toBe(true);
    }
    // Więcej niż 2 wierzchołki — trasa faktycznie skręca.
    expect(route.points.length).toBeGreaterThan(2);
  });

  it('porty NIE współliniowe (dir poziomy z from) → kształt L/Z analogicznie', () => {
    const from = port(0, 0, 'E');
    const to = port(96, 48, 'W');
    const route = { points: routeOrthogonal(from, to) };

    expect(allVerticesOnGrid(route)).toBe(true);
    expect(endsAtPorts(route, from, to)).toBe(true);
    for (let i = 0; i + 1 < route.points.length; i++) {
      const a = route.points[i];
      const b = route.points[i + 1];
      expect(a.x === b.x || a.y === b.y).toBe(true);
    }
  });
});

describe('V3 route — routeOrthogonal (spec §5.4): korytarz — tory równoległe co GRID', () => {
  it('dwie trasy z RÓŻNYM channelIndex → tor przesunięty dokładnie o GRID, zero segmentów współliniowych nakładających się', () => {
    const from = port(0, 0, 'S');
    const to = port(80, 40, 'N');

    const track0 = routeOrthogonal(from, to, [], 0);
    const track1 = routeOrthogonal(from, to, [], 1);

    expect(allVerticesOnGrid({ points: track0 })).toBe(true);
    expect(allVerticesOnGrid({ points: track1 })).toBe(true);

    // Oba tory zaczynają/kończą się w TYCH SAMYCH portach (definicja
    // korytarza — różne trasy do tego samego celu, rozsunięte torem).
    expect(endsAtPorts({ points: track0 }, from, to)).toBe(true);
    expect(endsAtPorts({ points: track1 }, from, to)).toBe(true);

    // Odcinek "korytarzowy" (poziomy, dir='S' z from -> lane w Y) toru 1 jest
    // dokładnie GRID dalej niż toru 0.
    const laneYOf = (pts: readonly RouteVertex[]): number => {
      // Odcinek poziomy leżący MIĘDZY pierwszym a ostatnim wierzchołkiem
      // (nie stub startowy/końcowy) — dla tej geometrii to punkt [1].y.
      return pts[1].y;
    };
    expect(laneYOf(track1) - laneYOf(track0)).toBe(GRID);

    // Zero nakładania: żaden odcinek toru 0 nie jest współliniowy I
    // pokrywający się z odcinkiem toru 1 (różne lane Y ⇒ z konstrukcji brak
    // nakładania odcinków poziomych; sprawdzamy jawnie).
    for (let i = 0; i + 1 < track0.length; i++) {
      for (let j = 0; j + 1 < track1.length; j++) {
        const a0 = track0[i];
        const b0 = track0[i + 1];
        const a1 = track1[j];
        const b1 = track1[j + 1];
        const bothHorizontal = a0.y === b0.y && a1.y === b1.y;
        if (bothHorizontal && a0.y === a1.y) {
          // Ten sam Y — muszą mieć rozłączne zakresy X (brak nakładania).
          const minX0 = Math.min(a0.x, b0.x);
          const maxX0 = Math.max(a0.x, b0.x);
          const minX1 = Math.min(a1.x, b1.x);
          const maxX1 = Math.max(a1.x, b1.x);
          expect(maxX0 <= minX1 || maxX1 <= minX0).toBe(true);
        }
      }
    }
  });

  it('to samo wejście (ta sama para portów + kanał) ⇒ identyczny wynik (determinizm)', () => {
    const from = port(16, 16, 'E');
    const to = port(96, 64, 'W');
    const first = routeOrthogonal(from, to, [], 2);
    const second = routeOrthogonal(from, to, [], 2);
    expect(second).toEqual(first);
  });
});

describe('V3 route — routeAvoidsObstacles / routeOrthogonal (spec §5.4, §11.4): omijanie przeszkód', () => {
  it('przeszkoda MIĘDZY portami na wprost → routeOrthogonal generuje objazd (routeAvoidsObstacles = true)', () => {
    const from = port(0, 40, 'E');
    const to = port(160, 40, 'W');
    // Przeszkoda dokładnie NA prostej trasie (obejmuje y=40 na szerokim
    // zakresie x) — trasa "na wprost" MUSIAŁABY przez nią przejść.
    const obstacle: V3Rect = { x: 64, y: 24, width: 32, height: 32 };

    const route = { points: routeOrthogonal(from, to, [obstacle]) };

    expect(routeAvoidsObstacles(route, [obstacle])).toBe(true);
    expect(allVerticesOnGrid(route)).toBe(true);
    expect(endsAtPorts(route, from, to)).toBe(true);
  });

  it('KONTRPRZYKŁAD: trasa "na wprost" (bez objazdu) PRZEZ tę samą przeszkodę jest wykrywana jako naruszenie', () => {
    const from: RouteVertex = { x: 0, y: 40 };
    const to: RouteVertex = { x: 160, y: 40 };
    const obstacle: V3Rect = { x: 64, y: 24, width: 32, height: 32 };
    const naiveStraightRoute = { points: [from, to] };

    expect(routeAvoidsObstacles(naiveStraightRoute, [obstacle])).toBe(false);
  });

  it('przeszkoda na trasie pionowej (kształt L) → objazd w X, zero przecięć', () => {
    const from = port(40, 0, 'S');
    const to = port(40, 120, 'N');
    const obstacle: V3Rect = { x: 24, y: 48, width: 32, height: 24 };

    const route = { points: routeOrthogonal(from, to, [obstacle]) };

    expect(routeAvoidsObstacles(route, [obstacle])).toBe(true);
    expect(allVerticesOnGrid(route)).toBe(true);
    expect(endsAtPorts(route, from, to)).toBe(true);
  });

  it('FIX-A: dwie przeszkody wymuszające OSCYLACJĘ objazdu (sprzeczne kierunki) → routeOrthogonal NIE rzuca, zwraca best-effort polilinię; wyrocznia routeAvoidsObstacles WYKRYWA naruszenie (false)', () => {
    // Konstrukcja celowo wyczerpuje limit prób (MAX_DETOUR_PASSES): objazd
    // przeszkody A przesuwa odcinek w rejon przeszkody B, objazd B przesuwa
    // go z powrotem w rejon A — stan oscyluje w kółko (nigdy się nie
    // stabilizuje w limicie 8 przejść). Router korytarzowy F3 NIE jest
    // ogólnym A* (patrz DECYZJA w nagłówku route.ts) — to legalna topologia
    // poza jego zakresem, którą ma zgłosić wyrocznia, nie wyjątek.
    const from = port(0, 40, 'E');
    const to = port(200, 40, 'W');
    const obstacleA: V3Rect = { x: 64, y: 24, width: 32, height: 32 };
    const obstacleB: V3Rect = { x: 60, y: 0, width: 20, height: 24 };

    let points: readonly RouteVertex[] | undefined;
    expect(() => {
      points = routeOrthogonal(from, to, [obstacleA, obstacleB]);
    }).not.toThrow();

    expect(points).toBeDefined();
    const route = { points: points! };
    // Best-effort: nadal port-to-port i na siatce, mimo że NIE omija obu
    // przeszkód (to właśnie ma wykryć wyrocznia poniżej).
    expect(endsAtPorts(route, from, to)).toBe(true);
    expect(allVerticesOnGrid(route)).toBe(true);
    expect(routeAvoidsObstacles(route, [obstacleA, obstacleB])).toBe(false);
  });
});

describe('V3 route — classifyRouteNodes (spec §5.4): T-węzeł (junction) vs skrzyżowanie (crossing)', () => {
  it('koniec jednej trasy leżący NA odcinku drugiej → junction (jawna kropka)', () => {
    // Magistrala pozioma (0,40)->(160,40); lateral schodzi z punktu (80,40)
    // (leży NA magistrali, nie w jej wierzchołku) w dół do stacji odgałęzienia.
    const trunk = { points: routeOrthogonal(port(0, 40, 'E'), port(160, 40, 'W')) };
    const lateral = { points: routeOrthogonal(port(80, 40, 'S'), port(80, 120, 'N')) };

    const { junctions, crossings } = classifyRouteNodes([trunk, lateral]);

    expect(junctions).toEqual([{ x: 80, y: 40 }]);
    expect(crossings).toHaveLength(0);
  });

  it('dwie NIEZALEŻNE trasy przecinające się bez wspólnego końca → crossing (bez kropki)', () => {
    // Trasa pozioma i trasa pionowa przecinają się w (80,40), ale ŻADNA z
    // nich nie MA tam swojego końca (końce są gdzie indziej) — to fizyczne
    // skrzyżowanie bez połączenia elektrycznego (np. kabel nad/pod inną fazą).
    const routeA = { points: [{ x: 0, y: 40 }, { x: 160, y: 40 }] };
    const routeB = { points: [{ x: 80, y: 0 }, { x: 80, y: 96 }] };

    const { junctions, crossings } = classifyRouteNodes([routeA, routeB]);

    expect(junctions).toHaveLength(0);
    expect(crossings).toEqual([{ x: 80, y: 40 }]);
  });

  it('trzy trasy: jeden T-węzeł + jedno niezależne skrzyżowanie jednocześnie', () => {
    const trunk = { points: [{ x: 0, y: 40 }, { x: 160, y: 40 }] };
    const tap = { points: [{ x: 60, y: 40 }, { x: 60, y: 100 }] }; // koniec NA trunk → junction
    const crosser = { points: [{ x: 120, y: 0 }, { x: 120, y: 96 }] }; // przecina trunk, bez wspólnego końca → crossing

    const { junctions, crossings } = classifyRouteNodes([trunk, tap, crosser]);

    expect(junctions).toEqual([{ x: 60, y: 40 }]);
    expect(crossings).toEqual([{ x: 120, y: 40 }]);
  });

  it('determinizm: ta sama kolejność wejścia ⇒ identyczny wynik klasyfikacji', () => {
    const trunk = { points: routeOrthogonal(port(0, 40, 'E'), port(160, 40, 'W')) };
    const lateral = { points: routeOrthogonal(port(80, 40, 'S'), port(80, 120, 'N')) };
    const first = classifyRouteNodes([trunk, lateral]);
    const second = classifyRouteNodes([trunk, lateral]);
    expect(second).toEqual(first);
  });

  it('FIX-B kontrprzykład: dwie trasy wychodzące z TEGO SAMEGO portu → zero junctions (wspólny port na szynie, nie T-odczep)', () => {
    const sharedPort = { x: 40, y: 40 };
    const routeA = { points: [sharedPort, { x: 40, y: 100 }] };
    const routeB = { points: [sharedPort, { x: 120, y: 40 }] };

    const { junctions, crossings } = classifyRouteNodes([routeA, routeB]);

    expect(junctions).toHaveLength(0);
    expect(crossings).toHaveLength(0);
  });

  it('FIX-B kontrprzykład: styk koniec-do-końca dwóch tras → zero junctions', () => {
    const routeC = { points: [{ x: 0, y: 40 }, { x: 100, y: 40 }] };
    const routeD = { points: [{ x: 100, y: 40 }, { x: 100, y: 120 }] };

    const { junctions, crossings } = classifyRouteNodes([routeC, routeD]);

    expect(junctions).toHaveLength(0);
    expect(crossings).toHaveLength(0);
  });

  it('FIX-B regresja: poprawny T-odczep (koniec JEDNEJ trasy we WNĘTRZU odcinka drugiej) nadal klasyfikowany jako junction', () => {
    const trunk = { points: [{ x: 0, y: 40 }, { x: 160, y: 40 }] };
    const lateral = { points: [{ x: 80, y: 40 }, { x: 80, y: 120 }] };

    const { junctions, crossings } = classifyRouteNodes([trunk, lateral]);

    expect(junctions).toEqual([{ x: 80, y: 40 }]);
    expect(crossings).toHaveLength(0);
  });
});

describe('V3 route — buildRoute (spec §16): terminale przenoszone 1:1', () => {
  it('fromTerminal/toTerminal z wejścia trafiają BEZ ZMIAN do wyniku', () => {
    const result = buildRoute({
      from: port(0, 40, 'E'),
      to: port(120, 40, 'W'),
      fromTerminal: { busRef: 'bus-1', ownerRef: 'station-a' },
      toTerminal: { busRef: 'bus-2', ownerRef: 'station-b' },
    });

    expect(result.fromTerminal).toEqual({ busRef: 'bus-1', ownerRef: 'station-a' });
    expect(result.toTerminal).toEqual({ busRef: 'bus-2', ownerRef: 'station-b' });
    expect(allVerticesOnGrid(result)).toBe(true);
  });

  it('brak terminali na wejściu ⇒ brak terminali na wyjściu (undefined, nie fabrykowane wartości)', () => {
    const result = buildRoute({ from: port(0, 0, 'E'), to: port(40, 0, 'W') });
    expect(result.fromTerminal).toBeUndefined();
    expect(result.toTerminal).toBeUndefined();
  });

  it('terminal z busRef=null (np. terminal splice śródliniowy, §16) przenoszony wiernie — nie zamieniany na undefined', () => {
    const result = buildRoute({
      from: port(0, 0, 'S'),
      to: port(0, 40, 'N'),
      fromTerminal: { busRef: null, ownerRef: null },
    });
    expect(result.fromTerminal).toEqual({ busRef: null, ownerRef: null });
  });
});

describe('V3 route — allVerticesOnGrid / endsAtPorts (spec §11.2/§11.3): wyrocznie na przykładach negatywnych', () => {
  it('allVerticesOnGrid wykrywa wierzchołek POZA siatką', () => {
    const route = { points: [{ x: 0, y: 0 }, { x: 5, y: 0 }] };
    expect(allVerticesOnGrid(route)).toBe(false);
  });

  it('endsAtPorts wykrywa trasę, która NIE kończy się dokładnie w porcie docelowym', () => {
    const from = port(0, 0, 'E');
    const to = port(80, 0, 'W');
    const route = { points: [{ x: 0, y: 0 }, { x: 72, y: 0 }] }; // o GRID za krótko
    expect(endsAtPorts(route, from, to)).toBe(false);
  });
});
