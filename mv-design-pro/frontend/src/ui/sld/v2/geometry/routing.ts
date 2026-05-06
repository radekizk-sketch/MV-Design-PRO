/**
 * SLD v2 Routing — ortogonalne L-shape (PR-5).
 *
 * Zastępuje phase5-routing.ts (A* + collision avoidance, 516 linii).
 * Nowy routing wynika z hierarchii kanałów Y, NIE z minimalizacji.
 */

import { snapToGrid } from '../theme/tokens';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Path {
  readonly points: readonly Point[];
}

/**
 * Routing ortogonalny L-shape od portu A do portu B.
 *
 * Strategia:
 * 1. Z portu A schodzimy/wchodzimy w pionie do kanału Y (channelY).
 * 2. Wzdłuż channelY przesuwamy się horyzontalnie do X portu B.
 * 3. Z channelY wchodzimy/schodzimy w pionie do portu B.
 *
 * Wynikowa ścieżka ma 4 punkty (start → corner1 → corner2 → end) i jest
 * deterministyczna dla danego wejścia.
 */
export function routeOrthogonalL(
  from: Point,
  to: Point,
  channelY: number,
): Path {
  const channelYSnapped = snapToGrid(channelY);
  return {
    points: [
      { x: snapToGrid(from.x), y: snapToGrid(from.y) },
      { x: snapToGrid(from.x), y: channelYSnapped },
      { x: snapToGrid(to.x), y: channelYSnapped },
      { x: snapToGrid(to.x), y: snapToGrid(to.y) },
    ],
  };
}

/**
 * Routing prosty (pionowy lub horyzontalny) — gdy from i to są na tej samej osi.
 */
export function routeStraight(from: Point, to: Point): Path {
  return {
    points: [
      { x: snapToGrid(from.x), y: snapToGrid(from.y) },
      { x: snapToGrid(to.x), y: snapToGrid(to.y) },
    ],
  };
}

/**
 * Routing dla pola SN w GPZ — pionowy tor od szyny w dół.
 *
 * Pole jest sekwencją aparatów wertykalnie ułożonych pod szyną.
 */
export function routeBayDownTrack(
  bayHead: Point,
  bayTailY: number,
): Path {
  return routeStraight(bayHead, { x: bayHead.x, y: snapToGrid(bayTailY) });
}

/**
 * Routing kabla / linii od pola GPZ do stacji na ciągu.
 *
 * `bayPort` — port wyjściowy pola GPZ (X jest X-em pola).
 * `stationPort` — port wejściowy stacji na ciągu (X jest X-em stacji).
 * `runChannelY` — kanał Y ciągu liniowego.
 */
export function routeRunSegment(
  bayPort: Point,
  stationPort: Point,
  runChannelY: number,
): Path {
  return routeOrthogonalL(bayPort, stationPort, runChannelY);
}

/**
 * Routing odgałęzienia od stacji macierzystej do stacji końcowej odgałęzienia.
 *
 * Odgałęzienie schodzi z kanału macierzystego do niższego kanału (branchChannelY).
 */
export function routeBranchSegment(
  parentStationPort: Point,
  branchStationPort: Point,
  branchChannelY: number,
): Path {
  return routeOrthogonalL(parentStationPort, branchStationPort, branchChannelY);
}

/**
 * Walidacja: czy wszystkie segmenty ścieżki są ortogonalne.
 *
 * Inwariant (BINDING): nie ma diagonalnych segmentów.
 */
export function isOrthogonal(path: Path): boolean {
  for (let i = 0; i < path.points.length - 1; i++) {
    const a = path.points[i];
    const b = path.points[i + 1];
    if (a.x !== b.x && a.y !== b.y) {
      return false;
    }
  }
  return true;
}

/**
 * Walidacja: czy wszystkie współrzędne są wielokrotnościami GRID_BASE_PX.
 */
export function isOnGrid(path: Path): boolean {
  for (const p of path.points) {
    if (snapToGrid(p.x) !== p.x || snapToGrid(p.y) !== p.y) {
      return false;
    }
  }
  return true;
}
