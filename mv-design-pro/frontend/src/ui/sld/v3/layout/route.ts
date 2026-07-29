/**
 * SLD V3 — routing (SLD_CAD_SPEC_V3 §5.4, potok measure → bands → columns →
 * route → label). Czysta arytmetyka, zero DOM/losowości/Date (P7): ten sam
 * zestaw wejść (porty, przeszkody, indeks kanału) daje IDENTYCZNĄ polilinię
 * przy każdym wywołaniu.
 *
 * Trasa jest ortogonalna (segmenty WYŁĄCZNIE poziome/pionowe), port-to-port
 * (koniec = dokładnie pozycja portu, §11.3 port_probe), wierzchołki NA
 * siatce GRID (§11.2 grid_probe). Równoległe trasy w tym samym korytarzu
 * (ten sam `from`/`to` co do geometrii, różny `channelIndex`) dostają tory
 * przesunięte o `channelIndex × GRID` w osi PROSTOPADŁEJ do kierunku
 * wyjścia portu (spec §5.4 "kanały: ... tory co GRID").
 *
 * Tożsamość terminali (§16): `buildRoute` przenosi `fromTerminal`/
 * `toTerminal` (typ `SegmentTerminalRef`, WSPÓLNY z v2 — zero cienia modelu,
 * re-eksportowany chirurgicznie z `v2/canvas/enmToSldAdapter.ts`) 1:1 z
 * wejścia na wyjście; routing nie interpretuje ani nie modyfikuje tej
 * tożsamości.
 *
 * DECYZJA (luka spec §5.4, F3 — patrz raport końcowy): spec opisuje
 * `routeOrthogonal(from, to, obstacles, channelIndex)` jako funkcję zwracającą
 * "polilinię H/V", oraz OSOBNO wymaga wyjścia trasy w kształcie
 * `{ points, fromTerminal, toTerminal }`. Te dwie role rozdzielono na dwie
 * funkcje: `routeOrthogonal` (czysta geometria — polilinia) i `buildRoute`
 * (asembler doklejający §16 do wyniku `routeOrthogonal`) — spec nie nazywa
 * asemblera, nazwa `buildRoute` to decyzja tej implementacji.
 *
 * DECYZJA (luka spec §5.4, obchodzenie przeszkód): spec wymaga zera
 * przecięć trasa↔bbox (wyrocznia `wire_probe`), nie definiując algorytmu
 * omijania. Przyjęto najprostszy deterministyczny objazd wystarczający dla
 * ROUTINGU KORYTARZOWEGO magistrali/lateralu (nie ogólna scena z dowolnym
 * upakowaniem — to nie jest ogólny router A*): gdy odcinek trasy
 * przecina wnętrze przeszkody, tor jest przesuwany NAD/PONIŻEJ (odcinek
 * poziomy) lub NA LEWO/NA PRAWO (odcinek pionowy) od przeszkody, z
 * prześwitem GRID, wybierając kierunek o mniejszym przesunięciu względem
 * oryginalnego toru (remis: mniejsza współrzędna — „nad"/„na lewo").
 */

import { GRID, isOnGrid, type PortDir, type V3Rect } from '../core/grid';
import type { SegmentTerminalRef } from '../../v2/canvas/enmToSldAdapter';

/** Wierzchołek trasy w świecie (px, na siatce GRID — spec §11.2). */
export interface RouteVertex {
  readonly x: number;
  readonly y: number;
}

/** Port w ŚWIECIE (już zsumowany origin symbolu + offset portu z
 *  `SymbolPort`, spec §2/§3) — routing operuje wyłącznie na współrzędnych
 *  świata, nie zna origin/offset symbolu. */
export interface RoutePort {
  readonly x: number;
  readonly y: number;
  readonly dir: PortDir;
}

/** Klasyfikacja węzła trasy (spec §5.4): T-węzeł = jawna kropka (junction),
 *  skrzyżowanie niezależnych tras = bez kropki (crossing). */
export interface RouteNode {
  readonly x: number;
  readonly y: number;
}

export interface RouteGeometry {
  readonly points: readonly RouteVertex[];
}

/** Pełny wynik trasy (spec §5.4/§16): geometria + tożsamość terminali
 *  przeniesiona 1:1 z wejścia (§16 — patrz nagłówek pliku). */
export interface RouteResult extends RouteGeometry {
  readonly fromTerminal?: SegmentTerminalRef;
  readonly toTerminal?: SegmentTerminalRef;
}

