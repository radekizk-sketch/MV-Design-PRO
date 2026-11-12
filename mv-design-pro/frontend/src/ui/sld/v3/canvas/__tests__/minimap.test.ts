// @vitest-environment node
/**
 * K11-B §0.1 — minimapa (nawigator): geometria projekcji.
 *
 * Wszystko, co minimapa robi z liczbami, żyje w `canvas/minimap.ts` jako czyste
 * funkcje — więc dowód jest tu, bez renderu i bez DOM. Panel
 * (`SldMinimapPanel.tsx`) tylko rysuje policzone kształty i zamienia gest na
 * punkt, a integrację end-to-end (klik przesuwa kadr, skala bez zmian) ćwiczy
 * spec `e2e/sld-minimapa.spec.ts` na ŻYWEJ aplikacji.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import type { V3Rect } from '../../core/grid';
import {
  MINIMAP_MAX_HEIGHT,
  MINIMAP_MIN_HEIGHT,
  minimapPointToWorld,
  minimapProjectionOf,
  minimapShapesOf,
  parseCameraViewBox,
  worldRectToMinimap,
} from '../minimap';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'v2',
  'geometry',
  '__tests__',
  'fixtures',
  'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;
const scena = buildSceneV3(enm);

const SQUARE: V3Rect = { x: 0, y: 0, width: 1000, height: 1000 };

describe('K11-B — projekcja minimapy', () => {
  it('bbox zdegenerowany (pusty projekt) ⇒ brak projekcji (uczciwy stan zerowy, zero atrapy)', () => {
    expect(minimapProjectionOf({ x: 0, y: 0, width: 0, height: 0 })).toBeNull();
    expect(minimapProjectionOf({ x: 0, y: 0, width: 100, height: 0 })).toBeNull();
  });

  it('skala jest JEDNAKOWA na obu osiach — rysunek sieci nie może być rozciągnięty', () => {
    const projection = minimapProjectionOf(scena.bbox, 260);
    expect(projection).not.toBeNull();
    // Jedna liczba `scale` z definicji typu; sprawdzamy, że mieści treść w obu
    // wymiarach panelu (a nie że przycina jeden z nich).
    expect(scena.bbox.width * projection!.scale).toBeLessThanOrEqual(projection!.width + 1e-9);
    expect(scena.bbox.height * projection!.scale).toBeLessThanOrEqual(projection!.height + 1e-9);
  });

  it('wysokość panelu wynika z proporcji sieci i mieści się w granicach', () => {
    const plaska = minimapProjectionOf({ x: 0, y: 0, width: 10000, height: 100 }, 260);
    const wysoka = minimapProjectionOf({ x: 0, y: 0, width: 100, height: 10000 }, 260);
    expect(plaska!.height).toBe(MINIMAP_MIN_HEIGHT);
    expect(wysoka!.height).toBe(MINIMAP_MAX_HEIGHT);
  });

  it('kształty pochodzą WYŁĄCZNIE ze sceny — tyle samo odcinków i symboli, nic dorysowanego', () => {
    const projection = minimapProjectionOf(scena.bbox)!;
    const shapes = minimapShapesOf(scena, projection);
    const segmenty = scena.segments.filter((s) => s.points.length >= 2).length;
    const symbole = scena.symbols.length;
    expect(shapes.length).toBe(segmenty + symbole + scena.meta.drawnStationIds.length);
    expect(shapes.filter((s) => 'points' in s).length).toBe(segmenty);
    // Jedna scena (karta SLD-SKALA-I-NAWIGACJA R7): klasa „station" to obrys rysunku KAŻDEJ
    // stacji narysowanej w scenie (w tym GPZ) — dawniej zliczany po zwiniętych symbolach widoku L0.
    expect(shapes.filter((s) => s.kind === 'station').length).toBe(scena.meta.drawnStationIds.length);
  });

  it('każdy symbol ma na minimapie ślad co najmniej 1,5 px (stacja nie może zniknąć z nawigatora)', () => {
    const projection = minimapProjectionOf(scena.bbox)!;
    for (const shape of minimapShapesOf(scena, projection)) {
      if ('points' in shape) continue;
      expect(shape.rect.width).toBeGreaterThanOrEqual(1.5);
      expect(shape.rect.height).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('determinizm: te same wejścia dają identyczny wynik', () => {
    const a = minimapShapesOf(scena, minimapProjectionOf(scena.bbox)!);
    const b = minimapShapesOf(scena, minimapProjectionOf(scena.bbox)!);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('K11-B — prostokąt kadru i odwzorowanie odwrotne', () => {
  it('kadr obejmujący CAŁY świat pokrywa cały obszar treści panelu', () => {
    const projection = minimapProjectionOf(SQUARE, 200)!;
    const frame = worldRectToMinimap(SQUARE, SQUARE, projection);
    expect(frame.x).toBeCloseTo(projection.offsetX, 9);
    expect(frame.y).toBeCloseTo(projection.offsetY, 9);
    expect(frame.width).toBeCloseTo(SQUARE.width * projection.scale, 9);
    expect(frame.height).toBeCloseTo(SQUARE.height * projection.scale, 9);
  });

  it('kadr w ĆWIARTCE świata ląduje w odpowiadającej ćwiartce panelu', () => {
    const projection = minimapProjectionOf(SQUARE, 200)!;
    const frame = worldRectToMinimap({ x: 500, y: 500, width: 500, height: 500 }, SQUARE, projection);
    expect(frame.x).toBeGreaterThan(projection.offsetX + (projection.width - 2 * projection.offsetX) / 2 - 1e-6);
    expect(frame.width).toBeCloseTo(500 * projection.scale, 9);
  });

  it('minimapPointToWorld jest ODWROTNOŚCIĄ rzutu (ten sam LOD) — punkt wraca na swoje miejsce', () => {
    const projection = minimapProjectionOf(scena.bbox)!;
    for (const probe of [
      { x: 0, y: 0 },
      { x: projection.width / 2, y: projection.height / 2 },
      { x: projection.width, y: projection.height },
    ]) {
      const world = minimapPointToWorld(probe, scena.bbox, projection);
      const back = worldRectToMinimap({ x: world.x, y: world.y, width: 0, height: 0 }, scena.bbox, projection);
      expect(back.x).toBeCloseTo(probe.x, 6);
      expect(back.y).toBeCloseTo(probe.y, 6);
    }
  });

  it('świat kamery przesunięty o margines arkusza: środek sceny trafia w środek treści panelu (i wraca)', () => {
    // Jedna scena (karta SLD-SKALA-I-NAWIGACJA): dawny „mostek" między światami poziomów
    // szczegółu jest przesunięciem o margines ramki — świat kamery ma ten sam rozmiar.
    const projection = minimapProjectionOf(scena.bbox)!;
    const swiatKamery = { ...scena.bbox, x: scena.bbox.x + 40, y: scena.bbox.y + 40 };
    const srodek = { x: swiatKamery.x + swiatKamery.width / 2, y: swiatKamery.y + swiatKamery.height / 2 };
    const frame = worldRectToMinimap({ x: srodek.x, y: srodek.y, width: 0, height: 0 }, swiatKamery, projection);
    expect(frame.x).toBeCloseTo(projection.offsetX + (scena.bbox.width * projection.scale) / 2, 6);
    expect(frame.y).toBeCloseTo(projection.offsetY + (scena.bbox.height * projection.scale) / 2, 6);
    const back = minimapPointToWorld({ x: frame.x, y: frame.y }, swiatKamery, projection);
    expect(back.x).toBeCloseTo(srodek.x, 6);
    expect(back.y).toBeCloseTo(srodek.y, 6);
    // Rozmiar kadru bez przeskalowania (ten sam świat).
    const kadr = worldRectToMinimap({ x: srodek.x, y: srodek.y, width: 100, height: 50 }, swiatKamery, projection);
    expect(kadr.width).toBeCloseTo(100 * projection.scale, 9);
    expect(kadr.height).toBeCloseTo(50 * projection.scale, 9);
  });
});

describe('K11-B — odczyt viewBox kamery', () => {
  it('parsuje kadr kamery', () => {
    expect(parseCameraViewBox('10 20 300 400')).toEqual({ x: 10, y: 20, width: 300, height: 400 });
    expect(parseCameraViewBox('  -5   -6  30   40 ')).toEqual({ x: -5, y: -6, width: 30, height: 40 });
  });

  it('brak pomiaru (viewport 0×0, wartość niepełna) NIE jest zgadywany', () => {
    expect(parseCameraViewBox('0 0 0 0')).toBeNull();
    expect(parseCameraViewBox('0 0 100')).toBeNull();
    expect(parseCameraViewBox('a b c d')).toBeNull();
    expect(parseCameraViewBox('')).toBeNull();
  });
});