export interface BuildRouteInput {
  readonly from: RoutePort;
  readonly to: RoutePort;
  /** Bboxy zakazane: symbole + sloty etykiet (columns.ts/bands.ts) — trasa
   *  nie może przeciąć ich WNĘTRZA (spec §5.4). */
  readonly obstacles?: readonly V3Rect[];
  /** Indeks toru w korytarzu równoległych tras (spec §5.4) — 0 = brak
   *  przesunięcia względem osi portu. */
  readonly channelIndex?: number;
  readonly fromTerminal?: SegmentTerminalRef;
  readonly toTerminal?: SegmentTerminalRef;
}

function isVerticalDir(dir: PortDir): boolean {
  return dir === 'N' || dir === 'S';
}

function isHorizontalDir(dir: PortDir): boolean {
  return dir === 'E' || dir === 'W';
}

/** Punkt oddalony od portu o `distance` w kierunku jego wyprowadzenia
 *  (`dir`) — pierwszy krok trasy zawsze zgodny z geometrią portu. */
function stepFrom(port: RoutePort, distance: number): RouteVertex {
  switch (port.dir) {
    case 'N':
      return { x: port.x, y: port.y - distance };
    case 'S':
      return { x: port.x, y: port.y + distance };
    case 'E':
      return { x: port.x + distance, y: port.y };
    case 'W':
      return { x: port.x - distance, y: port.y };
  }
}

/** Usuwa kolejne duplikaty i zbędne wierzchołki pośrednie leżące na wprost
 *  (trzy kolejne punkty współliniowe ⇒ środkowy jest zbędny). Nie zmienia
 *  trasy geometrycznie, tylko jej reprezentację (mniej wierzchołków). */
function simplifyCollinear(points: readonly RouteVertex[]): RouteVertex[] {
  const out: RouteVertex[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue; // duplikat
    if (out.length >= 2) {
      const a = out[out.length - 2];
      const b = out[out.length - 1];
      const collinear = (a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y);
      if (collinear) out.pop();
    }
    out.push(p);
  }
  return out;
}

/**
 * Kandydat geometryczny BEZ uwzględnienia przeszkód (spec §5.4: prosta H/V
 * gdy porty współliniowe; w przeciwnym razie kształt L/Z z jednym
 * odcinkiem-korytarzem przesuniętym o `channelIndex × GRID` w osi
 * prostopadłej do kierunku wyjścia portu `from`).
 */
function buildCandidatePath(from: RoutePort, to: RoutePort, channelIndex: number): RouteVertex[] {
  const p0: RouteVertex = { x: from.x, y: from.y };
  const p4: RouteVertex = { x: to.x, y: to.y };
  const offset = channelIndex * GRID;

  if (from.y === to.y && isHorizontalDir(from.dir) && isHorizontalDir(to.dir)) {
    if (offset === 0) return [p0, p4];
    const y = from.y + offset;
    return [p0, { x: p0.x, y }, { x: p4.x, y }, p4];
  }

  if (from.x === to.x && isVerticalDir(from.dir) && isVerticalDir(to.dir)) {
    if (offset === 0) return [p0, p4];
    const x = from.x + offset;
    return [p0, { x, y: p0.y }, { x, y: p4.y }, p4];
  }

  // Kształt L/Z: dosuw od `from` w jej kierunku wyjścia, korytarz
  // (prostopadła oś, przesunięty o kanał), dosuw do `to` z jej kierunku.
  const exit = stepFrom(from, GRID);
  const entry = stepFrom(to, GRID);

  if (isVerticalDir(from.dir)) {
    const sign = from.dir === 'S' ? 1 : -1;
    const laneY = exit.y + sign * offset;
    return [p0, exit, { x: exit.x, y: laneY }, { x: entry.x, y: laneY }, entry, p4];
  }
  const sign = from.dir === 'E' ? 1 : -1;
  const laneX = exit.x + sign * offset;
  return [p0, exit, { x: laneX, y: exit.y }, { x: laneX, y: entry.y }, entry, p4];
}

/** Przecięcie odcinka (ortogonalnego) z WNĘTRZEM prostokąta (styczność do
 *  krawędzi = brak kolizji — spec §5.4 zakazuje przejścia PRZEZ bbox, nie
 *  dotknięcia jego brzegu, np. w porcie). */
function segmentIntersectsRectInterior(a: RouteVertex, b: RouteVertex, rect: V3Rect): boolean {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const overlapsX = maxX > rect.x && minX < rect.x + rect.width;
  const overlapsY = maxY > rect.y && minY < rect.y + rect.height;
  return overlapsX && overlapsY;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi);
}

/** Objazd JEDNEGO odcinka POZIOMEGO dookoła `rect` (nad/pod, prześwit
 *  GRID) — patrz DECYZJA w nagłówku pliku. */
function detourHorizontal(a: RouteVertex, b: RouteVertex, rect: V3Rect): RouteVertex[] {
  const leftX = Math.min(a.x, b.x);
  const rightX = Math.max(a.x, b.x);
  const above = rect.y - GRID;
  const below = rect.y + rect.height + GRID;
  const y = Math.abs(above - a.y) <= Math.abs(below - a.y) ? above : below;
  const jogInX = clamp(rect.x - GRID, leftX, rightX);
  const jogOutX = clamp(rect.x + rect.width + GRID, leftX, rightX);
  const goingRight = b.x >= a.x;
  const x1 = goingRight ? jogInX : jogOutX;
  const x2 = goingRight ? jogOutX : jogInX;
  return [a, { x: x1, y: a.y }, { x: x1, y }, { x: x2, y }, { x: x2, y: b.y }, b];
}

/** Objazd JEDNEGO odcinka PIONOWEGO dookoła `rect` (lewo/prawo, prześwit
 *  GRID) — analogia do `detourHorizontal` z zamienioną osią. */
function detourVertical(a: RouteVertex, b: RouteVertex, rect: V3Rect): RouteVertex[] {
  const topY = Math.min(a.y, b.y);
  const bottomY = Math.max(a.y, b.y);
  const left = rect.x - GRID;
  const right = rect.x + rect.width + GRID;
  const x = Math.abs(left - a.x) <= Math.abs(right - a.x) ? left : right;
  const jogInY = clamp(rect.y - GRID, topY, bottomY);
  const jogOutY = clamp(rect.y + rect.height + GRID, topY, bottomY);
  const goingDown = b.y >= a.y;
  const y1 = goingDown ? jogInY : jogOutY;
  const y2 = goingDown ? jogOutY : jogInY;
  return [a, { x: a.x, y: y1 }, { x, y: y1 }, { x, y: y2 }, { x: b.x, y: y2 }, b];
}

interface Collision {
  readonly segmentIndex: number;
  readonly rect: V3Rect;
}

function findFirstCollision(points: readonly RouteVertex[], obstacles: readonly V3Rect[]): Collision | null {
  for (let i = 0; i + 1 < points.length; i++) {
    for (const rect of obstacles) {
      if (segmentIntersectsRectInterior(points[i], points[i + 1], rect)) {
        return { segmentIndex: i, rect };
      }
    }
  }
  return null;
}

function applyDetour(points: readonly RouteVertex[], collision: Collision): RouteVertex[] {
  const a = points[collision.segmentIndex];
  const b = points[collision.segmentIndex + 1];
  const detour = a.y === b.y ? detourHorizontal(a, b, collision.rect) : detourVertical(a, b, collision.rect);
  return [...points.slice(0, collision.segmentIndex), ...detour, ...points.slice(collision.segmentIndex + 2)];
}

/** Limit prób objazdu — router korytarzowy (nie ogólny A*, patrz DECYZJA w
 *  nagłówku); przekroczenie oznacza topologię poza zakresem F3. */
const MAX_DETOUR_PASSES = 8;

/**
 * Trasa ortogonalna port-to-port (spec §5.4). Zwraca polilinię (wierzchołki
 * NA siatce, końce dokładnie w `from`/`to`), omijającą WSZYSTKIE `obstacles`
 * z konstrukcji (patrz DECYZJA — objazd korytarzowy w nagłówku pliku).
 * Deterministyczna: to samo wejście ⇒ identyczny wynik (P7).
 *
 * Gdy limit prób objazdu (`MAX_DETOUR_PASSES`) zostanie wyczerpany BEZ
 * znalezienia trasy wolnej od kolizji (topologia poza zakresem routera
 * korytarzowego F3, np. sprzeczne kierunki objazdu oscylujące między dwiema
 * przeszkodami), funkcja NIE rzuca wyjątku — zwraca best-effort polilinię
 * (ostatni stan `points`, wciąż port-to-port i na siatce). Render ma
 * DOKOŃCZYĆ rysowanie; naruszenie zero-kolizji wykrywa i RAPORTUJE osobna
 * wyrocznia `routeAvoidsObstacles` (§11.4 wire_probe) — to nie jest
 * wyjątek czasu wykonania, tylko warunek do zgłoszenia przez oracle.
 */
export function routeOrthogonal(
  from: RoutePort,
  to: RoutePort,
  obstacles: readonly V3Rect[] = [],
  channelIndex = 0,
): readonly RouteVertex[] {
  let points = simplifyCollinear(buildCandidatePath(from, to, channelIndex));

  for (let pass = 0; pass < MAX_DETOUR_PASSES; pass++) {
    const collision = findFirstCollision(points, obstacles);
    if (!collision) return points;
    points = simplifyCollinear(applyDetour(points, collision));
  }
  return points;
}

/**
 * Asembler wyniku trasy (spec §5.4/§16): geometria z `routeOrthogonal` +
 * tożsamość terminali przeniesiona 1:1 z wejścia (patrz DECYZJA w nagłówku
 * pliku — spec nie nazywa tej funkcji).
 */
export function buildRoute(input: BuildRouteInput): RouteResult {
  const points = routeOrthogonal(input.from, input.to, input.obstacles ?? [], input.channelIndex ?? 0);
  return { points, fromTerminal: input.fromTerminal, toTerminal: input.toTerminal };
}

// ---------------------------------------------------------------------------
// Wyrocznie (spec §11.2/§11.3/§11.4) jako czyste funkcje.
// ---------------------------------------------------------------------------

/** grid_probe (§11.2): wszystkie wierzchołki trasy na siatce GRID. */
export function allVerticesOnGrid(route: RouteGeometry): boolean {
  return route.points.every((p) => isOnGrid(p.x) && isOnGrid(p.y));
}

/** wire_probe (§11.4): zero przecięć trasa↔bbox (wnętrze przeszkody). */
export function routeAvoidsObstacles(route: RouteGeometry, obstacles: readonly V3Rect[]): boolean {
  for (let i = 0; i + 1 < route.points.length; i++) {
    for (const rect of obstacles) {
      if (segmentIntersectsRectInterior(route.points[i], route.points[i + 1], rect)) return false;
    }
  }
  return true;
}

/** port_probe (§11.3): końce trasy = dokładnie pozycje portów. */
export function endsAtPorts(route: RouteGeometry, from: RoutePort, to: RoutePort): boolean {
  const first = route.points[0];
  const last = route.points[route.points.length - 1];
  return !!first && !!last && first.x === from.x && first.y === from.y && last.x === to.x && last.y === to.y;
}

/** Czy punkt `p` leży we WNĘTRZU odcinka ortogonalnego [s1,s2] — z WYŁĄCZENIEM
 *  obu końców. Użycie: klasyfikacja T-węzeł w `classifyRouteNodes` — dotknięcie
 *  DOKŁADNIE końca `s1`/`s2` (wspólny port / styk koniec-do-końca dwóch tras)
 *  NIE jest T-odczepem, więc nie kwalifikuje się jako junction (spec §5.4). */
function pointOnSegment(p: RouteVertex, s1: RouteVertex, s2: RouteVertex): boolean {
  if ((p.x === s1.x && p.y === s1.y) || (p.x === s2.x && p.y === s2.y)) return false; // koniec, nie wnętrze
  const minX = Math.min(s1.x, s2.x);
  const maxX = Math.max(s1.x, s2.x);
  const minY = Math.min(s1.y, s2.y);
  const maxY = Math.max(s1.y, s2.y);
  if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) return false;
  if (s1.x === s2.x) return p.x === s1.x; // odcinek pionowy
  if (s1.y === s2.y) return p.y === s1.y; // odcinek poziomy
  return false;
}

/** Punkt przecięcia dwóch odcinków ortogonalnych PROSTOPADŁYCH (jeden
 *  pionowy, jeden poziomy) — `null` gdy równoległe lub bez przecięcia w
 *  zakresie obu odcinków. Współliniowe nakładanie się (dwa odcinki poziome
 *  na tej samej wysokości) to poza zakresem klasyfikacji T-węzeł/skrzyżowanie
 *  (routing korytarzowy z kanałami z konstrukcji nie nakłada torów, §5.4). */
function perpendicularIntersection(
  a1: RouteVertex,
  a2: RouteVertex,
  b1: RouteVertex,
  b2: RouteVertex,
): RouteVertex | null {
  const aVertical = a1.x === a2.x;
  const bVertical = b1.x === b2.x;
  if (aVertical === bVertical) return null; // równoległe (H-H lub V-V)

  const vert = aVertical ? a1 : b1;
  const vert2 = aVertical ? a2 : b2;
  const horiz1 = aVertical ? b1 : a1;
  const horiz2 = aVertical ? b2 : a2;

  const x = vert.x;
  const yMin = Math.min(vert.y, vert2.y);
  const yMax = Math.max(vert.y, vert2.y);
  const y = horiz1.y;
  const xMin = Math.min(horiz1.x, horiz2.x);
  const xMax = Math.max(horiz1.x, horiz2.x);

  if (x >= xMin && x <= xMax && y >= yMin && y <= yMax) return { x, y };
  return null;
}

export interface RouteNodeClassification {
  /** T-węzeł: koniec (endpoint) JEDNEJ trasy leży NA odcinku INNEJ trasy —
   *  rzeczywiste połączenie elektryczne (spec §5.4: jawna kropka ∅6). */
  readonly junctions: readonly RouteNode[];
  /** Skrzyżowanie: przecięcie segmentów RÓŻNYCH tras, które NIE jest
   *  junction — brak połączenia elektrycznego (spec §5.4: bez kropki). */
  readonly crossings: readonly RouteNode[];
}

/**
 * Klasyfikuje węzły zbioru tras (spec §5.4): T-węzeł (junction, kropka) vs
 * skrzyżowanie (crossing, bez kropki). Determinizm: kolejność wejściowych
 * tras nie wpływa na ZBIÓR wynikowych węzłów (tylko na kolejność w tablicy
 * wyjściowej, która jest stabilna — pierwsze trafienie w kolejności
 * przetwarzania, bez losowości).
 */
export function classifyRouteNodes(routes: readonly RouteGeometry[]): RouteNodeClassification {
  const junctionKeys = new Set<string>();
  const junctions: RouteNode[] = [];
  const keyOf = (p: RouteVertex): string => `${p.x},${p.y}`;

  for (let ri = 0; ri < routes.length; ri++) {
    const endpoints = [routes[ri].points[0], routes[ri].points[routes[ri].points.length - 1]];
    for (const endpoint of endpoints) {
      if (!endpoint) continue;
      for (let rj = 0; rj < routes.length; rj++) {
        if (rj === ri) continue;
        const other = routes[rj].points;
        for (let s = 0; s + 1 < other.length; s++) {
          if (pointOnSegment(endpoint, other[s], other[s + 1])) {
            const key = keyOf(endpoint);
            if (!junctionKeys.has(key)) {
              junctionKeys.add(key);
              junctions.push(endpoint);
            }
            break;
          }
        }
      }
    }
  }

  const isRouteEndpoint = (p: RouteVertex, route: RouteGeometry): boolean => {
    const first = route.points[0];
    const last = route.points[route.points.length - 1];
    return (!!first && p.x === first.x && p.y === first.y) || (!!last && p.x === last.x && p.y === last.y);
  };

  const crossingKeys = new Set<string>();
  const crossings: RouteNode[] = [];
  for (let ri = 0; ri < routes.length; ri++) {
    for (let rj = ri + 1; rj < routes.length; rj++) {
      const A = routes[ri].points;
      const B = routes[rj].points;
      for (let i = 0; i + 1 < A.length; i++) {
        for (let j = 0; j + 1 < B.length; j++) {
          const point = perpendicularIntersection(A[i], A[i + 1], B[j], B[j + 1]);
          if (!point) continue;
          const key = keyOf(point);
          if (junctionKeys.has(key) || crossingKeys.has(key)) continue;
          // Punkt będący RÓWNOCZEŚNIE endpointem trasy `ri` lub `rj` (styk
          // koniec-do-końca / wspólny port) to ani junction, ani crossing —
          // nie ma tu dwóch niezależnych tras przechodzących nawzajem przez
          // siebie, tylko naturalne złącze (patrz DECYZJA FIX-B w pointOnSegment).
          if (isRouteEndpoint(point, routes[ri]) || isRouteEndpoint(point, routes[rj])) continue;
          crossingKeys.add(key);
          crossings.push(point);
        }
      }
    }
  }

  return { junctions, crossings };
}
